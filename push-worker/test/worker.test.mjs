import { weekFor, messageFor, madridNow, runDaily } from '../src/worker.js';
import assert from 'node:assert/strict';

// Semana: 280 días = 40+0. Parto el 2027-02-21 → el 2026-10-05 son 139 días antes → día 141 → semana 20.
assert.equal(weekFor('2027-02-21', '2026-10-05'), 20);
assert.equal(weekFor('2027-02-21', '2027-02-21'), 40);
assert.equal(weekFor('2027-02-21', '2027-02-28'), 41);
assert.equal(weekFor('basura', '2026-10-05'), null);

const m = messageFor(20);
assert.equal(m.title, 'Semana 20 de embarazo');
assert.ok(m.body.startsWith('Lo normal estos días: ') && m.body.length <= 200, m.body);
for (let w = 4; w <= 42; w++) assert.ok(messageFor(w).body.length <= 200, `semana ${w}`);

// Madrid verano (UTC+2) e invierno (UTC+1)
assert.deepEqual(madridNow(new Date('2026-07-01T07:00:00Z')), { date: '2026-07-01', hour: 9 });
assert.deepEqual(madridNow(new Date('2026-12-01T08:00:00Z')), { date: '2026-12-01', hour: 9 });

// Cron diario con KV simulada y push falso
const store = new Map();
const SUBS = {
  async list({ prefix }) { return { keys: [...store.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }; },
  async get(k) { return store.has(k) ? JSON.parse(store.get(k)) : null; },
  async put(k, v) { store.set(k, v); },
  async delete(k) { store.delete(k); },
};
const mk = (due, last) => JSON.stringify({ sub: { endpoint: 'https://fcm.googleapis.com/x', keys: { p256dh: 'a', auth: 'b' } }, due, last });
store.set('s:nueva-semana', mk('2027-02-21', 19));
store.set('s:ya-avisada', mk('2027-02-21', 20));
store.set('s:caducada', mk('2025-01-01', 30));
const env = { SUBS };
assert.deepEqual(await runDaily(env, { date: '2026-10-05', hour: 8 }), { skipped: true });
globalThis.fetch = async () => new Response(null, { status: 410 });
// con envío real fallaría el cifrado (claves falsas): se comprueba solo el flujo de descarte
const r = await runDaily({ ...env, VAPID_PUBLIC: 'x', VAPID_PRIVATE: 'y', VAPID_SUBJECT: 'mailto:a@b.c' }, { date: '2026-10-05', hour: 9 }).catch((e) => ({ error: String(e) }));
assert.ok(!store.has('s:caducada'), 'suscripción con parto pasado se elimina');
assert.ok(store.has('s:ya-avisada'), 'la ya avisada se conserva');
console.log('worker: OK', JSON.stringify(r));
