// Hera · panel privado para el móvil: GET /panel?k=<DASH_KEY>&d=1|7|30
// Página generada en el servicio (sin JS, sin login: la clave va en el enlace, guárdalo en favoritos).
// Datos: recuentos por día (tabla counts, sin límite de fechas), actividad reciente (tabla activity, 31 días)
// y consultas abiertas (KV). Los dispositivos en modo equipo no envían nada, así que no aparecen.

import { eventText, deviceText } from './activity.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const madrid = (ts, opts) => new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', ...opts }).format(new Date(ts));
const dayISO = (ts) => madrid(ts, { year: 'numeric', month: '2-digit', day: '2-digit' }).split('/').reverse().join('-');
const PROS = [['gineco', 'Gonzalo'], ['matrona', 'Marina'], ['pediatra', 'Lucía']];
const STAGES = [['pregnancy', 'Embarazo'], ['postpartum', 'Posparto'], ['cycle', 'Ciclo'], ['menopause', 'Menopausia']];
// El embudo de la app se mide paso a paso desde el 31 oct por la noche: antes de eso solo cuenta como «abrieron»
const APP_FUNNEL_FROM = Date.parse('2026-11-01T00:00:00+01:00');
const is = (e, names) => names.some((n) => e === n || e.startsWith(`${n}:`));
const pct = (a, t) => (t ? `${Math.round((a * 100) / t)} %` : '—');
// Marcas de anuncio: la visita desde el anuncio y lo que la app o el servicio apuntan después con la marca guardada (30 días)
const AD_MARK = ['anuncio_visita', 'consulta_anuncio', 'instalada_anuncio', 'vuelta_anuncio'];
const AD_GROUPS = [['matrona', 'Matrona'], ['gineco', 'Ginecólogo'], ['pediatra', 'Pediatra'], ['lactancia', 'Lactancia'], ['gineco_latam', 'Ginecólogo · Latinoamérica'], ['pediatra_latam', 'Pediatra · Latinoamérica'], ['', 'Sin grupo (enlace de sitio u otro)']];
const PATH = (e) => {
  const [n, v = ''] = e.split(':');
  if (n === 'anuncio_visita') return `anuncio${v ? ` ${v}` : ''}`;
  if (n === 'tiempo') return `${v} s`;
  if (n === 'scroll') return `${v} %`;
  if (n === 'seccion' || n === 'clic') return v.replace(/_/g, ' ');
  return n;
};
const TABS = [['today', 'Hoy'], ['diary', 'Diario'], ['care', 'Cuidados'], ['guide', 'Dudas'], ['baby', 'Tu bebé'], ['cycle', 'Ciclo'], ['trends', 'Patrones']];
const DIARY = [['sintoma', 'Síntomas'], ['animo', 'Ánimo'], ['regla', 'Regla'], ['dato', 'Peso, sueño o temperatura'], ['flujo', 'Flujo'], ['estres', 'Estrés'], ['intimidad', 'Relaciones'], ['ovulacion', 'Test de ovulación']];

/**
 * Embudo por persona y día (actividad anónima). Cada paso es [texto, ...eventos]; quien llega a un paso cuenta también
 * en los anteriores. Devuelve las personas de cada paso, cuántas se caen ahí y la lista de las últimas caídas.
 */
export function dropoff(act, steps, ad = null) {
  const reached = new Map(); // persona-día → { paso más avanzado, última hora, dispositivo }
  for (const r of act) {
    if (!r.p) continue;
    const i = steps.findIndex(([, ...ev]) => is(r.e, ev));
    if (i < 0) continue;
    const k = `${dayISO(r.ts)}:${r.p}`;
    const c = reached.get(k);
    if (!c) reached.set(k, { step: i, ts: r.ts, d: r.d, p: r.p });
    else { c.step = Math.max(c.step, i); if (r.ts > c.ts) { c.ts = r.ts; c.d = r.d; } }
  }
  const rows = steps.map(([label], i) => {
    const hit = [...reached].filter(([, c]) => c.step >= i);
    return { label, n: hit.length, ad: ad ? hit.filter(([k]) => ad.has(k)).length : 0 };
  });
  rows.forEach((row, i) => { const last = i === rows.length - 1; row.lost = last ? 0 : row.n - rows[i + 1].n; row.lostAd = last ? 0 : row.ad - rows[i + 1].ad; });
  const started = rows[0].n, done = rows[rows.length - 1].n;
  const lost = [...reached.values()].filter((c) => c.step < steps.length - 1).sort((a, b) => b.ts - a.ts);
  return { rows, started, done, dropped: started - done, lost, startedAd: rows[0].ad, doneAd: rows[rows.length - 1].ad };
}

