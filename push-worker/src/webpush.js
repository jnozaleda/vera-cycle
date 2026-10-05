// webpush.js — Web Push (RFC 8030 + cifrado RFC 8291 aes128gcm + VAPID RFC 8292) con WebCrypto,
// para ejecutarse en un Cloudflare Worker (la librería `web-push` de Node no funciona allí).

const enc = new TextEncoder();

export const b64u = {
  enc: (buf) => {
    const b = new Uint8Array(buf);
    let s = '';
    for (const x of b) s += String.fromCharCode(x);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  dec: (str) => {
    const s = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (str.length % 4)) % 4);
    return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  },
};

const concat = (...arrs) => {
  const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0));
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
};

async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

/** Cifra el mensaje (RFC 8291). `opts` solo para tests: salt y par de claves del servidor fijos. */
export async function encryptPayload(sub, plaintext, opts = {}) {
  const uaPublic = b64u.dec(sub.keys.p256dh); // 65 bytes
  const authSecret = b64u.dec(sub.keys.auth);
  const salt = opts.salt || crypto.getRandomValues(new Uint8Array(16));

  let asPublic, asPrivate;
  if (opts.asKeyPair) ({ publicKey: asPublic, privateKey: asPrivate } = opts.asKeyPair);
  else ({ publicKey: asPublic, privateKey: asPrivate } = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']));
  const asPublicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', asPublic));

  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asPrivate, 256));

  const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublic, asPublicRaw);
  const ikm = await hkdf(authSecret, ecdh, keyInfo, 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const data = concat(typeof plaintext === 'string' ? enc.encode(plaintext) : plaintext, new Uint8Array([2])); // delimitador de último registro
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, data));

  const rs = new Uint8Array([0, 0, 16, 0]); // tamaño de registro 4096
  return concat(salt, rs, new Uint8Array([asPublicRaw.length]), asPublicRaw, cipher);
}

/** JWT VAPID firmado con ES256. `privateKeyB64u` = escalar d (32 bytes), `publicKeyB64u` = punto sin comprimir (65). */
export async function vapidJwt(audience, subject, publicKeyB64u, privateKeyB64u, expSeconds = 12 * 3600) {
  const pub = b64u.dec(publicKeyB64u);
  const jwk = { kty: 'EC', crv: 'P-256', x: b64u.enc(pub.slice(1, 33)), y: b64u.enc(pub.slice(33, 65)), d: privateKeyB64u, ext: true };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const header = b64u.enc(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u.enc(enc.encode(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + expSeconds, sub: subject })));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${claims}`)));
  return `${header}.${claims}.${b64u.enc(sig)}`;
}

/** Envía un push. Devuelve la Response del servicio de push (201 = aceptado; 404/410 = suscripción caducada). */
export async function sendPush(sub, payload, vapid, { ttl = 86400, urgency = 'normal' } = {}) {
  const body = await encryptPayload(sub, JSON.stringify(payload));
  const audience = new URL(sub.endpoint).origin;
  const jwt = await vapidJwt(audience, vapid.subject, vapid.publicKey, vapid.privateKey);
  return fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `vapid t=${jwt}, k=${vapid.publicKey}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttl),
      Urgency: urgency,
    },
    body,
  });
}
