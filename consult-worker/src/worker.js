// Hera · consultas con control de gratuitas (vera-backlog#57).
//
// La app envía aquí cada consulta. El servicio cuenta cuántas lleva cada correo (solo guarda una huella
// del correo normalizado, el número y las fechas; el texto NO se guarda), reenvía la consulta al profesional
// con «responder a» la usuaria y le manda a ella una confirmación. Agotadas las gratuitas, no envía nada.
// Con su consentimiento, guarda el correo de quien pide que le avisen cuando haya consultas de pago.
//
//   POST /ask          {email, to, text, context?, situation?, website?}   navegador (ALLOWED_ORIGINS)
//   POST /notify       {email, consent: true}                              navegador
//   POST /admin/reset  {email}                                             Authorization: Bearer ADMIN_TOKEN
//   POST /admin/vip    {email, until?, note?} | {email|id, remove: true}   Authorization: Bearer ADMIN_TOKEN o BETA_CODE: consultas ilimitadas
//   GET  /admin/vip                                                        lista (sin correos: id = huella, nota, fin, alta) — página beta.html
//                      (beta testers / plan ilimitado). Se guarda solo la huella del correo: v:<hmac> = {plan, until, note, at}
//   POST /hit          {e}                                                 navegador: evento anónimo de uso (texto plano)
//   GET  /stats?days=N                                                     panel: Authorization: Bearer PANEL_CODE
//   GET  /panel?k=DASH_KEY&d=1|7|30                                     panel privado para el móvil (HTML, sin login)
//   GET  /status?ids=a,b                                                   app: ¿respondida? por número de consulta (solo fechas)
//   POST /checkout     {email, plan, payTest?}  GET /checkout/status?cs=…   pagos (stripe.js)
//   POST /stripe/webhook                                                   avisos firmados de Stripe
//
// Medición (vera-backlog#6): D1 «hera-metrics» con recuentos por día (tabla counts) y huellas diarias para contar
// personas distintas (tabla visitors: hash de IP + navegador + día + sal, se borran a las 48 h). Sin IP ni identificadores.
//
// Bindings: KV (KV), HASH_SALT, ADMIN_TOKEN, RESEND_API_KEY, COPY_TO (opcional) (secretos), ALLOWED_ORIGINS, FROM, FREE_LIMIT,
// DRY_RUN ("1" = hace todo menos enviar correos), DB (D1), PANEL_CODE (secreto), FALLBACK_TO (opcional: adónde reenviar
// lo que llegue a otras direcciones por la regla catch-all; si falta, se usa COPY_TO).
//
// Respuestas a través de Hera (relay.js): email() recibe lo que llega a hera-p-…/hera-u-… y lo reenvía al otro lado;
// scheduled() avisa al profesional cuando una consulta lleva 40 h sin respuesta.

import { validateAttachments } from './attachments.js';
import { sendFeedbackDue, handleOpinion, feedbackEmail, feedbackSig } from './feedback.js';
import { inviteFor, rewardInvite } from './invite.js';
import { panel } from './panel.js';
import { isEvent, isDevice, record, personTag, hourlyDigest, notify } from './activity.js';
import { PLANS, VIDEO_PROS, paymentsOn, createCheckout, sessionStatus, handleWebhook, getBalance, spendCredit, markDay } from './stripe.js';
import { newThreadId, relayAddress, parseRelayAddress, sealEmail, openEmail, saveThread, loadThread, parseIncoming, isAutomatic } from './relay.js';

export const PROS = {
  gineco: { key: 'gineco', name: 'Dr. Gonzalo Nozaleda', short: 'Gonzalo', role: 'ginecólogo', email: 'gonzalo@hera-gine.com' },
  matrona: { key: 'matrona', name: 'Marina Fernández', short: 'Marina', role: 'matrona', email: 'marina@hera-gine.com' },
  pediatra: { key: 'pediatra', name: 'Dra. Lucía Carrascón', short: 'Lucía', role: 'pediatra', email: 'lucia@hera-gine.com' },
};

const EMAIL_RE = /^[^\s@<>()",;]{1,64}@[^\s@<>()",;]{1,190}\.[a-z]{2,24}$/i;
const MAX_BODY = 6000;
const MAX_ASK_BODY = 14 * 1024 * 1024 + 6000; // /ask lleva los adjuntos en base64 (10 MB reales)

/** Minúsculas; sin «+etiqueta»; en Gmail, sin puntos. Así un mismo buzón cuenta una vez. */
export function normalizeEmail(raw) {
  const e = String(raw || '').trim().toLowerCase();
  if (!EMAIL_RE.test(e)) return null;
  let [local, domain] = e.split('@');
  local = local.split('+')[0];
  if (domain === 'googlemail.com') domain = 'gmail.com';
  if (domain === 'gmail.com') local = local.replace(/\./g, '');
  if (!local) return null;
  return `${local}@${domain}`;
}

async function hmac(secret, text) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nl2br = (s) => esc(s).replace(/\n/g, '<br>');

function shell(inner) {
  return `<div style="background:#FAF9F4;padding:24px 16px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#2F3631;font-size:15px;line-height:1.55">
<div style="max-width:520px;margin:0 auto">
<div style="font-family:Georgia,serif;font-size:28px;color:#45574C;margin-bottom:18px">Hera</div>${inner}
<p style="font-size:12px;color:#8A8A8E;margin-top:24px;border-top:1px solid #E5E1D8;padding-top:12px">Hera · Salud de la mujer, con profesionales · <a href="https://hera-gine.com" style="color:#45574C">hera-gine.com</a></p></div></div>`;
}

export function proEmail(pro, q, id = '', relay = true) {
  const subject = `Consulta Hera${id ? ` #${id.toUpperCase()}` : ''}${q.context ? ` · ${q.context}` : ''}`;
  const html = shell(`<p>Nueva consulta para <b>${esc(pro.name)}</b>.</p>
<div style="background:#F6E0E2;border-radius:10px;padding:14px;margin:12px 0">${nl2br(q.text)}</div>
${q.context ? `<p style="font-size:13px;color:#6E6C67">Sobre: ${esc(q.context)}</p>` : ''}
${q.situation ? `<p style="font-size:13px;color:#6E6C67">Situación: ${nl2br(q.situation)}</p>` : ''}
${q.files ? `<p style="font-size:13px;color:#6E6C67">Incluye ${q.files} ${q.files === 1 ? 'archivo adjunto' : 'archivos adjuntos'}. Hera no los guarda: solo están en este correo.</p>` : ''}
${relay ? `<p style="font-size:13px;color:#6E6C67"><b>Para contestar, responde a este correo</b> desde el móvil o el ordenador. Tu respuesta le llegará a la usuaria desde ${esc(pro.email)}: tu correo personal no se muestra. Si ella vuelve a escribir, te llegará en esta misma conversación. Plazo comprometido: 48 h.</p>`
    : `<p style="font-size:13px;color:#6E6C67">Responde a este correo para contestar directamente a la usuaria (${esc(q.email)}). Plazo comprometido: 48 h.</p>`}`);
  const text = `Nueva consulta para ${pro.name}\n\n${q.text}\n\n${q.context ? `Sobre: ${q.context}\n` : ''}${q.situation ? `Situación: ${q.situation}\n` : ''}\n${relay ? `Para contestar, responde a este correo: tu respuesta le llegará a la usuaria desde ${pro.email}, sin mostrar tu correo personal. Plazo: 48 h.` : `Responde a este correo para contestar a la usuaria (${q.email}).`}`;
  return { subject, html, text };
}

