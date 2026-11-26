import { isEvent, eventText, deviceText, hourlyDigest } from '../src/activity.js';
import worker, { normalizeEmail, confirmEmail, PROS, relayIncoming, remindOverdue } from '../src/worker.js';
import { stripQuoted, parseRelayAddress, relayAddress, loadThread, saveThread, openEmail } from '../src/relay.js';
import assert from 'node:assert/strict';

assert.equal(normalizeEmail(' Maria.Lopez+hera@Gmail.com '), 'marialopez@gmail.com');
assert.equal(normalizeEmail('maria.lopez@googlemail.com'), 'marialopez@gmail.com');
assert.equal(normalizeEmail('ana.g+x@hotmail.es'), 'ana.g@hotmail.es');
assert.equal(normalizeEmail('no-es-un-correo'), null);
assert.match(confirmEmail(PROS.matrona, { text: 'Hola', context: '' }, 1).text, /Te queda 1 consulta gratuita/);
assert.match(confirmEmail(PROS.matrona, { text: 'Hola', context: '' }, 0).text, /última consulta gratuita/);
assert.match(confirmEmail(PROS.matrona, { text: '<script>', context: '' }, 1).html, /&lt;script&gt;/);

const store = new Map();
const metas = new Map();
const KV = { async get(k, t) { const v = store.get(k); return v == null ? null : t === 'json' ? JSON.parse(v) : v; }, async put(k, v, o) { store.set(k, v); if (o?.metadata) metas.set(k, o.metadata); }, async delete(k) { store.delete(k); },
  async list({ prefix }) { return { keys: [...store.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name, metadata: metas.get(name) })), list_complete: true }; } };
const sent = [];
const saldo = new Map(); const counts = new Map(); const visitors = new Set(); const activity = []; const opiniones = []; const taps = [];
const DB = { async batch(list) { const out = []; for (const st of list) out.push(await st.run()); return out; }, prepare(sql) { return { bind(...a) { return { async run() {
  if (sql.startsWith('INSERT INTO counts')) { const k = a[0] + '|' + a[1]; counts.set(k, (counts.get(k) || 0) + 1); return { meta: { changes: 1 } }; }
  if (sql.startsWith('UPDATE saldo SET n = (CASE')) { saldo.set(a[0], (saldo.get(a[0]) || 0) + a[1]); return { meta: { changes: 1 } }; }
  if (sql.startsWith('INSERT INTO opiniones')) { opiniones.push({ ts: a[0], pro: a[1], rating: a[2], texto: a[3], nombre: a[4], publicable: a[5] }); return { meta: { changes: 1 } }; }
  if (sql.startsWith('INSERT INTO taps')) { taps.push({ ts: a[0], pg: a[1], x: a[2], y: a[3], w: a[4], h: a[5], el: a[6], act: a[7], d: a[8], p: a[9] }); return { meta: { changes: 1 } }; }
  if (sql.startsWith('INSERT INTO activity')) { activity.push({ ts: a[0], e: a[1], d: a[2], p: a[3] }); return { meta: { changes: 1 } }; }
  if (sql.startsWith('INSERT OR IGNORE')) { const k = a.join('|'); if (visitors.has(k)) return { meta: { changes: 0 } }; visitors.add(k); return { meta: { changes: 1 } }; }
  return { meta: { changes: 0 } }; },
  async all() { if (sql.includes('FROM taps')) return { results: taps.filter((t) => t.pg === a[0] && t.ts > a[1]) }; if (sql.includes('FROM opiniones')) return { results: opiniones }; if (sql.includes('FROM activity')) return { results: activity.filter((r) => r.ts > a[0] && r.ts <= a[1]) }; return { results: [...counts].map(([k, n]) => ({ day: k.split('|')[0], k: k.split('|')[1], n })) }; } }; } }; } };
const env = { KV, DB, PANEL_CODE: 'panel', COPY_TO: 'copia@example.com', HASH_SALT: 'sal', ADMIN_TOKEN: 'adm', ALLOWED_ORIGINS: 'https://hera-gine.com', FROM: 'Hera <consultas@hera-gine.com>', FREE_LIMIT: '2', DRY_RUN: '0', RELAY: '1', RESEND_API_KEY: 'k', ADD_WINDOW_MIN: '0', BF_OFFER_END_MS: String(Date.parse('2026-12-01T23:59:59+01:00')) }; // las pruebas de Black Friday siguen como si estuviera en marcha // 0: sin «añadir a la consulta» salvo en su prueba
let rid = 0;
globalThis.fetch = async (u, o) => {
  if (!o || o.method !== 'POST') return new Response(JSON.stringify({ message_id: `<m${u.split('/').pop()}@resend>` }), { status: 200 });
  sent.push(JSON.parse(o.body)); return new Response(JSON.stringify({ id: `r${++rid}` }), { status: 200 });
};
let ip = 0;
const call = (path, body, extra = {}) => worker.fetch(new Request(`https://w${path}`, { method: 'POST', headers: { Origin: 'https://hera-gine.com', 'CF-Connecting-IP': `1.1.1.${ip++}`, ...extra }, body: JSON.stringify(body) }), env).then(async (r) => ({ s: r.status, j: await r.json() }));
const q = { email: 'Maria.Lopez@gmail.com', to: 'matrona', text: 'Me duele al dar el pecho', context: 'Posparto · semana 2' };

