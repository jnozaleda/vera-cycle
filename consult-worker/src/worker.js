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
// Bindings: KV (KV), HASH_SALT, ADMIN_TOKEN, RESEND_API_KEY, RESEND_READ_KEY (opcional: leer correos enviados para reenviarlos), COPY_TO (opcional) (secretos), ALLOWED_ORIGINS, FROM, FREE_LIMIT,
// DRY_RUN ("1" = hace todo menos enviar correos), DB (D1), PANEL_CODE (secreto), FALLBACK_TO (opcional: adónde reenviar
// lo que llegue a otras direcciones por la regla catch-all; si falta, se usa COPY_TO).
//
// Respuestas a través de Hera (relay.js): email() recibe lo que llega a hera-p-…/hera-u-… y lo reenvía al otro lado;
// scheduled() avisa al profesional cuando una consulta lleva 16 h sin respuesta.

import { validateAttachments } from './attachments.js';
import { sendFeedbackDue, handleOpinion, feedbackEmail, feedbackSig } from './feedback.js';
import { inviteCode, inviteFor, rewardInvite } from './invite.js';
import { panel } from './panel.js';
import { isEvent, isDevice, record, personTag, hourlyDigest, notify } from './activity.js';
import { handleResendWebhook } from './bounces.js';
import { addWaConsult, setWaState, assignPaidRow, maskPhone, normalizePhone } from './whatsapp.js';
import { PLANS, VIDEO_PROS, paymentsOn, createCheckout, sessionStatus, handleWebhook, getBalance, spendCredit, markDay, waCode } from './stripe.js';
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
  // Con tildes o «ñ» el correo no se puede enviar (Resend lo rechaza y la usuaria nunca recibe nada)
  if (/[^\x21-\x7e]/.test(e)) return null;
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
${relay ? `<p style="font-size:13px;color:#6E6C67"><b>Para contestar, responde a este correo</b> desde el móvil o el ordenador. Tu respuesta le llegará a la usuaria desde ${esc(pro.email)}: tu correo personal no se muestra. Si ella vuelve a escribir, te llegará en esta misma conversación. Plazo comprometido: 24 h.</p>`
    : `<p style="font-size:13px;color:#6E6C67">Responde a este correo para contestar directamente a la usuaria (${esc(q.email)}). Plazo comprometido: 24 h.</p>`}`);
  const text = `Nueva consulta para ${pro.name}\n\n${q.text}\n\n${q.context ? `Sobre: ${q.context}\n` : ''}${q.situation ? `Situación: ${q.situation}\n` : ''}\n${relay ? `Para contestar, responde a este correo: tu respuesta le llegará a la usuaria desde ${pro.email}, sin mostrar tu correo personal. Plazo: 24 h.` : `Responde a este correo para contestar a la usuaria (${q.email}).`}`;
  return { subject, html, text };
}

export function confirmEmail(pro, q, remaining, id = '', unlimited = false, leftText = '') {
  const excerpt = q.text.length > 160 ? `${q.text.slice(0, 160).trim()}…` : q.text;
  const left = leftText || (unlimited ? 'Tienes consultas ilimitadas' : remaining === 0 ? 'Era tu última consulta gratuita' : `Te ${remaining === 1 ? 'queda 1 consulta gratuita' : `quedan ${remaining} consultas gratuitas`}`);
  const subject = `Tu consulta a ${pro.short} · Hera${id ? ` #${id.toUpperCase()}` : ''}`;
  const html = shell(`<p>Hola,</p>
<p>Tu consulta ha llegado a <b>${esc(pro.name)}, ${esc(pro.role)}</b>. Te responderá en esta misma conversación en menos de 24 h.</p>
<div style="background:#F6E0E2;border-radius:10px;padding:12px;margin:12px 0;font-size:14px;color:#2F3631">«${esc(excerpt)}»${q.context ? `<br><span style="color:#6E6C67">Sobre: ${esc(q.context)}</span>` : ''}</div>
<p><span style="display:inline-block;background:#ffffff;color:#45574C;border:1.5px solid #45574C;border-radius:999px;padding:4px 12px;font-size:13px;font-weight:600">${left}</span></p>
<p style="font-size:13px;color:#6E6C67">¿Quieres añadir algo o enviar una foto? Responde a este correo y le llegará a ${esc(pro.short)}.</p>
<p style="font-size:13px;color:#6E6C67">No es un servicio de urgencias. Si algo no va bien, llama al 112 o acude a tu centro de salud.</p>
<p style="font-size:12px;color:#8A8A8E">¿No has escrito tú esta consulta? Escríbenos a contacto@hera-gine.com y la borramos.</p>`);
  const text = `Tu consulta ha llegado a ${pro.name}, ${pro.role}. Te responderá en esta misma conversación en menos de 24 h.\n\n«${excerpt}»\n\n${left}.\n\n¿Quieres añadir algo o enviar una foto? Responde a este correo y le llegará a ${pro.short}.\n\nNo es un servicio de urgencias: si algo no va bien, llama al 112 o acude a tu centro de salud.\n¿No has escrito tú esta consulta? Escríbenos a contacto@hera-gine.com y la borramos.`;
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
export function videoPaidEmail(pro, plan, invite = null) {
  if (plan.call) return callPaidEmail(pro, plan, invite);
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
<p style="font-size:13px;color:#6E6C67">No es un servicio de urgencias. Si algo no va bien, llama al 112 o acude a tu centro de salud.</p>${invite ? invite.html : ''}`);
  const text = `Hola,\n\nHemos recibido el pago de tu ${what} con ${pro.name}, ${pro.role} (${plan.eur} €).\n\nSIGUIENTE PASO: responde a este correo con 3 franjas que te vengan bien en los próximos días (por ejemplo: «martes por la tarde, jueves de 10 a 12, viernes a primera hora»). Si quieres, añade una línea sobre lo que quieres consultar.\n\nDespués:\n1. En menos de 24 h laborables te proponemos día y hora.\n2. Te enviamos el enlace de Google Meet.\n3. A la hora acordada, entra en el enlace (en el ordenador, en el navegador; en el móvil, con la app de Google Meet).\n\nPuedes cambiarla o cancelarla hasta 1 hora antes y te devolvemos el dinero entero. La llamada no se graba.\nNo es un servicio de urgencias: si algo no va bien, llama al 112 o acude a tu centro de salud.${invite ? `\n\n${invite.text}` : ''}`;
  return { subject, html, text };
}

