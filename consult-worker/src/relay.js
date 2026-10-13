// Hera · respuestas a través de Hera (consultas con hilo).
//
// Cada consulta abre un hilo #XXXXXXXX. El aviso al profesional lleva como «responder a» una dirección de un solo uso
// (hera-p-<hilo>-<firma>@hera-gine.com) y la confirmación a la usuaria otra (hera-u-…). Cloudflare Email Routing envía
// esas direcciones (regla «catch-all» → este Worker) al manejador email(): se limpia el texto citado y se reenvía al otro
// lado con Resend, con las cabeceras In-Reply-To/References para que todo quede en la misma conversación en Gmail.
//
// Qué se guarda (KV, 30 días desde el último mensaje): el correo de la usuaria cifrado (AES-GCM, clave derivada de
// HASH_SALT), una huella de su correo, a quién va la consulta, fechas e identificadores técnicos de los correos.
// El texto de los mensajes y los adjuntos NO se guardan: solo se reenvían.

import PostalMime from 'postal-mime';

export const RELAY_DOMAIN = 'hera-gine.com';
export const THREAD_TTL = 30 * 86400; // segundos
const ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789';

export function newThreadId() {
  const b = crypto.getRandomValues(new Uint8Array(8));
  return [...b].map((x) => ALPHA[x % ALPHA.length]).join('');
}

async function hmacHex(secret, text) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** Dirección de respuesta firmada: role «p» (escribe el profesional) o «u» (escribe la usuaria) */
export async function relayAddress(env, role, id) {
  const mac = (await hmacHex(env.HASH_SALT, `relay:${role}:${id}`)).slice(0, 10);
  return `hera-${role}-${id}-${mac}@${RELAY_DOMAIN}`;
}

/** Comprueba una dirección hera-… y devuelve {role, id} o null */
export async function parseRelayAddress(env, addr) {
  const m = /^hera-([pu])-([a-z0-9]{8})-([a-f0-9]{10})@(.+)$/.exec(String(addr || '').trim().toLowerCase());
  if (!m || m[4] !== RELAY_DOMAIN) return null;
  const good = (await hmacHex(env.HASH_SALT, `relay:${m[1]}:${m[2]}`)).slice(0, 10);
  return good === m[3] ? { role: m[1], id: m[2] } : null;
}

// MARK: - Cifrado del correo de la usuaria

async function aesKey(env) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.HASH_SALT), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new TextEncoder().encode('hera-relay'), info: new TextEncoder().encode('v1') },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function sealEmail(env, email) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(env), new TextEncoder().encode(email)));
  return `${b64(iv)}.${b64(ct)}`;
}
export async function openEmail(env, sealed) {
  const [iv, ct] = String(sealed).split('.');
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await aesKey(env), unb64(ct)));
}

// MARK: - Hilo en KV

export const threadKey = (id) => `t:${id}`;
const meta = (t) => ({ p: t.p, c: t.c, a: t.a || 0, r: t.rem ? 1 : 0 });
export async function saveThread(env, t) {
  await env.KV.put(threadKey(t.id), JSON.stringify(t), { expirationTtl: THREAD_TTL, metadata: meta(t) });
}
export async function loadThread(env, id) {
  return env.KV.get(threadKey(id), 'json');
}

// MARK: - Texto de la respuesta: sin lo citado ni la firma del móvil

const QUOTE_HEAD = [
  /\n[^\n]{0,20}(El|On)\s[^\n]{4,200}(\n[^\n]{0,200})?\s(escribió|wrote|a écrit)\s*:\s*\n/i,
  /\n-{2,}\s*(Mensaje original|Original Message|Forwarded message|Mensaje reenviado)\s*-{2,}/i,
  /\n_{8,}\s*\n/,
  /\n(De|From)\s*:\s[^\n]+\n(Enviado|Sent|Fecha|Date)\s*:/i,
];
const MOBILE_SIG = /\n\s*(Enviado desde mi (iPhone|iPad|móvil|Android|Samsung[^\n]*)|Sent from my (iPhone|iPad|Android|mobile)[^\n]*|Obtener Outlook para [^\n]+|Get Outlook for [^\n]+)\s*$/i;

export function stripQuoted(text) {
  let t = `\n${String(text || '').replace(/\r\n?/g, '\n')}`;
  let cut = t.length;
  for (const re of QUOTE_HEAD) { const m = re.exec(t); if (m && m.index < cut) cut = m.index; }
  t = t.slice(0, cut);
  // líneas citadas sueltas al final («> …»)
  const lines = t.split('\n');
  while (lines.length && (/^\s*>/.test(lines[lines.length - 1]) || !lines[lines.length - 1].trim())) lines.pop();
  t = lines.join('\n').replace(MOBILE_SIG, '');
  return t.replace(/\n{3,}/g, '\n\n').trim();
}

const htmlToText = (h) => String(h || '').replace(/<(br|\/p|\/div|\/li)[^>]*>/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

/** Correos automáticos (fuera de la oficina, rebotes): no se reenvían para no crear bucles */
export function isAutomatic(headers) {
  const get = (k) => (headers.get ? headers.get(k) : headers[k]) || '';
  const auto = get('auto-submitted').toLowerCase();
  if (auto && auto !== 'no') return true;
  if (/^(bulk|junk|list|auto_reply)$/i.test(get('precedence').trim())) return true;
  return !!(get('x-autoreply') || get('x-autorespond') || get('x-auto-response-suppress').match(/all|oof/i));
}

/** Lee el correo entrante: texto limpio, adjuntos, identificadores */
export async function parseIncoming(raw) {
  const mail = await PostalMime.parse(raw);
  const body = stripQuoted(mail.text || htmlToText(mail.html));
  let total = 0;
  const attachments = [];
  for (const a of mail.attachments || []) {
    const size = a.content?.byteLength || 0;
    if (!size || total + size > 15 * 1024 * 1024) continue; // hasta 15 MB en total
    total += size;
    const u8 = new Uint8Array(a.content);
    let bin = ''; for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
    attachments.push({ filename: a.filename || 'adjunto', content: btoa(bin), ...(a.mimeType ? { content_type: a.mimeType } : {}) });
  }
  return { body, attachments, messageId: mail.messageId || null, from: mail.from?.address || '' };
}