let r = await call('/ask', q);
assert.deepEqual([r.s, r.j.remaining], [200, 1]);
assert.equal(sent.length, 3, 'correo al profesional, copia para el equipo y confirmación');
assert.equal(sent[0].to[0], 'marina@hera-gine.com'); assert.match(sent[0].reply_to, /^hera-p-[a-z0-9]{8}-[a-f0-9]{10}@hera-gine\.com$/, 'el profesional responde a una dirección de Hera');
assert.ok(!sent[0].html.includes('Maria.Lopez'), 'el profesional no ve el correo de la usuaria'); assert.match(sent[2].reply_to, /^hera-u-/);
assert.equal(sent[2].to[0], 'Maria.Lopez@gmail.com');
assert.equal(sent[0].bcc, undefined); assert.equal(sent[2].bcc, undefined, 'sin copias ocultas');
assert.equal(sent[1].to[0], 'copia@example.com'); assert.match(sent[1].subject, /^Consulta · Marina · #[A-Z0-9]{8}$/); assert.match(sent[1].text, /Me duele al dar el pecho/, 'la copia lleva el texto entero');
assert.match(sent[1].from, /Hera · Equipo/); assert.ok(!sent[1].html.includes('Maria.Lopez'), 'la copia no lleva el correo de la usuaria');
r = await call('/ask', { ...q, email: 'marialopez+otra@gmail.com', to: 'pediatra' });
assert.equal(r.j.remaining, 0, 'cuenta en total y normaliza el correo');
r = await call('/ask', q);
assert.equal(r.j.limit, true); assert.equal(sent.length, 6, 'agotadas: no se envía nada');
assert.ok(![...store.values()].some((v) => v.includes('duele')), 'el texto no se guarda');
assert.ok(![...store.values()].some((v) => v.includes('Maria.Lopez')), 'el correo de la usuaria se guarda cifrado en el hilo');
assert.ok(![...store.keys()].some((k) => k.includes('maria')), 'el correo no se guarda en claro en el contador');

r = await call('/ask', { ...q, to: 'otro' }); assert.equal(r.s, 400);
r = await call('/ask', { ...q, email: 'x' }); assert.equal(r.s, 400);
r = await worker.fetch(new Request('https://w/ask', { method: 'POST', headers: { Origin: 'https://malo.com' }, body: '{}' }), env); assert.equal(r.status, 403);
r = await call('/notify', { email: 'Maria.Lopez@gmail.com' }); assert.equal(r.s, 400, 'sin consentimiento no se guarda');
r = await call('/notify', { email: 'Maria.Lopez@gmail.com', consent: true }); assert.equal(r.s, 200);
assert.ok([...store.values()].some((v) => v.includes('Maria.Lopez@gmail.com')), 'lista de aviso con consentimiento');
r = await call('/admin/reset', { email: 'marialopez@gmail.com' }, { Authorization: 'Bearer adm' }); assert.equal(r.s, 200);
r = await call('/ask', q); assert.equal(r.j.remaining, 1, 'reset vuelve a dar gratuitas');
// límite por IP
const fixed = (b) => worker.fetch(new Request('https://w/ask', { method: 'POST', headers: { Origin: 'https://hera-gine.com', 'CF-Connecting-IP': '9.9.9.9' }, body: JSON.stringify(b) }), env);
let last; for (let i = 0; i < 6; i++) last = await fixed({ ...q, email: `p${i}@x.com` });
assert.equal(last.status, 429);
const cnt = (k) => [...counts].filter(([kk]) => kk.endsWith('|' + k)).reduce((a, [, n]) => a + n, 0);
assert.ok(cnt('consulta:matrona') >= 1 && cnt('consulta:pediatra') >= 1, 'cuenta consultas por profesional');
assert.ok(cnt('gratuitas_agotadas') >= 1); assert.equal(cnt('aviso_pago'), 1);
r = await call('/hit', { e: 'apertura' }, { 'CF-Connecting-IP': '5.5.5.5', 'User-Agent': 'x' });
await call('/hit', { e: 'apertura' }, { 'CF-Connecting-IP': '5.5.5.5', 'User-Agent': 'x' });
await call('/hit', { e: 'pestana:care' });
r = await call('/hit', { e: 'otra_cosa' }); assert.equal(r.s, 400, 'eventos fuera de la lista');
assert.equal(cnt('apertura'), 2); assert.equal(cnt('personas_app'), 1, 'misma persona el mismo día cuenta una vez');
let st = await worker.fetch(new Request('https://w/stats?days=7', { headers: { Origin: 'https://hera-gine.com', Authorization: 'Bearer panel' } }), env);
assert.equal(st.status, 200); assert.ok((await st.json()).rows.length > 0);
st = await worker.fetch(new Request('https://w/stats', { headers: { Origin: 'https://hera-gine.com', Authorization: 'Bearer mal' } }), env); assert.equal(st.status, 401);

// MARK: respuestas a través de Hera
assert.equal(stripQuoted('Hola, es normal.\n\nUn saludo\n\nEl lun, 13 oct 2026 a las 10:00, Hera <\nconsultas@hera-gine.com> escribió:\n> Me duele'), 'Hola, es normal.\n\nUn saludo');
assert.equal(stripQuoted('Gracias!\n\nEnviado desde mi iPhone'), 'Gracias!');
assert.equal(stripQuoted('Ok\n\nOn Mon, Oct 13, 2026 at 10:00 AM Hera wrote:\n> x'), 'Ok');
const tid = Object.keys(Object.fromEntries(store)).find((k) => k.startsWith('t:')).slice(2);
const pAddr = await relayAddress(env, 'p', tid), uAddr = await relayAddress(env, 'u', tid);
assert.deepEqual(await parseRelayAddress(env, pAddr), { role: 'p', id: tid });
assert.equal(await parseRelayAddress(env, pAddr.replace(/-[a-f0-9]{10}@/, '-0000000000@')), null, 'firma falsa');
let t = await loadThread(env, tid);
assert.equal(await openEmail(env, t.u), 'Maria.Lopez@gmail.com');

const mime = (from, to, body, extra = '') => `From: ${from}\r\nTo: ${to}\r\nSubject: Re: x\r\nMessage-ID: <in${Math.random()}@gmail.com>\r\nIn-Reply-To: <ses${Math.random()}@amazonses.com>\r\n${extra}Content-Type: text/plain; charset=utf-8\r\n\r\n${body}`;
let n0 = sent.length;
let rr = await relayIncoming(env, t, 'p', mime('marina.personal@gmail.com', pAddr, 'Es normal al principio.\r\n\r\nEl lun, 13 oct 2026, Hera escribió:\r\n> Me duele'));
assert.ok(rr.ok); const out = sent[n0];
assert.match(out.html, /¿Te ha ayudado la respuesta de Marina\?/, 'valoración al pie de la primera respuesta'); assert.match(out.text, /opinion\/\?t=[a-z0-9]{8}&s=[a-f0-9]{16}&r=1/);
assert.equal(out.to[0], 'Maria.Lopez@gmail.com'); assert.equal(out.from, 'Marina · Hera <marina@hera-gine.com>');
assert.equal(out.reply_to, uAddr); assert.ok(out.text.includes('Es normal al principio.') && !out.text.includes('Me duele'), 'sin lo citado');
assert.ok(!out.text.includes('marina.personal'), 'no se ve el correo personal');
t = await loadThread(env, tid); assert.ok(t.a > 0, 'consulta respondida'); assert.equal(cnt('respondida:matrona'), 1);
rr = await relayIncoming(env, t, 'u', mime('otra@x.com', uAddr, 'hola')); assert.equal(rr.why, 'sender', 'solo la usuaria puede escribir por su dirección');
n0 = sent.length;
rr = await relayIncoming(env, await loadThread(env, tid), 'u', mime('maria.lopez@gmail.com', uAddr, '¿Y si sangra?'));
assert.ok(rr.ok); assert.equal(sent[n0].to[0], 'marina@hera-gine.com'); assert.equal(sent[n0].reply_to, pAddr);
assert.ok(sent[n0].headers.References.split(' ').length >= 2, 'el hilo del profesional incluye el aviso original y su propia respuesta');
// recordatorio a las 16 h
await call('/ask', { ...q, email: 'nueva@x.com', to: 'gineco' });
const old = [...store.keys()].filter((k) => k.startsWith('t:')).map((k) => [k, JSON.parse(store.get(k))]).find(([, v]) => v.p === 'gineco');
old[1].c = Date.now() - 41 * 3600000; await KV.put(old[0], JSON.stringify(old[1]), { metadata: { p: 'gineco', c: old[1].c, a: 0, r: 0 } });
n0 = sent.length; assert.equal(await remindOverdue(env), 1); assert.equal(sent[n0].to[0], 'gonzalo@hera-gine.com');
assert.equal(await remindOverdue(env), 0, 'solo un recordatorio');
st = await worker.fetch(new Request('https://w/stats?days=7', { headers: { Origin: 'https://hera-gine.com', Authorization: 'Bearer panel' } }), env);
assert.equal((await st.json()).open.pendientes.gineco, 1);
// otras direcciones: se reenvían
let fw = null; await worker.email({ to: 'consultas@hera-gine.com', from: 'a@b.c', forward: async (x) => { fw = x; }, setReject() {} }, env);
assert.equal(fw, 'copia@example.com');
// estado de las consultas para la app
const sj = await worker.fetch(new Request(`https://w/status?ids=${tid},zzzzzzzz,../x`, { headers: { Origin: 'https://hera-gine.com' } }), env).then((r) => r.json());
assert.ok(sj.status[tid].a > 0, 'respondida'); assert.equal(sj.status.zzzzzzzz, null); assert.equal(Object.keys(sj.status).length, 2, 'ignora ids raros');
r = await call('/ask', { ...q, email: 'otra2@x.com', to: 'gineco' }); assert.match(r.j.id, /^[a-z0-9]{8}$/, 'devuelve el número de consulta');
// consultas ilimitadas (beta)
r = await call('/admin/vip', { email: 'beta@x.com' }, { Authorization: 'Bearer mal' }); assert.equal(r.s, 401);
r = await call('/admin/vip', { email: 'Be.ta@x.com', note: 'beta' }, { Authorization: 'Bearer adm' }); assert.equal(r.s, 200);
for (let i = 0; i < 3; i++) { r = await call('/ask', { ...q, email: 'be.ta@x.com' }); assert.equal(r.j.unlimited, true, 'ilimitada'); }
assert.ok(![...store.values()].some((v) => v.includes('be.ta')), 'la lista beta guarda solo la huella');
const lst = await worker.fetch(new Request('https://w/admin/vip', { headers: { Authorization: 'Bearer adm' } }), env).then((r) => r.json());
assert.equal(lst.list.length, 1); assert.equal(lst.list[0].note, 'beta'); assert.ok(!JSON.stringify(lst).includes('be.ta'), 'la lista no lleva correos');
r = await call('/admin/vip', { email: 'be.ta@x.com', until: '2020-01-01' }, { Authorization: 'Bearer adm' });
r = await call('/ask', { ...q, email: 'be.ta@x.com' }); assert.ok(!r.j.unlimited, 'caducada: vuelve a las gratuitas');
r = await call('/admin/vip', { id: lst.list[0].id, remove: true }, { Authorization: 'Bearer beta' }); assert.equal(r.s, 401, 'sin BETA_CODE configurado no vale');
env.BETA_CODE = 'beta';
r = await call('/admin/vip', { id: lst.list[0].id, remove: true }, { Authorization: 'Bearer beta' }); assert.equal(r.j.removed, true, 'BETA_CODE puede quitar por id');
// actividad para el equipo
assert.ok(isEvent('onboarding:pregnancy') && isEvent('diario:sintoma') && !isEvent('hackeo') && !isEvent('onboarding:<x>'));
assert.equal(eventText('onboarding:pregnancy'), 'Completó la bienvenida: embarazo'); assert.equal(eventText('consulta:matrona'), 'Envió una consulta a Marina');
assert.equal(deviceText('ios-app'), 'iPhone · app instalada');
const before = activity.length;
r = await call('/hit', { e: 'fecha_parto', d: 'ios-app' }, { 'CF-Connecting-IP': '7.7.7.7', 'User-Agent': 'y' }); assert.equal(r.s, 200);
assert.equal(activity.length, before + 1); assert.equal(activity.at(-1).d, 'ios-app'); assert.match(activity.at(-1).p, /^[0-9A-F]{4}$/, 'etiqueta de persona');
assert.ok(activity.some((a) => a.e === 'consulta:matrona'), 'las consultas también quedan en la actividad');
n0 = sent.length;
env.ALERTS = '1';
await call('/hit', { e: 'instalada', d: 'android-app' }, { 'CF-Connecting-IP': '8.8.8.8', 'User-Agent': 'z' });
assert.equal(sent.length, n0, 'instalar la app ya no avisa al momento');
await call('/hit', { e: 'via_visita:google', d: 'android-app' }, { 'CF-Connecting-IP': '8.8.8.8', 'User-Agent': 'z' });
assert.equal(sent.length, n0, 'un via ajeno no avisa');
await call('/hit', { e: 'via_visita:q7m', d: 'android-app' }, { 'CF-Connecting-IP': '8.8.8.8', 'User-Agent': 'z' });
assert.equal(sent.length, n0, 'visitas de nuestros enlaces: sin aviso (20 nov)');
await call('/hit', { e: 'contacto', d: 'android-app' }, { 'CF-Connecting-IP': '8.8.8.8', 'User-Agent': 'z' });
assert.equal(sent.length, n0 + 1, 'aviso al momento'); assert.match(sent.at(-1).subject, /Contacto/); assert.equal(sent.at(-1).to[0], 'copia@example.com');
await call('/hit', { e: 'contacto', d: 'android-app' }, { 'CF-Connecting-IP': '8.8.8.8', 'User-Agent': 'z' });
assert.equal(sent.length, n0 + 1, 'sin repetir el mismo aviso en 30 min');
await call('/hit', { e: 'diario:sintoma', d: 'android-app' }, { 'CF-Connecting-IP': '8.8.8.8', 'User-Agent': 'z' });
assert.equal(sent.length, n0 + 1, 'lo frecuente va al resumen');
await KV.put('digest:last', String(Date.now() - 3600000));
assert.ok(await hourlyDigest(env, async (e, m) => { sent.push({ ...m, to: [m.to] }); return { id: 'x' }; }, true) >= 3);
assert.match(sent.at(-1).subject, /^Actividad - Resumen · /);
assert.match(sent.at(-1).text, /Apuntó en el diario: síntomas/); assert.match(sent.at(-1).text, /Android · app instalada/);
env.ALERTS = '0';
// panel privado
env.DASH_KEY = 'dk';
let pg = await worker.fetch(new Request('https://w/panel?k=dk&d=30'), env);
assert.equal(pg.status, 200); const html = await pg.text();
assert.match(html, /<h1>Panel<\/h1>/); assert.match(html, /Consultas/); assert.ok(!html.includes('copia@example.com'), 'sin correos en el panel');
pg = await worker.fetch(new Request('https://w/panel?k=mal'), env); assert.equal(pg.status, 404);
// Escribir gratis, pagar después (24 nov): llega a la profesional por valorar, su valoración lleva el pago, al pagar se desbloquea
{
  const { unlockVal, valLinks, sendOpinions } = await import('../src/worker.js');
  const k6x = '';
  const local = (u) => u.replace(/^https:\/\/[^/]+/, 'https://w');
  const postForm = async (u, extra = {}) => { const q = new URL(u).searchParams; const f = new URLSearchParams({ c: q.get('c'), s: q.get('s'), ...extra }); return (await worker.fetch(new Request(local(u), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: f }), env)).text(); };
  const P0 = env.PAYMENTS, K0 = env.STRIPE_SECRET_KEY, R0 = env.RELAY, N0 = env.NO_FREE, V0 = env.VALORA, B0 = env.BF_OFFER_END_MS, DB0 = env.DB;
  env.PAYMENTS = 'on'; env.STRIPE_SECRET_KEY = 'sk_test_x'; env.RELAY = '1'; env.NO_FREE = '1'; env.VALORA = '1'; env.BF_OFFER_END_MS = '1';
  env.DB = { batch: DB0.batch, prepare: (sql) => { const st = DB0.prepare(sql); return { ...st, bind: (...a) => { const b = st.bind(...a); return Object.assign(Object.create(Object.getPrototypeOf(b) || Object.prototype), b, { first: b.first ? b.first.bind(b) : async () => null }); } }; } };
  const s0 = sent.length;
  const before = new Set([...store.keys()].filter((k) => k.startsWith('t:')));
  const r = await call('/ask', { email: 'valora@example.com', to: 'matrona', text: 'Tengo 34 semanas y las manos hinchadas', context: '', val: true });
  assert.ok(r.j.ok && r.j.val && !r.j.held, JSON.stringify(r.j));
  const pm = sent.slice(s0).find((m) => m.to[0] === PROS.matrona.email);
  assert.match(pm.subject, /^POR VALORAR · /); assert.match(pm.html, /Aún no ha pagado\. Elige con un toque/); assert.match(pm.html, /pedir el pago de 5 €/i); assert.match(pm.html, /\/valorar\/cobrar\?c=/); assert.match(pm.html, /\/valorar\/gratis\?c=/); assert.match(pm.html, /\/valorar\/urgente\?c=/);
  const um = sent.slice(s0).find((m) => m.to[0] === 'valora@example.com');
  assert.match(um.html, /Si es algo rápido, te lo dirá sin coste/); assert.match(um.html, /Enviarla ha sido gratis/);
  const k = [...store.keys()].find((x) => x.startsWith('t:') && !before.has(x));
  let t = await loadThread(env, k.slice(2)); assert.equal(t.v, 1);
  // Sin val (la app o /consultas/): sigue guardándose hasta pagar, como antes
  const old = await call('/ask', { email: 'valora-sin@example.com', to: 'matrona', text: 'Otra duda sin valoración', context: '' });
  assert.ok(old.j.held, 'sin val: consulta guardada');
  // Pedir más datos antes de decidir (Lucía, 25 nov): contestar al correo no cobra
  const s1 = sent.length;
  assert.ok((await relayIncoming(env, t, 'p', mime(PROS.matrona.email, await relayAddress(env, 'p', t.id), '¿Te han tomado la tensión?'))).ok);
  const v0 = sent.slice(s1).find((m) => m.to[0] === 'valora@example.com');
  assert.ok(!/Pagar 5 €/.test(v0.html), 'pedir datos: sin botón de pago'); assert.ok(!/¿Te ha ayudado/.test(v0.html));
  t = await loadThread(env, t.id); assert.equal(t.v, 1, 'sigue por valorar');
  // La usuaria responde: a la profesional le llega con los botones debajo
  const su1 = sent.length;
  assert.ok((await relayIncoming(env, t, 'u', mime('valora@example.com', await relayAddress(env, 'u', t.id), 'Sí, 14/9'))).ok);
  assert.ok(sent.slice(su1).some((m) => m.to[0] === PROS.matrona.email && /pedir el pago de 5 €/i.test(m.html)), 'botones tras la respuesta');
  // Ya lo tiene claro: «Pedir el pago»; desde ahí sus mensajes llevan el botón
  t = await loadThread(env, t.id);
  const sc = sent.length; assert.match(await postForm((await valLinks(env, t.id)).charge, { m: 'Ya lo tengo todo.' }), /Enviado/);
  const v1 = sent.slice(sc).find((m) => m.to[0] === 'valora@example.com');
  assert.match(v1.html, /Pagar 5 € y recibir la respuesta/); assert.match(v1.html, /\/valorar\/pagar\?c=/);
  t = await loadThread(env, t.id); assert.equal(t.v, 2); assert.ok(t.va);
  // Pago pedido y ella sigue escribiendo: correo automático con el botón de pago (una vez cada 12 h) y aviso a la profesional
  const sq = sent.length;
  assert.ok((await relayIncoming(env, t, 'u', mime('valora@example.com', await relayAddress(env, 'u', t.id), '¿Y si me duele más?'))).ok);
  assert.ok(sent.slice(sq).some((m) => m.to[0] === 'valora@example.com' && /falta completar el pago de 5 €/.test(m.html) && /Pagar 5 €/.test(m.html)), 'respuesta automática');
  assert.ok(sent.slice(sq).some((m) => m.to[0] === PROS.matrona.email && /Todavía no ha pagado/.test(m.html)), 'aviso a la profesional');
  t = await loadThread(env, t.id); const sq2 = sent.length;
  assert.ok((await relayIncoming(env, t, 'u', mime('valora@example.com', await relayAddress(env, 'u', t.id), 'Otra cosa'))).ok);
  assert.ok(sent.slice(sq2).some((m) => m.to[0] === 'valora@example.com' && /falta completar el pago de 5 €/.test(m.html)), 'a cada mensaje, su respuesta automática');
  t = await loadThread(env, t.id);
  const sp = sent.length; assert.ok((await relayIncoming(env, t, 'p', mime(PROS.matrona.email, await relayAddress(env, 'p', t.id), 'Cuando pagues te lo explico.'))).ok);
  assert.match(sent.slice(sp).find((m) => m.to[0] === 'valora@example.com').html, /Pagar 5 €/, 'tras pedir el pago, sus mensajes llevan el botón');
  t = await loadThread(env, t.id);
  // A las 24 h sin pagar, un recordatorio a la usuaria (una sola vez)
  t.va = Date.now() - 25 * 3600000; await saveThread(env, t);
  const sr = sent.length; await remindOverdue(env); await remindOverdue(env);
  assert.equal(sent.slice(sr).filter((m) => m.to[0] === 'valora@example.com' && /está esperando para responderte/.test(m.html)).length, 1, 'un recordatorio de pago');
  t = await loadThread(env, t.id);
  // Opinión (Noza, 26 nov): 6 h después del recordatorio, un único correo de producto con un toque por motivo
  const so = sent.length; await sendOpinions(env); assert.equal(sent.length, so, 'todavía no (recordatorio reciente)');
  t.vr = Date.now() - 7 * 3600000; await saveThread(env, t);
  await sendOpinions(env); await sendOpinions(env);
  const op = sent.slice(so).filter((m) => m.to[0] === 'valora@example.com');
  assert.equal(op.length, 1, 'un solo correo de opinión'); assert.match(op[0].subject, /Qué te frenó con tu consulta a Marina/); assert.match(op[0].html, /Soy Juan/);
  const opl = op[0].html.match(/https:\/\/[^"]+\/motivo\?c=[^"]+r=precio[^"]+/)[0].replace(/&amp;/g, '&').replace(/^https:\/\/[^/]+/, 'https://w');
  assert.match(await (await worker.fetch(new Request(opl), env)).text(), /Has elegido: <b>El precio/);
  await worker.fetch(new Request(opl), env);
  assert.equal([...counts].filter(([k]) => k.endsWith('|opinion:precio')).reduce((a, [, n]) => a + n, 0), 1, 'el motivo cuenta una vez');
  const sm = sent.length; await worker.fetch(new Request(opl, { method: 'POST', body: new URLSearchParams({ m: 'En pesos sería más fácil' }) }), env);
  assert.ok(sent.slice(sm).some((m) => /con comentario/.test(m.subject) && /En pesos/.test(m.text || m.html)), 'comentario al equipo');
  assert.match(await (await worker.fetch(new Request(opl.replace(/s=[^&]+/, 's=mal')), env)).text(), /no funciona/);
  // Página de pago de Hera antes de Stripe (GET) y Stripe con nombre, plazo y garantía (POST)
  { const payUrl = (await valLinks(env, t.id)).pay.replace(/^https:\/\/[^/]+/, 'https://w');
    const pg = await (await worker.fetch(new Request(payUrl), env)).text();
    assert.match(pg, /Marina ya ha leído tu consulta/); assert.match(pg, /te devolvemos el dinero/); assert.match(pg, /method="post"/);
    const f1 = globalThis.fetch; let body = '';
    globalThis.fetch = async (u, o) => { if (String(u).includes('api.stripe.com/v1/checkout/sessions')) { body = String(o.body); return new Response('{"url":"https://checkout.stripe.com/x"}', { status: 200 }); } return f1(u, o); };
    const q = new URL(payUrl).searchParams;
    const rr = await worker.fetch(new Request('https://w/valorar/pagar', { method: 'POST', body: new URLSearchParams({ c: q.get('c'), s: q.get('s') }) }), env);
    globalThis.fetch = f1;
    assert.equal(rr.status, 303); const b = new URLSearchParams(body);
    assert.match(b.get('line_items[0][price_data][product_data][name]'), /Respuesta completa · Marina Fernández, matrona/);
    assert.match(b.get('custom_text[submit][message]'), /devolvemos el dinero/); assert.equal(b.get('line_items[0][price_data][unit_amount]'), '500'); }
  t = await loadThread(env, t.id);
  // Enlaces firmados: uno falso no sirve
  const bad = await worker.fetch(new Request(`https://w/valorar/pagar?c=${t.id}&s=mal`), env); assert.match(await bad.text(), /ya no sirve/);
  // Pago: se desbloquea, aviso a la profesional y su siguiente respuesta va sin botón y con la opinión
  const s2 = sent.length;
  await unlockVal(env, t.id);
  t = await loadThread(env, t.id); assert.equal(t.v, 3);
  assert.ok(sent.slice(s2).some((m) => m.to[0] === PROS.matrona.email && /Ha pagado la respuesta completa/.test(m.html)), 'aviso a la profesional');
  assert.ok(!sent.slice(s2).some((m) => m.to[0] === 'copia@example.com' && /PAGADA/.test(m.subject)), 'sin aviso duplicado al equipo');
  assert.ok(sent.slice(s2).some((m) => m.to[0] === 'valora@example.com' && /Hemos recibido tu pago de 5 €/.test(m.html)), 'confirmación de pago a la usuaria');
  const s3 = sent.length;
  assert.ok((await relayIncoming(env, t, 'p', mime(PROS.matrona.email, await relayAddress(env, 'p', t.id), 'Respuesta completa.'))).ok);
  const full = sent.slice(s3).find((m) => m.to[0] === 'valora@example.com');
  assert.ok(!/Pagar 5 €/.test(full.html), 'sin botón tras pagar'); assert.match(full.html, /¿Te ha ayudado/);
  const paidPage = await (await worker.fetch(new Request((await valLinks(env, t.id)).pay.replace(/^https:\/\/[^/]+/, 'https://w')), env)).text(); assert.match(paidPage, /Ya está pagada/);
  // Urgente: sin pago
  const r2 = await call('/ask', { email: 'valora-urg@example.com', to: 'gineco', text: 'Sangro mucho y estoy embarazada', context: '', val: true });
  assert.ok(r2.j.ok && r2.j.val);
  const k2 = [...store.keys()].find((x) => x.startsWith('t:') && !before.has(x) && x !== k);
  const ul = (await valLinks(env, k2.slice(2))).urgent;
  assert.match(await (await worker.fetch(new Request(local(ul)), env)).text(), /Sí, es urgente/);
  assert.equal((await loadThread(env, k2.slice(2))).v, 1, 'abrir el enlace no cambia nada (los correos de empresa lo abren solos)');
  const su = sent.length; assert.match(await postForm(ul), /Hecho/);
  assert.ok(sent.slice(su).some((m) => m.to[0] === 'copia@example.com' && /Gonzalo la marcó como urgente/.test(m.subject)), 'aviso al equipo');
  const t2 = await loadThread(env, k2.slice(2)); assert.equal(t2.v, 0);
  const s4 = sent.length;
  assert.ok((await relayIncoming(env, t2, 'p', mime(PROS.gineco.email, await relayAddress(env, 'p', t2.id), 'Ve a urgencias ahora.'))).ok);
  assert.ok(!/Pagar 5 €/.test(sent.slice(s4).find((m) => m.to[0] === 'valora-urg@example.com').html), 'urgente sin pago');
  // Es algo rápido: respuesta gratis, sin botón de pago y con la oferta de seguir por 5 €
  const r3 = await call('/ask', { email: 'valora-rapida@example.com', to: 'pediatra', text: '¿Puedo bañar al bebé con fiebre?', context: '', val: true });
  assert.ok(r3.j.ok && r3.j.val);
  const k3 = [...store.keys()].find((x) => x.startsWith('t:') && !before.has(x) && x !== k && x !== k2);
  assert.match(await postForm((await valLinks(env, k3.slice(2))).free), /Hecho/);
  const t3 = await loadThread(env, k3.slice(2)); assert.equal(t3.v, 0); assert.ok(t3.vg);
  const s5 = sent.length;
  assert.ok((await relayIncoming(env, t3, 'p', mime(PROS.pediatra.email, await relayAddress(env, 'p', t3.id), 'Sí, puedes bañarlo con agua templada.'))).ok);
  const fr = sent.slice(s5).find((m) => m.to[0] === 'valora-rapida@example.com');
  assert.ok(!/Pagar 5 €/.test(fr.html), 'gratis: sin botón de pago'); assert.match(fr.html, /¿Quieres hablarlo con Lucía\?/); assert.match(fr.html, /¿Te ha ayudado/);
  // «Pedir el pago de 5 €» con un toque: formulario, mensaje opcional y le llega a la usuaria con el botón de pago
  const r4 = await call('/ask', { email: 'valora-cobro@example.com', to: 'matrona', text: 'Me duele el pecho al dar el pecho', context: '', val: true });
  assert.ok(r4.j.ok && r4.j.val);
  const k4 = [...store.keys()].find((x) => x.startsWith('t:') && !before.has(x) && ![k, k2, k3].includes(x));
  const cl = (await valLinks(env, k4.slice(2))).charge;
  assert.match(await (await worker.fetch(new Request(local(cl)), env)).text(), /Enviar con el pago de 5 €/);
  const s6 = sent.length;
  assert.match(await postForm(cl, { m: '¿Tienes fiebre o una zona roja?' }), /Enviado/);
  assert.ok(sent.slice(s6).some((m) => m.to[0] === 'copia@example.com' && /Marina pidió el pago/.test(m.subject)), 'aviso al equipo del cobro');
  const cm = sent.slice(s6).find((m) => m.to[0] === 'valora-cobro@example.com');
  assert.match(cm.html, /¿Tienes fiebre o una zona roja\?/); assert.match(cm.html, /Pagar 5 € y recibir la respuesta/);
  const t4 = await loadThread(env, k4.slice(2)); assert.equal(t4.v, 2); assert.ok(t4.a);
  assert.match(await postForm(cl), /Ya le pediste el pago/);
  // «Prefiero contestarle desde el correo»: no sale nada; su respuesta lleva el pago; si no escribe en 2 h, mensaje corto
  const r6 = await call('/ask', { email: 'valora-correo@example.com', to: 'gineco', text: 'Me ha bajado la regla dos veces este mes', context: '', val: true });
  const k6 = [...store.keys()].find((x) => x.startsWith('t:') && !before.has(x) && ![k, k2, k3, k4].includes(x) && x !== k6x);
  const cl6 = (await valLinks(env, k6.slice(2))).charge;
  const s10 = sent.length; assert.match(await postForm(cl6, { modo: 'correo' }), /Ahora contesta al correo/);
  assert.ok(!sent.slice(s10).some((m) => m.to[0] === 'valora-correo@example.com'), 'no sale nada todavía');
  let t6 = await loadThread(env, k6.slice(2)); assert.equal(t6.v, 2); assert.ok(t6.vc && !t6.va);
  const s11 = sent.length;
  assert.ok((await relayIncoming(env, t6, 'p', mime(PROS.gineco.email, await relayAddress(env, 'p', t6.id), 'Puede ser normal, pero quiero revisarlo bien.'))).ok);
  const one = sent.slice(s11).filter((m) => m.to[0] === 'valora-correo@example.com');
  assert.equal(one.length, 1); assert.match(one[0].html, /quiero revisarlo bien/); assert.match(one[0].html, /Pagar 5 € y recibir la respuesta/);
  t6 = await loadThread(env, t6.id); assert.ok(t6.va && !t6.vc, 'enlace enviado con su respuesta');
  // respaldo a las 2 h
  const r7 = await call('/ask', { email: 'valora-correo2@example.com', to: 'gineco', text: 'Otra duda para el respaldo', context: '', val: true });
  const k7 = [...store.keys()].find((x) => x.startsWith('t:') && !before.has(x) && ![k, k2, k3, k4, k6].includes(x) && x !== k6x);
  await postForm((await valLinks(env, k7.slice(2))).charge, { modo: 'correo' });
  let t7 = await loadThread(env, k7.slice(2)); t7.vc = Date.now() - 3 * 3600000; await saveThread(env, t7);
  const s12 = sent.length; await worker.scheduled({ scheduledTime: Date.parse('2026-11-25T09:00:00Z') }, env);
  assert.ok(sent.slice(s12).some((m) => m.to[0] === 'valora-correo2@example.com' && /Pagar 5 €/.test(m.html)), 'respaldo a las 2 h');
  // Consultas por valorar de antes de los botones: se le reenvían una vez a la profesional
  const r5 = await call('/ask', { email: 'valora-vieja@example.com', to: 'pediatra', text: 'Duda de antes de los botones', context: '', val: true });
  const k5 = [...store.keys()].find((x) => x.startsWith('t:') && !before.has(x) && ![k, k2, k3, k4, k6, k7].includes(x));
  const t5 = await loadThread(env, k5.slice(2)); delete t5.vb; await saveThread(env, t5);
  const s7 = sent.length; await remindOverdue(env); await remindOverdue(env);
  assert.equal(sent.slice(s7).filter((m) => m.to[0] === PROS.pediatra.email && /pedir el pago de 5 €/i.test(m.html)).length, 1, 'botones reenviados una vez');
  // Reenvío pedido por el equipo (KV val-reenvio): también a una marcada urgente, que luego puede pedir el pago
  await env.KV.put('val-reenvio', JSON.stringify([k2.slice(2), k4.slice(2)]));
  const s8 = sent.length; await worker.scheduled({ scheduledTime: Date.parse('2026-11-25T09:00:00Z') }, env);
  const rs = sent.slice(s8).filter((m) => /pedir el pago de 5 €/i.test(m.html));
  assert.equal(rs.length, 2, 'reenviados'); assert.match(rs[0].html, /La marcaste como urgente/); assert.equal(await env.KV.get('val-reenvio'), null);
  const s9 = sent.length;
  assert.match(await postForm((await valLinks(env, k2.slice(2))).charge), /Enviado/);
  assert.ok(sent.slice(s9).some((m) => m.to[0] === 'valora-urg@example.com' && /Pagar 5 € y recibir la respuesta/.test(m.html)), 'tras urgente, puede pedir el pago');
  const ph = await (await worker.fetch(new Request('https://w/panel?k=dk&d=7'), env)).text();
  const bq = await (await worker.fetch(new Request(`https://w/panel/consulta?k=dk&c=${k4.slice(2).toUpperCase()}`), env)).text();
  assert.match(bq, /valora-cobro@example\.com/); assert.match(bq, /Pago pedido/);
  assert.match(await (await worker.fetch(new Request('https://w/panel/consulta?k=dk&c=ZZZZZZZZ'), env)).text(), /No hay ninguna consulta/);
  assert.equal((await worker.fetch(new Request('https://w/panel/consulta?k=mal&c=x'), env)).status, 404);
  assert.match(ph, /Consultas recientes/); assert.match(ph, /Pago pedido/); assert.match(ph, /Urgente/); assert.match(ph, /\/valorar\/pagar\?c=[a-z0-9]{8}&amp;s=|\/valorar\/pagar\?c=[a-z0-9]{8}&s=/);
  env.PAYMENTS = P0; env.STRIPE_SECRET_KEY = K0; env.RELAY = R0; env.NO_FREE = N0; env.VALORA = V0; env.BF_OFFER_END_MS = B0; env.DB = DB0;
  console.log('Escribir gratis, pagar después: OK');
}

// Mapa de calor (24 nov): /tap guarda toques válidos (sin lo que escriben) y /panel/mapa los dibuja
{
  const r = await call('/tap', { pg: 'portada', p: 'AB12', d: 'ios-web', t: [[-20, 900, 390, 4100, 'section#ask › button#ask-send', 1], [80, 1500, 390, 4100, 'quien › img.face', 0], ['x', 1, 2, 3, 'malo', 0]] });
  assert.equal(r.s, 200); assert.equal(taps.length, 2, 'descarta el toque mal formado'); assert.equal(taps[1].act, 0);
  assert.equal((await call('/tap', { pg: 'portada', t: [] })).s, 400);
  const big = await call('/tap', { pg: 'portada', t: [[0, 10, 390, 4000, '<script>x', 1]] }); assert.equal(big.s, 200); assert.ok(!taps.at(-1).el.includes('<'), 'sin etiquetas');
  const m = await worker.fetch(new Request('https://w/panel/mapa?k=dk&d=7'), env); assert.equal(m.status, 200);
  const mh = await m.text(); assert.match(mh, /Mapa de calor · portada/); assert.match(mh, /quien › img\.face/); assert.match(mh, /<circle[^>]+class="n"/);
  assert.equal((await worker.fetch(new Request('https://w/panel/mapa?k=mal'), env)).status, 404);
  console.log('Mapa de calor: OK');
}
// Resend al límite (429): la consulta se envía igual (correo en cola) y sale en la siguiente vuelta del cron
{
  const { retryMailQueue } = await import('../src/worker.js');
  const f0 = globalThis.fetch; let blocked = true;
  globalThis.fetch = async (u, o) => (blocked && String(u).includes('api.resend.com/emails') && o?.method === 'POST' ? new Response('{"message":"daily quota"}', { status: 429 }) : f0(u, o));
  const s0 = sent.length;
  const r = await call('/ask', { email: 'cola-resend@example.com', to: 'matrona', text: 'Duda con Resend al límite', context: '' });
  assert.ok(r.j.ok, JSON.stringify(r.j)); assert.equal(sent.length, s0, 'nada enviado todavía');
  assert.ok(((await env.KV.get('mailq', 'json')) || []).length >= 2, 'en cola: a la profesional y a la usuaria');
  const panelHtml = await (await worker.fetch(new Request('https://w/panel?k=dk&d=7'), env)).text(); assert.match(panelHtml, /en espera: Resend no los aceptó/);
  blocked = false;
  const out = await retryMailQueue(env);
  assert.ok(out.sent >= 2 && out.left === 0, JSON.stringify(out));
  assert.ok(sent.slice(s0).some((m) => m.to[0] === PROS.matrona.email) && sent.slice(s0).some((m) => m.to[0] === 'cola-resend@example.com'), 'salen al reintentar');
  globalThis.fetch = f0;
  console.log('Cola de reintentos: OK');
}
// Consulta sin texto (26 nov): no va a la profesional; a la usuaria le pedimos su duda y su respuesta llega como consulta nueva
{
  const P0 = env.PAYMENTS, K0 = env.STRIPE_SECRET_KEY, R0 = env.RELAY;
  env.RELAY = '1';
  const s0 = sent.length; const before = new Set([...store.keys()].filter((k) => k.startsWith('t:')));
  const r = await call('/ask', { email: 'sin-texto@example.com', to: 'gineco', text: '  ', context: '' });
  assert.ok(r.j.ok && r.j.empty, JSON.stringify(r.j));
  assert.ok(!sent.slice(s0).some((m) => m.to[0] === PROS.gineco.email), 'nada a la profesional');
  assert.ok(sent.slice(s0).some((m) => m.to[0] === 'sin-texto@example.com' && /no has escrito tu duda/.test(m.html)), 'correo a la usuaria');
  assert.ok(sent.slice(s0).some((m) => m.to[0] === 'copia@example.com' && /Consulta sin texto/.test(m.subject)), 'aviso al equipo');
  const k = [...store.keys()].find((x) => x.startsWith('t:') && !before.has(x));
  let t = await loadThread(env, k.slice(2)); assert.equal(t.ve, 1);
  const s1 = sent.length;
  assert.ok((await relayIncoming(env, t, 'u', mime('sin-texto@example.com', await relayAddress(env, 'u', t.id), 'Tengo dolor al orinar desde hace dos días'))).ok);
  const pm = sent.slice(s1).find((m) => m.to[0] === PROS.gineco.email);
  assert.ok(pm, 'le llega a la profesional'); assert.match(pm.html, /Tengo dolor al orinar/); assert.match(pm.subject, /Consulta Hera #/);
  t = await loadThread(env, t.id); assert.ok(!t.ve && t.sp, 'ya es una consulta normal');
  env.PAYMENTS = P0; env.STRIPE_SECRET_KEY = K0; env.RELAY = R0;
  console.log('Consulta sin texto: OK');
}
// Cuestionario de menopausia sin duda escrita: la profesional no ve un «Mi duda:» vacío
{
  const s0 = sent.length;
  const r = await call('/ask', { email: 'meno-sin-duda@example.com', to: 'gineco', text: 'Mi cuestionario de menopausia (orientativo): 11 de 48.\n\nSofocos y sudores (2 de 8):\n· Sofocos: poco\n\nMi duda: ', context: '' });
  assert.ok(r.j.ok || r.j.limit, JSON.stringify(r.j));
  const pm = sent.slice(s0).find((m) => m.to[0] === PROS.gineco.email);
  assert.ok(pm, 'le llega a la profesional'); assert.match(pm.html, /no ha escrito ninguna duda concreta/);
  console.log('Menopausia sin duda: OK');
}
// embudo: personas distintas por día, quien avanza cuenta en los pasos anteriores
const { dropoff } = await import('../src/panel.js');
const T = Date.UTC(2026, 9, 31, 12);
const steps = [['Empieza', 'a', 'a2'], ['Correo', 'b'], ['Envía', 'c']];
const f = dropoff([
  { ts: T, e: 'a', p: 'P1', d: 'ios-web' }, { ts: T + 1, e: 'a', p: 'P1' }, { ts: T + 2, e: 'c', p: 'P1' },
  { ts: T, e: 'a2', p: 'P2' }, { ts: T + 5, e: 'b', p: 'P2', d: 'android-web' },
  { ts: T, e: 'a', p: 'P3' }, { ts: T - 86400000, e: 'a', p: 'P3' },
  { ts: T, e: 'otro', p: 'P4' }, { ts: T, e: 'a' },
], steps);
assert.deepEqual(f.rows.map((r) => r.n), [4, 2, 1]);
assert.deepEqual(f.rows.map((r) => r.lost), [2, 1, 0]);
assert.equal(f.dropped, 3); assert.equal(f.lost.length, 3); assert.equal(f.lost[0].p, 'P2'); assert.equal(f.lost[0].d, 'android-web');
assert.equal(dropoff([], steps).started, 0);
// adjuntos: se validan por contenido, limitan cantidad y tamaño, y limpian el nombre
const { validateAttachments, MAX_BYTES } = await import('../src/attachments.js');
const png = btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 1, 2, 3, 4));
const pdf = btoa('%PDF-1.7 hola');
assert.deepEqual(validateAttachments(undefined), { files: [] });
let va = validateAttachments([{ filename: '../../a<b>.exe', content: png, content_type: 'text/html' }, { filename: 'informe.pdf', content: pdf }]);
assert.equal(va.files[0].content_type, 'image/png'); assert.equal(va.files[0].filename, 'ab.png'); assert.equal(va.files[1].content_type, 'application/pdf');
assert.equal(validateAttachments([{ content: btoa('<html>evil</html>') }]).error, 'bad_files');
assert.equal(validateAttachments([{ content: 'no base64!!' }]).error, 'bad_files');
assert.equal(validateAttachments(Array(4).fill({ content: png })).error, 'bad_files');
assert.equal(validateAttachments([{ content: 'A'.repeat(Math.ceil((MAX_BYTES * 4) / 3) + 8) }]).error, 'too_large');
// opinión: 24 h después de la primera respuesta, una vez; comentario sin correo; seguimiento por el hilo
{
  const { feedbackSig } = await import('../src/feedback.js');
  const { saveThread } = await import('../src/relay.js');
  sent.length = 0;
  const rr = await call('/ask', { email: 'opina@example.com', to: 'gineco', text: 'Duda para probar la opinión', follow: true });
  const id = rr.j.id; let t = await loadThread(env, id);
  assert.equal(t.f, 1, 'permiso de seguimiento guardado en el hilo');
  t.a = Date.now() - 25 * 3600000; await saveThread(env, t);
  sent.length = 0; await worker.scheduled({}, env);
  const fb = sent.find((m) => m.subject === '¿Te ayudó la respuesta de Gonzalo?');
  assert.ok(fb, 'correo de opinión enviado'); assert.equal(fb.to[0], 'opina@example.com');
  const s = await feedbackSig(env, id); assert.ok(fb.html.includes(`t=${id}&s=${s}&r=1`));
  sent.length = 0; await worker.scheduled({}, env);
  assert.ok(!sent.some((m) => m.subject?.startsWith('¿Te ayudó')), 'solo una vez por consulta');
  let o = await call('/opinion', { t: id, s: 'mala', r: 1 }); assert.equal(o.s, 404, 'firma obligatoria');
  sent.length = 0;
  o = await call('/opinion', { t: id, s, r: 3 }); assert.equal(o.j.followSent, true, 'no le ayudó y dio permiso: aviso a la profesional');
  assert.equal(sent[0].to[0], 'gonzalo@hera-gine.com'); assert.match(sent[0].reply_to, /^hera-p-/); assert.ok(!sent[0].html.includes('opina@'), 'sin el correo de la usuaria');
  o = await call('/opinion/comentario', { t: id, s, text: 'No me quedó claro', name: 'Ana', publish: true });
  assert.equal(o.s, 200); assert.equal(opiniones.at(-1).publicable, 0, 'solo se publica una valoración positiva'); assert.equal(opiniones.at(-1).nombre, null);
  // positiva y publicable: se guarda el nombre, nunca el correo
  const r2 = await call('/ask', { email: 'contenta@example.com', to: 'matrona', text: 'Otra duda para probar' });
  const s2 = await feedbackSig(env, r2.j.id);
  await call('/opinion', { t: r2.j.id, s: s2, r: 1 });
  await call('/opinion/comentario', { t: r2.j.id, s: s2, text: 'Me respondió rapidísimo', name: 'Laura G.', publish: true });
  const last = opiniones.at(-1); assert.deepEqual([last.publicable, last.nombre, last.pro], [1, 'Laura G.', 'matrona']);
  const avisos = sent.filter((m) => /^Opinión · /.test(m.subject || ''));
  assert.ok(avisos.some((m) => /^Opinión · «Sí, mucho» para Marina · #[0-9A-Z]{8}$/.test(m.subject)), 'aviso de opinión al equipo');
  assert.ok(avisos.some((m) => m.subject.startsWith('Opinión · comentario') && m.text.includes('Laura G.')), 'aviso de comentario con el nombre');
  assert.ok(avisos.every((m) => m.to[0] === 'copia@example.com' && !m.text.includes('contenta@')), 'al equipo y sin el correo de la usuaria');
  assert.ok(!JSON.stringify(opiniones).includes('@'), 'las opiniones no llevan correos');
  await call('/opinion/baja', { t: r2.j.id, s: s2 });
  t = await loadThread(env, r2.j.id); t.a = Date.now() - 25 * 3600000; await saveThread(env, t);
  sent.length = 0; await worker.scheduled({}, env);
  assert.ok(!sent.some((m) => m.subject?.startsWith('¿Te ayudó')), 'baja respetada');
  const pg2 = await (await worker.fetch(new Request('https://w/panel?k=dk&d=30'), env)).text();
  assert.match(pg2, /Opiniones tras la consulta/); assert.match(pg2, /Laura G\./);

  // MARK: 2 gratis, como mucho 1 por especialista (16 nov)
  {
    const a1 = await call('/ask', { email: 'unapor@example.com', to: 'gineco', text: 'Primera para Gonzalo' });
    assert.equal(a1.j.remaining, 1); assert.equal(a1.j.next, 'Marina o Lucía', 'dice con quién es la que queda');
    assert.ok(sent.some((m) => m.to?.[0] === 'unapor@example.com' && /queda 1 consulta gratuita, con Marina o Lucía/.test(m.html)), 'la confirmación lo dice');
    const a2 = await call('/ask', { email: 'unapor@example.com', to: 'gineco', text: 'Otra para Gonzalo' });
    assert.equal(a2.j.limit, true, 'la 2.ª con la misma especialista no es gratis'); assert.equal(a2.j.same, 'Marina o Lucía');
    const a3 = await call('/ask', { email: 'unapor@example.com', to: 'pediatra', text: 'Ahora para Lucía' });
    assert.equal(a3.j.ok, true, 'con otra especialista sí'); assert.equal(a3.j.remaining, 0);
    const a4 = await call('/ask', { email: 'unapor@example.com', to: 'matrona', text: 'Y para Marina' });
    assert.equal(a4.j.limit, true, '2 en total'); assert.equal(a4.j.same, undefined);
    const hmac = async (k, t) => [...new Uint8Array(await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', new TextEncoder().encode(k), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), new TextEncoder().encode(t)))].map((x) => x.toString(16).padStart(2, '0')).join('');
    await KV.put(`c:${await hmac('sal', 'antigua@example.com')}`, JSON.stringify({ n: 1, first: 'x', last: 'x', all: 1 }));
    assert.equal((await call('/ask', { email: 'antigua@example.com', to: 'gineco', text: 'Registro sin fp' })).j.ok, true, 'registros antiguos: se respeta su 2.ª gratis');
  }

  // MARK: invitaciones (vera-backlog#84)
  const inv = (await call('/opinion', { t: r2.j.id, s: s2, r: 1 })).j.invite;
  assert.match(inv, /^[a-hjkmnp-z2-9]{6}$/, 'quien valora «Sí, mucho» recibe su enlace');
  assert.equal((await call('/opinion', { t: r2.j.id, s: s2, r: 1 })).j.invite, inv, 'siempre el mismo código');
  { const t0 = await loadThread(env, r2.j.id); delete t0.h; await saveThread(env, t0); }
  assert.equal((await call('/opinion', { t: r2.j.id, s: s2, r: 1 })).j.invite, inv, 'consultas antiguas: la huella se rehace con el correo cifrado');
  assert.equal((await call('/opinion', { t: id, s, r: 1 })).j.invite, undefined, 'sin enlace si no le ayudó');
  const own = await call('/ask', { email: 'contenta@example.com', to: 'pediatra', text: 'Me invito a mí misma', ref: inv });
  assert.equal((await loadThread(env, own.j.id)).rf, undefined, 'no vale invitarse a una misma');
  const old = await call('/ask', { email: 'opina@example.com', to: 'matrona', text: 'Ya había preguntado', ref: inv });
  assert.equal((await loadThread(env, old.j.id)).rf, undefined, 'solo correos que nunca han preguntado');
  const fr = await call('/ask', { email: 'amiga@example.com', to: 'pediatra', text: 'Duda de la amiga', ref: inv });
  let ft = await loadThread(env, fr.j.id); assert.equal(ft.rf, inv, 'consulta invitada');
  assert.equal(cnt('consulta_invitada'), 1); assert.equal(saldo.size, 0, 'no se regala nada al enviar');
  sent.length = 0;
  await relayIncoming(env, ft, 'p', mime('lucia@x.com', await relayAddress(env, 'p', ft.id), 'Respuesta de Lucía'));
  const hC = [...saldo.keys()][0];
  assert.deepEqual([saldo.size, saldo.get(hC)], [1, 1], '1 consulta para quien invitó al responder');
  const gift = sent.find((m) => m.subject === 'Tienes 1 consulta más en Hera');
  assert.ok(gift && gift.to[0] === 'contenta@example.com' && !gift.html.includes('amiga'), 'aviso a quien invitó, sin decir quién');
  await relayIncoming(env, await loadThread(env, ft.id), 'p', mime('lucia@x.com', await relayAddress(env, 'p', ft.id), 'Otra cosa'));
  assert.equal(saldo.get(hC), 1, 'una sola vez por consulta'); assert.equal(cnt('consulta_regalada'), 1);
  const pg3 = await (await worker.fetch(new Request('https://w/panel?k=dk&d=30'), env)).text();
  assert.match(pg3, /Invitaciones/); assert.match(pg3, /Consultas regaladas/);
  // Quien ya valoró desde la respuesta no recibe el correo de las 24 h
  ft = await loadThread(env, fr.j.id); const sf = await feedbackSig(env, ft.id);
  assert.ok(!sent.filter((m) => m.subject?.startsWith('Re:')).at(-1).html.includes('¿Te ha ayudado'), 'solo en la primera respuesta');
  await call('/opinion', { t: ft.id, s: sf, r: 2 });
  ft = await loadThread(env, ft.id); ft.a = Date.now() - 25 * 3600000; await saveThread(env, ft);
  sent.length = 0; await worker.scheduled({}, env);
  assert.ok(!sent.some((m) => m.subject === '¿Te ayudó la respuesta de Lucía?'), 'ya valoró: sin correo de opinión');
}
console.log('consultas: OK');

// Corregir el correo de una consulta (rebote por correo mal escrito) y reenvío de la profesional
{
  env.DASH_KEY = 'dk';
  const fd = (o) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
  const post = (o) => worker.fetch(new Request('https://w/panel/correo', { method: 'POST', body: fd(o) }), env);
  assert.equal((await post({ k: 'mala', id: tid, email: 'maria@gmail.com' })).status, 404, 'sin la clave del panel no se puede');
  assert.equal((await post({ k: 'dk', id: tid, email: 'no-correo' })).status, 400);
  // Resend guarda lo enviado: GET /emails/{id} devuelve el correo (aquí, del registro de la prueba)
  const byId = new Map(); sent.forEach((m, i) => byId.set(`0000000${i}-0000-4000-8000-000000000000`.slice(-36), m));
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u, o) => { const m = /\/emails\/([0-9a-f-]{36})$/.exec(u); if (m && (!o || !o.method || o.method === 'GET')) { const x = byId.get(m[1]); return x ? new Response(JSON.stringify({ ...x, created_at: m[1] }), { status: 200 }) : new Response('{}', { status: 404 }); } return realFetch(u, o); };
  const th = await loadThread(env, tid);
  const mine = ['aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000002'];
  byId.set(mine[0], { to: ['Maria.Lopez@gmail.com'], from: 'Hera <consultas@hera-gine.com>', subject: 'Tu consulta a Marina', html: '<p>confirmación</p>', text: 'confirmación' });
  byId.set(mine[1], { to: ['maria.lopez@gmail.com'], from: 'Marina · Hera <marina@hera-gine.com>', subject: 'Re: Tu consulta a Marina', html: '<p>respuesta</p>', text: 'respuesta' });
  const other = 'ffffffff-0000-4000-8000-000000000000'; byId.set(other, { to: ['otra.persona@gmail.com'], from: 'x', subject: 'otra', html: '<p>otra</p>', text: 'otra' });
  th.ou = []; await saveThread(env, th);
  const nR = sent.length;
  const ok = await post({ k: 'dk', id: `#${tid.toUpperCase()}`, email: 'maria.buena@gmail.com', resend: '1', ids: [...mine, other].join('\n') });
  assert.equal(ok.status, 200);
  const html = await ok.text();
  assert.match(html, new RegExp(`reenviado <b>${mine.length} correos`), 'reenvía lo que se envió a su correo anterior');
  assert.match(html, /No he reenviado:<br>· ffffffff: es de otra consulta/, 'no reenvía correos de otra consulta');
  assert.ok(sent.slice(nR).every((m) => m.to[0] === 'maria.buena@gmail.com' && /^hera-u-/.test(m.reply_to)));
  globalThis.fetch = realFetch;
  assert.equal(await openEmail(env, (await loadThread(env, tid)).u), 'maria.buena@gmail.com');
  const fwd = `From: g@x.com\r\nTo: ${pAddr}\r\nSubject: Fwd: Re: Tu consulta\r\nMessage-ID: <f${Math.random()}@gmail.com>\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n---------- Forwarded message ---------\r\nFrom: Marina <marina@x.com>\r\nDate: jue, 13 nov 2026\r\nSubject: Re: Tu consulta\r\nTo: <${pAddr}>\r\n\r\nEs normal al principio, ponte calor.\r\n\r\nEl jue, 13 nov 2026, Hera escribió:\r\n> Me duele`;
  const n1 = sent.length;
  const rf = await relayIncoming(env, await loadThread(env, tid), 'p', fwd);
  assert.ok(rf.ok);
  assert.equal(sent[n1].to[0], 'maria.buena@gmail.com', 'el reenvío llega al correo corregido');
  assert.ok(sent[n1].text.includes('Es normal al principio, ponte calor.') && !sent[n1].text.includes('Forwarded') && !sent[n1].text.includes('Me duele'), 'solo la respuesta, sin cabecera ni lo citado');
  const ru = await relayIncoming(env, await loadThread(env, tid), 'u', mime('maria.buena@gmail.com', uAddr, 'Gracias'));
  assert.ok(ru.ok, 'la usuaria puede contestar desde el correo nuevo');
  console.log('correo corregido y reenvío: OK');
}

// Correos que no han llegado: webhook de Resend (firma Svix) → lista del panel → «Corregir y reenviar»
{
  const { panel } = await import('../src/panel.js');
  const secretRaw = new Uint8Array(24).fill(7);
  env.RESEND_WEBHOOK_SECRET = `whsec_${btoa(String.fromCharCode(...secretRaw))}`;
  const sign = async (body, id = 'msg_1', ts = Math.floor(Date.now() / 1000)) => {
    const key = await crypto.subtle.importKey('raw', secretRaw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const mac = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${body}`)))));
    return { 'svix-id': id, 'svix-timestamp': String(ts), 'svix-signature': `v1,${mac}` };
  };
  const hook = async (ev, headers) => { const body = JSON.stringify(ev); return worker.fetch(new Request('https://w/resend/webhook', { method: 'POST', headers: headers || await sign(body), body }), env); };
  const eid = '11111111-2222-4333-8444-555555555555';
  const ev = { type: 'email.bounced', data: { email_id: eid, to: ['vasquez@gmail.co'], subject: `Re: Tu consulta a Marina · Hera #${tid.toUpperCase()}`, bounce: { message: 'Mailbox does not exist' } } };
  assert.equal((await hook(ev, { 'svix-id': 'x', 'svix-timestamp': String(Math.floor(Date.now() / 1000)), 'svix-signature': 'v1,mala' })).status, 401, 'sin firma válida no entra');
  assert.equal((await hook(ev)).status, 200);
  const html = await panel(env, new URL('https://w/panel?k=dk&d=7'), async () => ({ pendientes: {}, fuera_plazo: {} }));
  assert.match(html, /Correos que no han llegado/);
  assert.match(html, /vasquez@gmail\.co/); assert.match(html, /value="vasquez@gmail\.com"/, 'propone el correo corregido');
  assert.match(html, new RegExp(`name="ids" value="${eid}"`));
  // Retrasado que luego llega: desaparece
  const eid2 = '99999999-2222-4333-8444-555555555555';
  await hook({ type: 'email.delivery_delayed', data: { email_id: eid2, to: ['x@gmail.cl'], subject: 'Tu consulta a Gonzalo · Hera #ABCDEFGH' } });
  assert.ok(await env.KV.get(`fail:${eid2}`));
  await hook({ type: 'email.delivered', data: { email_id: eid2, to: ['x@gmail.cl'], subject: 's' } });
  assert.equal(await env.KV.get(`fail:${eid2}`), null, 'si al final llega, se quita');
  // Quitar a mano
  const fd = new FormData(); fd.set('k', 'dk'); fd.set('eid', eid);
  const r = await worker.fetch(new Request('https://w/panel/fallo', { method: 'POST', body: fd }), env);
  assert.equal(r.status, 303); assert.equal(await env.KV.get(`fail:${eid}`), null);
  console.log('correos que no han llegado: OK');
}

// El aviso al equipo dice si es la 2.ª consulta de ese correo
{
  const q2 = { email: 'segunda.vez@gmail.com', to: 'gineco', text: 'Primera duda', context: '' };
  let n0 = sent.length; await call('/ask', q2);
  const c1 = sent.slice(n0).find((m) => /^Consulta · /.test(m.subject));
  assert.ok(c1 && !/consulta$/.test(c1.subject.replace(/^Consulta/, '')), 'la primera no lo dice');
  n0 = sent.length; await call('/ask', { ...q2, to: 'matrona', text: 'Segunda duda' });
  const c2 = sent.slice(n0).find((m) => /^Consulta · /.test(m.subject));
  assert.match(c2.subject, / · 2\.ª consulta$/); assert.match(c2.html, /Es su 2\.ª consulta/);
  console.log('n.º de consulta en el aviso: OK');
}

// Sin recordatorio si la misma usuaria mandó la duda dos veces y la profesional contestó en el otro hilo
{
  const old = Date.now() - 41 * 3600000;
  const base = { p: 'gineco', u: 'x', uh: 'abcdefabcdefabcdefabcdef', sp: 's', su: 's', rp: [], ru: [], rem: false, n: 0 };
  await saveThread(env, { ...base, id: 'twin0001', c: old - 180000, a: old + 3600000, n: 1 });
  await saveThread(env, { ...base, id: 'twin0002', c: old, a: 0 });
  await saveThread(env, { ...base, id: 'solo0003', uh: 'ffffffffffffffffffffffff', c: old, a: 0 });
  await saveThread(env, { ...base, id: 'late0004', c: old - 5 * 3600000, a: 0 }); // misma usuaria, 5 h antes: otra duda, sí recordatorio
  const n0 = sent.length; await remindOverdue(env);
  const rem = sent.slice(n0).filter((m) => /lleva 16 horas/.test(m.text || ''));
  assert.ok(rem.some((m) => /SOLO0003/.test(m.text)), 'la consulta sin respuesta sí recibe recordatorio');
  assert.ok(!rem.some((m) => /TWIN0002/.test(m.text)), 'la duplicada ya respondida en el otro hilo, no');
  assert.ok(rem.some((m) => /LATE0004/.test(m.text)), 'si la otra se envió horas antes, es otra duda: sí recordatorio');
  console.log('recordatorio sin duplicadas: OK');
}

// Conversiones para Google Ads: consulta desde anuncio con gclid → fila en el CSV (con contraseña)
{
  await call('/ask', { email: 'desde.anuncio@gmail.com', to: 'gineco', text: 'Duda', context: '', src: 'ads', camp: 'gineco_latam', gclid: 'Cj0KCQiA_test-123abc' });
  await call('/ask', { email: 'sin.gclid@gmail.com', to: 'gineco', text: 'Duda', context: '', src: 'ads', camp: 'gineco' });
  const get = (pass) => worker.fetch(new Request('https://w/ads/conversiones.csv', { headers: pass ? { Authorization: `Basic ${btoa(`google:${pass}`)}` } : {} }), env);
  assert.equal((await get('')).status, 401); assert.equal((await get('mala')).status, 401);
  const csv = await (await get('dk')).text();
  const lines = csv.trim().split('\n');
  assert.equal(lines[0], 'Google Click ID,Conversion Name,Conversion Time');
  assert.equal(lines.length, 2, 'solo la consulta con gclid');
  assert.match(lines[1], /^Cj0KCQiA_test-123abc,Consulta enviada,\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\+0[12]:00$/);
  assert.ok(!csv.includes('@'), 'sin correos');
  console.log('conversiones Google Ads: OK');
}

// Consultas por WhatsApp (plan A): añadir desde el panel, 1.ª/2.ª gratis y luego «toca pagar»; estado; número cifrado
{
  const { normalizePhone } = await import('../src/whatsapp.js');
  const { panel } = await import('../src/panel.js');
  assert.equal(normalizePhone('+34 600 11 22 33'), '34600112233'); assert.equal(normalizePhone('600112233'), '34600112233');
  assert.equal(normalizePhone('0054 9 11 1234 5678'), '5491112345678'); assert.equal(normalizePhone('123'), null);
  const fd = (o) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
  const post = (path, o) => worker.fetch(new Request(`https://w${path}`, { method: 'POST', body: fd(o) }), env);
  assert.equal((await post('/panel/wa', { k: 'mala', tel: '600112233', pro: 'gineco' })).status, 404);
  for (let i = 0; i < 3; i++) assert.equal((await post('/panel/wa', { k: 'dk', tel: '+34 600 11 22 33', pro: 'gineco' })).status, 303);
  const bad = await post('/panel/wa', { k: 'dk', tel: 'abc', pro: 'gineco' }); assert.match(bad.headers.get('Location'), /wa=tel/);
  let html = await panel(env, new URL('https://w/panel?k=dk&d=7'), async () => ({ pendientes: {}, fuera_plazo: {} }));
  assert.match(html, /Consultas por WhatsApp/); assert.ok(!/gratis<\/span>/.test(html), 'por WhatsApp no hay gratis'); assert.match(html, /Toca pagar/);
  assert.match(html, /href="https:\/\/wa\.me\/34600112233"/); assert.ok(!html.includes('600 11 22 33') && html.includes('+34 ••• 233'), 'número enmascarado en pantalla');
  const raw = [...store].filter(([k]) => k.startsWith('wa:')).map(([, v]) => v).join('');
  assert.ok(!raw.includes('34600112233'), 'el número no se guarda en claro');
  const id = /name="id" value="([0-9a-f]{8})"/.exec(html)[1];
  await post('/panel/wa/estado', { k: 'dk', id, state: 'enviada' });
  html = await panel(env, new URL('https://w/panel?k=dk&d=7'), async () => ({ pendientes: {}, fuera_plazo: {} }));
  assert.match(html, /Enviada a la profesional/);
  console.log('consultas por WhatsApp: OK');
}

// Consulta por WhatsApp de pago: código estable por sesión, fila «Pagada · código» y correo con el código
{
  const { waCode } = await import('../src/stripe.js');
  const { addWaConsult, listWa } = await import('../src/whatsapp.js');
  const { waPaidEmail } = await import('../src/worker.js');
  const c1 = await waCode('cs_test_abc123'); assert.match(c1, /^[A-Z2-9]{4}$/); assert.equal(c1, await waCode('cs_test_abc123'));
  await addWaConsult(env, { phone: '+54 9 11 5555 4444', pro: '', limit: 0, bump: async () => {}, paid: true, code: c1 });
  const row = (await listWa(env)).find((w) => w.code === c1);
  assert.ok(row && row.state === 'pagada' && !row.free);
  const m = waPaidEmail(c1); assert.match(m.subject, new RegExp(c1)); assert.match(m.html, /wa\.me\/34603295806/); assert.match(m.text, /\+34 603 29 58 06/);
  console.log('WhatsApp de pago: OK');
}

// Pago por WhatsApp + añadir a mano el mismo número: se asigna la profesional a la fila pagada (no sale repetida)
{
  const { addWaConsult, listWa } = await import('../src/whatsapp.js');
  await addWaConsult(env, { phone: '+34 611 22 33 44', pro: '', limit: 0, bump: async () => {}, paid: true, code: 'ABCD' });
  const before = (await listWa(env)).length;
  const fd = new FormData(); fd.set('k', 'dk'); fd.set('tel', '611 22 33 44'); fd.set('pro', 'matrona');
  await worker.fetch(new Request('https://w/panel/wa', { method: 'POST', body: fd }), env);
  const rows = await listWa(env);
  assert.equal(rows.length, before, 'no crea otra fila');
  assert.equal(rows.find((w) => w.code === 'ABCD').pro, 'matrona');
  const id = rows.find((w) => w.code === 'ABCD').id;
  const q = new FormData(); q.set('k', 'dk'); q.set('id', id); q.set('state', 'quitar');
  await worker.fetch(new Request('https://w/panel/wa/estado', { method: 'POST', body: q }), env);
  assert.ok(!(await listWa(env)).some((w) => w.code === 'ABCD'), 'se puede quitar');
  console.log('WhatsApp: asignar y quitar: OK');
}

// Pasar una consulta a otra especialista (20 nov)
{
  const realFetch = globalThis.fetch;
  const byId = new Map();
  globalThis.fetch = async (u, o) => {
    const m = /\/emails\/(r\d+)$/.exec(u);
    if (m && (!o || !o.method || o.method === 'GET')) return new Response(JSON.stringify(byId.get(m[1]) || {}), { status: byId.has(m[1]) ? 200 : 404 });
    const res = await realFetch(u, o);
    if (o && o.method === 'POST' && /api\.resend\.com\/emails$/.test(u)) { const j = await res.clone().json(); byId.set(j.id, JSON.parse(o.body)); }
    return res;
  };
  const before = sent.length;
  const r = await call('/ask', { email: 'reasigna@example.com', to: 'gineco', text: 'Mi bebé no hace caca desde hace 3 días', context: '' });
  assert.equal(r.s, 200);
  const proMail = sent.slice(before).find((m) => m.to[0] === PROS.gineco.email);
  const link = /https:\/\/[^\s"]+\/reasignar\?t=([a-z0-9]{8})&to=pediatra&s=([0-9a-f]{16})/.exec(proMail.text);
  assert.ok(link, 'el correo de Gonzalo lleva «Pasársela a Lucía»');
  assert.match(proMail.html, /Pasársela a Marina/);
  const [, id, sig] = link;
  const page = await worker.fetch(new Request(`https://w/reasignar?t=${id}&to=pediatra&s=${sig}`), env);
  assert.match(await page.text(), /¿Pasar la consulta a Lucía\?/, 'el enlace solo enseña la pregunta (GET no reasigna)');
  assert.equal((await loadThread(env, id)).p, 'gineco');
  const bad = await worker.fetch(new Request(`https://w/reasignar?t=${id}&to=pediatra&s=0000000000000000`), env);
  assert.match(await bad.text(), /no es válido/);
  const n0 = sent.length;
  const fd = new FormData(); fd.set('t', id); fd.set('to', 'pediatra'); fd.set('s', sig);
  const done = await worker.fetch(new Request('https://w/reasignar', { method: 'POST', body: fd }), env);
  assert.match(await done.text(), /ya le ha llegado a Lucía/);
  const t = await loadThread(env, id);
  assert.equal(t.p, 'pediatra'); assert.equal(t.ra.from, 'gineco');
  const out = sent.slice(n0);
  const toLucia = out.find((m) => m.to[0] === PROS.pediatra.email);
  assert.ok(toLucia && /Gonzalo te ha pasado esta consulta/.test(toLucia.html) && /no hace caca/.test(toLucia.html), 'Lucía recibe la consulta');
  assert.match(toLucia.html, /Nueva consulta para <b>Dra\. Lucía Carrascón<\/b>/);
  assert.ok(!/Pasársela a Lucía/.test(toLucia.html) && /Pasársela a Gonzalo/.test(toLucia.html), 'sus enlaces son a las otras dos');
  assert.ok(out.some((m) => m.to[0] === 'reasigna@example.com' && /la responderá Dra\. Lucía Carrascón/.test(m.text)), 'aviso a la usuaria');
  const again = await worker.fetch(new Request('https://w/reasignar', { method: 'POST', body: fd }), env);
  assert.match(await again.text(), /Ya es tuya|Ya se ha pasado/);
  globalThis.fetch = realFetch;
  console.log('Pasar consulta a otra especialista: OK');
}

// Enlace de amigas (q7m): 5 gratis, también con la misma especialista; sin el enlace, 2
{
  const ask = (n, via) => call('/ask', { email: `amiga-q7m${via ? "" : "-sin"}@example.com`, to: 'gineco', text: `Duda número ${n} sobre la regla`, context: '', ...(via ? { via } : {}) });
  const s0 = sent.length; await ask(1, 'q7m');
  const viaMails = sent.slice(s0);
  assert.ok(viaMails.some((m) => m.to[0] === PROS.gineco.email && /vía enlace de Maite/.test(m.subject) && /Llegó desde enlace de Maite/.test(m.html)), 'la profesional ve de qué enlace viene');
  assert.ok(viaMails.some((m) => m.to[0] === 'copia@example.com' && /desde enlace de Maite/.test(m.subject)), 'la copia del equipo lo dice en el asunto');
  for (let n = 2; n <= 5; n++) { const r = await ask(n, 'q7m'); assert.ok(r.j.ok && !r.j.limit, `amiga: consulta ${n} gratis: ${r.s} ${JSON.stringify(r.j)}`); }
  const sixth = await ask(6, 'q7m');
  assert.ok(sixth.j.limit, 'la sexta ya no es gratis');
  assert.ok((await ask(1)).j.ok);
  assert.ok((await ask(2)).j.limit, 'sin el enlace, la segunda a Gonzalo no es gratis');
  console.log('Enlace de amigas: OK');
}

// WhatsApp «Próximamente»: «Avísame» guarda el correo cifrado una sola vez
{
  const bad = await call('/avisame', { email: 'no-es-correo' }); assert.equal(bad.s, 400);
  env.ALERTS = '1'; const s0 = sent.length;
  const a = await call('/avisame', { email: 'Aviso-WA@Example.com', src: 'portada' }); assert.equal(a.s, 200);
  assert.ok(sent.slice(s0).some((m) => /Aviso de WhatsApp · aviso-wa@example\.com/.test(m.subject)), 'aviso al momento con el correo'); env.ALERTS = '0';
  const b = await call('/avisame', { email: 'aviso-wa@example.com' }); assert.equal(b.s, 200);
  const keys = [...store.keys()].filter((k) => k.startsWith('wa_aviso:'));
  assert.equal(keys.length, 1, 'una sola entrada por correo'); assert.ok(!store.get(keys[0]).includes('aviso-wa@'), 'correo cifrado');
  console.log('WhatsApp avísame: OK');
}

// Modo equipo: la copia también llega, marcada como prueba del equipo
{
  const s0 = sent.length;
  const r = await call('/ask', { email: 'equipo-prueba@example.com', to: 'matrona', text: 'Prueba del equipo para ver la copia', context: '', team: true });
  assert.ok(r.j.ok, JSON.stringify(r.j));
  assert.ok(sent.slice(s0).some((m) => m.to[0] === 'copia@example.com' && /prueba del equipo/.test(m.subject)), 'copia marcada');
  console.log('Copia en modo equipo: OK');
}

// País de la consulta: en el asunto de la copia y en los contadores
{
  const s0 = sent.length;
  const req = new Request('https://w/ask', { method: 'POST', headers: { Origin: 'https://hera-gine.com', 'CF-Connecting-IP': '203.0.113.77' }, body: JSON.stringify({ email: 'pais-ar@example.com', to: 'pediatra', text: 'Duda de prueba desde Argentina', context: '' }) });
  Object.defineProperty(req, 'cf', { value: { country: 'AR' } });
  const r = await worker.fetch(req, env); assert.equal(r.status, 200);
  assert.ok(sent.slice(s0).some((m) => m.to[0] === 'copia@example.com' && / · AR$/.test(m.subject)), 'país en el asunto');
  console.log('País de la consulta: OK');
}

// Oferta de pago en la primera respuesta, solo si la consulta vino de un anuncio
{
  const before = new Set([...store.keys()].filter((k) => k.startsWith('t:')));
  const r = await call('/ask', { email: 'oferta-anuncio@example.com', to: 'gineco', text: 'Duda que llega desde un anuncio', context: '', src: 'ads', camp: 'gineco' });
  assert.ok(r.j.ok, JSON.stringify(r.j));
  const k2 = [...store.keys()].find((k) => k.startsWith('t:') && !before.has(k));
  const t2 = await loadThread(env, k2.slice(2)); assert.equal(t2.ad, 1);
  const s0 = sent.length;
  const r2 = await relayIncoming(env, t2, 'p', mime(PROS.gineco.email, await relayAddress(env, 'p', t2.id), 'Respuesta de prueba.'));
  assert.ok(r2.ok);
  const toUser = sent.slice(s0).find((m) => m.to[0] === 'oferta-anuncio@example.com');
  assert.match(toUser.html, /¿Quieres hablarlo con Gonzalo\?/); assert.match(toUser.html, /#llamada-gineco/); assert.match(toUser.html, /te queda 1 consulta gratis/);
  assert.ok(!/Videollamada de 30 min con Gonzalo · 55 €/.test(toUser.html), 'sin la línea de antes');
  const r3 = await relayIncoming(env, await loadThread(env, t2.id), 'p', mime(PROS.gineco.email, await relayAddress(env, 'p', t2.id), 'Segunda respuesta.'));
  assert.ok(r3.ok); assert.ok(!/¿Quieres hablarlo/.test(sent.at(-1).html), 'solo en la primera respuesta');
  console.log('Oferta tras la respuesta: OK');
}

// Prueba Black Friday: con ab=bf y de anuncio, la consulta se guarda hasta pagar 1 € (sin gastar gratis)
{
  const P0 = env.PAYMENTS, K0 = env.STRIPE_SECRET_KEY, R0 = env.RELAY;
  env.PAYMENTS = 'on'; env.STRIPE_SECRET_KEY = 'sk_test_x'; env.RELAY = '1';
  const DB0 = env.DB;
  env.DB = { prepare: (sql) => { const st = DB0.prepare(sql); return { ...st, bind: (...a) => { const b = st.bind(...a); return Object.assign(Object.create(Object.getPrototypeOf(b) || Object.prototype), b, { first: b.first ? b.first.bind(b) : async () => null }); } }; } };
  const s0 = sent.length;
  const r = await call('/ask', { email: 'bf-prueba@example.com', to: 'matrona', text: 'Duda en la versión Black Friday', context: '', src: 'ads', camp: 'matrona', ab: 'bf' });
  assert.ok(r.j.held && r.j.bf, JSON.stringify(r.j));
  const m = sent.slice(s0).find((x) => x.to[0] === 'bf-prueba@example.com');
  assert.match(m.html, /Pagar 1 € y enviarla/); assert.match(m.html, /plan=bf1/); assert.ok(!/WhatsApp/.test(m.html), 'sin WhatsApp');
  const g = await call('/ask', { email: 'bf-gratis@example.com', to: 'matrona', text: 'Duda en la versión de siempre', context: '', src: 'ads', camp: 'matrona', ab: 'gratis' });
  assert.ok(g.j.ok, 'la versión de siempre sigue gratis');
  const nb = await call('/ask', { email: 'bf-sin-anuncio@example.com', to: 'matrona', text: 'Sin anuncio no hay prueba', context: '', ab: 'bf' });
  assert.ok(nb.j.ok, 'sin anuncio, gratis');
  env.PAYMENTS = P0; env.STRIPE_SECRET_KEY = K0; env.RELAY = R0; env.DB = DB0;
  console.log('Prueba Black Friday: OK');
}

// Evento de la prueba Black Friday aceptado por /hit
{ const r = await call('/hit', { e: 'ab_visita:bf', d: 'ios-web' }); assert.equal(r.s, 200); console.log('Evento de la prueba: OK'); }

// Consulta prioritaria: campaña «prioritaria», 29 €, plazo de 6 h
{
  const { proEmail, reminderEmail } = await import('../src/worker.js');
  const pe = proEmail(PROS.gineco, { text: 'Duda', context: '', prio: true }, 'abcd2345');
  assert.match(pe.subject, /^PRIORITARIA · responder antes de las \d\d:\d\d · Consulta Hera #ABCD2345/); assert.match(pe.html, /plazo de 6 h/);
  assert.match(reminderEmail(PROS.gineco, 'abcd2345', true).text, /lleva 4 horas.*plazo: 6 h/);
  assert.match(confirmEmail(PROS.gineco, { text: 'Duda', prio: true }, 0, 'abcd2345').text, /menos de 6 h/);
  const P0 = env.PAYMENTS, K0 = env.STRIPE_SECRET_KEY, R0 = env.RELAY, DB0 = env.DB;
  env.PAYMENTS = 'on'; env.STRIPE_SECRET_KEY = 'sk_test_x'; env.RELAY = '1';
  env.DB = { prepare: (sql) => { const st = DB0.prepare(sql); return { ...st, bind: (...a) => { const b = st.bind(...a); return Object.assign(Object.create(Object.getPrototypeOf(b) || Object.prototype), b, { first: b.first ? b.first.bind(b) : async () => null }); } }; } };
  const s0 = sent.length;
  const r = await call('/ask', { email: 'prio-prueba@example.com', to: 'gineco', text: 'Duda prioritaria de prueba', context: '', src: 'ads', camp: 'prioritaria', ab: 'prio' });
  assert.ok(r.j.held && r.j.prio, JSON.stringify(r.j));
  const m = sent.slice(s0).find((x) => x.to[0] === 'prio-prueba@example.com');
  assert.match(m.html, /Pagar 29 € y enviarla/); assert.match(m.html, /plan=prio29/);
  const otra = await call('/ask', { email: 'prio-otra@example.com', to: 'gineco', text: 'Otra campaña no es prioritaria', context: '', src: 'ads', camp: 'gineco', ab: 'prio' });
  assert.ok(otra.j.ok, 'sin la campaña prioritaria, gratis');
  env.PAYMENTS = P0; env.STRIPE_SECRET_KEY = K0; env.RELAY = R0; env.DB = DB0;
  console.log('Consulta prioritaria: OK');
}

// Enlaces de socios (23 nov): precio fijo aunque el dispositivo esté en la otra versión de la prueba, y no cuentan en ella
{
  const P0 = env.PAYMENTS, K0 = env.STRIPE_SECRET_KEY, R0 = env.RELAY, DB0 = env.DB, N0 = env.NO_FREE, A0 = env.PRICE_AB;
  env.PAYMENTS = 'on'; env.STRIPE_SECRET_KEY = 'sk_test_x'; env.RELAY = '1'; env.NO_FREE = '1'; env.PRICE_AB = '1'; const B0 = env.BF_OFFER_END_MS; env.BF_OFFER_END_MS = '1'; // ya sin Black Friday
  env.DB = { prepare: (sql) => { const st = DB0.prepare(sql); return { ...st, bind: (...a) => { const b = st.bind(...a); return Object.assign(Object.create(Object.getPrototypeOf(b) || Object.prototype), b, { first: b.first ? b.first.bind(b) : async () => null }); } }; } };
  const s0 = sent.length;
  const ab0 = cnt('consulta_ab:prio') + cnt('consulta_ab:pago');
  const li = await call('/ask', { email: 'socio-lidia@example.com', to: 'gineco', text: 'Duda desde el enlace de Lidia', context: '', via: 'lidia', ab: 'prio' });
  assert.ok(li.j.held && !li.j.prio, JSON.stringify(li.j));
  assert.ok(sent.slice(s0).some((x) => x.to[0] === 'socio-lidia@example.com' && /Pagar 5 € y enviarla/.test(x.html || '')), 'pago de 5 €');
  const cl = await call('/ask', { email: 'socio-clinica@example.com', to: 'gineco', text: 'Duda desde la clínica', context: '', via: 'atempocare', ab: 'pago' });
  assert.ok(cl.j.held && !cl.j.prio, JSON.stringify(cl.j)); // 24 nov: la clínica también a 5 €
  assert.ok(sent.slice(s0).some((x) => x.to[0] === 'socio-clinica@example.com' && /Pagar 5 € y enviarla/.test(x.html || '')), 'clínica a 5 €');
  assert.equal(cnt('consulta_ab:prio') + cnt('consulta_ab:pago'), ab0, 'fuera de la prueba de precio');
  env.PAYMENTS = P0; env.STRIPE_SECRET_KEY = K0; env.RELAY = R0; env.DB = DB0; env.NO_FREE = N0; env.PRICE_AB = A0; env.BF_OFFER_END_MS = B0;
  console.log('Enlaces de socios: OK');
}

// Cifras públicas de la portada
{ const r = await worker.fetch(new Request('https://w/cifras', { headers: { Origin: 'https://hera-gine.com' } }), env); assert.equal(r.status, 200); const j = await r.json(); assert.ok('n' in j && 'r' in j && 'h' in j); console.log('Cifras: OK'); }

// Embudo del pago (21 nov): «fue a Stripe» por persona, «volvió sin pagar» y «lo dejó a medias» (caducado)
{
  const P0 = env.PAYMENTS, K0 = env.STRIPE_SECRET_KEY, W0 = env.STRIPE_WEBHOOK_SECRET, D0 = env.DASH_KEY;
  env.PAYMENTS = 'on'; env.STRIPE_SECRET_KEY = 'sk_test_x'; env.STRIPE_WEBHOOK_SECRET = 'whsec_prueba'; env.DASH_KEY = 'dk';
  const realFetch = globalThis.fetch; let made = null;
  globalThis.fetch = async (u, o) => {
    if (String(u).startsWith('https://api.stripe.com/v1/prices')) return new Response(JSON.stringify({ data: [{ id: 'price_x' }] }), { status: 200 });
    if (String(u) === 'https://api.stripe.com/v1/checkout/sessions') { made = new URLSearchParams(o.body); return new Response(JSON.stringify({ id: 'cs_test_embudo', url: 'https://checkout.stripe.com/c/pay/cs_test_embudo' }), { status: 200 }); }
    return realFetch(u, o);
  };
  const mismo = { 'CF-Connecting-IP': '7.7.7.7', 'User-Agent': 'prueba-embudo' };
  await call('/hit', { e: 'portada', d: 'ios-web' }, mismo);
  const r = await call('/checkout', { email: 'embudo@example.com', plan: 'suelta', back: 'web' }, mismo);
  assert.equal(r.s, 200, JSON.stringify(r.j)); assert.match(r.j.url, /checkout\.stripe\.com/);
  assert.equal(made.get('cancel_url'), 'https://hera-gine.com/?web=1&pago=no&plan=suelta');
  const tag = made.get('metadata[p]'); assert.match(tag, /^[0-9A-F]{4}$/, 'la etiqueta del día viaja con el pago');
  assert.ok(activity.some((x) => x.e === 'pago_abierto:suelta' && x.p === tag), 'fue a Stripe, en su recorrido');
  assert.equal(cnt('pago_inicio:suelta') >= 1, true);
  // Modo equipo: abre el pago igual, pero no cuenta
  const antes = cnt('pago_inicio:bono');
  const eq = await call('/checkout', { email: 'equipo@example.com', plan: 'bono', back: 'web', team: true });
  assert.equal(eq.s, 200); assert.equal(cnt('pago_inicio:bono'), antes, 'el equipo no cuenta en «Fueron a Stripe»');
  // Vuelve de Stripe sin pagar: la web manda pago_cancelado:<plan>
  assert.equal((await call('/hit', { e: 'pago_cancelado:suelta', d: 'ios-web' })).s, 200);
  // Stripe la da por perdida: checkout.session.expired (firmado)
  const raw = JSON.stringify({ type: 'checkout.session.expired', data: { object: { id: 'cs_test_embudo', livemode: false, metadata: { plan: 'suelta', p: tag, h: 'a'.repeat(64) } } } });
  const t = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('whsec_prueba'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const v1 = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${raw}`)))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const wh = await worker.fetch(new Request('https://w/stripe/webhook', { method: 'POST', headers: { 'Stripe-Signature': `t=${t},v1=${v1}` }, body: raw }), env);
  assert.equal(wh.status, 200);
  assert.equal(cnt('pago_caducado:suelta'), 1);
  assert.ok(activity.some((x) => x.e === 'pago_caducado:suelta' && x.p === tag), 'a medias, en el recorrido de la misma persona');
  // El panel lo enseña
  const html = await (await worker.fetch(new Request('https://w/panel?k=dk&d=30'), env)).text();
  assert.match(html, /Pago con Stripe, paso a paso/);
  assert.match(html, /<td>Consulta suelta<\/td><td>\d+<\/td><td>1<\/td><td><b>0<\/b>[^<]*<span class="mute">0 %<\/span><\/td><td>1<\/td><td>1<\/td>/, 'fila: fue 1 vez a Stripe, 0 pagos, 1 volvió sin pagar, 1 a medias');
  globalThis.fetch = realFetch;
  env.PAYMENTS = P0; env.STRIPE_SECRET_KEY = K0; env.STRIPE_WEBHOOK_SECRET = W0; env.DASH_KEY = D0;
  console.log('Embudo del pago: OK');
}

// Visitas de anuncio a una guía: el servicio las acepta y las guarda en la actividad (el panel las agrupa en «De dónde vienen»)
{ const hr = await call('/hit', { e: 'anuncio_guia:lactancia' }, { 'CF-Connecting-IP': '6.6.6.6', 'User-Agent': 'guia' }); assert.equal(hr.s, 200); assert.ok(activity.some((x) => x.e === 'anuncio_guia:lactancia')); console.log('Anuncio a guía: OK'); }

// Recordatorios de pago pendiente (21 nov): el 1.º a la hora, el 2.º (último) a las 24 h, y ninguno más
{
  const { remindHolds } = await import('../src/worker.js');
  const P0 = env.PAYMENTS, K0 = env.STRIPE_SECRET_KEY;
  env.PAYMENTS = 'on'; env.STRIPE_SECRET_KEY = 'sk_test_x';
  const DB0 = env.DB;
  env.DB = { prepare: (sql) => { const st = DB0.prepare(sql); return { ...st, bind: (...a) => { const b = st.bind(...a); return Object.assign(Object.create(Object.getPrototypeOf(b) || Object.prototype), b, { first: b.first ? b.first.bind(b) : async () => null }); } }; } };
  const r = await call('/ask', { email: 'recordar@example.com', to: 'gineco', text: 'Duda para los recordatorios', context: '', src: 'ads', camp: 'gineco', ab: 'bf' });
  assert.ok(r.j.held, JSON.stringify(r.j));
  const key = [...store.keys()].filter((k) => k.startsWith('hold:')).sort((a, b) => JSON.parse(store.get(b)).at - JSON.parse(store.get(a)).at)[0];
  for (const k of [...store.keys()].filter((k) => k.startsWith('hold:') && k !== key)) store.delete(k); // solo esta
  const set = (o) => store.set(key, JSON.stringify({ ...JSON.parse(store.get(key)), ...o }));
  const mails = () => sent.filter((m) => m.to[0] === 'recordar@example.com');
  const n0 = mails().length;
  await remindHolds(env); assert.equal(mails().length, n0, 'nada antes de la hora');
  set({ at: Date.now() - 61 * 60000 });
  await remindHolds(env);
  assert.equal(mails().length, n0 + 1); assert.match(mails().at(-1).subject, /^¿Seguimos con tu consulta a /);
  assert.match(mails().at(-1).html, /Apple Pay/); assert.match(mails().at(-1).html, /una vez más mañana/);
  assert.equal(JSON.parse(store.get(key)).rem, 1);
  await remindHolds(env); assert.equal(mails().length, n0 + 1, 'el 2.º no sale enseguida');
  set({ at: Date.now() - 25 * 3600000, r1: Date.now() - 13 * 3600000 });
  await remindHolds(env);
  assert.equal(mails().length, n0 + 2); assert.match(mails().at(-1).subject, /^Último aviso: tu consulta a /); assert.match(mails().at(-1).html, /Es el último recordatorio/);
  await remindHolds(env); assert.equal(mails().length, n0 + 2, 'nunca más de dos');
  assert.equal(cnt('guardada_recordatorio2'), 1);
  // El cron de cada 15 min solo hace los recordatorios
  const { default: h } = await import('../src/worker.js'); await h.scheduled({ cron: '*/15 * * * *', scheduledTime: Date.UTC(2026, 10, 21, 20, 30) }, env);
  env.PAYMENTS = P0; env.STRIPE_SECRET_KEY = K0; env.DB = DB0;
  console.log('Recordatorios de pago: OK');
}

// Se le olvidó algo (21 nov): al mismo profesional en 30 min y sin respuesta → se añade a su consulta, sin gastar otra
{
  const R0 = env.RELAY; env.RELAY = '1'; env.ADD_WINDOW_MIN = '30';
  const em = 'olvido@example.com';
  const first = await call('/ask', { email: em, to: 'pediatra', text: 'Mi bebé tiene fiebre', context: '' });
  assert.ok(first.j.ok && !first.j.added, JSON.stringify(first.j));
  const nThreads = [...store.keys()].filter((k) => k.startsWith('t:')).length;
  const s0 = sent.length;
  const again = await call('/ask', { email: em, to: 'pediatra', text: 'Se me olvidó: tiene 8 meses', context: '' });
  assert.ok(again.j.ok && again.j.added, JSON.stringify(again.j));
  assert.equal(again.j.id, first.j.id ?? again.j.id);
  assert.equal(again.j.remaining, first.j.remaining, 'no gasta otra consulta');
  assert.equal([...store.keys()].filter((k) => k.startsWith('t:')).length, nThreads, 'no abre otra consulta');
  const toPro = sent.slice(s0).find((m) => /^Re: /.test(m.subject) && /ha escrito/.test(m.html));
  assert.ok(toPro, 'le llega al profesional en la misma conversación'); assert.match(toPro.text, /tiene 8 meses/); assert.match(toPro.text, /lo añadió \d+ min después/);
  // A otro profesional: consulta nueva
  const other = await call('/ask', { email: em, to: 'matrona', text: 'Y otra duda de lactancia', context: '' });
  assert.ok(other.j.ok && !other.j.added);
  // Pasados 30 min: consulta nueva
  for (const k of [...store.keys()].filter((k) => k.startsWith('c:'))) { const v = JSON.parse(store.get(k)); if (v.lt) { v.lt.at -= 31 * 60000; store.set(k, JSON.stringify(v)); } }
  const late = await call('/ask', { email: em, to: 'matrona', text: 'Otra cosa, una hora después', context: '' });
  assert.ok(!late.j.added, 'fuera de los 30 min no se añade');
  env.RELAY = R0; env.ADD_WINDOW_MIN = '0';
  console.log('Añadir a la consulta: OK');
}

// Sin consultas gratis (22 nov, NO_FREE): todas se guardan hasta pagar (1 € hasta el 1 dic), salvo enlaces de profesionales y amigas
{
  const P0 = env.PAYMENTS, K0 = env.STRIPE_SECRET_KEY, R0 = env.RELAY;
  env.PAYMENTS = 'on'; env.STRIPE_SECRET_KEY = 'sk_test_x'; env.RELAY = '1'; env.NO_FREE = '1';
  const DB0 = env.DB;
  env.DB = { prepare: (sql) => { const st = DB0.prepare(sql); return { ...st, bind: (...a) => { const b = st.bind(...a); return Object.assign(Object.create(Object.getPrototypeOf(b) || Object.prototype), b, { first: b.first ? b.first.bind(b) : async () => null }); } }; } };
  const s0 = sent.length;
  const a = await call('/ask', { email: 'sin-gratis@example.com', to: 'gineco', text: 'Primera consulta, ya sin gratis', context: '' });
  assert.ok(a.j.limit && a.j.held && a.j.bf, JSON.stringify(a.j));
  const m = sent.slice(s0).find((x) => x.to[0] === 'sin-gratis@example.com');
  assert.match(m.html, /Pagar 1 € y enviarla/); assert.ok(!/gratis/i.test(m.subject));
  const pro = await call('/ask', { email: 'via-pro@example.com', to: 'matrona', text: 'Vengo del Instagram de Marina', context: '', via: 'ig_marina' });
  assert.ok(pro.j.ok && !pro.j.limit, 'los enlaces de las profesionales siguen gratis');
  const fr = await call('/ask', { email: 'amiga@example.com', to: 'matrona', text: 'Vengo del enlace de Maite', context: '', via: 'q7m' });
  assert.ok(fr.j.ok && !fr.j.limit, 'los enlaces de amigas siguen gratis');
  const app = await call('/ask', { email: 'app-sin-gratis@example.com', to: 'pediatra', text: 'Desde la app, sin ab ni anuncio', context: '' });
  assert.ok(app.j.held && app.j.bf, 'también sin anuncio ni versión (la app)');
  const { holdEmail } = await import('../src/worker.js');
  assert.match(holdEmail(PROS.gineco, 'x', { suelta: 's', bono: 'b', mensual: 'm' }, false, '', 'pago').html, /Cada consulta por escrito cuesta 5 €/);
  delete env.NO_FREE; env.PAYMENTS = P0; env.STRIPE_SECRET_KEY = K0; env.RELAY = R0; env.DB = DB0;
  console.log('Sin consultas gratis: OK');
}

// Grupo de Maite (g8w, FREE_VIA): con NO_FREE y la prueba 9 € / 29 €, sigue con 2 gratis, una por profesional
{
  const P0 = env.PAYMENTS, K0 = env.STRIPE_SECRET_KEY, R0 = env.RELAY;
  env.PAYMENTS = 'on'; env.STRIPE_SECRET_KEY = 'sk_test_x'; env.RELAY = '1'; env.NO_FREE = '1'; env.PRICE_AB = '1';
  const DB0 = env.DB;
  env.DB = { prepare: (sql) => { const st = DB0.prepare(sql); return { ...st, bind: (...a) => { const b = st.bind(...a); return Object.assign(Object.create(Object.getPrototypeOf(b) || Object.prototype), b, { first: b.first ? b.first.bind(b) : async () => null }); } }; } };
  const ask = (to, text) => call('/ask', { email: 'grupo-maite@example.com', to, text, context: '', via: 'g8w', ab: 'prio' });
  const g1 = await ask('gineco', 'Primera, con Gonzalo');
  assert.ok(g1.j.ok && !g1.j.limit && g1.j.remaining === 1, JSON.stringify(g1.j));
  const g2 = await ask('gineco', 'Segunda, otra vez con Gonzalo');
  assert.ok(g2.j.limit && g2.j.same && !g2.j.prio, 'la gratis con Gonzalo ya la usó: la otra es con otra profesional (y a 9 €, no a 29 €)');
  const m1 = await ask('matrona', 'Segunda gratis, con Marina');
  assert.ok(m1.j.ok && !m1.j.limit && m1.j.remaining === 0, JSON.stringify(m1.j));
  const l1 = await ask('pediatra', 'Tercera: ya no hay gratis');
  assert.ok(l1.j.limit && !l1.j.prio, 'gastadas las 2, se paga (9 €)');
  delete env.NO_FREE; delete env.PRICE_AB; env.PAYMENTS = P0; env.STRIPE_SECRET_KEY = K0; env.RELAY = R0; env.DB = DB0;
  console.log('Grupo de Maite: 2 gratis, una por profesional: OK');
}

// Cuestionario de menopausia: resultado por correo, enlace de pago, «no quiero más» y seguimiento a los 2 días
{
  const { menoFollowups } = await import('../src/worker.js');
  const text = 'Mi cuestionario de menopausia (orientativo): 30 de 48, te afectan mucho. Tu cuerpo 9/12.\n\nMi duda: ';
  const s0 = sent.length;
  const bad = await call('/menopausia/resultado', { email: 'meno@example.com', text: 'otra cosa' });
  assert.equal(bad.j.error, 'bad_text');
  const r1 = await call('/menopausia/resultado', { email: 'meno@example.com', text, ab: 'prio' });
  assert.ok(r1.j.ok, JSON.stringify(r1.j));
  const m1 = sent.slice(s0).find((x) => x.to[0] === 'meno@example.com');
  assert.match(m1.subject, /Tu resultado del cuestionario/); assert.match(m1.html, /Enviar mi resultado a Gonzalo · 29 €/); assert.match(m1.html, /30 de 48, te afectan mucho/);
  assert.ok(!/Mi duda:/.test(m1.text), 'sin el «Mi duda:» del final');
  assert.ok(sent.slice(s0).some((x) => x.to[0] !== 'meno@example.com' && /meno@example\.com/.test(x.subject || '') && /Correo: meno@example\.com/.test(x.text || '')), 'el aviso al equipo lleva su correo (Noza, 24 nov)');
  const pay = m1.text.match(/https:\/\/\S+\/menopausia\/pagar\?\S+/)[0]; const stop = m1.text.match(/https:\/\/\S+\/menopausia\/baja\?\S+/)[0];
  // pagar: crea la consulta guardada (prioritaria) y lleva a /pagar con el plan de 29 €
  const rp = await worker.fetch(new Request(pay.replace(/^https:\/\/[^/]+/, 'https://w')), env);
  assert.equal(rp.status, 303); const loc = rp.headers.get('Location');
  assert.match(loc, /\/pagar\?c=[a-z0-9]{8}&s=[a-f0-9]{16}&plan=prio29$/);
  const hid = loc.match(/c=([a-z0-9]{8})/)[1];
  const hold = await env.KV.get(`hold:${hid}`, 'json'); assert.ok(hold && hold.prio === 1 && hold.to === 'gineco' && hold.rem === 2, JSON.stringify(hold));
  const rp2 = await worker.fetch(new Request(pay.replace(/^https:\/\/[^/]+/, 'https://w')), env);
  assert.match(rp2.headers.get('Location'), new RegExp(`c=${hid}`), 'el segundo clic reutiliza la misma consulta guardada');
  // seguimiento: antes de 2 días, nada; después, uno (con la consulta aún sin pagar) y se borra
  const s1 = sent.length; await menoFollowups(env); assert.equal(sent.length, s1, 'aún no');
  const keys = (await env.KV.list({ prefix: 'meno:' })).keys; const k0 = keys[0].name; const raw = await env.KV.get(k0, 'json');
  await env.KV.put(k0, JSON.stringify({ ...raw, at: Date.now() - 49 * 3600000 }));
  await menoFollowups(env);
  const f1 = sent.slice(s1).filter((x) => x.to[0] === 'meno@example.com'); assert.equal(f1.length, 1); assert.match(f1[0].subject, /revise tu resultado/);
  assert.equal(await env.KV.get(k0), null, 'tras el seguimiento se borra');
  // no quiero más: borra
  const r2 = await call('/menopausia/resultado', { email: 'meno2@example.com', text });
  const m2 = sent.filter((x) => x.to[0] === 'meno2@example.com').pop(); assert.match(m2.html, /Gonzalo · 5 €/);
  const stop2 = m2.text.match(/https:\/\/\S+\/menopausia\/baja\?\S+/)[0];
  const rb = await worker.fetch(new Request(stop2.replace(/^https:\/\/[^/]+/, 'https://w')), env); assert.equal(rb.status, 200);
  assert.equal((await env.KV.list({ prefix: 'meno:' })).keys.length, 0, 'borrado al pedir no recibir más');
  const rs = await worker.fetch(new Request(stop.replace(/^https:\/\/[^/]+/, 'https://w')), env); assert.equal(rs.status, 200);
  const s9 = sent.length; await call('/menopausia/resultado', { email: 'equipo@example.com', text, team: true });
  assert.ok(sent.slice(s9).some((x) => /^Prueba del equipo · Cuestionario de menopausia · equipo@example\.com/.test(x.subject || '')), 'en modo equipo también avisa, marcado como prueba');
  console.log('Cuestionario de menopausia por correo: OK');
}

// Fin del 1 € (22 nov): sin gratis y pasado BF_OFFER_END, la consulta nueva se guarda a 9 € (las guardadas antes siguen a 1 €)
{
  const P0 = env.PAYMENTS, K0 = env.STRIPE_SECRET_KEY, R0 = env.RELAY, B0 = env.BF_OFFER_END_MS;
  env.PAYMENTS = 'on'; env.STRIPE_SECRET_KEY = 'sk_test_x'; env.RELAY = '1'; env.NO_FREE = '1'; env.BF_OFFER_END_MS = String(Date.now() - 1000);
  const DB0 = env.DB;
  env.DB = { prepare: (sql) => { const st = DB0.prepare(sql); return { ...st, bind: (...a) => { const b = st.bind(...a); return Object.assign(Object.create(Object.getPrototypeOf(b) || Object.prototype), b, { first: b.first ? b.first.bind(b) : async () => null }); } }; } };
  const s0 = sent.length;
  const a = await call('/ask', { email: 'nueve-euros@example.com', to: 'gineco', text: 'Ya sin Black Friday', context: '', ab: 'pago' });
  assert.ok(a.j.held && !a.j.bf && !a.j.prio, JSON.stringify(a.j));
  const m = sent.slice(s0).find((x) => x.to[0] === 'nueve-euros@example.com');
  assert.match(m.html, /Pagar 5 € y enviarla/); assert.match(m.html, /Cada consulta por escrito cuesta 5 €/);
  // Prueba 9 € / 29 € apagada: ab=prio no da la prioritaria (sin campaña)
  const p = await call('/ask', { email: 'sin-prio@example.com', to: 'gineco', text: 'Con ab=prio y la prueba apagada', context: '', ab: 'prio' });
  assert.ok(p.j.held && !p.j.prio, 'sin PRICE_AB no hay 29 €');
  env.PRICE_AB = '1';
  const q = await call('/ask', { email: 'con-prio@example.com', to: 'gineco', text: 'Con la prueba encendida', context: '', ab: 'prio' });
  assert.ok(q.j.held && q.j.prio, 'con PRICE_AB, 29 €');
  delete env.PRICE_AB; delete env.NO_FREE; env.BF_OFFER_END_MS = B0; env.PAYMENTS = P0; env.STRIPE_SECRET_KEY = K0; env.RELAY = R0; env.DB = DB0;
  console.log('Fin del 1 € y prueba de precio: OK');
}

// Precio de 29 € que falta en Stripe: el servicio lo crea solo (22 nov)
{
  const P0 = env.PAYMENTS, K0 = env.STRIPE_SECRET_KEY;
  env.PAYMENTS = 'on'; env.STRIPE_SECRET_KEY = 'sk_test_x';
  const realFetch = globalThis.fetch; const calls = [];
  globalThis.fetch = async (u, o) => {
    const url = String(u);
    if (url.startsWith('https://api.stripe.com/v1/prices?')) return new Response(JSON.stringify({ data: [] }), { status: 200 });
    if (url === 'https://api.stripe.com/v1/products') { calls.push('product'); return new Response(JSON.stringify({ id: 'prod_x' }), { status: 200 }); }
    if (url === 'https://api.stripe.com/v1/prices') { calls.push('price:' + new URLSearchParams(o.body).get('unit_amount')); return new Response(JSON.stringify({ id: 'price_prio' }), { status: 200 }); }
    if (url === 'https://api.stripe.com/v1/checkout/sessions') return new Response(JSON.stringify({ id: 'cs_x', url: 'https://checkout.stripe.com/x' }), { status: 200 });
    return realFetch(u, o);
  };
  const id = 'prio1234';
  await env.KV.put(`hold:${id}`, JSON.stringify({ x: 'x', at: Date.now(), h: 'h', to: 'gineco', rem: 0, prio: 1 }));
  const { createCheckout } = await import('../src/stripe.js');
  const u = await createCheckout(env, { email: 'p@example.com', plan: 'prio29', h: 'a'.repeat(64), origin: 'https://hera-gine.com', back: 'web', hold: id });
  assert.match(u, /checkout\.stripe\.com/); assert.deepEqual(calls, ['product', 'price:2900']);
  globalThis.fetch = realFetch; env.PAYMENTS = P0; env.STRIPE_SECRET_KEY = K0;
  console.log('Precio de 29 € creado si falta: OK');
}

// Acompañamiento mensual (22 nov): precio mensual de 99 € creado si falta, con la profesional y el móvil en el pago
{
  const P0 = env.PAYMENTS, K0 = env.STRIPE_SECRET_KEY;
  env.PAYMENTS = 'on'; env.STRIPE_SECRET_KEY = 'sk_test_x';
  const realFetch = globalThis.fetch; const calls = []; let sess = null;
  globalThis.fetch = async (u, o) => {
    const url = String(u);
    if (url.startsWith('https://api.stripe.com/v1/prices?')) return new Response(JSON.stringify({ data: [] }), { status: 200 });
    if (url === 'https://api.stripe.com/v1/products') return new Response(JSON.stringify({ id: 'prod_a' }), { status: 200 });
    if (url === 'https://api.stripe.com/v1/prices') { const b = new URLSearchParams(o.body); calls.push(`${b.get('unit_amount')}/${b.get('recurring[interval]')}`); return new Response(JSON.stringify({ id: 'price_acomp' }), { status: 200 }); }
    if (url === 'https://api.stripe.com/v1/checkout/sessions') { sess = new URLSearchParams(o.body); return new Response(JSON.stringify({ id: 'cs_a', url: 'https://checkout.stripe.com/a' }), { status: 200 }); }
    return realFetch(u, o);
  };
  const r = await call('/checkout', { email: 'acomp@example.com', plan: 'acomp', pro: 'matrona', back: 'consultas' });
  assert.match(r.j.url || '', /checkout\.stripe\.com/, JSON.stringify(r.j));
  assert.deepEqual(calls, ['9900/month']);
  assert.equal(sess.get('mode'), 'subscription'); assert.equal(sess.get('subscription_data[metadata][pro]'), 'matrona');
  assert.equal(sess.get('phone_number_collection[enabled]'), 'true'); assert.match(sess.get('success_url'), /\/consultas\/\?pago=ok/);
  const bad = await call('/checkout', { email: 'acomp@example.com', plan: 'acomp', back: 'consultas' });
  assert.equal(bad.j.error, 'bad_pro', 'sin profesional no hay acompañamiento');
  globalThis.fetch = realFetch; env.PAYMENTS = P0; env.STRIPE_SECRET_KEY = K0;
  console.log('Acompañamiento: pago mensual: OK');
}

// Con el acompañamiento en vigor, la consulta llega a la profesional como prioritaria (6 h) y sin el tope de una al día
{
  const K0 = env.STRIPE_SECRET_KEY; env.STRIPE_SECRET_KEY = 'sk_test_x';
  const DB0 = env.DB, KV0 = env.KV;
  const future = new Date(Date.now() + 20 * 86400000).toISOString();
  env.DB = { prepare: (sql) => { const st = DB0.prepare(sql); return { ...st, bind: (...a) => { const b = st.bind(...a); return Object.assign(Object.create(Object.getPrototypeOf(b) || Object.prototype), b, { first: sql.startsWith('SELECT n, until, sub_until') ? async () => ({ n: 0, until: null, sub_until: future, day: '2000-01-01' }) : b.first ? b.first.bind(b) : async () => null }); } }; } };
  env.KV = Object.assign(Object.create(Object.getPrototypeOf(KV0) || Object.prototype), KV0, { get: (k, t) => (String(k).startsWith('acomp:') ? Promise.resolve('matrona') : KV0.get(k, t)) });
  const s0 = sent.length;
  const a = await call('/ask', { email: 'socia@example.com', to: 'matrona', text: 'Duda del acompañamiento', context: '' });
  assert.ok(a.j.ok && a.j.unlimited, JSON.stringify(a.j));
  const pm = sent.slice(s0).find((x) => /PRIORITARIA/.test(x.subject || ''));
  assert.ok(pm, 'el correo a la profesional va como prioritario'); assert.match(pm.html, /Acompañamiento mensual/);
  env.DB = DB0; env.KV = KV0; env.STRIPE_SECRET_KEY = K0;
  console.log('Acompañamiento: consulta prioritaria: OK');
}