/** Llamada de 15 min (sin vídeo): pide franjas y el teléfono; la profesional llama con número oculto (fuera de España, Meet solo voz) */
export function callPaidEmail(pro, plan, invite = null) {
  const subject = `Tu llamada con ${pro.short} · elige día y hora`;
  const step = (n, t) => `<tr><td style="vertical-align:top;padding:6px 10px 6px 0"><span style="display:inline-block;width:24px;height:24px;border-radius:50%;background:#F6E0E2;color:#45574C;font-weight:600;font-size:13px;line-height:24px;text-align:center">${n}</span></td><td style="padding:6px 0;font-size:14px;color:#2F3631">${t}</td></tr>`;
  const html = shell(`<p>Hola,</p>
<p>Hemos recibido el pago de tu <b>llamada de 15 minutos</b> con <b>${esc(pro.name)}, ${esc(pro.role)}</b> (${plan.eur} €).</p>
<div style="background:#F6E0E2;border-radius:10px;padding:14px 16px;margin:14px 0">
<p style="margin:0 0 6px;font-family:Georgia,serif;font-size:19px;color:#45574C">Siguiente paso: responde a este correo</p>
<p style="margin:0;font-size:14px">Dinos <b>3 franjas que te vengan bien</b> en los próximos días y <b>el teléfono al que quieres que te llamemos</b>, con el prefijo de tu país (por ejemplo: +34 600 000 000). Si quieres, añade una línea sobre lo que quieres consultar.</p></div>
<p style="margin:16px 0 4px;font-weight:600">Después</p>
<table style="border-collapse:collapse">${step(1, 'En menos de 24 h laborables te proponemos día y hora.')}${step(2, `A esa hora te llama ${esc(pro.short)}, desde un número oculto. Ten el móvil a mano.`)}${step(3, 'Si estás fuera de España, en lugar de llamarte te enviamos un enlace de Google Meet para hablar solo por voz.')}</table>
<p style="font-size:13px;color:#6E6C67;margin-top:16px">Puedes cambiarla o cancelarla hasta 1 hora antes y te devolvemos el dinero entero. La llamada no se graba. Tu teléfono solo lo usamos para esta llamada.</p>
<p style="font-size:13px;color:#6E6C67">No es un servicio de urgencias. Si algo no va bien, llama al 112 o acude a tu centro de salud.</p>${invite ? invite.html : ''}`);
  const text = `Hola,\n\nHemos recibido el pago de tu llamada de 15 minutos con ${pro.name}, ${pro.role} (${plan.eur} €).\n\nSIGUIENTE PASO: responde a este correo con 3 franjas que te vengan bien en los próximos días y el teléfono al que quieres que te llamemos, con el prefijo de tu país (por ejemplo: +34 600 000 000).\n\nDespués:\n1. En menos de 24 h laborables te proponemos día y hora.\n2. A esa hora te llama ${pro.short}, desde un número oculto.\n3. Si estás fuera de España, te enviamos un enlace de Google Meet para hablar solo por voz.\n\nPuedes cambiarla o cancelarla hasta 1 hora antes y te devolvemos el dinero entero. La llamada no se graba. Tu teléfono solo lo usamos para esta llamada.\nNo es un servicio de urgencias: si algo no va bien, llama al 112 o acude a tu centro de salud.${invite ? `\n\n${invite.text}` : ''}`;
  return { subject, html, text };
}

// WhatsApp de Hera (prueba manual): número público de Hera, no de ninguna profesional
export const WA_NUMBER = '34603295806';
export const waLink = (code) => `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(`Hola, he pagado mi consulta por WhatsApp (código ${code}). Mi duda: `)}`;

/** Correo a quien paga una consulta por WhatsApp: el código y el botón para abrir el chat (por si cerró la página) */
export function waPaidEmail(code) {
  const subject = `Tu consulta por WhatsApp · código ${code}`;
  const link = waLink(code);
  const html = shell(`<p>Hola,</p>
<p>Hemos recibido tu pago de <b>9 €</b> por una <b>consulta por WhatsApp</b> con Hera.</p>
<div style="background:#F6E0E2;border-radius:10px;padding:14px 16px;margin:14px 0">
<p style="margin:0 0 4px;font-size:13px;color:#6E6C67">Tu código</p>
<p style="margin:0 0 12px;font-family:Georgia,serif;font-size:28px;letter-spacing:.08em;color:#45574C">${code}</p>
<p style="margin:0;font-size:14px">Siguiente paso: escríbenos tu duda por WhatsApp con este código y dinos si quieres preguntársela a Gonzalo (ginecólogo), Marina (matrona) o Lucía (pediatra).</p></div>
<p style="margin:18px 0"><a href="${link}" style="display:inline-block;background:#25803A;color:#ffffff;text-decoration:none;font-weight:600;border-radius:8px;padding:12px 20px">Abrir WhatsApp</a></p>
<p style="font-size:14px">Si el botón no funciona, escribe al <b>+34 603 29 58 06</b> y pon tu código.</p>
<p style="font-size:14px">La profesional te responde por el mismo chat en menos de 12 h. Tu número no lo ven las profesionales.</p>
<p style="font-size:13px;color:#6E6C67">No es un servicio de urgencias. Si algo no va bien, llama al 112 (o al número de emergencias de tu país) o acude a tu centro de salud.</p>`);
  const text = `Hola,\n\nHemos recibido tu pago de 9 € por una consulta por WhatsApp con Hera.\n\nTu código: ${code}\n\nSiguiente paso: escríbenos tu duda por WhatsApp con este código y dinos si quieres preguntársela a Gonzalo (ginecólogo), Marina (matrona) o Lucía (pediatra).\n\nAbrir WhatsApp: ${link}\nSi no funciona, escribe al +34 603 29 58 06 y pon tu código.\n\nLa profesional te responde por el mismo chat en menos de 12 h. Tu número no lo ven las profesionales.\nNo es un servicio de urgencias: si algo no va bien, llama al 112 (o al número de emergencias de tu país) o acude a tu centro de salud.`;
  return { subject, html, text };
}