export function confirmEmail(pro, q, remaining, id = '', unlimited = false, leftText = '') {
  const excerpt = q.text.length > 160 ? `${q.text.slice(0, 160).trim()}…` : q.text;
  const left = leftText || (unlimited ? 'Tienes consultas ilimitadas' : remaining === 0 ? 'Era tu última consulta gratuita' : `Te ${remaining === 1 ? 'queda 1 consulta gratuita' : `quedan ${remaining} consultas gratuitas`}`);
  const subject = `Tu consulta a ${pro.short} · Hera${id ? ` #${id.toUpperCase()}` : ''}`;
  const html = shell(`<p>Hola,</p>
<p>Tu consulta ha llegado a <b>${esc(pro.name)}, ${esc(pro.role)}</b>. Te responderá en esta misma conversación en menos de 48 h.</p>
<div style="background:#F6E0E2;border-radius:10px;padding:12px;margin:12px 0;font-size:14px;color:#2F3631">«${esc(excerpt)}»${q.context ? `<br><span style="color:#6E6C67">Sobre: ${esc(q.context)}</span>` : ''}</div>
<p><span style="display:inline-block;background:#ffffff;color:#45574C;border:1.5px solid #45574C;border-radius:999px;padding:4px 12px;font-size:13px;font-weight:600">${left}</span></p>
<p style="font-size:13px;color:#6E6C67">¿Quieres añadir algo o enviar una foto? Responde a este correo y le llegará a ${esc(pro.short)}.</p>
<p style="font-size:13px;color:#6E6C67">No es un servicio de urgencias. Si algo no va bien, llama al 112 o acude a tu centro de salud.</p>
<p style="font-size:12px;color:#8A8A8E">¿No has escrito tú esta consulta? Escríbenos a contacto@hera-gine.com y la borramos.</p>`);
  const text = `Tu consulta ha llegado a ${pro.name}, ${pro.role}. Te responderá en esta misma conversación en menos de 48 h.\n\n«${excerpt}»\n\n${left}.\n\n¿Quieres añadir algo o enviar una foto? Responde a este correo y le llegará a ${pro.short}.\n\nNo es un servicio de urgencias: si algo no va bien, llama al 112 o acude a tu centro de salud.\n¿No has escrito tú esta consulta? Escríbenos a contacto@hera-gine.com y la borramos.`;
  return { subject, html, text };
}


const TEAM_FROM = 'Hera · Equipo <alertas@hera-gine.com>';
/** Copia de control para el equipo (COPY_TO): correo propio con asunto «Consulta · …», el texto entero y, con COPY_ATTACH="1", los adjuntos */
export function teamCopy({ subject, intro, body, extra = '', nFiles = 0, withFiles = false }) {
  const files = nFiles ? `<p style="font-size:13px;color:#6E6C67">${nFiles} ${nFiles === 1 ? 'archivo adjunto' : 'archivos adjuntos'}${withFiles ? ': van en este correo.' : ' (solo los recibe la profesional).'}</p>` : '';
  const foot = 'Copia de control para el equipo de Hera. No respondas a este correo: la conversación sigue entre la profesional y la usuaria.';
  return {
    subject,
    html: shell(`<p>${intro}</p><div style="background:#F6E0E2;border-radius:10px;padding:14px;margin:12px 0">${nl2br(body)}</div>${extra}${files}<p style="font-size:12px;color:#8A8A8E">${foot}</p>`),
    text: `${intro.replace(/<[^>]+>/g, '')}\n\n${body}\n\n${nFiles ? `[${nFiles} adjunto(s)${withFiles ? ' en este correo' : ''}]\n\n` : ''}${foot}`,
  };
}

/** Correo a quien paga una videollamada (vera-backlog#86): pago recibido y siguiente paso (responder con horarios) */
export function videoPaidEmail(pro, plan) {
  const what = plan.eur === 99 ? 'asesoría de lactancia de 1 h 30' : 'videollamada de 30 minutos';
  const subject = `Tu ${plan.eur === 99 ? 'asesoría de lactancia' : 'videollamada'} con ${pro.short} · elige día y hora`;
  const step = (n, t) => `<tr><td style="vertical-align:top;padding:6px 10px 6px 0"><span style="display:inline-block;width:24px;height:24px;border-radius:50%;background:#F6E0E2;color:#45574C;font-weight:600;font-size:13px;line-height:24px;text-align:center">${n}</span></td><td style="padding:6px 0;font-size:14px;color:#2F3631">${t}</td></tr>`;
  const html = shell(`<p>Hola,</p>
<p>Hemos recibido el pago de tu <b>${what}</b> con <b>${esc(pro.name)}, ${esc(pro.role)}</b> (${plan.eur} €).</p>
<div style="background:#F6E0E2;border-radius:10px;padding:14px 16px;margin:14px 0">
<p style="margin:0 0 6px;font-family:Georgia,serif;font-size:19px;color:#45574C">Siguiente paso: responde a este correo</p>
<p style="margin:0;font-size:14px">Dinos <b>3 franjas que te vengan bien</b> en los próximos días (por ejemplo: «martes por la tarde, jueves de 10 a 12, viernes a primera hora»). Si quieres, añade una línea sobre lo que quieres consultar.</p></div>
<p style="margin:16px 0 4px;font-weight:600">Después</p>
<table style="border-collapse:collapse">${step(1, 'En menos de 24 h laborables te proponemos día y hora.')}${step(2, 'Te enviamos el enlace de Google Meet.')}${step(3, 'A la hora acordada, entra en el enlace. En el ordenador se abre en el navegador; en el móvil, con la app de Google Meet.')}</table>
<p style="font-size:13px;color:#6E6C67;margin-top:16px">Puedes cambiarla o cancelarla hasta 1 hora antes y te devolvemos el dinero entero. La llamada no se graba.</p>
<p style="font-size:13px;color:#6E6C67">No es un servicio de urgencias. Si algo no va bien, llama al 112 o acude a tu centro de salud.</p>`);
  const text = `Hola,\n\nHemos recibido el pago de tu ${what} con ${pro.name}, ${pro.role} (${plan.eur} €).\n\nSIGUIENTE PASO: responde a este correo con 3 franjas que te vengan bien en los próximos días (por ejemplo: «martes por la tarde, jueves de 10 a 12, viernes a primera hora»). Si quieres, añade una línea sobre lo que quieres consultar.\n\nDespués:\n1. En menos de 24 h laborables te proponemos día y hora.\n2. Te enviamos el enlace de Google Meet.\n3. A la hora acordada, entra en el enlace (en el ordenador, en el navegador; en el móvil, con la app de Google Meet).\n\nPuedes cambiarla o cancelarla hasta 1 hora antes y te devolvemos el dinero entero. La llamada no se graba.\nNo es un servicio de urgencias: si algo no va bien, llama al 112 o acude a tu centro de salud.`;
  return { subject, html, text };
}

