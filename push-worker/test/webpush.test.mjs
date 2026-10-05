// Pruebas de webpush.js: ida y vuelta del cifrado RFC 8291 (descifrado con node:crypto,
// una implementación independiente) y firma VAPID verificable.
import { encryptPayload, vapidJwt, b64u } from '../src/webpush.js';
import { createECDH, hkdfSync, createDecipheriv, randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';

// Navegador simulado: par de claves P-256 y secreto de autenticación
const ua = createECDH('prime256v1'); ua.generateKeys();
const auth = randomBytes(16);
const sub = { keys: { p256dh: b64u.enc(ua.getPublicKey()), auth: b64u.enc(auth) } };

function decrypt(body) {
  const salt = body.slice(0, 16), rs = new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0), idlen = body[20];
  const as = body.slice(21, 21 + idlen), ct = body.slice(21 + idlen);
  assert.equal(rs, 4096); assert.equal(idlen, 65);
  const secret = ua.computeSecret(Buffer.from(as));
  const ikm = Buffer.from(hkdfSync('sha256', secret, auth, Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), Buffer.from(as)]), 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, 'Content-Encoding: aes128gcm\0', 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, 'Content-Encoding: nonce\0', 12));
  const d = createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(Buffer.from(ct.slice(-16)));
  const plain = Buffer.concat([d.update(Buffer.from(ct.slice(0, -16))), d.final()]);
  assert.equal(plain[plain.length - 1], 2, 'delimitador de último registro');
  return plain.slice(0, -1).toString('utf8');
}

const msg = JSON.stringify({ title: 'Semana 21', body: 'Lo normal estos días: ñ ó ✓', url: '/vera-cycle/app/' });
assert.equal(decrypt(await encryptPayload(sub, msg)), msg);
assert.notEqual(b64u.enc(await encryptPayload(sub, msg)), b64u.enc(await encryptPayload(sub, msg)), 'sal y clave nuevas en cada envío');

// JWT VAPID: formato y firma verificable
const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
const raw = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
const jwt = await vapidJwt('https://fcm.googleapis.com', 'mailto:x@example.com', b64u.enc(raw), jwk.d);
const [h, c, s] = jwt.split('.');
assert.ok(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, kp.publicKey, b64u.dec(s), new TextEncoder().encode(`${h}.${c}`)), 'firma VAPID válida');
assert.equal(JSON.parse(new TextDecoder().decode(b64u.dec(c))).aud, 'https://fcm.googleapis.com');
console.log('webpush: OK (cifrado ida y vuelta + firma VAPID)');
