// periods.js
// Reglas registradas (vera-backlog#71): cada regla es { start, end } en "YYYY-MM-DD"; end = null mientras
// dura. El calendario pinta en el pasado solo lo registrado y hacia delante la predicción.
// lastPeriod y pastPeriods se derivan de aquí para el resto de la app (cycleInfo, predict).

import { cycleInfo, dnFromISO, isoFromDN, todayDN, averageCycleLength } from './logic.js';

/** Una regla abierta deja de contarse como «en curso» pasados estos días */
const OPEN_MAX = 10;
/** «Me duró hasta este día»: hasta cuántos días después del final se ofrece alargarla */
const EXTEND_MAX = 3;

const sortPeriods = (ps) => [...ps].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));

/** Último día de una regla (para pintarla): el final registrado, hoy si sigue abierta, o la duración habitual */
export function effectiveEnd(p, periodLen, today = todayDN()) {
  const s = dnFromISO(p.start);
  if (p.end) return Math.max(s, dnFromISO(p.end));
  if (today - s < OPEN_MAX) return Math.max(s, Math.min(today, s + periodLen - 1));
  return s + periodLen - 1;
}

/** Por si llegan ajustes sin lista de reglas (datos de una versión anterior) */
const norm = (s, today) => (Array.isArray(s.periods) ? s : ensurePeriods(s, today));

/** Une reglas que se solapan o se tocan y ordena */
function mergePeriods(list, periodLen, today) {
  const out = [];
  for (const p of sortPeriods(list.filter((p) => p && dnFromISO(p.start) != null))) {
    const prev = out[out.length - 1];
    if (prev && dnFromISO(p.start) <= effectiveEnd(prev, periodLen, today) + 1) {
      if (!prev.end || !p.end) prev.end = null;
      else if (p.end > prev.end) prev.end = p.end;
      continue;
    }
    out.push({ start: p.start, end: p.end && dnFromISO(p.end) != null ? p.end : null });
  }
  return out;
}

/** Ajustes con la lista de reglas ya ordenada y los campos derivados al día */
export function withPeriods(settings, periods, today = todayDN()) {
  const ps = mergePeriods(periods, settings.periodLen, today);
  const starts = ps.map((p) => p.start);
  return {
    ...settings,
    periods: ps,
    lastPeriod: starts[starts.length - 1] ?? null,
    pastPeriods: starts,
    cycleLen: !settings.isRegular && starts.length >= 2 ? averageCycleLength(starts) : settings.cycleLen,
  };
}

/** Datos antiguos (solo fechas de inicio) → reglas con la duración habitual */
export function ensurePeriods(settings, today = todayDN()) {
  if (Array.isArray(settings.periods)) return withPeriods(settings, settings.periods, today);
  const starts = [...new Set([...(settings.pastPeriods || []), settings.lastPeriod])].filter((d) => dnFromISO(d) != null);
  const periods = starts.map((start) => {
    const end = dnFromISO(start) + settings.periodLen - 1;
    return { start, end: end >= today ? null : isoFromDN(end) };
  });
  return withPeriods(settings, periods, today);
}

/** La regla registrada que incluye ese día (o null) */
export function periodAt(settings, dn, today = todayDN()) {
  return (settings.periods || []).find((p) => {
    const s = dnFromISO(p.start);
    return dn >= s && dn <= effectiveEnd(p, settings.periodLen, today);
  }) || null;
}

/** La regla que está en curso hoy (abierta y reciente), o null */
export function activePeriod(settings, today = todayDN()) {
  const p = (settings.periods || [])[settings.periods?.length - 1];
  if (!p || p.end) return null;
  const s = dnFromISO(p.start);
  return s <= today && today - s < OPEN_MAX ? p : null;
}

/** Regla que terminó justo antes de ese día (para «me duró hasta este día») */
export function periodEndingBefore(settings, dn, today = todayDN()) {
  return (settings.periods || []).find((p) => {
    const e = effectiveEnd(p, settings.periodLen, today);
    return dn > e && dn - e <= EXTEND_MAX;
  }) || null;
}

/** Marca el inicio de una regla ese día */
export function startPeriod(settings, ds, today = todayDN()) {
  settings = norm(settings, today);
  const end = dnFromISO(ds) + settings.periodLen - 1;
  return withPeriods(settings, [...(settings.periods || []), { start: ds, end: end >= today ? null : isoFromDN(end) }], today);
}

/** Pone el último día de la regla que incluye (o acaba justo antes de) ese día */
export function endPeriod(settings, ds, today = todayDN()) {
  settings = norm(settings, today);
  const dn = dnFromISO(ds);
  const target = periodAt(settings, dn, today) || periodEndingBefore(settings, dn, today);
  if (!target) return settings;
  return withPeriods(settings, settings.periods.map((p) => (p === target ? { ...p, end: ds } : p)), today);
}

/** Quita una regla (por su día de inicio). Devuelve los ajustes y el rango borrado. */
export function removePeriod(settings, start, today = todayDN()) {
  settings = norm(settings, today);
  const p = (settings.periods || []).find((x) => x.start === start);
  if (!p) return { settings, range: null };
  const range = [dnFromISO(p.start), effectiveEnd(p, settings.periodLen, today)];
  return { settings: withPeriods(settings, settings.periods.filter((x) => x !== p), today), range };
}

/**
 * Qué se pinta en un día: 'period' (registrada), 'period-est' (prevista), 'fertile', 'ovulation' o null.
 * Antes de la última regla solo se ve lo registrado; la ventana fértil y la regla prevista, a partir de ella.
 */
export function dayKind(settings, dn, today = todayDN()) {
  if (periodAt(settings, dn, today)) return 'period';
  const last = dnFromISO(settings.lastPeriod);
  if (last == null || dn < last) return null;
  const info = cycleInfo(settings, dn);
  if (info.phase === 'menstrual') {
    // La regla actual ya se cerró: sus días restantes no son «previstos»
    if (dn - (info.day - 1) === last) {
      const lp = settings.periods[settings.periods.length - 1];
      if (lp?.end || dn <= today) return null;
    }
    return dn > today ? 'period-est' : null;
  }
  if (info.phase === 'ovulation') return 'ovulation';
  if (info.phase === 'fertile') return 'fertile';
  return null;
}

/** Días que duró (o lleva) una regla */
export function periodLength(p, periodLen, today = todayDN()) {
  return effectiveEnd(p, periodLen, today) - dnFromISO(p.start) + 1;
}