/** Páginas más vistas de hera-gine.com según Cloudflare Web Analytics (sin cookies). Necesita el secreto CF_ANALYTICS_TOKEN. */
async function topPages(env, days) {
  if (!env.CF_ANALYTICS_TOKEN || !env.CF_ACCOUNT_ID) return { error: 'Falta la clave de Cloudflare (CF_ANALYTICS_TOKEN).' };
  const to = new Date(); const from = new Date(to.getTime() - days * 86400000);
  const query = `query($acc: string!, $from: Time!, $to: Time!) { viewer { accounts(filter: { accountTag: $acc }) {
    rumPageloadEventsAdaptiveGroups(limit: 25, orderBy: [count_DESC], filter: { datetime_geq: $from, datetime_leq: $to, requestHost: "hera-gine.com" }) { count dimensions { requestPath } } } } }`;
  try {
    const r = await fetch('https://api.cloudflare.com/client/v4/graphql', { method: 'POST', headers: { Authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { acc: env.CF_ACCOUNT_ID, from: from.toISOString(), to: to.toISOString() } }) });
    const j = await r.json();
    if (j.errors?.length) return { error: j.errors.map((e) => e.message).join(' · ').slice(0, 300) };
    const rows = j.data?.viewer?.accounts?.[0]?.rumPageloadEventsAdaptiveGroups || [];
    // Une «/guias/x» y «/guias/x/» y quita /index.html
    const m = new Map();
    for (const x of rows) { const pth = (x.dimensions.requestPath || '/').replace(/index\.html$/, '').replace(/(.)\/$/, '$1'); m.set(pth, (m.get(pth) || 0) + x.count); }
    // Países: visitas a la web y a la app (/app) por país
    const q2 = `query($acc: string!, $from: Time!, $to: Time!) { viewer { accounts(filter: { accountTag: $acc }) {
      rumPageloadEventsAdaptiveGroups(limit: 2000, filter: { datetime_geq: $from, datetime_leq: $to, requestHost: "hera-gine.com" }) { count dimensions { countryName requestPath } } } } }`;
    const r2 = await fetch('https://api.cloudflare.com/client/v4/graphql', { method: 'POST', headers: { Authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q2, variables: { acc: env.CF_ACCOUNT_ID, from: from.toISOString(), to: to.toISOString() } }) });
    const j2 = await r2.json();
    const c = new Map();
    for (const x of j2.data?.viewer?.accounts?.[0]?.rumPageloadEventsAdaptiveGroups || []) {
      const k = x.dimensions.countryName || '?'; const o = c.get(k) || { web: 0, app: 0 };
      if (/^\/app(\/|$)/.test(x.dimensions.requestPath || '')) o.app += x.count; else o.web += x.count;
      c.set(k, o);
    }
    const countries = [...c].sort((a, b) => (b[1].web + b[1].app) - (a[1].web + a[1].app)).slice(0, 12);
    return { rows: [...m].sort((a, b) => b[1] - a[1]).slice(0, 20), countries, countryError: j2.errors?.length ? j2.errors[0].message : '' };
  } catch (e) { return { error: e.message }; }
}
const countryName = (k) => { try { return new Intl.DisplayNames(['es'], { type: 'region' }).of(k) || k; } catch { return k; } };
const COUNTRY = { ES: 'España', MX: 'México', AR: 'Argentina', CO: 'Colombia', CL: 'Chile', PE: 'Perú', US: 'Estados Unidos', FR: 'Francia', DE: 'Alemania', GB: 'Reino Unido', PT: 'Portugal', IT: 'Italia', NL: 'Países Bajos', IE: 'Irlanda', VE: 'Venezuela', EC: 'Ecuador', UY: 'Uruguay', BR: 'Brasil' };

