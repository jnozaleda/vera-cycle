// Correos que no han llegado (vera-backlog#92). Resend avisa por webhook (firmado con Svix) cuando un correo rebota o
// se retrasa; se guarda en KV «fail:<id del correo>» 30 días y el panel lo lista con un botón para corregir y reenviar.
// Cuando un correo retrasado acaba entregándose, se quita de la lista. Del correo de la usuaria se guarda solo cifrado.
import { sealEmail, openEmail } from './relay.js';

const TTL = 30 * 86400;
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** Firma de Svix: HMAC-SHA256 de «id.timestamp.cuerpo» con el secreto (whsec_…), en base64; cabecera «v1,firma …» */
export async function verifySvix(secret, headers, body, now = Date.now()) {
  const id = headers.get('svix-id'), ts = headers.get('svix-timestamp'), sig = headers.get('svix-signature');
  if (!secret || !id || !ts || !sig) return false;
  if (Math.abs(now / 1000 - Number(ts)) > 600) return false; // más de 10 min: repetición
  const key = await crypto.subtle.importKey('raw', unb64(secret.replace(/^whsec_/, '')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = b64(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${body}`))));
  return sig.split(' ').some((p) => p.split(',')[1] === mac);
}

const TYPES = { 'email.bounced': 'rebotado', 'email.delivery_delayed': 'retrasado', 'email.complained': 'marcado como spam' };

/** POST /resend/webhook */
export async function handleResendWebhook(env, request, { notify, bump }) {
  const body = await request.text();
  if (!(await verifySvix(env.RESEND_WEBHOOK_SECRET, request.headers, body))) return 401;
  let ev; try { ev = JSON.parse(body); } catch { return 400; }
  const d = ev.data || {}; const eid = String(d.email_id || '');
  if (!/^[0-9a-f-]{36}$/.test(eid)) return 200;
  if (ev.type === 'email.delivered') { await env.KV.delete(`fail:${eid}`); return 200; }
  const kind = TYPES[ev.type];
  if (!kind) return 200;
  const to = String([].concat(d.to || [])[0] || '');
  const sub = String(d.subject || '').slice(0, 200);
  const id = (/#([A-Z0-9]{8})\b/i.exec(sub) || [])[1]?.toLowerCase() || '';
  const prev = await env.KV.get(`fail:${eid}`, 'json');
  const rec = { at: Date.now(), kind, sub, id, to: to ? await sealEmail(env, to) : '', why: String(d.bounce?.message || d.bounce?.subType || '').slice(0, 200) };
  await env.KV.put(`fail:${eid}`, JSON.stringify(rec), { expirationTtl: TTL });
  await bump(env, `correo_${kind === 'rebotado' ? 'rebotado' : kind === 'retrasado' ? 'retrasado' : 'spam'}`);
  // Aviso al equipo solo la primera vez y solo si rebota (los retrasos suelen acabar llegando)
  if (kind === 'rebotado' && prev?.kind !== 'rebotado') {
    await notify(env, `Error · correo rebotado${id ? ` · #${id.toUpperCase()}` : ''}`,
      `No ha llegado un correo de Hera${id ? ` de la consulta #${id.toUpperCase()}` : ''}.\n\nAsunto: ${sub}\nPara: ${to}\n${rec.why ? `Motivo: ${rec.why}\n` : ''}\nEn el panel, «Correos que no han llegado», puedes corregir el correo y reenviarlo.`);
  }
  return 200;
}

/** Para el panel: los correos que no han llegado, más recientes primero */
export async function listFailures(env) {
  const out = [];
  let cursor;
  do {
    const r = await env.KV.list({ prefix: 'fail:', cursor });
    for (const k of r.keys) {
      const v = await env.KV.get(k.name, 'json');
      if (v) out.push({ eid: k.name.slice(5), ...v, to: v.to ? await openEmail(env, v.to).catch(() => '') : '' });
    }
    cursor = r.list_complete ? null : r.cursor;
  } while (cursor);
  return out.sort((a, b) => b.at - a.at);
}
