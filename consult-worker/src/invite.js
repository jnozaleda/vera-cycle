// Invitaciones (vera-backlog#84): quien valora «Sí, mucho» recibe su enlace personal (hera-gine.com/?r=CÓDIGO).
// Si alguien con un correo que nunca ha preguntado envía una consulta con ese enlace, cuando la profesional le
// responde, quien invitó gana 1 consulta en su saldo (sin tope). Se guarda solo la huella del correo; el correo
// cifrado para avisarla dura 30 días, como el de las consultas.
import { openEmail } from './relay.js';
import { addCredits } from './stripe.js';

const CODE_TTL = 365 * 86400;
const MAIL_TTL = 30 * 86400;
const ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789';
export const isCode = (c) => /^[a-hjkmnp-z2-9]{6}$/.test(String(c || ''));
const newCode = () => [...crypto.getRandomValues(new Uint8Array(6))].map((b) => ALPHA[b % ALPHA.length]).join('');

/** El código de esa persona (el mismo siempre); renueva su correo cifrado para poder avisarla del premio */
export async function inviteCode(env, h, sealed) {
  let code = await env.KV.get(`rh:${h}`);
  if (!code || !(await env.KV.get(`r:${code}`))) {
    code = newCode();
    await env.KV.put(`r:${code}`, JSON.stringify({ h, n: 0, at: Date.now() }), { expirationTtl: CODE_TTL });
    await env.KV.put(`rh:${h}`, code, { expirationTtl: CODE_TTL });
  }
  if (sealed) await env.KV.put(`ru:${code}`, sealed, { expirationTtl: MAIL_TTL });
  return code;
}

/** Código válido y de otra persona (no vale invitarse a una misma) */
export async function inviteFor(env, code, askerH) {
  if (!isCode(code)) return null;
  const r = await env.KV.get(`r:${code}`, 'json');
  return r && r.h !== askerH ? code : null;
}

export function rewardEmail(n) {
  const html = `<div style="background:#FBF7F1;padding:24px 16px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#2E2630">
<div style="max-width:460px;margin:0 auto">
<div style="font-family:Georgia,serif;font-size:28px;color:#3B2433;margin-bottom:18px">Hera</div>
<p style="font-size:15px;line-height:1.5;margin:0 0 12px">Hola,</p>
<p style="font-size:15px;line-height:1.5;margin:0 0 16px">Alguien a quien le pasaste tu enlace ha preguntado en Hera y ya tiene su respuesta. Gracias por recomendarnos.</p>
<p style="font-family:Georgia,serif;font-size:21px;color:#3B2433;margin:0 0 12px">Te regalamos 1 consulta</p>
<p style="font-size:15px;line-height:1.5;margin:0 0 16px">La próxima vez que preguntes con este correo, no gastarás tus consultas ni tendrás que pagar.${n > 1 ? ` Llevas <b>${n} consultas regaladas</b>.` : ''}</p>
<a href="https://hera-gine.com/#ask" style="display:block;text-align:center;text-decoration:none;font-weight:600;font-size:15px;border-radius:8px;padding:12px;background:#693D55;color:#ffffff">Hacer una consulta</a>
<p style="font-size:12px;color:#8A8A8E;line-height:1.5;border-top:1px solid #E6DFE2;padding-top:10px;margin:18px 0 0">No sabemos ni te diremos quién ha sido. Puedes seguir compartiendo tu enlace: cada persona nueva que pregunte con él te da otra consulta.</p>
</div></div>`;
  const text = `Hola,\n\nAlguien a quien le pasaste tu enlace ha preguntado en Hera y ya tiene su respuesta. Gracias por recomendarnos.\n\nTe regalamos 1 consulta: la próxima vez que preguntes con este correo, no gastarás tus consultas ni tendrás que pagar.${n > 1 ? ` Llevas ${n} consultas regaladas.` : ''}\n\nHacer una consulta: https://hera-gine.com/#ask\n\nNo sabemos ni te diremos quién ha sido.`;
  return { subject: 'Tienes 1 consulta más en Hera', html, text };
}

/** La profesional ha respondido a una consulta invitada: 1 consulta para quien invitó, y aviso si aún tenemos su correo */
export async function rewardInvite(env, code, sendMail, bump) {
  const r = await env.KV.get(`r:${code}`, 'json');
  if (!r) return false;
  await addCredits(env, r.h, 1);
  r.n = (r.n || 0) + 1;
  await env.KV.put(`r:${code}`, JSON.stringify(r), { expirationTtl: CODE_TTL });
  await bump(env, 'consulta_regalada');
  const sealed = await env.KV.get(`ru:${code}`);
  if (sealed) await sendMail(env, { to: await openEmail(env, sealed), replyTo: 'contacto@hera-gine.com', ...rewardEmail(r.n) });
  return true;
}
