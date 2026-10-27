// Hera · panel privado para el móvil: GET /panel?k=<DASH_KEY>&d=1|7|30
// Página generada en el servicio (sin JS, sin login: la clave va en el enlace, guárdalo en favoritos).
// Datos: recuentos por día (tabla counts, sin límite de fechas), actividad reciente (tabla activity, 31 días)
// y consultas abiertas (KV). Los dispositivos en modo equipo no envían nada, así que no aparecen.

import { eventText, deviceText } from './activity.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const madrid = (ts, opts) => new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', ...opts }).format(new Date(ts));
const dayISO = (ts) => madrid(ts, { year: 'numeric', month: '2-digit', day: '2-digit' }).split('/').reverse().join('-');
const PROS = [['gineco', 'Gonzalo'], ['matrona', 'Marina'], ['pediatra', 'Lucía']];
const STAGES = [['pregnancy', 'Embarazo'], ['postpartum', 'Posparto'], ['cycle', 'Ciclo']];
const TABS = [['today', 'Hoy'], ['diary', 'Diario'], ['care', 'Cuidados'], ['guide', 'Dudas'], ['baby', 'Tu bebé'], ['cycle', 'Ciclo'], ['trends', 'Patrones']];
const DIARY = [['sintoma', 'Síntomas'], ['animo', 'Ánimo'], ['regla', 'Regla'], ['dato', 'Peso, sueño o temperatura'], ['flujo', 'Flujo'], ['estres', 'Estrés'], ['intimidad', 'Relaciones'], ['ovulacion', 'Test de ovulación']];

