import worker, { normalizeEmail, confirmEmail, PROS } from '../src/worker.js';
import assert from 'node:assert/strict';

assert.equal(normalizeEmail(' Maria.Lopez+hera@Gmail.com '), 'marialopez@gmail.com');
assert.equal(normalizeEmail('maria.lopez@googlemail.com'), 'marialopez@gmail.com');
assert.equal(normalizeEmail('ana.g+x@hotmail.es'), 'ana.g@hotmail.es');
assert.equal(normalizeEmail('no-es-un-correo'), null);
assert.match(confirmEmail(PROS.matrona, { text: 'Hola', context: '' }, 1).text, /Te queda 1 consulta gratuita/);
assert.match(confirmEmail(PROS.matrona, { text: 'Hola', context: '' }, 0).text, /última consulta gratuita/);
assert.match(confirmEmail(PROS.matrona, { text: '<script>', context: '' }, 1).html, /&lt;script&gt;/);

const store = new Map();
const KV = { async get(k, t) { const v = store.get(k); return v == null ? null : t === 'json' ? JSON.parse(v) : v; }, async put(k, v) { store.set(k, v); }, async delete(k) { store.delete(k); } };
const sent = [];
const counts = new Map(); const visitors = new Set();
const DB = { prepare(sql) { return { bind(...a) { return { async run() {
  if (sql.startsWith('INSERT INTO counts')) { const k = a[0] + '|' + a[1]; counts.set(k, (counts.get(k) || 0) + 1); return { meta: { changes: 1 } }; }
  if (sql.startsWith('INSERT OR IGNORE')) { const k = a.join('|'); if (visitors.has(k)) return { meta: { changes: 0 } }; visitors.add(k); return { meta: { changes: 1 } }; }
  return { meta: { changes: 0 } }; },
  async all() { return { results: [...counts].map(([k, n]) => ({ day: k.split('|')[0], k: k.split('|')[1], n })) }; } }; } }; } };
const env = { KV, DB, PANEL_CODE: 'panel', COPY_TO: 'copia@example.com', HASH_SALT: 'sal', ADMIN_TOKEN: 'adm', ALLOWED_ORIGINS: 'https://hera-gine.com', FROM: 'Hera <consultas@hera-gine.com>', FREE_LIMIT: '2', DRY_RUN: '0', RESEND_API_KEY: 'k' };
globalThis.fetch = async (u, o) => { sent.push(JSON.parse(o.body)); return new Response('{}', { status: 200 }); };
let ip = 0;
const call = (path, body, extra = {}) => worker.fetch(new Request(`https://w${path}`, { method: 'POST', headers: { Origin: 'https://hera-gine.com', 'CF-Connecting-IP': `1.1.1.${ip++}`, ...extra }, body: JSON.stringify(body) }), env).then(async (r) => ({ s: r.status, j: await r.json() }));
const q = { email: 'Maria.Lopez@gmail.com', to: 'matrona', text: 'Me duele al dar el pecho', context: 'Posparto · semana 2' };

let r = await call('/ask', q);
assert.deepEqual([r.s, r.j.remaining], [200, 1]);
assert.equal(sent.length, 2, 'correo al profesional y confirmación');
assert.equal(sent[0].to[0], 'marina@hera-gine.com'); assert.equal(sent[0].reply_to, 'Maria.Lopez@gmail.com');
assert.equal(sent[1].to[0], 'Maria.Lopez@gmail.com');
assert.deepEqual(sent[0].bcc, ['copia@example.com'], 'copia oculta de la consulta'); assert.deepEqual(sent[1].bcc, ['copia@example.com'], 'la confirmación también lleva copia');
r = await call('/ask', { ...q, email: 'marialopez+otra@gmail.com', to: 'pediatra' });
assert.equal(r.j.remaining, 0, 'cuenta en total y normaliza el correo');
r = await call('/ask', q);
assert.equal(r.j.limit, true); assert.equal(sent.length, 4, 'agotadas: no se envía nada');
assert.ok(![...store.values()].some((v) => v.includes('duele')), 'el texto no se guarda');
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
console.log('consultas: OK');
