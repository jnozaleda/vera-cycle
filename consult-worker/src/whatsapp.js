// Consultas por WhatsApp (prueba manual, plan A). Noza pega el número y la profesional en el panel; aquí se guarda la fila
// (número cifrado, 30 días), se cuenta qué consulta es de ese número (huella, como con los correos) y se lleva el estado.
// En el plan B (API de Meta) las filas las creará el propio servicio al llegar cada mensaje.
import { sealEmail, openEmail } from './relay.js';

const TTL = 30 * 86400;
const COUNT_TTL = 365 * 86400;
export const WA_STATES = { nueva: 'Nueva', enviada: 'Enviada a la profesional', respondida: 'Respondida', pagada: 'Pagada' };

/** «+34 600 00 00 00», «0034…», «54 9 11…» → solo dígitos con prefijo de país (8–15); null si no vale */
export function normalizePhone(raw) {
  let d = String(raw || '').replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1); else if (d.startsWith('00')) d = d.slice(2);
  d = d.replace(/\D/g, '');
  // Sin prefijo y con pinta de móvil español (9 cifras empezando por 6 o 7): +34
  if (/^[67]\d{8}$/.test(d)) d = `34${d}`;
  return /^[1-9]\d{7,14}$/.test(d) ? d : null;
}

/** +34 6•• ••• 812 */
export function maskPhone(d) {
  return `+${d.slice(0, 2)} ••• ${d.slice(-3)}`;
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
async function phoneHash(env, d) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.HASH_SALT), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`wa:${d}`))).slice(0, 32);
}

/** Nueva consulta por WhatsApp: devuelve la fila creada (con qué consulta es de ese número) */
export async function addWaConsult(env, { phone, pro, limit, bump, paid = false, code = '' }) {
  const d = normalizePhone(phone);
  if (!d) return { error: 'tel' };
  const h = await phoneHash(env, d);
  const rec = (await env.KV.get(`wac:${h}`, 'json')) || { n: 0 };
  const nth = rec.n + 1;
  await env.KV.put(`wac:${h}`, JSON.stringify({ n: nth, last: Date.now() }), { expirationTtl: COUNT_TTL });
  const id = crypto.randomUUID().slice(0, 8);
  const row = { id, at: Date.now(), t: await sealEmail(env, d), pro, nth, free: !paid && nth <= limit, state: paid ? 'pagada' : 'nueva', ...(code ? { code } : {}) };
  await env.KV.put(`wa:${row.at}:${id}`, JSON.stringify(row), { expirationTtl: TTL });
  await bump(env, `consulta_wa:${pro || 'sin_elegir'}`);
  if (!row.free) await bump(env, 'consulta_wa_pago');
  return { row };
}

/** Si ese número ya pagó y su consulta aún no tiene profesional, se le asigna (en vez de crear otra fila) */
export async function assignPaidRow(env, phone, pro) {
  const d = normalizePhone(phone);
  if (!d) return false;
  const rows = await listWa(env);
  const row = rows.find((w) => w.d === d && w.code && !w.pro && Date.now() - w.at < 7 * 86400000);
  if (!row) return false;
  const page = await env.KV.list({ prefix: 'wa:' });
  const k = page.keys.find((x) => x.name.endsWith(`:${row.id}`));
  if (!k) return false;
  const { d: _, ...clean } = row;
  clean.pro = pro;
  await env.KV.put(k.name, JSON.stringify(clean), { expirationTtl: Math.max(60, Math.round((row.at + TTL * 1000 - Date.now()) / 1000)) });
  return true;
}

export async function setWaState(env, id, state) {
  if (state === 'quitar' && /^[0-9a-f]{8}$/.test(id)) {
    const page = await env.KV.list({ prefix: 'wa:' });
    const k = page.keys.find((x) => x.name.endsWith(`:${id}`));
    if (k) await env.KV.delete(k.name);
    return !!k;
  }
  if (!WA_STATES[state] || !/^[0-9a-f]{8}$/.test(id)) return false;
  const page = await env.KV.list({ prefix: 'wa:' });
  const k = page.keys.find((x) => x.name.endsWith(`:${id}`));
  if (!k) return false;
  const row = await env.KV.get(k.name, 'json');
  if (!row) return false;
  row.state = state;
  await env.KV.put(k.name, JSON.stringify(row), { expirationTtl: Math.max(60, Math.round((row.at + TTL * 1000 - Date.now()) / 1000)) });
  return true;
}

/** Para el panel: filas de los últimos 30 días, más recientes primero, con el número abierto (solo para el enlace) */
export async function listWa(env) {
  const out = [];
  let cursor;
  do {
    const page = await env.KV.list({ prefix: 'wa:', cursor });
    for (const k of page.keys) {
      const row = await env.KV.get(k.name, 'json');
      if (row) out.push({ ...row, d: await openEmail(env, row.t).catch(() => '') });
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return out.sort((a, b) => b.at - a.at);
}
