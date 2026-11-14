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
const saldo = new Map(); const counts = new Map(); const visitors = new Set(); const activity = []; const opiniones = [];
const DB = { prepare(sql) { return { bind(...a) { return { async run() {
  if (sql.startsWith('INSERT INTO counts')) { const k = a[0] + '|' + a[1]; counts.set(k, (counts.get(k) || 0) + 1); return { meta: { changes: 1 } }; }
  if (sql.startsWith('UPDATE saldo SET n = (CASE')) { saldo.set(a[0], (saldo.get(a[0]) || 0) + a[1]); return { meta: { changes: 1 } }; }
  if (sql.startsWith('INSERT INTO opiniones')) { opiniones.push({ ts: a[0], pro: a[1], rating: a[2], texto: a[3], nombre: a[4], publicable: a[5] }); return { meta: { changes: 1 } }; }
  if (sql.startsWith('INSERT INTO activity')) { activity.push({ ts: a[0], e: a[1], d: a[2], p: a[3] }); return { meta: { changes: 1 } }; }
  if (sql.startsWith('INSERT OR IGNORE')) { const k = a.join('|'); if (visitors.has(k)) return { meta: { changes: 0 } }; visitors.add(k); return { meta: { changes: 1 } }; }
  return { meta: { changes: 0 } }; },
  async all() { if (sql.includes('FROM opiniones')) return { results: opiniones }; if (sql.includes('FROM activity')) return { results: activity.filter((r) => r.ts > a[0] && r.ts <= a[1]) }; return { results: [...counts].map(([k, n]) => ({ day: k.split('|')[0], k: k.split('|')[1], n })) }; } }; } }; } };
const env = { KV, DB, PANEL_CODE: 'panel', COPY_TO: 'copia@example.com', HASH_SALT: 'sal', ADMIN_TOKEN: 'adm', ALLOWED_ORIGINS: 'https://hera-gine.com', FROM: 'Hera <consultas@hera-gine.com>', FREE_LIMIT: '2', DRY_RUN: '0', RELAY: '1', RESEND_API_KEY: 'k' };
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
// recordatorio a las 40 h
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
assert.equal(sent.length, n0 + 1, 'aviso al momento'); assert.match(sent.at(-1).subject, /Instaló la app/); assert.equal(sent.at(-1).to[0], 'copia@example.com');
await call('/hit', { e: 'instalada', d: 'android-app' }, { 'CF-Connecting-IP': '8.8.8.8', 'User-Agent': 'z' });
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
  assert.ok(avisos.some((m) => m.subject === 'Opinión · «Sí, mucho» para Marina'), 'aviso de opinión al equipo');
  assert.ok(avisos.some((m) => m.subject.startsWith('Opinión · comentario') && m.text.includes('Laura G.')), 'aviso de comentario con el nombre');
  assert.ok(avisos.every((m) => m.to[0] === 'copia@example.com' && !m.text.includes('contenta@')), 'al equipo y sin el correo de la usuaria');
  assert.ok(!JSON.stringify(opiniones).includes('@'), 'las opiniones no llevan correos');
  await call('/opinion/baja', { t: r2.j.id, s: s2 });
  t = await loadThread(env, r2.j.id); t.a = Date.now() - 25 * 3600000; await saveThread(env, t);
  sent.length = 0; await worker.scheduled({}, env);
  assert.ok(!sent.some((m) => m.subject?.startsWith('¿Te ayudó')), 'baja respetada');
  const pg2 = await (await worker.fetch(new Request('https://w/panel?k=dk&d=30'), env)).text();
  assert.match(pg2, /Opiniones tras la consulta/); assert.match(pg2, /Laura G\./);

  // MARK: invitaciones (vera-backlog#84)
  const inv = (await call('/opinion', { t: r2.j.id, s: s2, r: 1 })).j.invite;
  assert.match(inv, /^[a-hjkmnp-z2-9]{6}$/, 'quien valora «Sí, mucho» recibe su enlace');
  assert.equal((await call('/opinion', { t: r2.j.id, s: s2, r: 1 })).j.invite, inv, 'siempre el mismo código');
  { const t0 = await loadThread(env, r2.j.id); delete t0.h; await saveThread(env, t0); }
  assert.equal((await call('/opinion', { t: r2.j.id, s: s2, r: 1 })).j.invite, inv, 'consultas antiguas: la huella se rehace con el correo cifrado');
  assert.equal((await call('/opinion', { t: id, s, r: 1 })).j.invite, undefined, 'sin enlace si no le ayudó');
  const own = await call('/ask', { email: 'contenta@example.com', to: 'matrona', text: 'Me invito a mí misma', ref: inv });
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
  assert.match(html, /No he reenviado 1 identificador/, 'no reenvía correos de otra consulta');
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