/** Único correo a quien deja a medias el pago de una videollamada (vera-backlog#86). Avisado junto al botón de pagar. */
export function videoAbandonedEmail(pro, plan) {
  const lact = plan.eur === 99;
  const what = lact ? 'asesoría de lactancia' : 'videollamada';
  const link = `https://hera-gine.com/videollamada/?de=medias${lact ? '#lactancia' : `#reservar-${pro.key}`}`;
  const free = `https://hera-gine.com/#preguntar-${pro.key}`;
  const subject = `Tu ${what} con ${pro.short} se quedó a medias`;
  const html = shell(`<p>Hola,</p><p>Empezaste a reservar una <b>${what} con ${esc(pro.name)}, ${esc(pro.role)}</b>, pero el pago no se llegó a completar.</p>
<p style="margin:18px 0"><a href="${link}" style="display:inline-block;background:#45574C;color:#ffffff;text-decoration:none;font-weight:600;border-radius:8px;padding:12px 20px">Terminar la reserva</a></p>
<p>¿Te quedó alguna duda antes de pagar? <b>Responde a este correo</b> y te contestamos.</p>
<p>Si prefieres empezar por escrito, <a href="${free}" style="color:#45574C;font-weight:600">pregúntaselo gratis a ${esc(pro.short)}</a>: tus 2 primeras consultas no cuestan nada.</p>
<p style="font-size:13px;color:#6E6C67">No te volveremos a escribir sobre esta reserva.</p>`);
  const text = `Hola,\n\nEmpezaste a reservar una ${what} con ${pro.name}, ${pro.role}, pero el pago no se llegó a completar.\n\nTerminar la reserva: ${link}\n\n¿Te quedó alguna duda antes de pagar? Responde a este correo y te contestamos.\nSi prefieres empezar por escrito, pregúntaselo gratis a ${pro.short}: ${free}\n\nNo te volveremos a escribir sobre esta reserva.`;
  return { subject, html, text };
}

/** Mensaje reenviado por el hilo: del profesional a la usuaria o de la usuaria al profesional */
/** Pie de la primera respuesta (vera-backlog#85): «¿Te ha ayudado?» con tres botones a la página de opinión */
export function rateBlock(pro, link) {
  const b = (r, label, solid) => `<a href="${link(r)}" style="display:inline-block;text-align:center;text-decoration:none;font-weight:600;font-size:14px;border-radius:8px;padding:9px 14px;margin:0 6px 6px 0;border:1.5px solid #45574C;${solid ? 'background:#45574C;color:#ffffff' : 'background:#ffffff;color:#45574C'}">${label}</a>`;
  return {
    html: `<div style="margin:20px 0 0;padding:14px;border:1px solid #E5E1D8;border-radius:10px;background:#ffffff">
<p style="font-family:Georgia,serif;font-size:17px;color:#45574C;margin:0 0 10px">¿Te ha ayudado la respuesta de ${esc(pro.short)}?</p>
${b(1, 'Sí, mucho', true)}${b(2, 'Más o menos')}${b(3, 'No')}
<p style="font-size:12px;color:#8A8A8E;margin:4px 0 0">Un toque. Se lo diremos a ${esc(pro.short)}, sin tu correo.</p></div>`,
    text: `¿Te ha ayudado la respuesta de ${pro.short}?\nSí, mucho: ${link(1)}\nMás o menos: ${link(2)}\nNo: ${link(3)}`,
  };
}

export function relayEmail(pro, role, id, body, nAttach, rate = null) {
  const head = role === 'p' ? `<p style="font-size:13px;color:#6E6C67;margin-bottom:6px">${esc(pro.name)}, ${esc(pro.role)}, te responde:</p>`
    : `<p style="font-size:13px;color:#6E6C67;margin-bottom:6px">La usuaria de la consulta #${id.toUpperCase()} ha escrito:</p>`;
  const att = nAttach ? `<p style="font-size:13px;color:#6E6C67">${nAttach} ${nAttach === 1 ? 'archivo adjunto' : 'archivos adjuntos'}</p>` : '';
  const foot = role === 'p'
    ? 'Si necesitas aclarar algo, responde a este correo. No es un servicio de urgencias: si algo no va bien, llama al 112 o acude a tu centro de salud.'
    : `Responde a este correo para contestarle; le llegará desde ${pro.email}.`;
  // Debajo de cada respuesta de la profesional: la videollamada con ella (vera-backlog#86)
  const vlink = `https://hera-gine.com/videollamada/?de=respuesta#reservar-${pro.key}`;
  const video = role === 'p' && pro.key ? {
    html: `<div style="margin:16px 0 0;padding:12px 14px;border:1px solid #E5E1D8;border-radius:10px;background:#ffffff;font-size:14px">¿Prefieres hablarlo cara a cara? <a href="${vlink}" style="color:#45574C;font-weight:600">Videollamada de 30 min con ${esc(pro.short)} · 55 €</a></div>`,
    text: `¿Prefieres hablarlo cara a cara? Videollamada de 30 min con ${pro.short} (55 €): ${vlink}`,
  } : null;
  const html = shell(`${head}<div style="white-space:normal">${nl2br(body)}</div>${att}${rate ? rate.html : ''}${video ? video.html : ''}<p style="font-size:12px;color:#8A8A8E;margin-top:18px">${esc(foot)}</p>`);
  const text = `${role === 'p' ? `${pro.name}, ${pro.role}, te responde:` : `La usuaria de la consulta #${id.toUpperCase()} ha escrito:`}\n\n${body}\n\n${nAttach ? `[${nAttach} adjunto(s)]\n\n` : ''}${rate ? `${rate.text}\n\n` : ''}${video ? `${video.text}\n\n` : ''}${foot}`;
  return { html, text };
}

/** Aviso al profesional cuando una consulta lleva 40 h sin respuesta */
export function reminderEmail(pro, id) {
  const html = shell(`<p>Hola, ${esc(pro.short)}:</p><p>La consulta <b>#${id.toUpperCase()}</b> lleva 40 horas sin respuesta y el plazo que damos a las usuarias es de 48 h.</p>
<p>Puedes responder a este mismo correo y le llegará a ella.</p>`);
  return { html, text: `Hola, ${pro.short}: la consulta #${id.toUpperCase()} lleva 40 horas sin respuesta (plazo: 48 h). Puedes responder a este mismo correo y le llegará a la usuaria.` };
}

// MARK: - Medición de uso

/** Fecha de hoy en Madrid, AAAA-MM-DD */
export function madridDay(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}


async function bump(env, k, day = madridDay(), by = 1) {
  if (!env.DB) return;
  try {
    await env.DB.prepare('INSERT INTO counts (day, k, n) VALUES (?1, ?2, ?3) ON CONFLICT(day, k) DO UPDATE SET n = n + ?3').bind(day, k, by).run();
  } catch (e) { console.log(`metrics ${e.message}`); }
}

