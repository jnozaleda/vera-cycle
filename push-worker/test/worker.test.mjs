import { weekFor, weeksSinceBirth, babyNoticeWeek, messageFor, madridNow, runDaily, periodNoticeDue } from '../src/worker.js';
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

// Posparto
assert.equal(weeksSinceBirth('2026-09-23', '2026-10-05'), 1);
assert.equal(weeksSinceBirth('2026-09-23', '2026-09-29'), 0);
assert.deepEqual([1, 12, 13, 16, 20, 52, 53].map(babyNoticeWeek), [true, true, false, true, true, true, false]);
const pm = messageFor(3, 'postpartum');
assert.equal(pm.title, 'Tu bebé tiene 3 semanas');
assert.ok(pm.body.startsWith('Lo normal a su edad: ') && pm.body.length <= 200, pm.body);
assert.equal(messageFor(1, 'postpartum').title, 'Tu bebé tiene 1 semana');
assert.equal(messageFor(26, 'postpartum').title, 'Tu bebé tiene 6 meses');
for (let w = 1; w <= 52; w++) assert.ok(messageFor(w, 'postpartum').body.length <= 200, `bebé semana ${w}`);

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
store.set('s:bebe-viejo', JSON.stringify({ sub: { endpoint: 'https://fcm.googleapis.com/y', keys: { p256dh: 'a', auth: 'b' } }, kind: 'postpartum', date: '2025-01-01', last: 40 }));
const env = { SUBS };
assert.deepEqual(await runDaily(env, { date: '2026-10-05', hour: 8 }), { skipped: true });
globalThis.fetch = async () => new Response(null, { status: 410 });
// con envío real fallaría el cifrado (claves falsas): se comprueba solo el flujo de descarte
const r = await runDaily({ ...env, VAPID_PUBLIC: 'x', VAPID_PRIVATE: 'y', VAPID_SUBJECT: 'mailto:a@b.c' }, { date: '2026-10-05', hour: 9 }).catch((e) => ({ error: String(e) }));
assert.ok(!store.has('s:caducada'), 'suscripción con parto pasado se elimina');
assert.ok(!store.has('s:bebe-viejo'), 'bebé de más de un año se elimina');
assert.ok(store.has('s:ya-avisada'), 'la ya avisada se conserva');
// Ciclo: aviso solo si la regla se retrasa 2 días o más, una vez por fecha
assert.equal(messageFor(null, 'cycle').title, '¿Te ha bajado la regla?');
assert.equal(periodNoticeDue({ date: '2026-10-10' }, '2026-10-11'), false, 'un día de retraso no avisa');
assert.equal(periodNoticeDue({ date: '2026-10-10' }, '2026-10-12'), true, 'dos días de retraso avisa');
assert.equal(periodNoticeDue({ date: '2026-10-10', last: '2026-10-10' }, '2026-10-20'), false, 'ya avisada no repite');
assert.equal(periodNoticeDue({ date: '2026-11-07', last: '2026-10-10' }, '2026-11-09'), true, 'fecha nueva vuelve a avisar');
const mc = (date, last) => JSON.stringify({ sub: { endpoint: 'https://fcm.googleapis.com/z', keys: { p256dh: 'a', auth: 'b' } }, kind: 'cycle', date, last });
store.set('s:ciclo-pronto', mc('2026-10-20'));
store.set('s:ciclo-avisada', mc('2026-10-01', '2026-10-01'));
store.set('s:ciclo-vieja', mc('2026-07-01'));
await runDaily({ ...env, VAPID_PUBLIC: 'x', VAPID_PRIVATE: 'y', VAPID_SUBJECT: 'mailto:a@b.c' }, { date: '2026-10-05', hour: 9 });
assert.ok(store.has('s:ciclo-pronto') && store.has('s:ciclo-avisada'), 'las de ciclo vigentes se conservan');
assert.ok(!store.has('s:ciclo-vieja'), 'la de ciclo sin actividad se elimina');
console.log('worker: OK', JSON.stringify(r));
