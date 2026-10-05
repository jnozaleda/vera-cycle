// Vera · avisos push semanales (vera-backlog#9).
//
// Guarda lo mínimo para poder avisar: la dirección de push del navegador (una URL opaca), sus claves de
// cifrado, la fecha probable de parto y la última semana avisada. Nada más: ni nombre, ni correo, ni
// registros del diario. Cada día a las 9:00 (Madrid) avisa a quien haya empezado una semana nueva.
//
//   POST /subscribe     {sub, due}        navegador, solo desde ALLOWED_ORIGINS
//   POST /unsubscribe   {endpoint}        navegador
//   POST /send-now      {hash}            solo pruebas, Authorization: Bearer ADMIN_TOKEN
//
// Bindings: SUBS (KV), VAPID_PRIVATE y ADMIN_TOKEN (secretos), VAPID_PUBLIC, VAPID_SUBJECT y ALLOWED_ORIGINS (vars).

import { sendPush } from './webpush.js';
import { pregnancyNormal } from '../../app/js/today.js';

const PUSH_HOSTS = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com', '.notify.windows.com'];
const MAX_BODY = 4096;
const DAY = 86400000;

const dayNumber = (iso) => { // días desde 1970 (UTC) de 'YYYY-MM-DD'
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return Number.isNaN(t) ? null : Math.round(t / DAY);
};

export function madridNow(date = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: +p.hour };
}

/** Semana de embarazo cumplida a partir de la fecha de parto (misma cuenta que la app: 280 días). */
export function weekFor(dueISO, todayISO) {
  const due = dayNumber(dueISO), today = dayNumber(todayISO);
  if (due == null || today == null) return null;
  return Math.floor((280 - (due - today)) / 7);
}

export function messageFor(week) {
  const items = pregnancyNormal(week);
  let body = `Lo normal estos días: ${items.slice(0, 2).join(' ')}`;
  if (body.length > 180) body = `Lo normal estos días: ${items[0]}`;
  return { title: `Semana ${week} de embarazo`, body, url: './' };
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const hashOf = async (endpoint) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint)));

const validEndpoint = (e) => {
  try {
    const u = new URL(e);
    return u.protocol === 'https:' && PUSH_HOSTS.some((h) => (h.startsWith('.') ? u.hostname.endsWith(h) : u.hostname === h));
  } catch { return false; }
};
const validDue = (due) => { const d = dayNumber(due); return d != null && d > dayNumber('2020-01-01') && d < dayNumber('2100-01-01'); };

async function notify(env, rec, week) {
  return sendPush(rec.sub, messageFor(week), {
    subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC, privateKey: env.VAPID_PRIVATE,
  }, { ttl: 86400 });
}

async function runDaily(env, now = madridNow(), force = false) {
  if (!force && now.hour !== 9) return { skipped: true };
  let sent = 0, dropped = 0, cursor;
  do {
    const page = await env.SUBS.list({ prefix: 's:', cursor });
    cursor = page.list_complete ? undefined : page.cursor;
    for (const k of page.keys) {
      const rec = await env.SUBS.get(k.name, 'json');
      if (!rec) continue;
      const week = weekFor(rec.due, now.date);
      if (week == null || week > 42) { await env.SUBS.delete(k.name); dropped++; continue; }
      if (week < 4 || week <= (rec.last ?? -1)) continue;
      try { // un fallo en una suscripción no debe frenar al resto
        const res = await notify(env, rec, week);
        if (res.status === 404 || res.status === 410) { await env.SUBS.delete(k.name); dropped++; continue; }
        if (res.ok) { await env.SUBS.put(k.name, JSON.stringify({ ...rec, last: week })); sent++; }
        else console.log(`push ${k.name.slice(0, 10)} → ${res.status}`);
      } catch (e) { console.log(`push ${k.name.slice(0, 10)} falló: ${e.message}`); }
    }
  } while (cursor);
  return { sent, dropped };
}

export default {
  async scheduled(event, env, ctx) { ctx.waitUntil(runDaily(env).then((r) => console.log('daily', JSON.stringify(r)))); },

  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') ?? '';
    const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const cors = {
      'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0] ?? '',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };
    const reply = (status, body) => new Response(body == null ? null : JSON.stringify(body), {
      status, headers: { ...cors, ...(body == null ? {} : { 'Content-Type': 'application/json' }) },
    });
    if (request.method === 'OPTIONS') return reply(204);
    if (request.method !== 'POST') return reply(405, { error: 'method not allowed' });

    try {
      const raw = await request.text();
      if (raw.length > MAX_BODY) return reply(413, { error: 'too large' });
      const body = raw ? JSON.parse(raw) : {};

      if (url.pathname === '/subscribe' || url.pathname === '/unsubscribe') {
        if (!allowed.includes(origin)) return reply(403, { error: 'origin not allowed' });
        if (url.pathname === '/unsubscribe') {
          if (typeof body.endpoint !== 'string') return reply(400, { error: 'bad request' });
          await env.SUBS.delete(`s:${await hashOf(body.endpoint)}`);
          return reply(200, { ok: true });
        }
        const sub = body.sub;
        if (!sub || !validEndpoint(sub.endpoint) || typeof sub.keys?.p256dh !== 'string' || typeof sub.keys?.auth !== 'string') return reply(400, { error: 'bad subscription' });
        if (!validDue(body.due)) return reply(400, { error: 'bad due date' });
        const key = `s:${await hashOf(sub.endpoint)}`;
        const prev = await env.SUBS.get(key, 'json');
        const week = weekFor(body.due, madridNow().date);
        // Si la fecha cambia o es nueva, no se avisa de la semana actual (ya la está viendo): se avisa de la siguiente.
        const last = prev && prev.due === body.due ? prev.last : week;
        await env.SUBS.put(key, JSON.stringify({ sub: { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } }, due: body.due, last }));
        return reply(200, { ok: true, week });
      }

      if (url.pathname === '/send-now') {
        if (!env.ADMIN_TOKEN || request.headers.get('Authorization') !== `Bearer ${env.ADMIN_TOKEN}`) return reply(401, { error: 'unauthorized' });
        const rec = await env.SUBS.get(`s:${body.hash}`, 'json');
        if (!rec) return reply(404, { error: 'not found' });
        const week = Math.min(42, Math.max(4, weekFor(rec.due, madridNow().date) ?? 20));
        const res = await notify(env, rec, week);
        return reply(200, { status: res.status });
      }
      return reply(404, { error: 'not found' });
    } catch (e) {
      return reply(400, { error: 'bad request' });
    }
  },
};

export { runDaily };