/** Cuenta una persona distinta al día (huella que cambia cada día y se borra a las 48 h) */
async function countPerson(env, request, key) {
  if (!env.DB) return;
  const day = madridDay();
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const ua = request.headers.get('User-Agent') || '';
  const h = (await hmac(`${env.HASH_SALT}:${day}`, `${ip}|${ua}`)).slice(0, 32);
  try {
    const r = await env.DB.prepare('INSERT OR IGNORE INTO visitors (day, h) VALUES (?1, ?2)').bind(`${key}:${day}`, h).run();
    if (r.meta?.changes) {
      await bump(env, `personas_${key}`, day);
      const old = madridDay(new Date(Date.now() - 2 * 86400000));
      await env.DB.prepare('DELETE FROM visitors WHERE substr(day, -10) < ?1').bind(old).run();
    }
  } catch (e) { console.log(`metrics ${e.message}`); }
}

/** Envía con Resend. Devuelve {id} si sale bien o null. refs: identificadores anteriores del hilo (para In-Reply-To/References) */
async function sendMail(env, { to, replyTo, subject, html, text, bcc, from, refs, attachments }) {
  if (env.DRY_RUN === '1') { console.log(`[ensayo] correo a ${to}: ${subject}`); return { id: null }; }
  // Resend pone su propio Message-ID; el real de cada correo enviado lo conocemos cuando nos responden (In-Reply-To)
  const headers = refs?.length ? { 'In-Reply-To': refs[refs.length - 1], References: refs.slice(-20).join(' ') } : undefined;
  let res, detail = '';
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: from || env.FROM, to: [to], reply_to: replyTo, subject, html, text, ...(bcc ? { bcc: [bcc] } : {}),
        ...(headers ? { headers } : {}), ...(attachments?.length ? { attachments } : {}) }),
    });
    if (!res.ok) detail = `Resend respondió ${res.status}: ${(await res.text()).slice(0, 300)}`;
  } catch (e) { detail = `No se pudo conectar con Resend: ${e.message}`; }
  if (detail) { console.log(detail); await alertSendFailure(env, subject, detail); return null; }
  const j = await res.json().catch(() => ({}));
  return { id: j.id || null };
}

/** Aviso a Noza cuando falla un envío (como mucho uno cada 30 min). Va por Cloudflare (MAILER), no por Resend,
 * para que llegue aunque Resend sea lo que falla. Sin direcciones de la usuaria: solo el asunto y el error. */
async function alertSendFailure(env, subject, detail) {
  try {
    const slot = `alerta:envio:${Math.floor(Date.now() / 1800000)}`;
    if (await env.KV.get(slot)) return;
    await env.KV.put(slot, '1', { expirationTtl: 3600 });
    const hora = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'medium', timeStyle: 'short' });
    await notify(env, 'Error · ha fallado un envío de correo', `Ha fallado el envío de un correo de Hera (${hora}).\n\nAsunto: ${subject || '—'}\n${detail}\n\nSi era una consulta, a la usuaria le salió un aviso de error para que lo intente de nuevo. Revisa Resend o avisa a Claude. No se envían más avisos de este tipo en los próximos 30 minutos.`);
  } catch (e) { console.log(`alerta ${e.message}`); }
}