/** Único correo a quien deja a medias el pago de una videollamada (vera-backlog#86). Avisado junto al botón de pagar. */
export function videoAbandonedEmail(pro, plan) {
  const lact = plan.eur === 99;
  const what = plan.call ? 'llamada' : lact ? 'asesoría de lactancia' : 'videollamada';
  const link = `https://hera-gine.com/videollamada/?de=medias${lact ? '#lactancia' : plan.call ? `#llamada-${pro.key}` : `#reservar-${pro.key}`}`;
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

// MARK: - Consulta guardada hasta que se paga (vera-backlog: «pendiente de pago»)
// Sin gratuitas ni saldo, la consulta se guarda cifrada (KV hold:ID, 7 días) y NO llega a la profesional.
// Al pagar (metadata hold), se envía sola reproduciendo /ask; a las 3 h, un único recordatorio.
const WORKER_URL = 'https://hera-consultas.tempcheck-app.workers.dev';
const HOLD_DAYS = 7;
const holdSig = async (env, id) => (await hmac(env.HASH_SALT, `hold:${id}`)).slice(0, 16);
const holdLinks = async (env, id) => { const s = await holdSig(env, id); return Object.fromEntries(['suelta', 'bono', 'mensual'].map((p) => [p, `${WORKER_URL}/pagar?c=${id}&s=${s}&plan=${p}`])); };

export function holdEmail(pro, text, links, reminder = false, others = '') {
  // others: la gratis que le queda es con otra especialista (1 gratis por especialista)
  const why = others ? `Tu consulta gratis con ${pro.short} ya la usaste (la que te queda es para ${others})` : 'Ya has usado tus consultas gratis';
  const excerpt = text.length > 220 ? `${text.slice(0, 220).trim()}…` : text;
  const btn = `<p style="margin:16px 0"><a href="${links.suelta}" style="display:inline-block;background:#45574C;color:#ffffff;text-decoration:none;font-weight:600;border-radius:8px;padding:12px 20px">Pagar 9 € y enviarla</a></p>`;
  const quote = `<div style="background:#F6E0E2;border-radius:10px;padding:12px;margin:12px 0;font-size:14px">«${esc(excerpt)}»</div>`;
  const subject = reminder ? `¿Seguimos con tu consulta a ${pro.short}?` : `Tu consulta a ${pro.short} está guardada · falta el pago`;
  const html = reminder
    ? shell(`<p>Hola,</p><p>Tu consulta para ${esc(pro.short)} sigue guardada y esperando el pago:</p>${quote}${btn}<p style="font-size:14px">¿Te quedó alguna duda antes de pagar? Responde a este correo y te contestamos.</p><p style="font-size:13px;color:#6E6C67">Es el único recordatorio. Si no pagas, la borramos en ${HOLD_DAYS} días.</p>`)
    : shell(`<p>Hola,</p><p>${esc(why)}, así que hemos <b>guardado tu consulta</b> para ${esc(pro.name)}, ${esc(pro.role)}:</p>${quote}<p>Para que le llegue, solo falta el pago. En cuanto pagues, se la enviamos y te responde en menos de 24 h; no tienes que volver a escribirla.</p>${btn}<p style="font-size:14px">¿Vas a preguntar más veces? <a href="${links.bono}" style="color:#45574C;font-weight:600">Bono de 5 consultas por 35 €</a> o <a href="${links.mensual}" style="color:#45574C;font-weight:600">ilimitado por 15 € al mes</a>.</p><p style="font-size:13px;color:#6E6C67">Si no pagas en ${HOLD_DAYS} días, borramos tu consulta. No es un servicio de urgencias: si algo no va bien, llama al 112 o acude a tu centro de salud.</p>`);
  const text2 = reminder
    ? `Hola,\n\nTu consulta para ${pro.short} sigue guardada y esperando el pago:\n\n«${excerpt}»\n\nPagar 9 € y enviarla: ${links.suelta}\n\n¿Te quedó alguna duda antes de pagar? Responde a este correo.\nEs el único recordatorio. Si no pagas, la borramos en ${HOLD_DAYS} días.`
    : `Hola,\n\n${why}, así que hemos guardado tu consulta para ${pro.name}, ${pro.role}:\n\n«${excerpt}»\n\nPara que le llegue, solo falta el pago. En cuanto pagues, se la enviamos; no tienes que volver a escribirla.\n\nPagar 9 € y enviarla: ${links.suelta}\nBono de 5 por 35 €: ${links.bono}\nIlimitado por 15 € al mes: ${links.mensual}\n\nSi no pagas en ${HOLD_DAYS} días, borramos tu consulta. No es un servicio de urgencias: si algo no va bien, llama al 112 o acude a tu centro de salud.`;
  return { subject, html, text: text2 };
}

/** Envía una consulta guardada cuando ya está pagada: reproduce /ask con lo guardado (una sola vez) */
async function deliverHold(env, id, ctx) {
  const raw = await env.KV.get(`hold:${id}`, 'json');
  if (!raw) return false;
  await env.KV.delete(`hold:${id}`);
  const held = JSON.parse(await openEmail(env, raw.x));
  const res = await handler.fetch(new Request(`${WORKER_URL}/ask`, { method: 'POST', headers: { Origin: 'https://hera-gine.com', 'Content-Type': 'application/json' }, body: JSON.stringify({ ...held, held: true }) }), env, ctx);
  const j = await res.json().catch(() => ({}));
  if (j.ok) await bump(env, 'guardada_pagada');
  else console.log(`hold ${id}: no se pudo enviar ${JSON.stringify(j)}`);
  return !!j.ok;
}

/** Cron: un único recordatorio a las 3 h a quien aún no ha pagado su consulta guardada */
export async function remindHolds(env) {
  let cursor;
  do {
    const page = await env.KV.list({ prefix: 'hold:', cursor });
    for (const k of page.keys) {
      const raw = await env.KV.get(k.name, 'json');
      if (!raw || raw.rem || Date.now() - raw.at < 3 * 3600000) continue;
      const id = k.name.slice(5);
      const held = JSON.parse(await openEmail(env, raw.x));
      const pro = PROS[held.to] || PROS.gineco;
      await sendMail(env, { to: held.email, replyTo: 'contacto@hera-gine.com', ...holdEmail(pro, held.text, await holdLinks(env, id), true) });
      const left = Math.max(60, Math.floor((raw.at + HOLD_DAYS * 86400000 - Date.now()) / 1000));
      await env.KV.put(k.name, JSON.stringify({ ...raw, rem: 1 }), { expirationTtl: left });
      await bump(env, 'guardada_recordatorio');
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
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

/** Recuadro para invitar (invite.js) en los correos a la usuaria: su enlace personal y WhatsApp */
export function inviteBlock(code) {
  const url = `https://hera-gine.com/?r=${code}`;
  const msg = `Te paso Hera: le pregunté una duda a una profesional y me respondió por escrito. Las 2 primeras consultas son gratis y no piden tarjeta. ${url}`;
  const wa = `https://wa.me/?text=${encodeURIComponent(msg)}`;
  return {
    html: `<div style="margin:16px 0 0;padding:12px 14px;border-radius:10px;background:#EEF2EC;font-size:14px;line-height:1.5"><b>¿Conoces a alguien con dudas parecidas?</b> Pásale tu enlace: si pregunta en Hera, te regalamos 1 consulta.<br><a href="${wa}" style="color:#45574C;font-weight:600">Enviar por WhatsApp</a> <span style="color:#6E6C67">· o copia hera-gine.com/?r=${code}</span></div>`,
    text: `¿Conoces a alguien con dudas parecidas? Pásale tu enlace: si pregunta en Hera, te regalamos 1 consulta. ${url}`,
  };
}

export function relayEmail(pro, role, id, body, nAttach, rate = null, invite = null) {
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
  const html = shell(`${head}<div style="white-space:normal">${nl2br(body)}</div>${att}${rate ? rate.html : ''}${video ? video.html : ''}${invite ? invite.html : ''}<p style="font-size:12px;color:#8A8A8E;margin-top:18px">${esc(foot)}</p>`);
  const text = `${role === 'p' ? `${pro.name}, ${pro.role}, te responde:` : `La usuaria de la consulta #${id.toUpperCase()} ha escrito:`}\n\n${body}\n\n${nAttach ? `[${nAttach} adjunto(s)]\n\n` : ''}${rate ? `${rate.text}\n\n` : ''}${video ? `${video.text}\n\n` : ''}${invite ? `${invite.text}\n\n` : ''}${foot}`;
  return { html, text };
}

/** Aviso al profesional cuando una consulta lleva 16 h sin respuesta */
export function reminderEmail(pro, id) {
  const html = shell(`<p>Hola, ${esc(pro.short)}:</p><p>La consulta <b>#${id.toUpperCase()}</b> lleva 16 horas sin respuesta y el plazo que damos a las usuarias es de 24 h.</p>
<p>Puedes responder a este mismo correo y le llegará a ella.</p>`);
  return { html, text: `Hola, ${pro.short}: la consulta #${id.toUpperCase()} lleva 16 horas sin respuesta (plazo: 24 h). Puedes responder a este mismo correo y le llegará a la usuaria.` };
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

const handler = {
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
        if (PLANS[plan].wa) {
          const code = await waCode(s.id);
          const to = s.customer_details?.email || s.customer_email;
          const tel = normalizePhone(s.customer_details?.phone || '');
          if (tel) await addWaConsult(env, { phone: tel, pro: '', limit: 0, bump, paid: true, code });
          if (to) await sendMail(env, { to, replyTo: 'contacto@hera-gine.com', ...waPaidEmail(code) });
          if (s.metadata?.src === 'ads') { const ak = /_latam$/.test(String(s.metadata?.camp || '')) ? 'latam' : 'anuncio'; await bump(env, `${ak}_pago:${plan}`); await bump(env, `${ak}_eur`, madridDay(), PLANS[plan].eur); }
          await notify(env, `Pago · WhatsApp · 9 € · código ${code}${s.metadata?.src === 'ads' ? ' · desde anuncio' : ''}${s.livemode ? '' : ' · prueba'}`,
            `Consulta por WhatsApp pagada (9 €${s.livemode ? '' : ', modo de prueba'}).\n\nCódigo: ${code}\nMóvil: ${tel ? maskPhone(tel) : 'no lo dio'}\n\nYa está en el panel («Consultas por WhatsApp», Pagada · ${code}). Cuando te escriba con ese código, pásale la duda a la profesional que elija.`, sendMail);
          return;
        }
        if (PLANS[plan].video) {
          const pro = PROS[s.metadata?.pro] || PROS.matrona;
          const to = s.customer_details?.email || s.customer_email;
          // Con su enlace para invitar (invite.js): quien paga una videollamada es quien más confía
          const h0 = /^[0-9a-f]{64}$/.test(String(s.metadata?.h || '')) ? s.metadata.h : '';
          const inv = to && h0 ? inviteBlock(await inviteCode(env, h0, await sealEmail(env, to))) : null;
          if (to) await sendMail(env, { to, replyTo: 'contacto@hera-gine.com', ...videoPaidEmail(pro, PLANS[plan], inv) });
          if (s.metadata?.src === 'ads') { const ak = /_latam$/.test(String(s.metadata?.camp || '')) ? 'latam' : 'anuncio'; await bump(env, `${ak}_pago:${plan}`); await bump(env, `${ak}_eur`, madridDay(), PLANS[plan].eur); }
          const dash = `https://dashboard.stripe.com/${s.livemode ? '' : 'test/'}${s.payment_intent ? `payments/${s.payment_intent}` : 'payments'}`;
          await notify(env, `Pago · ${PLANS[plan].call ? 'Llamada' : PLANS[plan].eur === 99 ? 'Asesoría de lactancia' : 'Videollamada'} con ${pro.short} · ${PLANS[plan].eur} €${s.metadata?.src === 'ads' ? ' · desde anuncio' : ''}${s.livemode ? '' : ' · prueba'}`,
            `${PLANS[plan].label} con ${pro.name}: ${PLANS[plan].eur} €${s.livemode ? '' : ' (modo de prueba, sin dinero real)'}\n\nLe hemos enviado el correo con los pasos: responderá con 3 franjas a contacto@hera-gine.com.\nSiguiente: cuadrar la hora con ${pro.short} y proponérsela en menos de 24 h laborables; después, ${PLANS[plan].call ? `que ${pro.short} la llame a esa hora con número oculto (fuera de España, enlace de Meet solo voz). Su teléfono viene en su respuesta` : 'enviar el enlace de Google Meet'}.\nSi no responde, su correo está en el pago de Stripe.\n\nVer en Stripe: ${dash}`, sendMail);
          return;
        }
        if (s.metadata?.src === 'ads') { const ak = /_latam$/.test(String(s.metadata?.camp || '')) ? 'latam' : 'anuncio'; await bump(env, `${ak}_pago:${plan}`); await bump(env, `${ak}_eur`, madridDay(), PLANS[plan].eur); }
        if (/^[a-z0-9]{8}$/.test(String(s.metadata?.hold || ''))) await deliverHold(env, s.metadata.hold, ctx);
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
    // Correos que no llegan (Resend avisa de rebotes y retrasos): lista en el panel
    if (request.method === 'POST' && url.pathname === '/resend/webhook') return new Response(null, { status: await handleResendWebhook(env, request, { notify: (e, s, t) => notify(e, s, t, sendMail), bump }) });
    if (request.method === 'POST' && url.pathname === '/stripe/webhook') return new Response(null, { status: await handleWebhook(env, request, payHooks) });
    // Enlace de pago del correo «consulta guardada»: abre Stripe para esa consulta (o avisa si ya no está)
    if (request.method === 'GET' && url.pathname === '/pagar') {
      const id = String(url.searchParams.get('c') || ''); const plan = String(url.searchParams.get('plan') || 'suelta');
      const raw = /^[a-z0-9]{8}$/.test(id) && PLANS[plan] && !PLANS[plan].video && url.searchParams.get('s') === await holdSig(env, id) ? await env.KV.get(`hold:${id}`, 'json') : null;
      if (!raw || !env.STRIPE_SECRET_KEY) return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font:16px/1.5 -apple-system,sans-serif;max-width:32em;margin:40px auto;padding:0 18px;color:#2F3631"><h1 style="font:400 28px Georgia,serif">Esta consulta ya no está pendiente</h1><p>O ya se ha enviado, o han pasado más de ${HOLD_DAYS} días y se ha borrado. Puedes escribirla de nuevo en <a href="https://hera-gine.com/#ask" style="color:#45574C">hera-gine.com</a>.</p></body>`, { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } });
      const held = JSON.parse(await openEmail(env, raw.x));
      try {
        const u = await createCheckout(env, { email: held.email, plan, h: raw.h, origin: 'https://hera-gine.com', back: 'web', ad: held.src === 'ads', camp: /^[a-z0-9_]{1,24}$/.test(String(held.camp || '')) ? held.camp : '', hold: id, pro: PROS[raw.to] ? raw.to : '' });
        await bump(env, `pago_inicio:${plan}`);
        return Response.redirect(u, 303);
      } catch (e) { console.log(e.message); return new Response('No se ha podido abrir el pago. Inténtalo en un rato.', { status: 502 }); }
    }
    // Consulta por WhatsApp: abre el pago de Stripe (pide correo y móvil) y vuelve a hera-gine.com/whatsapp/
    if (request.method === 'GET' && url.pathname === '/wa/pagar') {
      const back = 'https://hera-gine.com/whatsapp/';
      if (!env.STRIPE_SECRET_KEY) return Response.redirect(`${back}?pago=error`, 303);
      if (await rateLimited(env, request.headers.get('CF-Connecting-IP'))) return Response.redirect(`${back}?pago=error`, 303);
      try {
        const h = [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('');
        const camp = /^[a-z0-9_]{1,24}$/.test(url.searchParams.get('camp') || '') ? url.searchParams.get('camp') : '';
        const to = await createCheckout(env, { email: '', plan: 'whatsapp', h, origin: 'https://hera-gine.com', back: 'wa', ad: url.searchParams.get('src') === 'ads', camp });
        if (url.searchParams.get('t') !== '1') {
          await bump(env, 'pago_inicio:whatsapp');
          await record(env, { e: 'whatsapp_pagar', p: await personTag(env, request, madridDay(), url.searchParams.get('p') || '') }, sendMail, ctx);
        }
        return Response.redirect(to, 303);
      } catch (e) { console.log(e.message); return Response.redirect(`${back}?pago=error`, 303); }
    }
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
    // Corregir el correo de una consulta (panel → «Corregir el correo»): cuando rebotó por estar mal escrito y la usuaria
    // ha confirmado el bueno. Cambia a dónde va el hilo y, si se marca, le reenvía lo que no le llegó (Resend guarda los
    // correos enviados; Hera solo guarda sus identificadores). Lo que la profesional responda después ya va al correo nuevo.
    // Consultas por WhatsApp (plan A): añadir una y cambiar su estado desde el panel
    if (request.method === 'POST' && (url.pathname === '/panel/wa' || url.pathname === '/panel/wa/estado')) {
      const f = await request.formData().catch(() => null);
      if (!f || !env.DASH_KEY || f.get('k') !== env.DASH_KEY) return new Response('Not found', { status: 404 });
      let flag = '';
      if (url.pathname === '/panel/wa') {
        const pro = String(f.get('pro') || '');
        if (!PROS[pro]) flag = 'pro';
        // WhatsApp es de pago desde la primera: si ese número ya pagó, se le asigna la profesional a esa fila; si no, «Toca pagar»
        else if (!(await assignPaidRow(env, f.get('tel'), pro))) { const r = await addWaConsult(env, { phone: f.get('tel'), pro, limit: 0, bump }); if (r.error) flag = 'tel'; }
      } else await setWaState(env, String(f.get('id') || ''), String(f.get('state') || ''));
      return new Response(null, { status: 303, headers: { Location: `/panel?k=${encodeURIComponent(env.DASH_KEY)}${flag ? `&wa=${flag}` : ''}#wa`, 'referrer-policy': 'no-referrer' } });
    }
    // Quitar un correo de la lista «Correos que no han llegado»
    if (request.method === 'POST' && url.pathname === '/panel/fallo') {
      const f = await request.formData().catch(() => null);
      if (!f || !env.DASH_KEY || f.get('k') !== env.DASH_KEY) return new Response('Not found', { status: 404 });
      const eid = String(f.get('eid') || '');
      if (/^[0-9a-f-]{36}$/.test(eid)) await env.KV.delete(`fail:${eid}`);
      return new Response(null, { status: 303, headers: { Location: `/panel?k=${encodeURIComponent(env.DASH_KEY)}`, 'referrer-policy': 'no-referrer' } });
    }
    if (request.method === 'POST' && url.pathname === '/panel/correo') {
      // (si la profesional aún no ha respondido, no hay respuesta que reenviar: le llegará al correo nuevo cuando responda)
      const f = await request.formData().catch(() => null);
      const page = (msg, ok) => new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><body style="font:16px/1.5 -apple-system,sans-serif;max-width:560px;margin:40px auto;padding:0 16px;color:#2F3631"><div style="font-size:17px;color:${ok ? '#45574C' : '#B3261E'}">${msg}</div><p><a href="/panel?k=${encodeURIComponent(String(f?.get('k') || ''))}" style="color:#45574C">Volver al panel</a></p>`, { status: ok ? 200 : 400, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex', 'referrer-policy': 'no-referrer' } });
      if (!f || !env.DASH_KEY || f.get('k') !== env.DASH_KEY) return new Response('Not found', { status: 404 });
      const id = String(f.get('id') || '').trim().replace(/^#/, '').toLowerCase();
      const newEmail = String(f.get('email') || '').trim();
      const norm = normalizeEmail(newEmail);
      if (!/^[a-z0-9]{8}$/.test(id)) return page('El número de consulta no es válido. Son 8 letras y números, como T6NVC8NM.', false);
      if (!norm) return page('El correo no es válido.', false);
      const t = await loadThread(env, id);
      if (!t) return page(`No encuentro la consulta #${id.toUpperCase()} (o tiene más de 30 días).`, false);
      const oldEmail = (await openEmail(env, t.u)).trim().toLowerCase();
      // Identificadores: los guardados (consultas desde el 14 nov) y los que se peguen de Resend (consultas anteriores)
      const pasted = [...new Set(String(f.get('ids') || '').toLowerCase().match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g) || [])];
      const ids = [...new Set([...(t.ou || []), ...pasted])];
      t.u = await sealEmail(env, newEmail);
      t.uh = (await hmac(env.HASH_SALT, norm)).slice(0, 24);
      let resent = 0; const skipped = [];
      if (f.get('resend') && ids.length && env.RESEND_API_KEY && env.DRY_RUN !== '1') {
        const replyTo = await relayAddress(env, 'u', id);
        const oldest = [];
        for (const rid of ids) {
          try {
            const r = await fetch(`https://api.resend.com/emails/${rid}`, { headers: { Authorization: `Bearer ${env.RESEND_READ_KEY || env.RESEND_API_KEY}` } });
            if (r.status === 401 || r.status === 403) { skipped.push(`${rid.slice(0, 8)}: la clave de Resend no permite leer correos enviados (falta el secreto RESEND_READ_KEY, una clave con acceso completo)`); continue; }
            const m = r.ok ? await r.json() : null;
            if (!m) { skipped.push(`${rid.slice(0, 8)}: Resend no lo encuentra (${r.status})`); continue; }
            const to = [].concat(m.to || []).map((x) => String(x).trim().toLowerCase());
            // Solo correos de esta consulta: enviados a su correo anterior o con su número en el asunto
            if (!to.includes(oldEmail) && !String(m.subject || '').toUpperCase().includes(`#${id.toUpperCase()}`)) { skipped.push(`${rid.slice(0, 8)}: es de otra consulta`); continue; }
            oldest.push(m);
          } catch (e) { skipped.push(`${rid.slice(0, 8)}: ${e.message}`); }
        }
        oldest.sort((x, y) => String(x.created_at).localeCompare(String(y.created_at)));
        const sentIds = [];
        for (const m of oldest) {
          const ok = await sendMail(env, { to: newEmail, from: m.from, replyTo, subject: m.subject, html: m.html || undefined, text: m.text || undefined });
          if (ok) { resent += 1; if (ok.id) sentIds.push(ok.id); if (m.id) await env.KV.delete(`fail:${m.id}`); }
        }
        if (sentIds.length) t.ou = sentIds.slice(-10);
      }
      await saveThread(env, t);
      await bump(env, 'correo_corregido');
      const tail = f.get('resend')
        ? (resent ? ` Le hemos reenviado <b>${resent} ${resent === 1 ? 'correo' : 'correos'}</b> (sin adjuntos: si los había, que la profesional se los reenvíe).` : ' No había nada que reenviarle: si la consulta es de antes del 15 de noviembre, pega los identificadores de Resend de los correos rebotados.')
          + (skipped.length ? `<br><br>No he reenviado:<br>${skipped.map((x) => `· ${esc(x)}`).join('<br>')}` : '')
        : '';
      const pend = t.a ? '' : ` <b>${esc((PROS[t.p] || {}).short || 'La profesional')} aún no ha respondido</b>: cuando lo haga, la respuesta le llegará directamente a este correo.`;
      return page(`<p>Hecho: la consulta #${id.toUpperCase()} ya va a <b>${esc(newEmail)}</b>.${pend}${tail}</p><p style="font-size:14px;color:#6E6C67">Lo que la profesional responda a partir de ahora le llegará a este correo, y ella puede contestar desde él.</p>`, true);
    }
    // Conversiones para Google Ads (subida programada desde una URL, con usuario y contraseña): solo códigos de clic y horas
    if (request.method === 'GET' && url.pathname === '/ads/conversiones.csv') {
      const [, pass = ''] = atob((request.headers.get('Authorization') || '').replace(/^Basic\s+/i, '') || 'Og==').split(':');
      if (!env.DASH_KEY || pass !== env.DASH_KEY) return new Response('Unauthorized', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="Hera"' } });
      const rows = [];
      let cursor;
      do {
        const page = await env.KV.list({ prefix: 'conv:', cursor });
        for (const k of page.keys) {
          const v = await env.KV.get(k.name, 'json'); if (!v) continue;
          const ts = Number(k.name.split(':')[1]);
          // Hora de Madrid con su desfase (+01:00 / +02:00): el conector nuevo de Google no lee la línea «Parameters:TimeZone»
          const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'longOffset' }).formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
          const off = (p.timeZoneName || 'GMT+01:00').replace('GMT', '') || '+00:00';
          rows.push(`${v.g},${v.n},${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}${off}`);
        }
        cursor = page.list_complete ? null : page.cursor;
      } while (cursor);
      return new Response(['Google Click ID,Conversion Name,Conversion Time', ...rows].join('\n') + '\n', { headers: { 'content-type': 'text/csv; charset=utf-8', 'cache-control': 'no-store' } });
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
    // Enlace de canal (?via=ig_marina…): solo letras, números y guion bajo
    const via = /^[a-z0-9_]{1,20}$/.test(String(body.via || '')) ? body.via : '';

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
        const checkoutUrl = await createCheckout(env, { email: String(body.email).trim(), plan: body.plan, h: await hmac(env.HASH_SALT, norm), origin, back: ['web', 'video'].includes(body.back) ? body.back : 'app', ad: body.src === 'ads', pro: vpro, camp: /^[a-z0-9_]{1,24}$/.test(String(body.camp || '')) ? body.camp : '', hold: /^[a-z0-9]{8}$/.test(String(body.hold || '')) && await env.KV.get(`hold:${body.hold}`) ? body.hold : '' });
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
      // 2 gratis en total, como mucho 1 por especialista (Noza, 16 nov). fp = especialistas ya usadas gratis (los registros antiguos no lo tienen)
      const fp = Array.isArray(rec.fp) ? rec.fp : [];
      const samePro = !test && rec.n < limit && fp.includes(body.to);
      const others = samePro ? Object.values(PROS).filter((x) => !fp.includes(x.key)).map((x) => x.short).join(' o ') : '';
      if (!test && !unlimited && (rec.n >= limit || samePro) && credits <= 0) {
        if (body.team !== true) {
          if (body.src === 'ads') await bump(env, /_latam$/.test(String(body.camp || '')) ? 'latam_limite' : 'anuncio_limite');
          await bump(env, 'gratuitas_agotadas');
          await record(env, { e: 'gratuitas_agotadas', p: await personTag(env, request, madridDay(), body.p) }, sendMail, ctx);
        }
        // Pendiente de pago: se guarda cifrada y se le manda el enlace (no llega a la profesional hasta que pague)
        if (pay && env.RELAY === '1' && body.held !== true) {
          const hid = newThreadId();
          const held = { email: q.email, to: body.to, text: q.text, context: q.context, situation: q.situation, follow: body.follow === true, src: body.src, camp: body.camp, ref: body.ref, p: body.p, team: body.team === true };
          await env.KV.put(`hold:${hid}`, JSON.stringify({ x: await sealEmail(env, JSON.stringify(held)), at: Date.now(), h, to: body.to, rem: 0 }), { expirationTtl: HOLD_DAYS * 86400 });
          const links = await holdLinks(env, hid);
          await sendMail(env, { to: q.email, replyTo: 'contacto@hera-gine.com', ...holdEmail(pro, q.text, links, false, others) });
          if (body.team !== true) {
            await bump(env, 'consulta_guardada');
            if (env.COPY_TO) {
              const who = env.COPY_EMAIL === '1' ? `<p style="font-size:13px;color:#6E6C67">Correo de la usuaria: <b>${esc(q.email)}</b></p>` : '';
              const tc = teamCopy({ subject: `Consulta · ${pro.short} · #${hid.toUpperCase()} · PENDIENTE DE PAGO`, intro: `Consulta guardada para <b>${esc(pro.name)}</b>. <b style="color:#B3261E">Aún no ha pagado</b>: a ${esc(pro.short)} no le ha llegado.`, body: q.text,
                extra: `${who}<p style="font-size:13px;color:#6E6C67">Le hemos enviado el enlace de pago. Recordatorio a las 3 h si no paga. Se borra en ${HOLD_DAYS} días.${files.length ? ' Los adjuntos no se guardan: podrá enviarlos respondiendo al correo de la profesional.' : ''}</p>` });
              await sendMail(env, { to: env.COPY_TO, from: TEAM_FROM, replyTo: 'contacto@hera-gine.com', ...tc });
            }
          }
          return reply(200, { limit: true, used: rec.n, freeLimit: limit, pay: true, held: hid, ...(samePro ? { same: others } : {}) });
        }
        return reply(200, { limit: true, used: rec.n, freeLimit: limit, ...(pay ? { pay: true } : {}), ...(samePro ? { same: others } : {}) });
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
      // La consulta se guarda ya (antes de contadores y correos): si la usuaria sale de la página y la petición se corta,
      // la respuesta de la profesional igual le llega (B45WUAX3, 18 nov). Al final se vuelve a guardar completa.
      const baseThread = relay ? { id, p: pro.key || body.to, u: await sealEmail(env, q.email), uh: (await hmac(env.HASH_SALT, norm)).slice(0, 24),
        sp: pm.subject, su: `Tu consulta a ${pro.short} · Hera #${id.toUpperCase()}`, rp: [], ru: [], c: Date.now(), a: 0, rem: false, n: 0, h, ...(body.follow === true ? { f: 1 } : {}) } : null;
      if (baseThread) await saveThread(env, baseThread);
      const now = new Date().toISOString();
      // Primero se gastan las gratuitas y después las pagadas
      const paid = !test && !unlimited && (rec.n >= limit || samePro);
      const n = test || unlimited || paid ? rec.n : rec.n + 1;
      let creditsLeft = credits;
      // Cuántas consultas lleva este correo en total (gratis, pagadas e ilimitadas), para el aviso al equipo
      const nth = (rec.all ?? rec.n) + 1;
      const prevAt = rec.last;
      if (!test) {
        if (paid) creditsLeft = await spendCredit(env, h);
        const fpNext = !unlimited && !paid && !fp.includes(body.to) ? [...fp, body.to] : fp;
        await env.KV.put(key, JSON.stringify({ n, first: rec.first || now, last: now, all: nth, ...(fpNext.length ? { fp: fpNext } : {}) }));
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
          // Conversión para Google Ads: el código del clic (gclid, de esta misma visita) y la hora, 90 días; Google lo recoge del CSV
          if (fromAd && /^[\w-]{10,200}$/.test(String(body.gclid || ''))) await env.KV.put(`conv:${Date.now()}:${id}`, JSON.stringify({ g: body.gclid, n: 'Consulta enviada' }), { expirationTtl: 90 * 86400 });
          // Enlace de canal (?via=…, p. ej. ig_marina): cuántas consultas trae cada uno
          if (via) { await bump(env, `consulta_via:${via}`); await record(env, { e: `via_visita:${via}`, p: tag, note: 'envió una consulta' }, sendMail, ctx); }
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
        const tc = teamCopy({ subject: `Consulta · ${pro.short} · #${id.toUpperCase()}${files.length ? ` · ${files.length} ${files.length === 1 ? 'adjunto' : 'adjuntos'}` : ''}${body.src === 'ads' ? (/_latam$/.test(String(body.camp || '')) ? ' · desde anuncio (Latinoamérica)' : ' · desde anuncio') : ''}${via ? ` · desde ${via}` : ''}${paid ? ' · pagada' : ''}${nth > 1 ? ` · ${nth}.ª consulta` : ''}`,
          intro: `Nueva consulta para <b>${esc(pro.name)}</b>${body.src === 'ads' ? ' (llegó desde un anuncio)' : ''}.${nth > 1 ? ` <b>Es su ${nth}.ª consulta</b>${prevAt ? ` (la anterior, el ${new Date(prevAt).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short' })})` : ''}.` : ''}`, body: q.text, extra, nFiles: files.length, withFiles });
        await sendMail(env, { to: bcc, from: TEAM_FROM, replyTo: 'contacto@hera-gine.com', ...tc, ...(withFiles ? { attachments: files } : {}) });
      }
      const remaining = Math.max(0, limit - n);
      const paidLeft = remaining === 0 && !unlimited && creditsLeft >= 0 && (paid || credits > 0)
        ? (creditsLeft === 0 ? 'Era la última consulta de tu saldo' : `Te ${creditsLeft === 1 ? 'queda 1 consulta' : `quedan ${creditsLeft} consultas`} en tu saldo`) : '';
      const usedPros = test ? fp : (!unlimited && !paid && !fp.includes(body.to) ? [...fp, body.to] : fp);
      const nextWith = remaining > 0 && usedPros.length ? Object.values(PROS).filter((x) => !usedPros.includes(x.key)).map((x) => x.short).join(' o ') : '';
      const cm = confirmEmail(pro, q, remaining, id, unlimited, subscriber ? 'Tienes el plan ilimitado: una consulta nueva al día' : paidLeft || (nextWith && remaining === 1 ? `Te queda 1 consulta gratuita, con ${nextWith}` : ''));
      const sentU = await sendMail(env, { to: q.email, replyTo: relay ? await relayAddress(env, 'u', id) : pro.email, ...cm });
      // Sin relay no hay hilo que seguir (ni recordatorios): no se guarda nada más
      if (relay) {
        await saveThread(env, { ...baseThread, su: cm.subject, ...(sentU?.id ? { ou: [sentU.id] } : {}), ...(rf ? { rf } : {}) });
      }
      return reply(200, { ok: true, remaining, freeLimit: limit, ...(nextWith ? { next: nextWith, fp: usedPros } : {}), ...(unlimited ? { unlimited: true } : {}), ...(paid || credits > 0 ? { credits: creditsLeft } : {}), ...(relay ? { id } : {}), dryRun: env.DRY_RUN === '1' });
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
    if (isAutomatic(message.headers)) {
      // Respuestas automáticas: se descartan. Si viene de la profesional, avisamos por si era una respuesta de verdad.
      if (dest.role === 'p') await notify(env, `Error · respuesta no entregada · #${dest.id.toUpperCase()}`, `Ha llegado un correo de ${message.from} para la consulta #${dest.id.toUpperCase()}, pero parece una respuesta automática (fuera de la oficina) y no se le ha pasado a la usuaria.\n\nSi era una respuesta de verdad, que la profesional la reenvíe a la misma dirección.`, sendMail);
      return;
    }
    let r;
    try { r = await relayIncoming(env, t, dest.role, message.raw, message.from); } catch (e) { r = { ok: false, why: `error: ${e.message}` }; }
    if (!r?.ok) {
      const WHY = { empty: 'el mensaje llegó vacío (sin texto propio ni adjuntos: quizá escribió dentro del texto citado)', send: 'falló el envío (Resend)', sender: 'lo envió otra dirección distinta de la de la usuaria', pro: 'la consulta no tiene profesional' };
      const why = WHY[r?.why] || r?.why || 'desconocido';
      await bump(env, 'relay_fallo');
      await notify(env, `Error · mensaje no entregado · #${dest.id.toUpperCase()}`, `No se ha podido pasar un mensaje de la consulta #${dest.id.toUpperCase()} (${dest.role === 'p' ? 'de la profesional a la usuaria' : 'de la usuaria a la profesional'}).\n\nMotivo: ${why}\nRemitente: ${message.from}`, sendMail);
      // La profesional recibe el rebote con el motivo, para que lo vuelva a enviar
      if (dest.role === 'p' && r?.why !== 'send') message.setReject(`Hera no ha podido entregar tu respuesta: ${why}. Escribe tu respuesta encima del texto citado y vuelve a enviarla.`);
    }
  },

  /** Cada hora: recordatorio al profesional si una consulta lleva 16 h sin respuesta */
  async scheduled(event, env) {
    await remindOverdue(env);
    await sendFeedbackDue(env, sendMail, PROS);
    await hourlyDigest(env, sendMail);
    await remindHolds(env);
  },
};
export default handler;

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
  // Primera respuesta: su enlace para invitar (invite.js), aunque no valore
  const invite = role === 'p' && !t.a && t.h && t.p !== 'prueba' ? inviteBlock(await inviteCode(env, t.h, t.u)) : null;
  const { html, text } = relayEmail(pro, role, t.id, msg.body || '(Sin texto: mira el archivo adjunto.)', msg.attachments.length, rate, invite);
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
  // Lo que le enviamos a la usuaria: solo el identificador de Resend, para poder reenviárselo si rebotó (panel)
  if (toUser && sent.id) t.ou = [...(t.ou || []), sent.id].slice(-10);
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
      // Consulta repetida (la misma duda enviada dos veces seguidas) ya contestada en la otra: no cuenta como pendiente
      const tt = await loadThread(env, k.name.slice(2));
      if (tt && await answeredTwin(env, tt)) continue;
      out.pendientes[m.p] = (out.pendientes[m.p] || 0) + 1;
      if (Date.now() - m.c > 24 * 3600000) out.fuera_plazo[m.p] = (out.fuera_plazo[m.p] || 0) + 1;
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return out;
}

const TWIN_WINDOW = 3600000;
async function answeredTwin(env, t) {
  const u = String(t.uh || '').slice(0, 8);
  let cursor;
  do {
    const page = await env.KV.list({ prefix: 't:', cursor });
    for (const k of page.keys) {
      const m = k.metadata || {};
      // Gemela: misma profesional, enviada con menos de 1 h de diferencia y respondida después de esta
      if (k.name === `t:${t.id}` || m.p !== t.p || !(m.a >= t.c) || Math.abs((m.c || 0) - t.c) > TWIN_WINDOW) continue;
      if (m.u ? m.u === u : (await loadThread(env, k.name.slice(2)))?.uh === t.uh) return true;
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return false;
}

export async function remindOverdue(env) {
  let cursor; let n = 0;
  do {
    const page = await env.KV.list({ prefix: 't:', cursor });
    for (const k of page.keys) {
      const m = k.metadata || {};
      if (!m.p || m.a || m.r || Date.now() - m.c < 16 * 3600000) continue;
      const t = await loadThread(env, k.name.slice(2));
      if (!t || t.a || t.rem) continue;
      const pro = PROS[t.p] || (t.p === 'prueba' && env.COPY_TO ? { short: 'Prueba', email: env.COPY_TO } : null);
      if (!pro) continue;
      // La misma usuaria hizo otra consulta a la misma profesional y esa ya está respondida después de esta:
      // casi siempre es la misma duda enviada dos veces (la profesional contestó en el otro hilo). Sin recordatorio.
      if (await answeredTwin(env, t)) { t.rem = true; await saveThread(env, t); await bump(env, 'recordatorio_omitido'); continue; }
      const { html, text } = reminderEmail(pro, t.id);
      const sent = await sendMail(env, { to: pro.email, replyTo: await relayAddress(env, 'p', t.id), subject: `Re: ${t.sp}`, refs: t.rp, html, text });
      if (sent) { t.rem = true; await saveThread(env, t); if (t.p !== 'prueba') await bump(env, `recordatorio:${t.p}`); n++; }
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return n;
}