export async function panel(env, url, openThreads) {
  const days = [1, 7, 30].includes(Number(url.searchParams.get('d'))) ? Number(url.searchParams.get('d')) : 7;
  const now = Date.now();
  const from = dayISO(now - (days - 1) * 86400000);
  const rows = (await env.DB.prepare('SELECT day, k, n FROM counts WHERE day >= ?1').bind(from).all()).results || [];
  const tot = {}; const byDay = {};
  for (const r of rows) { tot[r.k] = (tot[r.k] || 0) + r.n; (byDay[r.day] ||= {})[r.k] = r.n; }
  const g = (k) => tot[k] || 0;
  const sum = (prefix) => Object.entries(tot).filter(([k]) => k.startsWith(prefix)).reduce((a, [, n]) => a + n, 0);
  const act = (await env.DB.prepare('SELECT ts, e, d, p FROM activity WHERE ts > ?1 ORDER BY ts DESC').bind(now - days * 86400000).all()).results || [];
  const open = openThreads ? await openThreads(env) : { pendientes: {}, fuera_plazo: {} };

  const bars = (pairs) => {
    const vis = pairs.filter(([, x]) => x > 0);
    if (!vis.length) return '<p class="mute">Nada todavía.</p>';
    const max = Math.max(...vis.map(([, x]) => x));
    return `<ul class="bars">${vis.map(([k, x]) => `<li><span>${esc(k)}</span><b>${x}</b><i style="width:${Math.round((x / max) * 100)}%"></i></li>`).join('')}</ul>`;
  };

  // Personas por día (app y web), con la huella diaria anónima
  const n = Math.max(days, 7);
  const slots = Array.from({ length: n }, (_, i) => now - (n - 1 - i) * 86400000);
  const perDay = slots.map((ts) => { const d = byDay[dayISO(ts)] || {}; return [madrid(ts, { day: 'numeric', month: 'short' }).replace('.', ''), d.personas_app || 0, d.personas_portada || 0]; });
  const maxDay = Math.max(1, ...perDay.map(([, a, w]) => Math.max(a, w)));

  // Dispositivos (personas distintas por día y dispositivo, de la actividad)
  const dev = new Map();
  for (const r of act) if (r.d && r.p) { const k = deviceText(r.d); (dev.get(k) || dev.set(k, new Set()).get(k)).add(`${dayISO(r.ts)}:${r.p}`); }
  const devices = [...dev.entries()].map(([k, s]) => [k, s.size]).sort((a, b) => b[1] - a[1]);

  const consultas = PROS.reduce((a, [k]) => a + g(`consulta:${k}`), 0);
  const respondidas = PROS.reduce((a, [k]) => a + g(`respondida:${k}`), 0);
  const horas = PROS.reduce((a, [k]) => a + g(`resp_horas:${k}`), 0);
  const pendientes = Object.values(open.pendientes || {}).reduce((a, x) => a + x, 0);

  const feed = act.slice(0, 80).map((r) => `<li><time>${madrid(r.ts, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</time>
<span>${esc(eventText(r.e))}</span><small>${r.p ? `Persona ${esc(r.p)}` : 'Servicio'}${r.d ? ` · ${esc(deviceText(r.d))}` : ''}</small></li>`).join('');

  const k = encodeURIComponent(url.searchParams.get('k') || '');
  const tab = (d, label) => `<a class="${d === days ? 'on' : ''}" href="?k=${k}&d=${d}">${label}</a>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#FAF8F5"><title>Hera · Panel</title>
<style>
:root{--bg:#FAF8F5;--card:#fff;--ink:#2E2630;--mute:#6E6268;--line:#E6DFE2;--bar:#F4E6E8;--plum:#693D55;--web:#C9B2BE}
@media (prefers-color-scheme:dark){:root{--bg:#1C1018;--card:#2A1823;--ink:#F3ECEF;--mute:#B9A9B1;--line:#3B2632;--bar:#3E2534;--plum:#E2B6CB;--web:#7C5A6C}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.w{max-width:640px;margin:0 auto;padding:18px 16px 40px}
h1{font:500 28px/1.1 Georgia,serif;color:var(--plum);margin:4px 0 2px}h2{font-size:15px;font-weight:650;color:var(--plum);margin:0 0 10px}
.mute{color:var(--mute);font-size:13px;margin:0}
.tabs{display:flex;gap:6px;margin:14px 0}.tabs a{flex:1;text-align:center;padding:9px;border-radius:6px;background:var(--card);border:1px solid var(--line);color:var(--ink);text-decoration:none;font-weight:600;font-size:14px}
.tabs a.on{background:var(--plum);border-color:var(--plum);color:#fff}
.kpis{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.k{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px}.k b{display:block;font:500 30px/1 Georgia,serif;color:var(--plum)}.k span{font-size:12.5px;color:var(--mute)}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin-top:12px}
.days{display:flex;align-items:flex-end;gap:3px;height:96px}.days div{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;gap:3px;font-size:9px;color:var(--mute);min-width:0}
.days .pair{display:flex;gap:2px;width:100%;height:64px;align-items:flex-end;justify-content:center;flex:none}.days i{display:block;flex:none;width:calc(50% - 1px);max-width:14px;background:var(--plum);border-radius:3px 3px 1px 1px;min-height:2px}.days i.web{background:var(--web)}
.legend{display:flex;gap:14px;font-size:12px;color:var(--mute);margin-top:8px}.legend b{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;vertical-align:-1px}
ul{list-style:none;margin:0;padding:0}
.bars li{position:relative;display:flex;justify-content:space-between;gap:10px;padding:7px 9px;margin-bottom:4px;border-radius:6px;overflow:hidden;font-size:14px}
.bars li span,.bars li b{position:relative;z-index:1}.bars li i{position:absolute;left:0;top:0;bottom:0;background:var(--bar);border-radius:6px}
table{width:100%;border-collapse:collapse;font-size:13.5px;font-variant-numeric:tabular-nums}th{text-align:left;font-weight:500;color:var(--mute);font-size:12.5px;padding:4px 0}td{padding:6px 0;border-top:1px solid var(--line)}td+td,th+th{text-align:right}
.feed li{padding:9px 0;border-bottom:1px solid var(--line);display:grid;grid-template-columns:auto 1fr;column-gap:10px}
.feed time{font-size:12px;color:var(--mute);grid-row:span 2;min-width:92px}.feed small{color:var(--mute);font-size:12px}
.late{color:#B4475E}
</style></head><body><div class="w">
<p class="mute">HERA · sin el equipo (modo equipo)</p><h1>Panel</h1>
<p class="mute">Actualizado ${madrid(now, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} (hora de Madrid). Datos anónimos, sin cookies.</p>
<div class="tabs">${tab(1, 'Hoy')}${tab(7, '7 días')}${tab(30, '30 días')}</div>
<div class="kpis">
<div class="k"><b>${g('personas_portada')}</b><span>visitas a la web (personas/día)</span></div>
<div class="k"><b>${g('personas_app')}</b><span>personas en la app (por día)</span></div>
<div class="k"><b>${g('instalada')}</b><span>instalaciones</span></div>
<div class="k"><b>${sum('onboarding:')}</b><span>bienvenidas completadas</span></div>
<div class="k"><b>${consultas}</b><span>consultas enviadas</span></div>
<div class="k"><b>${pendientes}</b><span>consultas pendientes ahora</span></div>
</div>
<div class="card"><h2>Personas por día</h2><div class="days">${perDay.map(([d, a, w]) => `<div><span>${a + w || ''}</span><span class="pair"><i style="height:${Math.round((a / maxDay) * 64)}px"></i><i class="web" style="height:${Math.round((w / maxDay) * 64)}px"></i></span>${esc(d)}</div>`).join('')}</div>
<div class="legend"><span><b style="background:var(--plum)"></b>App</span><span><b style="background:var(--web)"></b>Web</span></div></div>
<div class="card"><h2>De la web a la consulta</h2>${bars([['Visitaron la web', g('personas_portada')], ['Empezaron a escribir una duda', g('pregunta_portada')], ['Enviaron la consulta desde la web', g('enviada_portada')], ['Pulsaron «Abrir Hera»', g('abrir_portada')]])}</div>
<div class="card"><h2>En la app</h2>${bars([['Abrieron la app', g('apertura')], ['Completaron la bienvenida', sum('onboarding:')], ['Añadieron fecha de parto', g('fecha_parto')], ['Añadieron fecha de nacimiento', g('fecha_nacimiento')], ['Activaron el aviso semanal', g('push_on')], ['Conectaron Google Drive', g('sync_on')], ['Pulsaron «Contacto»', g('contacto')]])}</div>
<div class="card"><h2>Etapa al empezar</h2>${bars(STAGES.map(([k2, l]) => [l, g(`onboarding:${k2}`)]))}</div>
<div class="card"><h2>Consultas</h2>
<table><tr><th></th><th>Enviadas</th><th>Resp.</th><th>Media</th><th>Pend.</th></tr>
${PROS.map(([k2, name]) => { const r = g(`respondida:${k2}`); const fp = (open.fuera_plazo || {})[k2] || 0; return `<tr><td>${name}</td><td>${g(`consulta:${k2}`)}</td><td>${r}</td><td>${r ? `${Math.round(g(`resp_horas:${k2}`) / r)} h` : '—'}</td><td${fp ? ' class="late"' : ''}>${(open.pendientes || {})[k2] || 0}</td></tr>`; }).join('')}
</table>
${Object.values(open.fuera_plazo || {}).some(Boolean) ? `<p class="mute late" style="margin-top:8px">En rojo: con alguna consulta de más de 48 h sin responder (${PROS.filter(([k2]) => (open.fuera_plazo || {})[k2]).map(([k2, nm]) => `${nm} ${(open.fuera_plazo || {})[k2]}`).join(', ')}).</p>` : ''}
<p class="mute" style="margin-top:8px">Respondidas en total: ${respondidas}${respondidas ? ` · tiempo medio ${Math.round(horas / respondidas)} h` : ''}. Gratuitas agotadas: ${g('gratuitas_agotadas')} · piden aviso de pago: ${g('aviso_pago')}.</p></div>
<div class="card"><h2>Qué apuntan en el diario</h2>${bars(DIARY.map(([k2, l]) => [l, g(`diario:${k2}`)]))}</div>
<div class="card"><h2>Pestañas visitadas</h2>${bars(TABS.map(([k2, l]) => [l, g(`pestana:${k2}`)]))}</div>
<div class="card"><h2>Dispositivos</h2>${bars(devices)}</div>
<div class="card"><h2>Actividad reciente</h2><ul class="feed">${feed || '<li><span class="mute">Nada todavía.</span></li>'}</ul></div>
<p class="mute" style="margin-top:14px">«Persona XXXX» es una etiqueta anónima que cambia cada día; «personas por día» suma días, así que una misma persona cuenta una vez por cada día que entra. La actividad detallada se guarda 31 días.</p>
</div></body></html>`;
}