/** Límite simple por IP: 5 envíos cada 10 minutos */
async function rateLimited(env, ip) {
  if (!ip) return false;
  const key = `r:${await hmac(env.HASH_SALT, ip)}:${Math.floor(Date.now() / 600000)}`;
  const n = Number((await env.KV.get(key)) || 0);
  if (n >= 5) return true;
  await env.KV.put(key, String(n + 1), { expirationTtl: 1200 });
  return false;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') ?? '';
    const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const cors = {
      'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0] ?? '',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };
    const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const betaAuth = () => {
      const a = request.headers.get('Authorization') || '';
      return (!!env.ADMIN_TOKEN && a === `Bearer ${env.ADMIN_TOKEN}`) || (!!env.BETA_CODE && a === `Bearer ${env.BETA_CODE}`);
    };
    if (request.method === 'GET' && url.pathname === '/admin/vip') {
      if (!betaAuth()) return reply(401, { error: 'unauthorized' });
      const list = [];
      let cursor;
      do {
        const page = await env.KV.list({ prefix: 'v:', cursor });
        for (const k of page.keys) list.push({ id: k.name.slice(2), ...(k.metadata || {}) });
        cursor = page.list_complete ? null : page.cursor;
      } while (cursor);
      return reply(200, { list: list.sort((a, b) => String(b.at || '').localeCompare(String(a.at || ''))) });
    }
    if (request.method === 'GET' && url.pathname === '/status') {
      // Solo dice si cada consulta (número aleatorio que conoce quien la hizo) está respondida y cuándo; nada más
      const ids = String(url.searchParams.get('ids') || '').split(',').filter((x) => /^[a-z0-9]{8}$/.test(x)).slice(0, 30);
      const out = {};
      for (const id of ids) {
        const t = await loadThread(env, id);
        out[id] = t ? { a: t.a || 0, c: t.c } : null;
      }
      return reply(200, { status: out });
    }
    const payHooks = {
      paid: async (plan, s) => {
        await bump(env, `pago:${plan}`);
        if (PLANS[plan].video) {
          const pro = PROS[s.metadata?.pro] || PROS.matrona;
          const to = s.customer_details?.email || s.customer_email;
          if (to) await sendMail(env, { to, replyTo: 'contacto@hera-gine.com', ...videoPaidEmail(pro, PLANS[plan]) });
          if (s.metadata?.src === 'ads') { const ak = /_latam$/.test(String(s.metadata?.camp || '')) ? 'latam' : 'anuncio'; await bump(env, `${ak}_pago:${plan}`); await bump(env, `${ak}_eur`, madridDay(), PLANS[plan].eur); }
          const dash = `https://dashboard.stripe.com/${s.livemode ? '' : 'test/'}${s.payment_intent ? `payments/${s.payment_intent}` : 'payments'}`;
          await notify(env, `Pago · ${PLANS[plan].video && PLANS[plan].eur === 99 ? 'Asesoría de lactancia' : 'Videollamada'} con ${pro.short} · ${PLANS[plan].eur} €${s.metadata?.src === 'ads' ? ' · desde anuncio' : ''}${s.livemode ? '' : ' · prueba'}`,
            `${PLANS[plan].label} con ${pro.name}: ${PLANS[plan].eur} €${s.livemode ? '' : ' (modo de prueba, sin dinero real)'}\n\nLe hemos enviado el correo con los pasos: responderá con 3 franjas a contacto@hera-gine.com.\nSiguiente: cuadrar la hora con ${pro.short} y proponérsela en menos de 24 h laborables; después, enviar el enlace de Google Meet.\nSi no responde, su correo está en el pago de Stripe.\n\nVer en Stripe: ${dash}`, sendMail);
          return;
        }
        if (s.metadata?.src === 'ads') { const ak = /_latam$/.test(String(s.metadata?.camp || '')) ? 'latam' : 'anuncio'; await bump(env, `${ak}_pago:${plan}`); await bump(env, `${ak}_eur`, madridDay(), PLANS[plan].eur); }
        // Aviso al equipo: sin correo de la usuaria; enlace al pago en el panel de Stripe
        const dash = `https://dashboard.stripe.com/${s.livemode ? '' : 'test/'}${s.payment_intent ? `payments/${s.payment_intent}` : s.subscription ? `subscriptions/${typeof s.subscription === 'string' ? s.subscription : s.subscription.id}` : 'payments'}`;
        const hora = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'medium', timeStyle: 'short' });
        await notify(env, `Pago · ${PLANS[plan].label} · ${PLANS[plan].eur} €${s.metadata?.src === 'ads' ? ' · desde anuncio' : ''}${s.livemode ? '' : ' · prueba'}`,
          `${PLANS[plan].label}: ${PLANS[plan].eur} €${s.livemode ? '' : ' (modo de prueba, sin dinero real)'}\n${hora}\n\nVer en Stripe: ${dash}`, sendMail);
      },
      cancelled: async () => { await bump(env, 'pago:baja_mensual'); },
      abandoned: async (plan, s) => {
        const pro = PROS[s.metadata?.pro] || PROS.matrona;
        const to = s.customer_details?.email || s.customer_email;
        const ok = await sendMail(env, { to, from: 'Hera <consultas@hera-gine.com>', replyTo: 'contacto@hera-gine.com', ...videoAbandonedEmail(pro, PLANS[plan]) });
        await bump(env, `pago_medias:${plan}`);
        await notify(env, `Actividad · Pago a medias · ${PLANS[plan].label} con ${pro.short}`, `Alguien empezó a pagar ${PLANS[plan].label} con ${pro.name} (${PLANS[plan].eur} €) y no terminó.\n${ok ? 'Le hemos enviado el único correo de recordatorio.' : 'No se pudo enviar el correo de recordatorio.'}${s.livemode ? '' : '\n(modo de prueba)'}`, sendMail);
      },
      refunded: async (plan, charge) => {
        await bump(env, `pago:devuelto_${plan}`);
        await notify(env, `Reembolso · ${PLANS[plan].label} · ${PLANS[plan].eur} €`, `Reembolsado: ${PLANS[plan].label}.${PLANS[plan].video ? '' : ` Se han quitado ${PLANS[plan].credits === 1 ? 'esa consulta' : `esas ${PLANS[plan].credits} consultas`} del saldo (si quedaban).`}\n\nVer en Stripe: https://dashboard.stripe.com/${charge.livemode ? '' : 'test/'}payments/${charge.payment_intent}`, sendMail);
      },
    };
    if (request.method === 'POST' && url.pathname === '/stripe/webhook') return new Response(null, { status: await handleWebhook(env, request, payHooks) });
    if (request.method === 'GET' && url.pathname === '/checkout/status') {
      if (!env.STRIPE_SECRET_KEY) return reply(404, { error: 'not_found' });
      try { return reply(200, await sessionStatus(env, url.searchParams.get('cs'), payHooks)); } catch (e) { console.log(e.message); return reply(502, { error: 'stripe' }); }
    }
    // Panel privado para el móvil (clave en el enlace, sin login; guárdalo en favoritos)
    if (request.method === 'GET' && url.pathname === '/panel') {
      if (!env.DASH_KEY || url.searchParams.get('k') !== env.DASH_KEY) return new Response('Not found', { status: 404, headers: { 'x-robots-tag': 'noindex' } });
      return new Response(await panel(env, url, openThreads), {
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow', 'referrer-policy': 'no-referrer' },
      });
    }
    if (request.method === 'GET' && url.pathname === '/stats') {
      if (!env.PANEL_CODE || request.headers.get('Authorization') !== `Bearer ${env.PANEL_CODE}`) return reply(401, { error: 'unauthorized' });
      const days = Math.min(365, Math.max(1, Number(url.searchParams.get('days')) || 30));
      const from = madridDay(new Date(Date.now() - (days - 1) * 86400000));
      const { results } = await env.DB.prepare('SELECT day, k, n FROM counts WHERE day >= ?1 ORDER BY day').bind(from).all();
      return reply(200, { from, to: madridDay(), rows: results, open: await openThreads(env) });
    }
    if (request.method !== 'POST') return reply(405, { error: 'method' });

    let body;
    try {
      const raw = await request.text();
      if (raw.length > (url.pathname === '/ask' ? MAX_ASK_BODY : MAX_BODY)) return reply(413, { error: 'too_large' });
      body = JSON.parse(raw || '{}');
    } catch { return reply(400, { error: 'bad_request' }); }
    const limit = Number(env.FREE_LIMIT || 2);

    if (url.pathname === '/admin/reset') {
      if (!env.ADMIN_TOKEN || request.headers.get('Authorization') !== `Bearer ${env.ADMIN_TOKEN}`) return reply(401, { error: 'unauthorized' });
      const norm = normalizeEmail(body.email);
      if (!norm) return reply(400, { error: 'bad_email' });
      await env.KV.delete(`c:${await hmac(env.HASH_SALT, norm)}`);
      return reply(200, { ok: true });
    }

    if (url.pathname === '/admin/vip') {
      if (!betaAuth()) return reply(401, { error: 'unauthorized' });
      if (body.remove && /^[a-f0-9]{64}$/.test(String(body.id || ''))) { await env.KV.delete(`v:${body.id}`); return reply(200, { ok: true, removed: true }); }
      const norm = normalizeEmail(body.email);
      if (!norm) return reply(400, { error: 'bad_email' });
      const vk = `v:${await hmac(env.HASH_SALT, norm)}`;
      if (body.remove) { await env.KV.delete(vk); return reply(200, { ok: true, removed: true }); }
      // Fin opcional (AAAA-MM-DD): válido hasta el final de ese día
      const until = body.until && !Number.isNaN(Date.parse(body.until)) ? new Date(`${String(body.until).slice(0, 10)}T23:59:59Z`).toISOString() : null;
      const rec = { plan: 'ilimitado', until, note: String(body.note || '').slice(0, 60), at: new Date().toISOString() };
      await env.KV.put(vk, JSON.stringify(rec), { metadata: { note: rec.note, until, at: rec.at } });
      // Devuelve la entrada: la lista de KV tarda hasta un minuto en reflejar lo nuevo, así la página la muestra ya
      return reply(200, { ok: true, until, entry: { id: vk.slice(2), note: rec.note, until, at: rec.at } });
    }

    if (!allowed.includes(origin)) return reply(403, { error: 'origin' });

    if (url.pathname.startsWith('/opinion')) {
      if (!allowed.includes(origin)) return reply(403, { error: 'origin' });
      const [status, out] = await handleOpinion(env, url.pathname, body, { PROS, sendMail, bump, hashEmail: async (e) => { const n = normalizeEmail(e); return n ? hmac(env.HASH_SALT, n) : null; } });
      return reply(status, out);
    }
    // Prueba: manda ya el correo de opinión de una consulta de prueba (para verlo en el móvil)
    if (url.pathname === '/admin/opinion-test' && request.headers.get('Authorization') === `Bearer ${env.ADMIN_TOKEN}` && env.ADMIN_TOKEN) {
      const t = await loadThread(env, String(body.id || ''));
      if (!t || t.p !== 'prueba') return reply(404, { error: 'not_found' });
      const fe = feedbackEmail({ short: 'Marina', role: 'matrona' }, t.id, await feedbackSig(env, t.id));
      return reply(200, { sent: !!(await sendMail(env, { to: await openEmail(env, t.u), replyTo: 'contacto@hera-gine.com', ...fe })) });
    }
    if (url.pathname === '/hit') {
      const e = String(body.e || '');
      if (!isEvent(e)) return reply(400, { error: 'bad_event' });
      await bump(env, e);
      // Actividad en tiempo real para el equipo (activity.js): evento, dispositivo y etiqueta anónima del día
      const p = await personTag(env, request, madridDay(), body.p);
      await record(env, { e, d: isDevice(body.d) ? body.d : '', p }, sendMail, ctx);
      if (e === 'apertura') await countPerson(env, request, 'app');
      if (e === 'portada') await countPerson(env, request, 'portada');
      if (e.startsWith('anuncio_visita')) await countPerson(env, request, /_latam$/.test(e) ? 'latam' : 'anuncio');
      return reply(200, { ok: true, p });
    }

    if (url.pathname === '/checkout') {
      if (!env.STRIPE_SECRET_KEY || !paymentsOn(env, body)) return reply(404, { error: 'not_found' });
      const norm = normalizeEmail(body.email);
      if (!norm) return reply(400, { error: 'bad_email' });
      if (!PLANS[body.plan]) return reply(400, { error: 'bad_plan' });
      const vpro = body.plan === 'lactancia' ? 'matrona' : PLANS[body.plan].video ? body.pro : '';
      if (PLANS[body.plan].video && !VIDEO_PROS.includes(vpro)) return reply(400, { error: 'bad_pro' });
      if (await rateLimited(env, request.headers.get('CF-Connecting-IP'))) return reply(429, { error: 'rate' });
      try {
        const checkoutUrl = await createCheckout(env, { email: String(body.email).trim(), plan: body.plan, h: await hmac(env.HASH_SALT, norm), origin, back: ['web', 'video'].includes(body.back) ? body.back : 'app', ad: body.src === 'ads', pro: vpro, camp: /^[a-z0-9_]{1,24}$/.test(String(body.camp || '')) ? body.camp : '' });
        await bump(env, `pago_inicio:${body.plan}`);
        return reply(200, { url: checkoutUrl });
      } catch (e) { console.log(e.message); return reply(502, { error: 'stripe' }); }
    }

    if (url.pathname === '/notify') {
      const norm = normalizeEmail(body.email);
      if (!norm) return reply(400, { error: 'bad_email' });
      if (body.consent !== true) return reply(400, { error: 'consent' });
      const h = await hmac(env.HASH_SALT, norm);
      await env.KV.put(`w:${h}`, JSON.stringify({ email: String(body.email).trim(), at: new Date().toISOString() }));
      await bump(env, 'aviso_pago');
      await record(env, { e: 'aviso_pago_pedido', p: await personTag(env, request, madridDay()) }, sendMail, ctx);
      return reply(200, { ok: true });
    }

    if (url.pathname === '/ask') {
      if (body.website) return reply(200, { ok: true, remaining: limit - 1 }); // campo trampa: un robot cree que ha funcionado
      // En la prueba de principio a fin, email «yo» = COPY_TO (Noza hace de usuaria y de profesional sin escribir su correo aquí)
      if (body.to === 'prueba' && body.email === 'yo' && env.COPY_TO && request.headers.get('Authorization') === `Bearer ${env.ADMIN_TOKEN}`) body.email = env.COPY_TO;
      const norm = normalizeEmail(body.email);
      if (!norm) return reply(400, { error: 'bad_email' });
      const pro = PROS[body.to] || (body.to === 'prueba' && env.ADMIN_TOKEN && request.headers.get('Authorization') === `Bearer ${env.ADMIN_TOKEN}` && env.COPY_TO
        ? { name: 'Prueba de Hera', short: 'Prueba', role: 'prueba', email: env.COPY_TO, key: 'prueba' } : null);
      if (!pro) return reply(400, { error: 'bad_to' });
      // Se puede enviar sin escribir nada: la profesional responde preguntando qué necesita
      const text = String(body.text || '').trim() || 'Hola, me gustaría hacer una consulta.';
      if (text.length > 2000) return reply(400, { error: 'bad_text' });
      const { files, error: fileError } = validateAttachments(body.attachments);
      if (fileError) return reply(fileError === 'too_large' ? 413 : 400, { error: fileError });
      const q = { files: files.length, email: String(body.email).trim(), text, context: String(body.context || '').slice(0, 120), situation: String(body.situation || '').slice(0, 500) };
      // Prueba de principio a fin (solo con ADMIN_TOKEN): el «profesional» es COPY_TO y no cuenta como consulta gratuita
      const test = body.to === 'prueba' && env.ADMIN_TOKEN && request.headers.get('Authorization') === `Bearer ${env.ADMIN_TOKEN}` && env.COPY_TO;

      const h = await hmac(env.HASH_SALT, norm);
      const key = `c:${h}`;
      const rec = (await env.KV.get(key, 'json')) || { n: 0, first: null, last: null };
      // Consultas ilimitadas (beta testers / plan ilimitado): no gastan gratuitas
      const vip = await env.KV.get(`v:${h}`, 'json');
      const beta = !!vip && (!vip.until || Date.parse(vip.until) > Date.now());
      // Lo pagado (stripe.js). Ilimitado de pago: uso razonable, una consulta nueva al día (las de beta no tienen tope)
      const bal = env.STRIPE_SECRET_KEY ? await getBalance(env, h) : { credits: 0, sub: false, day: null };
      const subscriber = !beta && bal.sub;
      const unlimited = beta || subscriber;
      const pay = paymentsOn(env, body) && !!env.STRIPE_SECRET_KEY;
      if (!test && subscriber && bal.day === madridDay()) return reply(200, { limit: true, daily: true, freeLimit: limit, ...(env.STRIPE_PORTAL_URL ? { portal: env.STRIPE_PORTAL_URL } : {}) });
      const credits = unlimited ? 0 : bal.credits;
      if (!test && !unlimited && rec.n >= limit && credits <= 0) {
        if (body.team !== true) {
          if (body.src === 'ads') await bump(env, /_latam$/.test(String(body.camp || '')) ? 'latam_limite' : 'anuncio_limite');
          await bump(env, 'gratuitas_agotadas');
          await record(env, { e: 'gratuitas_agotadas', p: await personTag(env, request, madridDay(), body.p) }, sendMail, ctx);
        }
        return reply(200, { limit: true, used: rec.n, freeLimit: limit, ...(pay ? { pay: true } : {}) });
      }
      if (!test && await rateLimited(env, request.headers.get('CF-Connecting-IP'))) return reply(429, { error: 'rate' });

      // Hilo: el profesional y la usuaria se responden a través de direcciones de Hera de un solo uso
      const id = newThreadId();
      const bcc = test ? undefined : env.COPY_TO || undefined; // COPY_TO (secreto): copia oculta de cada consulta mientras se prueba
      // RELAY="1": respuestas a través de Hera (necesita la regla catch-all → Worker en Email Routing). Las pruebas siempre lo usan.
      const relay = env.RELAY === '1' || !!test;
      const pm = proEmail(pro, q, id, relay);
      // Con adjuntos, la copia de control va aparte y sin los archivos: solo los recibe la profesional
      const proReply = relay ? await relayAddress(env, 'p', id) : q.email;
      const sent = await sendMail(env, { to: pro.email, replyTo: proReply, ...pm, attachments: files });
      if (!sent) return reply(502, { error: 'send' });
      const now = new Date().toISOString();
      // Primero se gastan las gratuitas y después las pagadas
      const paid = !test && !unlimited && rec.n >= limit;
      const n = test || unlimited || paid ? rec.n : rec.n + 1;
      let creditsLeft = credits;
      if (!test) {
        if (paid) creditsLeft = await spendCredit(env, h);
        else if (!unlimited) await env.KV.put(key, JSON.stringify({ n, first: rec.first || now, last: now }));
        if (subscriber) await markDay(env, h, madridDay());
        // Dispositivos del equipo (modo equipo en la app): la consulta se envía igual, pero no cuenta en métricas ni avisos
        if (body.team !== true) {
          await bump(env, `consulta:${body.to}`);
          if (body.src === 'ads') { const ak = /_latam$/.test(String(body.camp || '')) ? 'latam' : 'anuncio'; await bump(env, paid ? `${ak}_consulta_pagada` : `${ak}_consulta`); }
          if (unlimited) await bump(env, 'consulta_ilimitada');
          // Si llegó desde un anuncio, el aviso lo dice (y queda en la actividad para el resumen y los recorridos)
          const camp = /^[a-z0-9_]{1,24}$/.test(String(body.camp || '')) ? body.camp : '';
          const fromAd = body.src === 'ads';
          const tag = await personTag(env, request, madridDay(), body.p);
          await record(env, { e: `consulta:${body.to}`, p: tag, note: fromAd ? `vino de un anuncio${camp ? ` (${camp})` : ''}${paid ? ', consulta pagada' : ''}` : (paid ? 'consulta pagada' : '') }, sendMail, ctx);
          if (fromAd) await record(env, { e: camp ? `consulta_anuncio:${camp}` : 'consulta_anuncio', p: tag }, sendMail, ctx);
        }
      }
      // Invitación (invite.js): solo si este correo nunca había preguntado y el enlace es de otra persona
      const rf = !test && body.team !== true && relay && !rec.first && rec.n === 0 ? await inviteFor(env, String(body.ref || ''), h) : null;
      if (rf) {
        await bump(env, 'consulta_invitada');
        await record(env, { e: 'consulta_invitada', p: await personTag(env, request, madridDay(), body.p) }, sendMail, ctx);
      }
      // Copia de control para el equipo: un solo correo por consulta, con el texto entero (y los adjuntos si COPY_ATTACH="1", temporal)
      if (bcc && body.team !== true) {
        const withFiles = env.COPY_ATTACH === '1' && files.length > 0;
        // COPY_EMAIL="1" (temporal, Noza 11 nov): la copia dice el correo de la usuaria, por si hay problemas
        const who = env.COPY_EMAIL === '1' ? `<p style="font-size:13px;color:#6E6C67">Correo de la usuaria: <b>${esc(q.email)}</b></p>` : '';
        const extra = `${who}${q.context ? `<p style="font-size:13px;color:#6E6C67">Sobre: ${esc(q.context)}</p>` : ''}${q.situation ? `<p style="font-size:13px;color:#6E6C67">Situación: ${nl2br(q.situation)}</p>` : ''}`;
        const tc = teamCopy({ subject: `Consulta · ${pro.short} · #${id.toUpperCase()}${files.length ? ` · ${files.length} ${files.length === 1 ? 'adjunto' : 'adjuntos'}` : ''}${body.src === 'ads' ? (/_latam$/.test(String(body.camp || '')) ? ' · desde anuncio (México y Argentina)' : ' · desde anuncio') : ''}${paid ? ' · pagada' : ''}`,
          intro: `Nueva consulta para <b>${esc(pro.name)}</b>${body.src === 'ads' ? ' (llegó desde un anuncio)' : ''}.`, body: q.text, extra, nFiles: files.length, withFiles });
        await sendMail(env, { to: bcc, from: TEAM_FROM, replyTo: 'contacto@hera-gine.com', ...tc, ...(withFiles ? { attachments: files } : {}) });
      }
      const remaining = Math.max(0, limit - n);
      const paidLeft = remaining === 0 && !unlimited && creditsLeft >= 0 && (paid || credits > 0)
        ? (creditsLeft === 0 ? 'Era la última consulta de tu saldo' : `Te ${creditsLeft === 1 ? 'queda 1 consulta' : `quedan ${creditsLeft} consultas`} en tu saldo`) : '';
      const cm = confirmEmail(pro, q, remaining, id, unlimited, subscriber ? 'Tienes el plan ilimitado: una consulta nueva al día' : paidLeft);
      const sentU = await sendMail(env, { to: q.email, replyTo: relay ? await relayAddress(env, 'u', id) : pro.email, ...cm });
      // Sin relay no hay hilo que seguir (ni recordatorios): no se guarda nada más
      if (relay) {
        await saveThread(env, { id, p: pro.key || body.to, u: await sealEmail(env, q.email), uh: (await hmac(env.HASH_SALT, norm)).slice(0, 24),
          sp: pm.subject, su: cm.subject, rp: [], ru: [], c: Date.now(), a: 0, rem: false, n: 0, h, ...(rf ? { rf } : {}), ...(body.follow === true ? { f: 1 } : {}) });
      }
      return reply(200, { ok: true, remaining, freeLimit: limit, ...(unlimited ? { unlimited: true } : {}), ...(paid || credits > 0 ? { credits: creditsLeft } : {}), ...(relay ? { id } : {}), dryRun: env.DRY_RUN === '1' });
    }
    return reply(404, { error: 'not_found' });
  },

  /** Correo entrante (Email Routing, regla catch-all → este Worker) */
  async email(message, env) {
    // Informes DMARC automáticos (rua=mailto:dmarc@ en el DNS): se aceptan y se cuentan; no hace falta leerlos
    if (/^dmarc@/i.test(String(message.to || ''))) { await bump(env, 'dmarc_informe'); return; }
    const dest = await parseRelayAddress(env, message.to);
    if (!dest) {
      // Cualquier otra dirección sin regla propia (p. ej. consultas@): se reenvía a Noza para que no se pierda
      const fwd = env.FALLBACK_TO || env.COPY_TO;
      if (fwd) { try { await message.forward(fwd); return; } catch (e) { console.log(`forward ${e.message}`); } }
      message.setReject('Esta dirección no existe. Escríbenos a contacto@hera-gine.com');
      return;
    }
    if (message.rawSize > 20 * 1024 * 1024) { message.setReject('El mensaje es demasiado grande (máximo 20 MB).'); return; }
    const t = await loadThread(env, dest.id);
    if (!t) { message.setReject('Esta consulta ya ha caducado. Puedes hacer una nueva en https://hera-gine.com'); return; }
    if (isAutomatic(message.headers)) return; // respuestas automáticas: se descartan
    await relayIncoming(env, t, dest.role, message.raw, message.from);
  },

  /** Cada hora: recordatorio al profesional si una consulta lleva 40 h sin respuesta */
  async scheduled(event, env) {
    await remindOverdue(env);
    await sendFeedbackDue(env, sendMail, PROS);
    await hourlyDigest(env, sendMail);
  },
};