export async function panel(env, url, openThreads) {
  const days = [1, 7, 30].includes(Number(url.searchParams.get('d'))) ? Number(url.searchParams.get('d')) : 7;
  const now = Date.now();
  const from = dayISO(now - (days - 1) * 86400000);
  // La gráfica diaria necesita al menos 7 días; los totales solo cuentan el periodo elegido.
  const rows = (await env.DB.prepare('SELECT day, k, n FROM counts WHERE day >= ?1').bind(dayISO(now - (Math.max(days, 7) - 1) * 86400000)).all()).results || [];
  const tot = {}; const byDay = {};
  for (const r of rows) { if (r.day >= from) tot[r.k] = (tot[r.k] || 0) + r.n; (byDay[r.day] ||= {})[r.k] = r.n; }
  const g = (k) => tot[k] || 0;
  const sum = (prefix) => Object.entries(tot).filter(([k]) => k.startsWith(prefix)).reduce((a, [, n]) => a + n, 0);
  // La gráfica enseña al menos 7 días, así que se lee la actividad de max(días, 7); el resto de tarjetas usa solo el periodo elegido.
  const actAll = (await env.DB.prepare('SELECT ts, e, d, p FROM activity WHERE ts > ?1 ORDER BY ts DESC').bind(now - Math.max(days, 7) * 86400000).all()).results || [];
  // Mismos días de calendario (Madrid) que los contadores: «Hoy» es desde las 00:00, no las últimas 24 h
  const act = actAll.filter((r) => dayISO(r.ts) >= from);
  const open = openThreads ? await openThreads(env) : { pendientes: {}, fuera_plazo: {} };
  const pages = await topPages(env, days);

  // Persona-día (etiqueta anónima diaria) → sus eventos. «De anuncio» = persona-día con una marca de anuncio, sin la
  // revisión automática de Google (todo lo suyo viene de un navegador «otro»).
  for (const r of actAll) r.k = r.p ? `${dayISO(r.ts)}:${r.p}` : '';
  const group = (list) => { const m = new Map(); for (const r of list) if (r.k) (m.get(r.k) || m.set(r.k, []).get(r.k)).push(r); return m; };
  const isAd = ([, v]) => { const ds = v.filter((r) => r.d); return v.some((r) => is(r.e, AD_MARK)) && !(ds.length && ds.every((r) => r.d === 'otro-web')); };
  // Prueba en México y Argentina (campañas …_latam): va aparte; «de anuncio» en el resto del panel es solo España
  const campOfV = (v) => { for (const r of v) { const m = /^(?:anuncio_visita|consulta_anuncio):([a-z0-9_]+)$/.exec(r.e); if (m) return m[1]; } return ''; };
  const isLatam = ([, v]) => /_latam$/.test(campOfV(v));
  const byKeyAll = group(actAll);
  const AD_ALL = new Set([...byKeyAll].filter((x) => isAd(x) && !isLatam(x)).map(([k2]) => k2));
  const byKey = group(act);
  const AD = new Set([...byKey].filter((x) => isAd(x) && !isLatam(x)).map(([k2]) => k2));
  const LATAM = new Set([...byKey].filter((x) => isAd(x) && isLatam(x)).map(([k2]) => k2));
  /** Cuántos eventos (o personas por día) de anuncio hay con estos nombres */
  const adCount = (names, persons = false) => {
    let c = 0; const ks = new Set();
    for (const r of act) if (r.k && AD.has(r.k) && is(r.e, names)) { c += 1; ks.add(r.k); }
    return persons ? ks.size : c;
  };
  const adNote = (a, x) => (a === undefined ? '' : `<small class="adn${a ? '' : ' zero'}">${a ? `${a} de anuncio · ${pct(a, x)}` : '0 de anuncio'}</small>`);
  /** pairs: [texto, total, parte de anuncio (opcional)]; all: también las filas a 0 */
  const bars = (pairs, all = false) => {
    const vis = all ? pairs : pairs.filter(([, x]) => x > 0);
    if (!vis.length || !vis.some(([, x]) => x > 0) && !all) return '<p class="mute">Nada todavía.</p>';
    const max = Math.max(1, ...vis.map(([, x]) => x));
    return `<ul class="bars">${vis.map(([k2, x, a]) => { const w = Math.round((x / max) * 100); return `<li><span>${esc(k2)}${adNote(a, x)}</span><b>${x}</b><i style="width:${w}%"></i>${a ? `<i class="ad" style="width:${(w * Math.min(a / (x || 1), 1)).toFixed(1)}%"></i>` : ''}</li>`; }).join('')}</ul>`;
  };
  const withAd = (label, total, names, persons = false) => [label, total, adCount(names, persons)];

  // Personas por día (app y web), con la huella diaria anónima
  const n = Math.max(days, 7);
  const slots = Array.from({ length: n }, (_, i) => now - (n - 1 - i) * 86400000);
  const adWeb = {}; const adApp = {};
  for (const k2 of AD_ALL) {
    const v = byKeyAll.get(k2); const d = k2.slice(0, 10);
    if (v.some((r) => r.e === 'portada')) adWeb[d] = (adWeb[d] || 0) + 1;
    if (v.some((r) => r.e === 'apertura')) adApp[d] = (adApp[d] || 0) + 1;
  }
  const perDay = slots.map((ts) => {
    const iso = dayISO(ts); const d = byDay[iso] || {};
    return { ts, label: madrid(ts, { day: 'numeric', month: 'short' }).replace('.', ''), a: d.personas_app || 0, w: d.personas_portada || 0, aa: adApp[iso] || 0, aw: adWeb[iso] || 0 };
  });
  const maxDay = Math.max(1, ...perDay.map((x) => Math.max(x.a, x.w)));
  const W = 360, H = 150, TOP = 16, CH = H - TOP - 22, gw = W / n, bw = Math.min(16, gw * 0.38);
  const y = (v) => TOP + CH - (CH * v) / maxDay;
  const rect = (x, v, fill, min = 1.5) => `<rect x="${x.toFixed(1)}" y="${(TOP + CH - Math.max((CH * v) / maxDay, min)).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max((CH * v) / maxDay, min).toFixed(1)}" rx="2" fill="${fill}"/>`;
  const chart = [`<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Personas por día" style="display:block">`];
  for (const gl of [0.5, 1]) { const yy = y(maxDay * gl); chart.push(`<line x1="0" x2="${W}" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}" stroke="var(--line)"/><text x="0" y="${(yy - 4).toFixed(1)}" font-size="9.5" fill="var(--mute)">${Math.round(maxDay * gl)}</text>`); }
  perDay.forEach((x, i) => {
    const cx = i * gw + gw / 2;
    const info = `${x.label} · App ${x.a}${x.aa ? ` (${x.aa} de anuncio)` : ''} · Web ${x.w}${x.aw ? ` (${x.aw} de anuncio)` : ''}`;
    chart.push(`<g class="day" data-t="${esc(info)}"><title>${esc(info)}</title><rect x="${(i * gw).toFixed(1)}" y="0" width="${gw.toFixed(1)}" height="${H}" fill="transparent"/>`);
    chart.push(rect(cx - bw - 1, x.a, 'var(--plum)'));
    if (x.aa) chart.push(rect(cx - bw - 1, Math.min(x.aa, x.a), 'var(--ad)', 0));
    chart.push(rect(cx + 1, x.w, 'var(--web)'));
    if (x.aw) chart.push(rect(cx + 1, Math.min(x.aw, x.w), 'var(--ad)', 0));
    if (n <= 7) chart.push(`<text x="${cx.toFixed(1)}" y="${(y(Math.max(x.a, x.w)) - 4).toFixed(1)}" text-anchor="middle" font-size="9.5" fill="var(--mute)">${x.a + x.w}</text>`);
    if (n <= 7 || madrid(x.ts, { weekday: 'short' }).startsWith('lun') || i === n - 1) {
      const anc = i === n - 1 ? 'end' : i === 0 ? 'start' : 'middle'; const lx = i === n - 1 ? W : i === 0 ? 0 : cx;
      chart.push(`<text x="${lx.toFixed(1)}" y="${H - 8}" text-anchor="${anc}" font-size="9.5" fill="var(--mute)">${esc(x.label)}</text>`);
    }
    chart.push('</g>');
  });
  chart.push('</svg>');
  const sumOf = (f) => perDay.reduce((acc, x) => acc + x[f], 0);

  // Dispositivos (personas distintas por día y dispositivo, de la actividad)
  const dev = new Map();
  for (const r of act) if (r.d && r.p) { const k = deviceText(r.d); (dev.get(k) || dev.set(k, new Set()).get(k)).add(`${dayISO(r.ts)}:${r.p}`); }
  const devices = [...dev.entries()].map(([k2, s2]) => [k2, s2.size, [...s2].filter((x) => AD.has(x)).length]).sort((a, b) => b[1] - a[1]);

  const consultas = PROS.reduce((a, [k]) => a + g(`consulta:${k}`), 0);
  const respondidas = PROS.reduce((a, [k]) => a + g(`respondida:${k}`), 0);
  const horas = PROS.reduce((a, [k]) => a + g(`resp_horas:${k}`), 0);
  const pendientes = Object.values(open.pendientes || {}).reduce((a, x) => a + x, 0);

  // Opiniones tras la consulta: valoraciones por profesional y últimos comentarios (sin correo ni número de consulta)
  let opiniones = [];
  try { opiniones = (await env.DB.prepare('SELECT ts, pro, rating, texto, nombre, publicable FROM opiniones WHERE ts > ?1 ORDER BY ts DESC LIMIT 40').bind(now - days * 86400000).all()).results || []; } catch { /* sin tabla */ }
  const RATE = { 1: 'Sí, mucho', 2: 'Más o menos', 3: 'No' };
  const opRows = PROS.map(([k2, name]) => { const v = [1, 2, 3].map((r) => g(`opinion:${k2}:${r}`)); return v.some(Boolean) ? `<tr><td>${esc(name)}</td>${v.map((x) => `<td>${x}</td>`).join('')}</tr>` : ''; }).join('');
  const opFeed = opiniones.map((o) => `<li><time>${madrid(o.ts, { day: 'numeric', month: 'short' })}</time><span>«${esc(o.texto)}»</span><small>${esc((PROS.find(([k2]) => k2 === o.pro) || [, o.pro])[1])} · ${RATE[o.rating] || ''}${o.publicable ? ` · <b>se puede publicar como «${esc(o.nombre)}»</b>` : ' · no publicar'}</small></li>`).join('');
  const funnels = [
    ['En la web', dropoff(act, [['Empezaron a escribir', 'pregunta_portada', 'ejemplo_duda'], ['Llegaron al correo', 'correo_portada'], ['Pulsaron enviar', 'intento_portada'], ['Enviaron', 'enviada_portada']], AD)],
    ['En la app', dropoff(act.filter((r) => r.ts >= APP_FUNNEL_FROM), [['Abrieron la consulta', 'consulta_abierta'], ['Empezaron a escribir', 'consulta_escribe', 'consulta_ejemplo'], ['Escribieron el correo', 'consulta_correo'], ['Pulsaron enviar', 'consulta_intento'], ['Enviaron', 'consulta_enviada']], AD)],
  ];
  // Quien llega por un anuncio: personas (por día) que hicieron cada cosa después, y sus recorridos
  // byKey va de lo más reciente a lo más antiguo (act viene ordenado así)
  const adPeople = [...AD].map((k2) => byKey.get(k2)).filter((v) => v.some((r) => r.e === 'portada'));
  const did = (...es) => adPeople.filter((v) => v.some((r) => is(r.e, es))).length;
  const adSteps = [['Llegaron y cargó la web', adPeople.length], ['Se quedaron 10 s o más', did('tiempo')], ['Bajaron a la mitad', did('scroll:50', 'scroll:75', 'scroll:100')],
    ['Vieron los precios', did('seccion:precio')], ['Pulsaron algún enlace', did('clic')], ['Empezaron a escribir una duda', did('pregunta_portada', 'ejemplo_duda')],
    ['Llegaron al correo', did('correo_portada')], ['Enviaron la consulta', did('enviada_portada')], ['Abrieron los planes', did('planes_abiertos', 'limite_portada')],
    ['Abrieron la app ese día', did('apertura')], ['Instalaron la app', did('instalada', 'instalada_anuncio')]];
  const adTrips = adPeople.slice(0, 10).map((v) => {
    const seq = [...v].reverse(); const dv = seq.find((r) => r.d)?.d;
    return `<li><time>${madrid(seq[0].ts, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</time><span>${esc(seq.map((r) => PATH(r.e)).filter((e, i, a) => a.indexOf(e) === i).join(' → '))}</span><small>Persona ${esc(seq[0].p)}${dv ? ` · ${esc(deviceText(dv))}` : ''}</small></li>`;
  }).join('');
  // Anuncios por grupo (la campaña llega en la marca del anuncio)
  const campOf = campOfV;
  const groups = AD_GROUPS.map(([c, label]) => {
    const vs = [...AD, ...LATAM].map((k2) => byKey.get(k2)).filter((v) => { const cc = campOf(v); return c ? cc === c : !AD_GROUPS.some(([g2]) => g2 && g2 === cc); });
    return [label, vs.length, vs.reduce((acc, v) => acc + v.filter((r) => is(r.e, ['consulta'])).length, 0), vs.filter((v) => v.some((r) => is(r.e, ['instalada', 'instalada_anuncio']))).length, vs.filter((v) => v.some((r) => is(r.e, ['pago_hecho']))).length];
  }).filter(([, np]) => np);
  const adInstal = adCount(['instalada', 'instalada_anuncio'], true);
  const adConsultas = g('anuncio_consulta') + g('anuncio_consulta_pagada');
  const SRC = { cabecera: 'Botón «Pregúntanos» de arriba', barra: 'Barra de la etapa', tema: 'Enlace de un tema', dudas: 'Pestaña Dudas', ajustes: 'Ajustes', web: 'Desde la web', otro: 'Otro' };
  const opens = {}; let closedFast = 0, closedSlow = 0, examples = 0;
  for (const r of act) {
    if (r.e.startsWith('consulta_abierta:')) { const k2 = r.e.slice(17); opens[k2] = (opens[k2] || 0) + 1; }
    else if (r.e === 'consulta_cerrada:rapido') closedFast += 1;
    else if (r.e === 'consulta_cerrada:sin_escribir') closedSlow += 1;
    else if (r.e === 'consulta_ejemplo') examples += 1;
  }
  const opensCard = Object.keys(opens).length || closedFast || closedSlow ? `<h3 class="fh">Desde dónde abren la consulta en la app</h3>${bars(Object.entries(opens).sort((a, b) => b[1] - a[1]).map(([k2, x]) => [SRC[k2] || k2, x]))}
<p class="mute" style="margin-top:6px">Cerraron sin escribir: ${closedFast} en menos de 5 s · ${closedSlow} después. Tocaron una duda de ejemplo: ${examples}.</p>` : '';
  const paren = (a) => ` <small class="adp${a ? '' : ' zero'}">(${a} anuncio)</small>`;
  const funnelCard = ([title, f]) => `<h3 class="fh">${title}</h3>${f.started ? `<p class="drop"><b>${f.dropped}</b> de ${f.started} se cayeron (${Math.round((f.dropped / f.started) * 100)} %) <small class="adp${f.startedAd ? '' : ' zero'}">${f.startedAd ? `· de las ${f.startedAd} de anuncio, se cayeron ${f.startedAd - f.doneAd}` : '· 0 de anuncio'}</small></p>
<table><tr><th></th><th>Personas</th><th>Se caen aquí</th></tr>${f.rows.map((r, i) => `<tr><td>${esc(r.label)}</td><td>${r.n}${paren(r.ad)}</td><td>${i < f.rows.length - 1 ? `${r.lost}${paren(r.lostAd)}` : '–'}</td></tr>`).join('')}</table>` : '<p class="mute">Nada todavía.</p>'}`;
  const lostFeed = funnels.flatMap(([title, f]) => f.lost.map((c) => ({ ...c, title, last: f.rows[c.step].label }))).sort((a, b) => b.ts - a.ts).slice(0, 12)
    .map((c) => `<li><time>${madrid(c.ts, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</time><span>${esc(c.title)}: se quedó en «${esc(c.last)}»</span><small>Persona ${esc(c.p)}${c.d ? ` · ${esc(deviceText(c.d))}` : ''}</small></li>`).join('');

  const feed = act.slice(0, 80).map((r) => `<li><time>${madrid(r.ts, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</time>
<span>${esc(eventText(r.e))}</span><small>${r.p ? `Persona ${esc(r.p)}` : 'Servicio'}${r.d ? ` · ${esc(deviceText(r.d))}` : ''}</small></li>`).join('');

  const kad = (a, t) => `<em${a ? '' : ' style="color:var(--mute);font-weight:400"'}>${a} de anuncio · ${pct(a, t)}</em>`;
  const k = encodeURIComponent(url.searchParams.get('k') || '');
  const tab = (d, label) => `<a class="${d === days ? 'on' : ''}" href="?k=${k}&d=${d}">${label}</a>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#FAF9F4"><title>Hera · Panel</title>
<style>
:root{--bg:#FAF9F4;--card:#fff;--ink:#2F3631;--mute:#6E6C67;--line:#E5E1D8;--bar:#EFECE4;--plum:#45574C;--web:#B8C4BC;--ad:#BCA172;--adbar:#EFE4CC}
@media (prefers-color-scheme:dark){:root{--bg:#161B18;--card:#1F2622;--ink:#F0F1EC;--mute:#ABB2AC;--line:#2E3832;--bar:#2A332D;--plum:#A9C2B2;--web:#55695C;--ad:#D4B97F;--adbar:#4A4330}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.w{max-width:640px;margin:0 auto;padding:18px 16px 40px}
h1{font:500 28px/1.1 Georgia,serif;color:var(--plum);margin:4px 0 2px}h2{font-size:15px;font-weight:650;color:var(--plum);margin:0 0 10px}
.mute{color:var(--mute);font-size:13px;margin:0}
.fh{font-size:14px;font-weight:600;margin:16px 0 6px}.drop{margin:0 0 8px;font-size:15px}.drop b{font-size:22px}
.tabs{display:flex;gap:6px;margin:14px 0}.tabs a{flex:1;text-align:center;padding:9px;border-radius:6px;background:var(--card);border:1px solid var(--line);color:var(--ink);text-decoration:none;font-weight:600;font-size:14px}
.tabs a.on{background:var(--plum);border-color:var(--plum);color:#fff}
.kpis{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.k{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px}.k b{display:block;font:500 30px/1 Georgia,serif;color:var(--plum)}.k span{font-size:12.5px;color:var(--mute)}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin-top:12px}
.k em{display:block;font-style:normal;font-size:12px;font-weight:600;color:var(--plum);margin-top:6px}
.day{cursor:pointer}.day.on rect[fill="transparent"]{fill:var(--bar)}
.legend{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12px;color:var(--mute);margin-top:8px}
.adn{display:block;font-size:11.5px;color:var(--plum);font-weight:600;margin-top:1px}.adn.zero,.adp.zero{color:var(--mute);font-weight:400}
.adp{font-size:12px;color:var(--plum);font-weight:600;white-space:nowrap}.bars li i.ad{background:var(--adbar)}th.ad,td.ad{color:var(--plum);font-weight:600}.legend b{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;vertical-align:-1px}
ul{list-style:none;margin:0;padding:0}
.bars li{position:relative;display:flex;justify-content:space-between;gap:10px;padding:7px 9px;margin-bottom:4px;border-radius:6px;overflow:hidden;font-size:14px}
.bars li span,.bars li b{position:relative;z-index:1}.bars li i{position:absolute;left:0;top:0;bottom:0;background:var(--bar);border-radius:6px}.bars li span{min-width:0}
table{width:100%;border-collapse:collapse;font-size:13.5px;font-variant-numeric:tabular-nums}th{text-align:left;font-weight:500;color:var(--mute);font-size:12.5px;padding:4px 0}td{padding:6px 0;border-top:1px solid var(--line)}td+td,th+th{text-align:right;padding-left:8px}
.feed li{padding:9px 0;border-bottom:1px solid var(--line);display:grid;grid-template-columns:auto 1fr;column-gap:10px}
.feed time{font-size:12px;color:var(--mute);grid-row:span 2;min-width:92px}.feed small{color:var(--mute);font-size:12px}
.late{color:#B3261E}
</style></head><body><div class="w">
<p class="mute">HERA · sin el equipo (modo equipo)</p><h1>Panel</h1>
<p class="mute">Actualizado ${madrid(now, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} (hora de Madrid). Datos anónimos, sin cookies.</p>
<div class="tabs">${tab(1, 'Hoy')}${tab(7, '7 días')}${tab(30, '30 días')}</div>
<div class="kpis">
<div class="k"><b>${g('personas_portada')}</b><span>visitas a la web (personas/día)</span>${kad(adCount(['portada'], true), g('personas_portada'))}</div>
<div class="k"><b>${g('personas_app')}</b><span>personas en la app (por día)</span>${kad(adCount(['apertura'], true), g('personas_app'))}</div>
<div class="k"><b>${g('instalada')}</b><span>instalaciones</span>${kad(adInstal, g('instalada'))}</div>
<div class="k"><b>${sum('onboarding:')}</b><span>bienvenidas completadas</span>${kad(adCount(['onboarding']), sum('onboarding:'))}</div>
<div class="k"><b>${consultas}</b><span>consultas enviadas</span>${kad(adCount(['consulta']), consultas)}</div>
<div class="k"><b>${pendientes}</b><span>consultas pendientes ahora</span></div>
</div>
<div class="card"><h2>Personas por día</h2>${chart.join('')}
<div class="legend"><span><b style="background:var(--plum)"></b>App · ${sumOf('a')}</span><span><b style="background:var(--web)"></b>Web · ${sumOf('w')}</span><span><b style="background:var(--ad)"></b>Parte que vino de anuncio: app ${sumOf('aa')} · web ${sumOf('aw')}</span></div>
<p class="mute" id="dayinfo" style="margin-top:6px">Toca o pasa el ratón por un día para ver sus cifras.</p></div>
<div class="card"><h2>Consultas</h2>
<table><tr><th></th><th>Enviadas</th><th class="ad">De anuncio</th><th>Resp.</th><th>Media</th><th>Pend.</th></tr>
${PROS.map(([k2, name]) => { const r = g(`respondida:${k2}`); const fp = (open.fuera_plazo || {})[k2] || 0; return `<tr><td>${name}</td><td>${g(`consulta:${k2}`)}</td><td class="ad">${adCount([`consulta:${k2}`])}</td><td>${r}</td><td>${r ? `${Math.round(g(`resp_horas:${k2}`) / r)} h` : '—'}</td><td${fp ? ' class="late"' : ''}>${(open.pendientes || {})[k2] || 0}</td></tr>`; }).join('')}
</table>
${Object.values(open.fuera_plazo || {}).some(Boolean) ? `<p class="mute late" style="margin-top:8px">En rojo: con alguna consulta de más de 48 h sin responder (${PROS.filter(([k2]) => (open.fuera_plazo || {})[k2]).map(([k2, nm]) => `${nm} ${(open.fuera_plazo || {})[k2]}`).join(', ')}).</p>` : ''}
<p class="mute" style="margin-top:8px">Respondidas en total: ${respondidas}${respondidas ? ` · tiempo medio ${Math.round(horas / respondidas)} h` : ''}. Gratuitas agotadas: ${g('gratuitas_agotadas')} · guardadas pendientes de pago: ${g('consulta_guardada')} (pagadas después: ${g('guardada_pagada')}, recordatorios: ${g('guardada_recordatorio')}) · piden aviso de pago: ${g('aviso_pago')}.</p></div>
<div class="card"><h2>¿Quién empieza a preguntar y se cae?</h2><p class="mute">Personas distintas por día; entre paréntesis, las que vinieron de un anuncio. En la app, los pasos se miden desde el 1 de noviembre.</p>${funnels.map(funnelCard).join('')}${(() => { const why = [['Sin correo', g('clic:fallo_sin_correo')], ['Correo mal escrito', g('clic:fallo_correo_mal')], ['Duda demasiado corta', g('clic:fallo_texto_corto')], ['Sin elegir profesional', g('clic:fallo_sin_profesional')], ['Error al enviar (servicio o conexión)', g('error_portada')], ['Agotó las gratuitas', g('limite_portada')]]; return why.some(([, n]) => n) ? `<h3 class="fh">En la web, por qué no se envió al pulsar</h3>${bars(why)}` : ''; })()}${opensCard}${lostFeed ? `<h3 class="fh">Últimas caídas</h3><ul class="feed">${lostFeed}</ul>` : ''}</div>
<div class="card"><h2>Anuncios</h2>${AD.size || g('personas_anuncio') ? `${bars([['Personas que llegaron por un anuncio', adCount(['anuncio_visita'], true)], ['Empezaron a escribir una duda', did('pregunta_portada', 'ejemplo_duda')], ['Enviaron una consulta gratuita', g('anuncio_consulta')], ['Llegaron al límite de gratuitas', g('anuncio_limite')], ['Instalaron la app', adInstal], ['Volvieron a abrir la app otro día', adCount(['vuelta_anuncio'], true)], ['Pagaron (suelta, bono o ilimitado)', sum('anuncio_pago:')], ['Enviaron una consulta pagada', g('anuncio_consulta_pagada')]], true)}
${groups.length ? `<h3 class="fh">Por grupo de anuncio</h3><table><tr><th></th><th>Personas</th><th>Consult.</th><th>Instal.</th><th>Pagos</th></tr>${groups.map(([l, ...v]) => `<tr><td>${esc(l)}</td>${v.map((x) => `<td>${x}</td>`).join('')}</tr>`).join('')}</table>` : ''}
<p class="mute" style="margin-top:8px">Ingresos de anuncios: ${g('anuncio_eur')} € (sin restar reembolsos). Coste por consulta = lo gastado en Google Ads ÷ ${adConsultas} · coste por pago = gasto ÷ ${sum('anuncio_pago:')}.</p>
<p class="mute" style="margin-top:6px">Instalaciones: en Android, exacto (la app ve la marca del anuncio); en iPhone, aproximado (mismo móvil y misma conexión el mismo día). Sin la revisión automática de Google.</p>` : '<p class="mute">Nadie ha llegado todavía desde un anuncio. Se cuenta quien entra con gclid o utm_medium=cpc.</p>'}</div>
${(() => { const lp = [...LATAM].map((k2) => byKey.get(k2)); const ld = (...es) => lp.filter((v) => v.some((r) => is(r.e, es))).length;
  return lp.length || g('personas_latam') ? `<div class="card"><h2>Prueba Latinoamérica</h2>${bars([['Personas que llegaron por un anuncio', lp.length], ['Empezaron a escribir una duda', ld('pregunta_portada', 'ejemplo_duda')], ['Enviaron una consulta gratuita', g('latam_consulta')], ['Llegaron al límite de gratuitas', g('latam_limite')], ['Pagaron', sum('latam_pago:')], ['Enviaron una consulta pagada', g('latam_consulta_pagada')]], true)}<p class="mute" style="margin-top:8px">Solo campañas «…_latam». Ingresos: ${g('latam_eur')} €. Coste por consulta = gasto de la campaña LatAm ÷ ${g('latam_consulta') + g('latam_consulta_pagada')}. El resto de «de anuncio» del panel es solo España.</p></div>` : ''; })()}
<div class="card"><h2>Qué hacen quienes llegan por un anuncio</h2>${adPeople.length ? `${bars(adSteps)}${adTrips ? `<h3 class="fh">Últimos recorridos</h3><ul class="feed">${adTrips}</ul>` : ''}` : '<p class="mute">Nada todavía.</p>'}<p class="mute" style="margin-top:8px">Medido desde el 8 de noviembre (desplazamiento, secciones, enlaces y tiempo).</p></div>
<div class="card"><h2>Invitaciones</h2>${g('invitacion_vista') || g('invitacion_visita') || g('consulta_invitada') ? bars([['Vieron su enlace para invitar', g('invitacion_vista')], ['Lo compartieron por WhatsApp', g('invitacion_whatsapp')], ['Lo copiaron', g('invitacion_copiar')], ['Visitas con un enlace de invitación', g('invitacion_visita')], ['Primeras consultas con invitación', g('consulta_invitada')], ['Consultas regaladas (ya respondidas)', g('consulta_regalada')]], true) : '<p class="mute">Nada todavía. El enlace sale al valorar «Sí, mucho» en el correo de opinión.</p>'}<p class="mute" style="margin-top:8px">Cada consulta regalada es tiempo de la profesional: se regala cuando responde a alguien nuevo que llegó con un enlace.</p></div>
${(() => { const vias = [...new Set(Object.keys(tot).filter((k2) => /^(via_visita|consulta_via):/.test(k2)).map((k2) => k2.split(':')[1]))];
  return `<div class="card"><h2>Canales</h2>${vias.length ? `<table><tr><th></th><th>Visitas</th><th>Consultas</th></tr>${vias.map((v) => `<tr><td>${esc(v)}</td><td>${g(`via_visita:${v}`)}</td><td>${g(`consulta_via:${v}`)}</td></tr>`).join('')}</table>` : '<p class="mute">Nada todavía.</p>'}<p class="mute" style="margin-top:8px">Enlaces etiquetados con <b>?via=</b> (p. ej. ig_marina para el Instagram de Marina; wa_guia, guías compartidas por WhatsApp). Guías compartidas: ${g('guia_compartir')}.</p></div>`; })()}
<div class="card"><h2>De la web a la consulta</h2>${bars([withAd('Visitaron la web', g('personas_portada'), ['portada'], true), withAd('Tocaron una duda de ejemplo', g('ejemplo_duda'), ['ejemplo_duda']), withAd('Empezaron a escribir una duda', g('pregunta_portada'), ['pregunta_portada']), withAd('Cambiaron de profesional', g('elige_pro'), ['elige_pro']), withAd('Llegaron al campo de correo', g('correo_portada'), ['correo_portada']), withAd('Enviaron la consulta desde la web', g('enviada_portada'), ['enviada_portada']), withAd('Pulsaron «Abrir la app» (arriba)', g('abrir_portada'), ['abrir_portada']), withAd('Pulsaron la franja de la app', g('clic:abrir_franja'), ['clic:abrir_franja'])])}</div>
<div class="card"><h2>En la app</h2>${bars([withAd('Abrieron la app', g('apertura'), ['apertura']), withAd('Completaron la bienvenida', sum('onboarding:'), ['onboarding']), withAd('Añadieron fecha de parto', g('fecha_parto'), ['fecha_parto']), withAd('Añadieron fecha de nacimiento', g('fecha_nacimiento'), ['fecha_nacimiento']), withAd('Activaron el aviso semanal', g('push_on'), ['push_on']), withAd('Conectaron Google Drive', g('sync_on'), ['sync_on']), withAd('Pulsaron «Contacto»', g('contacto'), ['contacto'])])}</div>
<div class="card"><h2>Etapa al empezar</h2>${bars(STAGES.map(([k2, l]) => withAd(l, g(`onboarding:${k2}`), [`onboarding:${k2}`])))}</div>
<div class="card"><h2>Qué apuntan en el diario</h2>${bars(DIARY.map(([k2, l]) => withAd(l, g(`diario:${k2}`), [`diario:${k2}`])))}</div>
<div class="card"><h2>Pestañas visitadas</h2>${bars(TABS.map(([k2, l]) => withAd(l, g(`pestana:${k2}`), [`pestana:${k2}`])))}</div>
<div class="card"><h2>Páginas más visitadas</h2>${pages.error ? `<p class="mute">${esc(pages.error)}</p>` : pages.rows.length ? bars(pages.rows.map(([pth, n]) => [pth, n])) : '<p class="mute">Nada todavía.</p>'}<p class="mute" style="margin-top:8px">Visitas a cada página según Cloudflare Web Analytics, sin cookies. Incluye al equipo y no separa anuncios.</p></div>
<div class="card"><h2>Visitas por país</h2>${pages.error || !pages.countries ? `<p class="mute">${esc(pages.error || pages.countryError || 'Sin datos.')}</p>` : pages.countries.length ? `<table><tr><th></th><th>Web</th><th>App</th></tr>${pages.countries.map(([k, o]) => `<tr><td>${esc(COUNTRY[k] || countryName(k))}</td><td>${o.web}</td><td>${o.app}</td></tr>`).join('')}</table>` : '<p class="mute">Nada todavía.</p>'}<p class="mute" style="margin-top:8px">Páginas vistas según Cloudflare Web Analytics (sin cookies). «App» es /app, en el navegador o instalada. Incluye al equipo.</p></div>
<div class="card"><h2>Dispositivos</h2>${bars(devices)}</div>
<div class="card"><h2>Actividad reciente</h2><ul class="feed">${feed || '<li><span class="mute">Nada todavía.</span></li>'}</ul></div>
<div class="card"><h2>Opiniones tras la consulta</h2>${opRows ? `<table><tr><th></th><th>Sí, mucho</th><th>Más o menos</th><th>No</th></tr>${opRows}</table>` : '<p class="mute">Nada todavía.</p>'}${opFeed ? `<h3 class="fh">Comentarios</h3><ul class="feed">${opFeed}</ul>` : ''}</div>
<p class="mute" style="margin-top:14px">«Persona XXXX» es una etiqueta anónima que cambia cada día; «personas por día» suma días, así que una misma persona cuenta una vez por cada día que entra. La actividad detallada se guarda 31 días.</p>
</div><script>document.querySelectorAll('.day').forEach((g)=>{const f=()=>{document.querySelectorAll('.day.on').forEach((x)=>x.classList.remove('on'));g.classList.add('on');document.getElementById('dayinfo').textContent=g.dataset.t;};g.addEventListener('click',f);g.addEventListener('mouseenter',f);});</script></body></html>`;
}
