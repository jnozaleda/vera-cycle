// Hera · panel privado para el móvil: GET /panel?k=<DASH_KEY>&d=1|7|30
// Página generada en el servicio (sin JS, sin login: la clave va en el enlace, guárdalo en favoritos).
// Datos: recuentos por día (tabla counts, sin límite de fechas), actividad reciente (tabla activity, 31 días)
// y consultas abiertas (KV). Los dispositivos en modo equipo no envían nada, así que no aparecen.

import { eventText, deviceText } from './activity.js';
import { PLANS } from './stripe.js';

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

  // ── Vista nueva (vera-backlog#90): resumen, lo que pide atención, 5 cifras, un embudo, de dónde vienen y visitas por persona
  const PLAN_EUR = Object.fromEntries(Object.entries(PLANS).map(([k2, p]) => [k2, p.eur]));
  const pagos = Object.entries(tot).filter(([k2]) => /^pago:[a-z]+$/.test(k2) && PLAN_EUR[k2.slice(5)]);
  const nPagos = pagos.reduce((a, [, x]) => a + x, 0);
  const eur = pagos.reduce((a, [k2, x]) => a + x * PLAN_EUR[k2.slice(5)], 0);
  const nVideo = g('pago:video') + g('pago:lactancia');
  // Origen de cada persona-día: anuncio España, anuncio Latinoamérica, enlace propio (?via=, invitación) o sin etiqueta
  const VIA_NAME = { ig_marina: 'Instagram de Marina', wa_guia: 'Guías por WhatsApp' };
  const viaOf = (v) => { for (const r of v) { const m = /^via_visita:([a-z0-9_]+)$/.exec(r.e); if (m) return m[1]; } return ''; };
  const srcOf = (k2, v) => (AD.has(k2) ? 'es' : LATAM.has(k2) ? 'la' : viaOf(v) ? `via:${viaOf(v)}` : v.some((r) => is(r.e, ['invitacion_visita', 'consulta_invitada'])) ? 'inv' : 'ot');
  const people = [...byKey].map(([k2, v]) => ({ k: k2, v, src: srcOf(k2, v) }));
  const WRITE = ['pregunta_portada', 'ejemplo_duda', 'consulta_escribe', 'consulta_ejemplo'];
  const has = (v, names) => v.some((r) => is(r.e, names));
  const nCons = (v) => v.filter((r) => /^consulta:(gineco|matrona|pediatra)$/.test(r.e)).length;
  const split = (pred, count = (v) => (pred(v) ? 1 : 0)) => { const o = { es: 0, la: 0, ot: 0 }; for (const p of people) o[p.src === 'es' || p.src === 'la' ? p.src : 'ot'] += count(p.v); return o; };
  const vis = split((v) => has(v, ['portada']));
  const visTotal = Math.max(g('personas_portada'), vis.es + vis.la + vis.ot);
  vis.ot = Math.max(0, visTotal - vis.es - vis.la);
  const wr = split((v) => has(v, WRITE));
  const wrTotal = wr.es + wr.la + wr.ot;
  const cs = split(null, nCons);
  cs.ot = Math.max(0, consultas - cs.es - cs.la);
  const media = respondidas ? Math.round(horas / respondidas) : 0;
  const PERIOD = { 1: 'Hoy', 7: 'Estos 7 días', 30: 'Estos 30 días' }[days];
  const fromAds = cs.es + cs.la;
  const lead = `${PERIOD} ${consultas === 1 ? 'llegó <b>1 consulta</b>' : `llegaron <b>${consultas} consultas</b>`}${respondidas ? ` y <b>${respondidas} ${respondidas === 1 ? 'ya tiene' : 'ya tienen'} respuesta</b>, en ${media} h de media` : ''}.${consultas ? ` ${fromAds === consultas ? (consultas === 1 ? 'Vino' : 'Todas vinieron') : `${fromAds} de ${consultas} ${fromAds === 1 ? 'vino' : 'vinieron'}`} de un anuncio.` : ''} ${nPagos ? `<b>${nPagos} ${nPagos === 1 ? 'pago' : 'pagos'}, ${eur} €.</b>` : '<b>Nadie ha pagado todavía.</b>'}`;
  const pendBy = PROS.filter(([k2]) => (open.pendientes || {})[k2]).map(([k2, nm]) => `${nm} ${(open.pendientes || {})[k2]}`);
  const late = PROS.reduce((a, [k2]) => a + ((open.fuera_plazo || {})[k2] || 0), 0);
  const sinCorreo = g('clic:fallo_sin_correo'), errores = g('error_portada') + g('consulta_error');
  const guardadas = Math.max(0, g('consulta_guardada') - g('guardada_pagada'));
  const chips = [
    pendientes ? `<span class="chip warn">${pendientes} ${pendientes === 1 ? 'consulta esperando' : 'consultas esperando'} respuesta: ${pendBy.join(' · ')}</span>` : '<span class="chip ok">Ninguna consulta esperando respuesta</span>',
    late ? `<span class="chip red">${late} fuera de plazo (más de 48 h)</span>` : pendientes ? '<span class="chip ok">Ninguna fuera de plazo (48 h)</span>' : '',
    sinCorreo ? `<span class="chip red">${sinCorreo} ${sinCorreo === 1 ? 'pulsó' : 'pulsaron'} enviar sin poner correo</span>` : '',
    errores ? `<span class="chip red">${errores === 1 ? '1 envío falló' : `${errores} envíos fallaron`} (servicio o conexión)</span>` : '',
    guardadas ? `<span class="chip warn">${guardadas === 1 ? '1 consulta guardada' : `${guardadas} consultas guardadas`} sin pagar</span>` : '',
  ].join('');
  const splitTxt = (o) => (o.es || o.la ? `<span class="split"><span class="c-es">${o.es} anuncio</span>${o.la ? ` · <span class="c-la">${o.la} Latam</span>` : ''}</span>` : '<span class="split mute">0 de anuncio</span>');
  // Embudo con el origen en colores (ancho proporcional a la primera fila)
  const funRows = [['Visitaron la web', visTotal, vis], ['Empezaron a escribir', wrTotal, wr], ['Enviaron', consultas, cs], ['Tienen respuesta', respondidas, null], ['Pagaron', nPagos, null]];
  const fun = funRows.map(([l, x, o]) => {
    const w = visTotal ? Math.max(x ? 1.5 : 0, (x * 100) / visTotal) : 0;
    const seg = o && x ? ['es', 'la', 'ot'].map((s) => (o[s] ? `<i class="i-${s}" style="width:${((o[s] * 100) / x).toFixed(1)}%"></i>` : '')).join('') : x ? '<i class="i-ot" style="width:100%"></i>' : '';
    return `<div class="fr"><span>${l}</span><div class="lane"><div class="track" style="width:${w.toFixed(1)}%">${seg}</div></div><b>${x}</b></div>`;
  }).join('');
  const lostWrite = funnels[0][1].rows; // web: escribir → correo → enviar → enviaron
  const funNote = wrTotal ? `De ${wrTotal} que empezaron a escribir, enviaron ${consultas > wrTotal ? wrTotal : consultas}.${lostWrite[0].lost ? ` En la web, ${lostWrite[0].lost} se fueron antes de llegar al correo` : ''}${lostWrite[2].lost ? ` y ${lostWrite[2].lost} se quedaron en el botón de enviar` : ''}${lostWrite[0].lost || lostWrite[2].lost ? '.' : ''}` : '';
  // De dónde vienen: una fila por origen
  const rowOf = (ps, label, consOverride) => {
    const pers = ps.filter((p) => has(p.v, ['portada', 'apertura', 'video_pagina', 'via_visita', 'invitacion_visita', 'anuncio_visita'])).length;
    const w2 = ps.filter((p) => has(p.v, WRITE)).length;
    const c2 = consOverride ?? ps.reduce((a, p) => a + nCons(p.v), 0);
    const pg = ps.filter((p) => has(p.v, ['pago_hecho'])).length;
    return [label, pers, w2, c2, pg];
  };
  const campOfP = (p) => campOfV(p.v);
  const knownCamp = new Set(AD_GROUPS.map(([c2]) => c2).filter(Boolean));
  const srcRows = [];
  const esRows = AD_GROUPS.filter(([c2]) => !/_latam$/.test(c2)).map(([c2, l]) => rowOf(people.filter((p) => p.src === 'es' && (c2 ? campOfP(p) === c2 : !knownCamp.has(campOfP(p)))), c2 ? l : 'Sitelinks y otros')).filter((r) => r[1] || r[3]);
  const laRows = AD_GROUPS.filter(([c2]) => /_latam$/.test(c2)).map(([c2, l]) => rowOf(people.filter((p) => p.src === 'la' && campOfP(p) === c2), l.replace(' · Latinoamérica', ''))).filter((r) => r[1] || r[3]);
  const vias = [...new Set([...Object.keys(tot).filter((k2) => /^(via_visita|consulta_via):/.test(k2)).map((k2) => k2.split(':')[1]), 'ig_marina'])];
  const ownRows = [...vias.map((v) => rowOf(people.filter((p) => p.src === `via:${v}`), VIA_NAME[v] || v, g(`consulta_via:${v}`))), rowOf(people.filter((p) => p.src === 'inv'), 'Invitaciones', g('consulta_invitada'))];
  const otRow = rowOf(people.filter((p) => p.src === 'ot'), 'Google, directo y otros');
  if (esRows.length) srcRows.push(['Google Ads · España', esRows]);
  if (laRows.length) srcRows.push(['Google Ads · Latinoamérica', laRows]);
  srcRows.push(['Enlaces propios', ownRows], ['Sin etiqueta', [otRow]]);
  const td = (x) => `<td${x ? '' : ' class="zero"'}>${x}</td>`;
  const srcTable = `<div style="overflow-x:auto"><table class="src-t"><tr><th></th><th>Personas</th><th>Escrib.</th><th>Consult.</th><th>Pagos</th></tr>${srcRows.map(([h, rs]) => `<tr class="grp"><td colspan="5">${esc(h)}</td></tr>${rs.map(([l, ...v]) => `<tr><td>${esc(l)}</td>${v.map(td).join('')}</tr>`).join('')}`).join('')}</table></div>`;
  // Visitas por persona: una línea con lo que hizo, en orden; las que enviaron, arriba
  const PRO_NAME = Object.fromEntries(PROS);
  const STEP = (e) => {
    const [n2, v2 = ''] = e.split(':');
    if (n2 === 'consulta' && PRO_NAME[v2]) return `<b>envió a ${PRO_NAME[v2]}</b>`;
    return ({ pregunta_portada: 'escribió', consulta_escribe: 'escribió', ejemplo_duda: 'tocó un ejemplo', consulta_ejemplo: 'tocó un ejemplo', correo_portada: 'puso el correo', consulta_correo: 'puso el correo',
      adjunto_portada: 'adjuntó un archivo', consulta_adjunto: 'adjuntó un archivo', elige_pro: 'cambió de profesional', intento_portada: 'pulsó enviar', consulta_intento: 'pulsó enviar',
      consulta_abierta: 'abrió la consulta en la app', apertura: 'abrió la app', instalada: 'instaló la app', video_pagina: 'vio la videollamada', video_reserva: 'pulsó reservar videollamada', pago_hecho: '<b>pagó</b>',
      limite_portada: 'agotó las gratuitas', consulta_limite: 'agotó las gratuitas', planes_abiertos: 'vio los planes', invitacion_vista: 'vio su enlace para invitar' })[n2]
      || (n2 === 'clic' && v2.startsWith('fallo_sin_correo') ? '<b>sin correo</b>' : n2 === 'seccion' && v2 === 'precio' ? 'vio precios' : n2 === 'seccion' && v2 === 'equipo' ? 'vio el equipo' : '');
  };
  const SRC_LABEL = (p) => {
    if (p.src === 'es' || p.src === 'la') { const c2 = campOfP(p); const l = (AD_GROUPS.find(([x]) => x === c2) || [, 'Sitelinks'])[1]; return [`Anuncio ${l}`, p.src]; }
    if (p.src.startsWith('via:')) return [VIA_NAME[p.src.slice(4)] || `Enlace ${p.src.slice(4)}`, 'own'];
    if (p.src === 'inv') return ['Invitación', 'own'];
    return ['Sin etiqueta', 'ot'];
  };
  const trips = people.filter((p) => has(p.v, ['portada', 'apertura', 'video_pagina'])).map((p) => {
    const seq = [...p.v].reverse();
    const steps = []; for (const r of seq) { const s2 = STEP(r.e); if (s2 && steps[steps.length - 1] !== s2) steps.push(s2); }
    const secs = Math.max(0, ...seq.filter((r) => r.e.startsWith('tiempo:')).map((r) => Number(r.e.slice(7)) || 0));
    const scr = Math.max(0, ...seq.filter((r) => r.e.startsWith('scroll:')).map((r) => Number(r.e.slice(7)) || 0));
    const tail = [secs ? `${secs} s` : '', scr >= 50 ? `bajó al ${scr} %` : ''].filter(Boolean).join(', ');
    const sent = nCons(p.v) > 0 || has(p.v, ['pago_hecho']);
    const txt = steps.length ? `${steps.join(' → ')}${sent ? '' : ' → se fue'}${tail ? ` · ${tail}` : ''}` : `entró${tail ? ` · ${tail}` : ''} y se fue`;
    const dv = seq.find((r) => r.d)?.d; const [sl, sc] = SRC_LABEL(p);
    return { sent, ts: seq[0].ts, html: `<li><time>${madrid(seq[0].ts, days === 1 ? { hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</time><div><span class="tag">${esc(seq[0].p)}</span> ${dv ? esc(deviceText(dv)) : ''} <span class="src s-${sc}">${esc(sl)}</span><br><span class="steps">${txt}</span></div></li>` };
  }).sort((a, b) => (b.sent - a.sent) || (b.ts - a.ts));
  const tripsHtml = trips.slice(0, 15).map((t) => t.html).join('');
  const opTotal = sum('opinion:');

  const k = encodeURIComponent(url.searchParams.get('k') || '');
  const tab = (d, label) => `<a class="${d === days ? 'on' : ''}" href="?k=${k}&d=${d}">${label}</a>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#FAF9F4"><title>Hera · Panel</title>
<style>
:root{--bg:#FAF9F4;--card:#fff;--ink:#2F3631;--mute:#6E6C67;--line:#E5E1D8;--bar:#EFECE4;--plum:#45574C;--web:#B8C4BC;--ad:#BCA172;--adbar:#EFE4CC;--es:#C98B6B;--es2:#F4E6DD;--es-t:#9A5B3E;--la:#C9A84E;--la2:#F3EDD9;--la-t:#8A6D1F;--ok2:#E6ECE6;--red:#B3261E;--red2:#FBE9E6;--grp:#F5F3EC;--tag:#FFF6A8;--tag-t:#2F3631}
@media (prefers-color-scheme:dark){:root{--bg:#161B18;--card:#1F2622;--ink:#F0F1EC;--mute:#ABB2AC;--line:#2E3832;--bar:#2A332D;--plum:#A9C2B2;--web:#55695C;--ad:#D4B97F;--adbar:#4A4330;--es:#D9997A;--es2:#3A2A22;--es-t:#E8B49A;--la:#D4B65E;--la2:#332C18;--la-t:#E2C878;--ok2:#26332B;--red:#F08A80;--red2:#3B2321;--grp:#252D28;--tag:#5A5320;--tag-t:#F0F1EC}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.w{max-width:720px;margin:0 auto;padding:18px 16px 40px}
h1{font:500 28px/1.1 Georgia,serif;color:var(--plum);margin:4px 0 2px}h2{font-size:15px;font-weight:650;color:var(--plum);margin:0 0 10px}
.mute{color:var(--mute);font-size:13px;margin:0}
.fh{font-size:14px;font-weight:600;margin:16px 0 6px}.drop{margin:0 0 8px;font-size:15px}.drop b{font-size:22px}
.tabs{display:flex;gap:6px;margin:14px 0}.tabs a{flex:1;text-align:center;padding:9px;border-radius:6px;background:var(--card);border:1px solid var(--line);color:var(--ink);text-decoration:none;font-weight:600;font-size:14px}
.tabs a.on{background:var(--plum);border-color:var(--plum);color:var(--bg)}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin-top:12px}
.lead{font:400 20px/1.4 Georgia,serif;margin:0}.lead b{color:var(--plum);font-weight:600}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}.chip{border-radius:999px;padding:4px 11px;font-size:13px;font-weight:500}
.chip.ok{background:var(--ok2);color:var(--plum)}.chip.warn{background:var(--la2);color:var(--la-t)}.chip.red{background:var(--red2);color:var(--red)}
.kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-top:12px}
.k{border-top:2px solid var(--plum);padding-top:8px}.k b{display:block;font:500 28px/1.05 Georgia,serif;color:var(--plum);font-variant-numeric:tabular-nums}.k>span{font-size:12.5px;color:var(--mute);display:block}
.split{display:block;font-size:12px;margin-top:3px}.c-es{color:var(--es-t);font-weight:600}.c-la{color:var(--la-t);font-weight:600}
.leg{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12px;color:var(--mute);margin-bottom:10px}.leg i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;vertical-align:-1px}
.fr{display:grid;grid-template-columns:140px minmax(0,1fr) 40px;gap:10px;align-items:center;font-size:14px;margin-bottom:7px}.fr b{text-align:right;font-variant-numeric:tabular-nums}
.lane{background:var(--bar);border-radius:5px;height:20px;overflow:hidden}.track{display:flex;height:100%;border-radius:5px;overflow:hidden}.track i{display:block;height:100%}
.i-es{background:var(--es)}.i-la{background:var(--la)}.i-ot{background:var(--plum)}
.day{cursor:pointer}.day.on rect[fill="transparent"]{fill:var(--bar)}
.legend{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12px;color:var(--mute);margin-top:8px}.legend b{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;vertical-align:-1px}
.adn{display:block;font-size:11.5px;color:var(--plum);font-weight:600;margin-top:1px}.adn.zero,.adp.zero{color:var(--mute);font-weight:400}
.adp{font-size:12px;color:var(--plum);font-weight:600;white-space:nowrap}.bars li i.ad{background:var(--adbar)}
ul{list-style:none;margin:0;padding:0}
.bars li{position:relative;display:flex;justify-content:space-between;gap:10px;padding:7px 9px;margin-bottom:4px;border-radius:6px;overflow:hidden;font-size:14px}
.bars li span,.bars li b{position:relative;z-index:1}.bars li i{position:absolute;left:0;top:0;bottom:0;background:var(--bar);border-radius:6px}.bars li span{min-width:0}
table{width:100%;border-collapse:collapse;font-size:13.5px;font-variant-numeric:tabular-nums}th{text-align:left;font-weight:500;color:var(--mute);font-size:12.5px;padding:4px 0}td{padding:6px 0;border-top:1px solid var(--line)}td+td,th+th{text-align:right;padding-left:8px}
td.zero{color:var(--mute);opacity:.6}tr.grp td{background:var(--grp);font-size:11.5px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--mute);padding:5px 6px}
.src-t td:first-child{padding-left:6px;white-space:normal}.src-t th+th,.src-t td+td{padding-left:6px}
.feed li{padding:9px 0;border-bottom:1px solid var(--line);display:grid;grid-template-columns:auto 1fr;column-gap:10px}
.feed time{font-size:12px;color:var(--mute);grid-row:span 2;min-width:92px}.feed small{color:var(--mute);font-size:12px}
.trips li{padding:9px 0;border-bottom:1px solid var(--line);display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:10px;font-size:14px}.trips li:last-child{border-bottom:0}
.trips time{font-size:12px;color:var(--mute);min-width:52px}.steps{color:var(--mute)}.steps b{color:var(--ink)}
.tag{font-family:ui-monospace,Menlo,monospace;font-size:12px;background:var(--tag);color:var(--tag-t);padding:1px 5px;border-radius:3px}
.src{font-size:12px;border-radius:4px;padding:1px 6px;white-space:nowrap}.s-es{background:var(--es2);color:var(--es-t)}.s-la{background:var(--la2);color:var(--la-t)}.s-own{background:var(--ok2);color:var(--plum)}.s-ot{background:var(--bar);color:var(--mute)}
.two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.two .card{margin-top:12px}
details.more{margin-top:12px;background:var(--card);border:1px solid var(--line);border-radius:12px}
details.more>summary{cursor:pointer;padding:14px 16px;font-weight:650;color:var(--plum);list-style:none;display:flex;justify-content:space-between}details.more>summary::after{content:"＋";color:var(--mute)}details.more[open]>summary::after{content:"－"}
details.more>.in{padding:0 12px 12px}details.more .card{border-color:var(--line)}
details.sub>summary{cursor:pointer;color:var(--plum);font-size:13.5px;font-weight:600;margin-top:10px}
.late{color:var(--red)}
@media(max-width:640px){.kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.two{grid-template-columns:1fr}.fr{grid-template-columns:112px minmax(0,1fr) 34px}}
</style></head><body><div class="w">
<p class="mute">HERA · sin el equipo (modo equipo)</p><h1>Panel</h1>
<p class="mute">Actualizado ${madrid(now, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} (hora de Madrid). Datos anónimos, sin cookies.</p>
<div class="tabs">${tab(1, 'Hoy')}${tab(7, '7 días')}${tab(30, '30 días')}</div>

<div class="card"><p class="lead">${lead}</p><div class="chips">${chips}</div></div>

<div class="kpis">
<div class="k"><b>${visTotal}</b><span>personas en la web</span>${splitTxt(vis)}</div>
<div class="k"><b>${wrTotal}</b><span>empezaron a escribir</span>${splitTxt(wr)}</div>
<div class="k"><b>${consultas}</b><span>consultas enviadas</span>${splitTxt(cs)}</div>
<div class="k"><b>${respondidas}</b><span>respondidas</span><span class="split mute">${respondidas ? `media ${media} h` : '—'}</span></div>
<div class="k"><b>${eur} €</b><span>${nPagos === 1 ? '1 pago' : `${nPagos} pagos`}</span><span class="split mute">${nVideo === 1 ? '1 videollamada' : `${nVideo} videollamadas`}</span></div>
</div>

<div class="card"><h2>De la visita al pago</h2>
<div class="leg"><span><i class="i-es"></i>Anuncio España</span><span><i class="i-la"></i>Anuncio Latinoamérica</span><span><i class="i-ot"></i>Resto (Google, directo, enlaces)</span></div>
${fun}${funNote ? `<p class="mute" style="margin-top:6px">${funNote}</p>` : ''}</div>

<div class="card"><h2>De dónde vienen</h2>${srcTable}
<p class="mute" style="margin-top:8px">Personas por día. Coste por consulta: lo gastado en cada grupo ÷ sus consultas. Enlaces propios: <b>?via=</b> (ig_marina, wa_guia…) e invitaciones (?r=).</p></div>

<div class="two">
<div class="card"><h2>Consultas por profesional</h2>
<table><tr><th></th><th>Enviadas</th><th>Resp.</th><th>Media</th><th>Esperan</th></tr>
${PROS.map(([k2, name]) => { const r = g(`respondida:${k2}`); const fp = (open.fuera_plazo || {})[k2] || 0; return `<tr><td>${name}</td>${td(g(`consulta:${k2}`))}${td(r)}<td>${r ? `${Math.round(g(`resp_horas:${k2}`) / r)} h` : '—'}</td><td${fp ? ' class="late"' : (open.pendientes || {})[k2] ? '' : ' class="zero"'}>${(open.pendientes || {})[k2] || 0}</td></tr>`; }).join('')}
</table>${late ? '<p class="mute late" style="margin-top:8px">En rojo: alguna de más de 48 h sin responder.</p>' : ''}</div>
<div class="card"><h2>Lo que se mueve</h2>
<table>
<tr><td>Vieron la página de videollamada</td>${td(g('video_pagina') + sum('video_pagina:'))}</tr>
<tr><td>Pagaron una videollamada</td>${td(nVideo)}</tr>
<tr><td>Agotaron las gratuitas</td>${td(g('gratuitas_agotadas'))}</tr>
<tr><td>Consultas guardadas sin pagar</td>${td(guardadas)}</tr>
<tr><td>Instalaron la app</td>${td(g('instalada'))}</tr>
<tr><td>Opiniones recibidas</td>${td(opTotal)}</tr>
<tr><td>Consultas regaladas por invitar</td>${td(g('consulta_regalada'))}</tr>
</table></div>
</div>

<div class="card"><h2>Últimas visitas</h2><p class="mute" style="margin-bottom:6px">Una línea por persona y día, con lo que hizo en orden. Las que enviaron, arriba.</p>
<ul class="trips">${tripsHtml || '<li><span class="mute">Nada todavía.</span></li>'}</ul>
<details class="sub"><summary>Ver toda la actividad, evento a evento</summary><ul class="feed">${feed || '<li><span class="mute">Nada todavía.</span></li>'}</ul></details></div>

${opFeed || opRows ? `<div class="card"><h2>Opiniones tras la consulta</h2>${opRows ? `<table><tr><th></th><th>Sí, mucho</th><th>Más o menos</th><th>No</th></tr>${opRows}</table>` : ''}${opFeed ? `<h3 class="fh">Comentarios</h3><ul class="feed">${opFeed}</ul>` : ''}</div>` : ''}

<details class="more"><summary>Más detalle</summary><div class="in">
<div class="card"><h2>Personas por día</h2>${chart.join('')}
<div class="legend"><span><b style="background:var(--plum)"></b>App · ${sumOf('a')}</span><span><b style="background:var(--web)"></b>Web · ${sumOf('w')}</span><span><b style="background:var(--ad)"></b>Parte que vino de anuncio (España): app ${sumOf('aa')} · web ${sumOf('aw')}</span></div>
<p class="mute" id="dayinfo" style="margin-top:6px">Toca o pasa el ratón por un día para ver sus cifras.</p></div>
<div class="card"><h2>Dónde se caen, paso a paso</h2><p class="mute">Personas distintas por día; entre paréntesis, las de anuncio en España. En la app, desde el 1 de noviembre.</p>${funnels.map(funnelCard).join('')}${(() => { const why = [['Sin correo', g('clic:fallo_sin_correo')], ['Correo mal escrito', g('clic:fallo_correo_mal')], ['Duda demasiado corta', g('clic:fallo_texto_corto')], ['Sin elegir profesional', g('clic:fallo_sin_profesional')], ['Error al enviar (servicio o conexión)', g('error_portada')], ['Agotó las gratuitas', g('limite_portada')]]; return why.some(([, n]) => n) ? `<h3 class="fh">En la web, por qué no se envió al pulsar</h3>${bars(why)}` : ''; })()}${opensCard}${lostFeed ? `<h3 class="fh">Últimas caídas</h3><ul class="feed">${lostFeed}</ul>` : ''}</div>
<div class="card"><h2>Qué hacen quienes llegan por un anuncio (España)</h2>${adPeople.length ? bars(adSteps) : '<p class="mute">Nada todavía.</p>'}
<p class="mute" style="margin-top:8px">Ingresos de anuncios: España ${g('anuncio_eur')} € · Latinoamérica ${g('latam_eur')} € (sin restar reembolsos). Instalaciones de anuncio: en Android, exacto; en iPhone, aproximado.</p></div>
<div class="card"><h2>Invitaciones</h2>${bars([['Vieron su enlace (tras valorar «Sí, mucho»)', g('invitacion_vista')], ['Lo compartieron por WhatsApp', g('invitacion_whatsapp')], ['Lo copiaron', g('invitacion_copiar')], ['Visitas con un enlace de invitación', g('invitacion_visita')], ['Primeras consultas con invitación', g('consulta_invitada')], ['Consultas regaladas (ya respondidas)', g('consulta_regalada')], ['Guías compartidas por WhatsApp', g('guia_compartir')]], true)}<p class="mute" style="margin-top:8px">El enlace también va al pie de la primera respuesta y del correo de videollamada pagada (esos clics no se pueden contar).</p></div>
<div class="card"><h2>En la app</h2>${bars([withAd('Abrieron la app', g('apertura'), ['apertura']), withAd('Completaron la bienvenida', sum('onboarding:'), ['onboarding']), withAd('Añadieron fecha de parto', g('fecha_parto'), ['fecha_parto']), withAd('Añadieron fecha de nacimiento', g('fecha_nacimiento'), ['fecha_nacimiento']), withAd('Activaron el aviso semanal', g('push_on'), ['push_on']), withAd('Conectaron Google Drive', g('sync_on'), ['sync_on']), withAd('Pulsaron «Contacto»', g('contacto'), ['contacto'])])}
<h3 class="fh">Etapa al empezar</h3>${bars(STAGES.map(([k2, l]) => withAd(l, g(`onboarding:${k2}`), [`onboarding:${k2}`])))}
<h3 class="fh">Qué apuntan en el diario</h3>${bars(DIARY.map(([k2, l]) => withAd(l, g(`diario:${k2}`), [`diario:${k2}`])))}
<h3 class="fh">Pestañas visitadas</h3>${bars(TABS.map(([k2, l]) => withAd(l, g(`pestana:${k2}`), [`pestana:${k2}`])))}</div>
<div class="card"><h2>En la web</h2>${bars([withAd('Tocaron una duda de ejemplo', g('ejemplo_duda'), ['ejemplo_duda']), withAd('Cambiaron de profesional', g('elige_pro'), ['elige_pro']), withAd('Pulsaron «Abrir la app» (arriba)', g('abrir_portada'), ['abrir_portada']), withAd('Pulsaron la franja de la app', g('clic:abrir_franja'), ['clic:abrir_franja'])])}</div>
<div class="card"><h2>Páginas más visitadas</h2>${pages.error ? `<p class="mute">${esc(pages.error)}</p>` : pages.rows.length ? bars(pages.rows.map(([pth, n]) => [pth, n])) : '<p class="mute">Nada todavía.</p>'}<p class="mute" style="margin-top:8px">Según Cloudflare Web Analytics, sin cookies. Incluye al equipo.</p></div>
<div class="card"><h2>Visitas por país</h2>${pages.error || !pages.countries ? `<p class="mute">${esc(pages.error || pages.countryError || 'Sin datos.')}</p>` : pages.countries.length ? `<table><tr><th></th><th>Web</th><th>App</th></tr>${pages.countries.map(([k3, o]) => `<tr><td>${esc(COUNTRY[k3] || countryName(k3))}</td><td>${o.web}</td><td>${o.app}</td></tr>`).join('')}</table>` : '<p class="mute">Nada todavía.</p>'}</div>
<div class="card"><h2>Dispositivos</h2>${bars(devices)}</div>
</div></details>
<p class="mute" style="margin-top:14px">«Persona XXXX» es una etiqueta anónima que cambia cada día; «personas» suma días, así que una misma persona cuenta una vez por cada día que entra. La actividad detallada se guarda 31 días.</p>
</div><script>document.querySelectorAll('.day').forEach((g)=>{const f=()=>{document.querySelectorAll('.day.on').forEach((x)=>x.classList.remove('on'));g.classList.add('on');document.getElementById('dayinfo').textContent=g.dataset.t;};g.addEventListener('click',f);g.addEventListener('mouseenter',f);});</script></body></html>`;
}