/** Reenvía un mensaje del hilo al otro lado y actualiza el hilo. role: quién escribe («p» profesional, «u» usuaria) */
export async function relayIncoming(env, t, role, raw, envelopeFrom = '') {
  const pro = PROS[t.p] || (t.p === 'prueba' && env.COPY_TO ? { name: 'Prueba de Hera', short: 'Prueba', role: 'prueba', email: env.COPY_TO } : null);
  if (!pro) return { ok: false, why: 'pro' };
  const msg = await parseIncoming(raw);
  console.log(`relay ${t.id} ${role} in-reply-to=${msg.inReplyTo || '-'}`);
  if (role === 'u') {
    // Solo la usuaria de la consulta puede escribir por su dirección
    const from = normalizeEmail(msg.from || envelopeFrom);
    if (!from || (await hmac(env.HASH_SALT, from)).slice(0, 24) !== t.uh) return { ok: false, why: 'sender' };
  }
  if (!msg.body && !msg.attachments.length) return { ok: false, why: 'empty' };
  const toUser = role === 'p';
  // Primera respuesta de la profesional: «¿Te ha ayudado?» al pie (si aún no ha valorado)
  let rate = null;
  if (role === 'p' && !t.a && !t.fr) { const sig = await feedbackSig(env, t.id); rate = rateBlock(pro, (r) => `https://hera-gine.com/opinion/?t=${t.id}&s=${sig}&r=${r}`); }
  const { html, text } = relayEmail(pro, role, t.id, msg.body || '(Sin texto: mira el archivo adjunto.)', msg.attachments.length, rate);
  const refsMine = toUser ? t.ru : t.rp;
  const sent = await sendMail(env, {
    to: toUser ? await openEmail(env, t.u) : pro.email,
    from: toUser ? `${pro.short} · Hera <${PROS[t.p] ? pro.email : 'consultas@hera-gine.com'}>` : `Consulta #${t.id.toUpperCase()} · Hera <consultas@hera-gine.com>`,
    replyTo: await relayAddress(env, toUser ? 'u' : 'p', t.id),
    subject: `Re: ${toUser ? t.su : t.sp}`,
    refs: refsMine, html, text, attachments: msg.attachments,
  });
  if (!sent) return { ok: false, why: 'send' };
  if (t.p !== 'prueba' && env.COPY_TO) {
    const withFiles = env.COPY_ATTACH === '1' && msg.attachments.length > 0;
    const tc = teamCopy({ subject: `Consulta · #${t.id.toUpperCase()} · ${toUser ? `${pro.short} respondió` : 'la usuaria escribió'}${msg.attachments.length ? ` · ${msg.attachments.length} ${msg.attachments.length === 1 ? 'adjunto' : 'adjuntos'}` : ''}`,
      intro: toUser ? `<b>${esc(pro.name)}</b> ha respondido a la consulta #${t.id.toUpperCase()}:` : `La usuaria de la consulta #${t.id.toUpperCase()} ha escrito a <b>${esc(pro.short)}</b>:`,
      body: msg.body || '(Sin texto: solo adjuntos.)', nFiles: msg.attachments.length, withFiles,
      extra: env.COPY_EMAIL === '1' ? `<p style="font-size:13px;color:#6E6C67">Correo de la usuaria: <b>${esc(await openEmail(env, t.u))}</b></p>` : '' });
    await sendMail(env, { to: env.COPY_TO, from: TEAM_FROM, replyTo: 'contacto@hera-gine.com', ...tc, ...(withFiles ? { attachments: msg.attachments } : {}) });
  }
  // Encadenar el hilo de quien escribe: el correo al que responde (su Message-ID real) y su propio mensaje
  const mine = toUser ? t.rp : t.ru;
  for (const x of [msg.inReplyTo, msg.messageId]) {
    const v = x && (x.startsWith('<') ? x : `<${x}>`);
    if (v && !mine.includes(v)) mine.push(v);
  }
  t.rp = t.rp.slice(-20); t.ru = t.ru.slice(-20);
  t.n = (t.n || 0) + 1;
  if (toUser && !t.a) {
    t.a = Date.now();
    if (t.p !== 'prueba') {
      await bump(env, `respondida:${t.p}`);
      await bump(env, `resp_horas:${t.p}`, madridDay(), Math.max(1, Math.round((t.a - t.c) / 3600000)));
      await record(env, { e: `respondida:${t.p}` }, sendMail);
      if (t.rf) { await rewardInvite(env, t.rf, sendMail, bump); delete t.rf; }
    }
  }
  if (t.p !== 'prueba') await bump(env, toUser ? 'mensaje:profesional' : 'mensaje:usuaria');
  await saveThread(env, t);
  return { ok: true };
}

/** Consultas abiertas sin respuesta, por profesional (para el panel) */
async function openThreads(env) {
  const out = { pendientes: {}, fuera_plazo: {} };
  let cursor;
  do {
    const page = await env.KV.list({ prefix: 't:', cursor });
    for (const k of page.keys) {
      const m = k.metadata || {};
      if (!m.p || m.a || m.p === 'prueba') continue;
      out.pendientes[m.p] = (out.pendientes[m.p] || 0) + 1;
      if (Date.now() - m.c > 48 * 3600000) out.fuera_plazo[m.p] = (out.fuera_plazo[m.p] || 0) + 1;
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return out;
}

export async function remindOverdue(env) {
  let cursor; let n = 0;
  do {
    const page = await env.KV.list({ prefix: 't:', cursor });
    for (const k of page.keys) {
      const m = k.metadata || {};
      if (!m.p || m.a || m.r || Date.now() - m.c < 40 * 3600000) continue;
      const t = await loadThread(env, k.name.slice(2));
      if (!t || t.a || t.rem) continue;
      const pro = PROS[t.p] || (t.p === 'prueba' && env.COPY_TO ? { short: 'Prueba', email: env.COPY_TO } : null);
      if (!pro) continue;
      const { html, text } = reminderEmail(pro, t.id);
      const sent = await sendMail(env, { to: pro.email, replyTo: await relayAddress(env, 'p', t.id), subject: `Re: ${t.sp}`, refs: t.rp, html, text });
      if (sent) { t.rem = true; await saveThread(env, t); if (t.p !== 'prueba') await bump(env, `recordatorio:${t.p}`); n++; }
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return n;
}
