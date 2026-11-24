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
import { isEvent, isDevice, record, personTag, hourlyDigest, notify, LINK_NAME } from './activity.js';
import { handleResendWebhook } from './bounces.js';
import { addWaConsult, setWaState, assignPaidRow, maskPhone, normalizePhone } from './whatsapp.js';
// Precio de WhatsApp en los textos, sacado del plan (4,50 € en Black Friday)
const eurText = (eur) => `${Number(eur).toFixed(2).replace('.', ',').replace(/,00$/, '')} €`;
const WA_PRICE = eurText(PLANS.whatsapp.eur);
/** Precio de WhatsApp para quien visita: la mitad en Argentina (por la IP) */
const waEur = (request) => (request.cf?.country === 'AR' && PLANS.whatsapp.ar ? PLANS.whatsapp.ar.eur : PLANS.whatsapp.eur);
import { PLANS, VIDEO_PROS, paymentsOn, createCheckout, sessionStatus, handleWebhook, getBalance, spendCredit, markDay, waCode, isAcomp } from './stripe.js';
import { newThreadId, relayAddress, parseRelayAddress, sealEmail, openEmail, saveThread, loadThread, parseIncoming, isAutomatic } from './relay.js';

/** Enlaces de amigas: consultas gratis y hasta cuándo (Noza, 20 nov) */
// Enlaces que siguen con las 2 gratis aunque no haya gratis para nadie más (NO_FREE): profesionales y grupo de Maite
export const FREE_VIA = ['ig_marina', 'reddit_gonzalo', 'x4d', 'p9t', 'g8w'];
// Enlaces de socios (Noza, 23 nov): precio fijo, sin gratis y fuera de la prueba 9 € / 29 €. pago = 9 €, prio = 29 € (menos de 6 h)
export const PARTNER_LINKS = { lidia: 'pago', jaime: 'pago', atempocare: 'pago' }; // 24 nov: los tres a 5 €, como todos // lidia y jaime: influencers; atempocare: clínica
export const FRIEND_LINKS = { q7m: { free: 5, until: '2026-12-31T23:59:59+01:00' }, k2v: { free: 5, until: '2026-12-31T23:59:59+01:00' } }; // q7m Maite, k2v Noza

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

/** Enlaces «Pasársela a…» del correo de la profesional (firmados, de un solo uso) */
async function reassignLinks(env, id, fromKey) {
  const s = (await hmac(env.HASH_SALT, `reasignar:${id}`)).slice(0, 16);
  return Object.values(PROS).filter((x) => x.key !== fromKey).map((x) => ({ short: x.short, role: x.role, url: `${WORKER_URL}/reasignar?t=${id}&to=${x.key}&s=${s}` }));
}
const reassignHtml = (links) => (links?.length ? `<!--ra--><p style="font-size:13px;color:#6E6C67;border-top:1px solid #EFECE4;padding-top:10px;margin-top:14px">¿No es de tu área? ${links.map((l) => `<a href="${l.url}" style="color:#45574C;font-weight:600">Pasársela a ${esc(l.short)} (${esc(l.role)})</a>`).join(' · ')}</p><!--/ra-->` : '');
const reassignText = (links) => (links?.length ? `\n\n¿No es de tu área? ${links.map((l) => `Pasársela a ${l.short}: ${l.url}`).join(' · ')}` : '');

export function proEmail(pro, q, id = '', relay = true, links = []) {
  // Prioritaria: plazo de 6 h, con la hora límite (Madrid) en el asunto
  const due = q.prio ? new Date(Date.now() + 6 * 3600000).toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' }) : '';
  const subject = `${q.prio ? `PRIORITARIA · responder antes de las ${due} · ` : ''}Consulta Hera${id ? ` #${id.toUpperCase()}` : ''}${q.context ? ` · ${q.context}` : ''}${q.via ? ` · vía ${q.via}` : ''}`;
  const html = shell(`<p>Nueva consulta para <b>${esc(pro.name)}</b>.${q.via ? ` Llegó desde ${esc(q.via)}.` : ''}</p>${q.prio ? `<p style="background:#FFF6D6;border-radius:8px;padding:8px 12px;font-size:14px"><b>${q.acomp ? 'Acompañamiento mensual' : 'Consulta prioritaria (29 €)'}: responde antes de las ${due}</b> (plazo de 6 h). Si te adjunta analíticas o informes, revísalos y dile qué pruebas pedir y cuándo ir a consulta.</p>` : ''}
<div style="background:#F6E0E2;border-radius:10px;padding:14px;margin:12px 0">${nl2br(q.text)}</div>
${q.context ? `<p style="font-size:13px;color:#6E6C67">Sobre: ${esc(q.context)}</p>` : ''}
${q.situation ? `<p style="font-size:13px;color:#6E6C67">Situación: ${nl2br(q.situation)}</p>` : ''}
${q.files ? `<p style="font-size:13px;color:#6E6C67">Incluye ${q.files} ${q.files === 1 ? 'archivo adjunto' : 'archivos adjuntos'}. Hera no los guarda: solo están en este correo.</p>` : ''}
${relay ? `<p style="font-size:13px;color:#6E6C67"><b>Para contestar, responde a este correo</b> desde el móvil o el ordenador. Tu respuesta le llegará a la usuaria desde ${esc(pro.email)}: tu correo personal no se muestra. Si ella vuelve a escribir, te llegará en esta misma conversación. Plazo comprometido: 24 h.</p>`
    : `<p style="font-size:13px;color:#6E6C67">Responde a este correo para contestar directamente a la usuaria (${esc(q.email)}). Plazo comprometido: 24 h.</p>`}${reassignHtml(links)}`);
  const text0 = `${q.prio ? `${q.acomp ? 'ACOMPAÑAMIENTO MENSUAL' : 'CONSULTA PRIORITARIA (29 €)'}: responde antes de las ${due} (plazo de 6 h).\n\n` : ''}Nueva consulta para ${pro.name}\n\n${q.text}\n\n${q.context ? `Sobre: ${q.context}\n` : ''}${q.situation ? `Situación: ${q.situation}\n` : ''}\n${relay ? `Para contestar, responde a este correo: tu respuesta le llegará a la usuaria desde ${pro.email}, sin mostrar tu correo personal. Plazo: 24 h.` : `Responde a este correo para contestar a la usuaria (${q.email}).`}`;
  const text = text0 + reassignText(links);
  return { subject, html, text };
}

export function confirmEmail(pro, q, remaining, id = '', unlimited = false, leftText = '') {
  const excerpt = q.text.length > 160 ? `${q.text.slice(0, 160).trim()}…` : q.text;
  const left = leftText || (unlimited ? 'Tienes consultas ilimitadas' : remaining === 0 ? 'Era tu última consulta gratuita' : `Te ${remaining === 1 ? 'queda 1 consulta gratuita' : `quedan ${remaining} consultas gratuitas`}`);
  const subject = `Tu consulta a ${pro.short} · Hera${id ? ` #${id.toUpperCase()}` : ''}`;
  const html = shell(`<p>Hola,</p>
<p>Tu consulta ha llegado a <b>${esc(pro.name)}, ${esc(pro.role)}</b>. Te responderá en esta misma conversación en menos de ${q.prio ? '6' : '24'} h.</p>
<div style="background:#F6E0E2;border-radius:10px;padding:12px;margin:12px 0;font-size:14px;color:#2F3631">«${esc(excerpt)}»${q.context ? `<br><span style="color:#6E6C67">Sobre: ${esc(q.context)}</span>` : ''}</div>
<p><span style="display:inline-block;background:#ffffff;color:#45574C;border:1.5px solid #45574C;border-radius:999px;padding:4px 12px;font-size:13px;font-weight:600">${left}</span></p>
<p style="font-size:13px;color:#6E6C67">¿Quieres añadir algo o enviar una foto? Responde a este correo y le llegará a ${esc(pro.short)}.</p>
<p style="font-size:13px;color:#6E6C67">No es un servicio de urgencias. Si algo no va bien, llama al 112 o acude a tu centro de salud.</p>
<p style="font-size:12px;color:#8A8A8E">¿No has escrito tú esta consulta? Escríbenos a contacto@hera-gine.com y la borramos.</p>`);
  const text = `Tu consulta ha llegado a ${pro.name}, ${pro.role}. Te responderá en esta misma conversación en menos de ${q.prio ? '6' : '24'} h.\n\n«${excerpt}»\n\n${left}.\n\n¿Quieres añadir algo o enviar una foto? Responde a este correo y le llegará a ${pro.short}.\n\nNo es un servicio de urgencias: si algo no va bien, llama al 112 o acude a tu centro de salud.\n¿No has escrito tú esta consulta? Escríbenos a contacto@hera-gine.com y la borramos.`;
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

/** Acompañamiento mensual (22 nov): bienvenida, qué incluye y cómo pedir la videollamada del mes */
export function acompPaidEmail(pro, plan) {
  const subject = `Bienvenida al acompañamiento con ${pro.short}`;
  const item = (t, d) => `<tr><td style="vertical-align:top;padding:7px 10px 7px 0;color:#45574C;font-weight:700">✓</td><td style="padding:7px 0;font-size:14px;color:#2F3631"><b>${t}</b><br><span style="color:#4F4E49">${d}</span></td></tr>`;
  const html = shell(`<p>Hola,</p>
<p>Ya tienes el <b>acompañamiento mensual</b> con <b>${esc(pro.name)}, ${esc(pro.role)}</b> (${plan.eur} € al mes, sin permanencia).</p>
<table style="border-collapse:collapse;margin:8px 0 4px">${item('Consultas por escrito, con respuesta en menos de 6 h', 'Escríbelas como siempre en hera-gine.com con este mismo correo: ya van marcadas como prioritarias.')}${item('Una videollamada de 30 minutos al mes', 'Responde a este correo con 3 franjas que te vengan bien y te proponemos día y hora en menos de 24 h laborables.')}${item(`WhatsApp con ${esc(pro.short)}`, 'En menos de 24 h te escribimos desde el número de Hera para que lo guardes. Para dudas rápidas, de 9:00 a 21:00 (hora de España).')}</table>
<div style="background:#F6E0E2;border-radius:10px;padding:14px 16px;margin:14px 0">
<p style="margin:0 0 6px;font-family:Georgia,serif;font-size:19px;color:#45574C">Siguiente paso: responde a este correo</p>
<p style="margin:0;font-size:14px">Dinos <b>3 franjas</b> para tu videollamada de este mes y, si quieres, una línea sobre tu momento (embarazo, posparto, menopausia…).</p></div>
<p style="font-size:13px;color:#6E6C67;margin-top:16px">Sin permanencia: lo dejas cuando quieras respondiendo a este correo. Si no quedas satisfecha, te devolvemos el dinero.</p>
<p style="font-size:13px;color:#6E6C67">No es un servicio de urgencias. Si algo no va bien, llama al 112 o acude a tu centro de salud.</p>`);
  const text = `Hola,\n\nYa tienes el acompañamiento mensual con ${pro.name}, ${pro.role} (${plan.eur} € al mes, sin permanencia).\n\nQué incluye:\n- Consultas por escrito, con respuesta en menos de 6 h. Escríbelas como siempre en hera-gine.com con este mismo correo.\n- Una videollamada de 30 minutos al mes. Responde a este correo con 3 franjas y te proponemos día y hora en menos de 24 h laborables.\n- WhatsApp con ${pro.short}: en menos de 24 h te escribimos desde el número de Hera. Para dudas rápidas, de 9:00 a 21:00 (hora de España).\n\nSIGUIENTE PASO: responde a este correo con 3 franjas para tu videollamada de este mes.\n\nSin permanencia: lo dejas cuando quieras respondiendo a este correo. Si no quedas satisfecha, te devolvemos el dinero.\nNo es un servicio de urgencias: si algo no va bien, llama al 112 o acude a tu centro de salud.`;
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
export function waPaidEmail(code, price = WA_PRICE) {
  const subject = `Tu consulta por WhatsApp · código ${code}`;
  const link = waLink(code);
  const html = shell(`<p>Hola,</p>
<p>Hemos recibido tu pago de <b>${price}</b> por una <b>consulta por WhatsApp</b> con Hera.</p>
<div style="background:#F6E0E2;border-radius:10px;padding:14px 16px;margin:14px 0">
<p style="margin:0 0 4px;font-size:13px;color:#6E6C67">Tu código</p>
<p style="margin:0 0 12px;font-family:Georgia,serif;font-size:28px;letter-spacing:.08em;color:#45574C">${code}</p>
<p style="margin:0;font-size:14px">Siguiente paso: escríbenos tu duda por WhatsApp con este código y dinos si quieres preguntársela a Gonzalo (ginecólogo), Marina (matrona) o Lucía (pediatra).</p></div>
<p style="margin:18px 0"><a href="${link}" style="display:inline-block;background:#25803A;color:#ffffff;text-decoration:none;font-weight:600;border-radius:8px;padding:12px 20px">Abrir WhatsApp</a></p>
<p style="font-size:14px">Si el botón no funciona, escribe al <b>+34 603 29 58 06</b> y pon tu código.</p>
<p style="font-size:14px">La profesional te responde por el mismo chat en menos de 12 h. Tu número no lo ven las profesionales.</p>
<p style="font-size:13px;color:#6E6C67">No es un servicio de urgencias. Si algo no va bien, llama al 112 (o al número de emergencias de tu país) o acude a tu centro de salud.</p>`);
  const text = `Hola,\n\nHemos recibido tu pago de ${price} por una consulta por WhatsApp con Hera.\n\nTu código: ${code}\n\nSiguiente paso: escríbenos tu duda por WhatsApp con este código y dinos si quieres preguntársela a Gonzalo (ginecólogo), Marina (matrona) o Lucía (pediatra).\n\nAbrir WhatsApp: ${link}\nSi no funciona, escribe al +34 603 29 58 06 y pon tu código.\n\nLa profesional te responde por el mismo chat en menos de 12 h. Tu número no lo ven las profesionales.\nNo es un servicio de urgencias: si algo no va bien, llama al 112 (o al número de emergencias de tu país) o acude a tu centro de salud.`;
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
export const BF_END = Date.parse('2026-12-01T23:59:59+01:00');
// Noza, 22 nov: el 1 € deja de ofrecerse hoy (ver BF_OFFER_END_MS para pruebas). Las consultas guardadas antes lo mantienen hasta BF_END
export const BF_OFFER_END = Date.parse('2026-11-22T20:15:00+01:00');
const holdSig = async (env, id) => (await hmac(env.HASH_SALT, `hold:${id}`)).slice(0, 16);

// ── Resultado del cuestionario de menopausia por correo (Noza, 24 nov; experimento, sin casilla) ──
// Al completarlo, la usuaria puede pedir su resultado por correo. Se le envía al momento y, a los 2 días, un único
// seguimiento por si quiere que Gonzalo lo revise (con el precio de su versión: 9 € o 29 €). Correo y resumen se guardan
// cifrados (meno:<id>, 3 días) y se borran tras el seguimiento o si pide no recibir más. «Enviar mi resultado a Gonzalo»
// crea una consulta guardada (hold:) con el resumen y abre el pago, como el correo de una consulta guardada.
const MENO_TTL = 3 * 86400; const MENO_FOLLOW_MS = 48 * 3600000;
const menoSig = async (env, id, what) => (await hmac(env.HASH_SALT, `meno:${what}:${id}`)).slice(0, 16);
const menoLinks = async (env, id) => ({ pay: `${WORKER_URL}/menopausia/pagar?c=${id}&s=${await menoSig(env, id, 'pagar')}`, stop: `${WORKER_URL}/menopausia/baja?c=${id}&s=${await menoSig(env, id, 'baja')}` });
export function menoEmail(m, links, followup = false) {
  const prio = m.ab === 'prio'; const price = prio ? '29 €' : '5 €'; const when = prio ? '6' : '24';
  const lines = String(m.text || '').replace(/\s*Mi duda:\s*$/, '').trim();
  const subject = followup ? '¿Quieres que Gonzalo revise tu resultado?' : 'Tu resultado del cuestionario de menopausia';
  const btn = `<p style="margin:18px 0"><a href="${links.pay}" style="display:inline-block;background:#45574C;color:#fff;text-decoration:none;font-weight:600;padding:12px 18px;border-radius:8px">Enviar mi resultado a Gonzalo · ${price}</a></p>`;
  const intro = followup ? '<p>Hola. Hace dos días hiciste el cuestionario de menopausia de Hera. Te lo recordamos por si quieres que el Dr. Gonzalo Nozaleda, ginecólogo, lo revise.</p>' : '<p>Hola. Aquí tienes el resultado de tu cuestionario de menopausia. Es orientativo: no es un diagnóstico, sirve para ordenar lo que te pasa y llevarlo a la consulta.</p>';
  const html = shell(`${intro}
<div style="background:#F3F1EA;border-radius:10px;padding:12px 14px;font-size:14px;white-space:pre-line">${esc(lines)}</div>
<p>El <b>Dr. Gonzalo Nozaleda</b>, ginecólogo del Hospital Gregorio Marañón, puede revisarlo y decirte qué opciones tienes. Te responde por escrito en menos de ${when} h. Si quieres añadir una duda concreta, se la escribes respondiendo a su correo.</p>${btn}
<p style="font-size:13px;color:#6E6C67">No se cobra nada hasta que lo confirmas. Si no te sirve, te devolvemos el dinero.</p>
<p style="font-size:13px;color:#6E6C67">${followup ? 'Es el único recordatorio: hoy borramos tu resultado y tu correo.' : 'En 2 días te escribiremos una sola vez por si quieres hacerlo.'} <a href="${links.stop}" style="color:#6E6C67">No quiero más correos</a></p>
<p style="font-size:13px;color:#6E6C67">No es un servicio de urgencias. Si sangras después de 12 meses sin regla o algo no va bien, consulta con tu médico; si es urgente, llama al 112.</p>`);
  const text = `${followup ? 'Hola. Hace dos días hiciste el cuestionario de menopausia de Hera. Te lo recordamos por si quieres que el Dr. Gonzalo Nozaleda, ginecólogo, lo revise.' : 'Hola. Aquí tienes el resultado de tu cuestionario de menopausia (orientativo, no es un diagnóstico).'}\n\n${lines}\n\nEl Dr. Gonzalo Nozaleda, ginecólogo del Hospital Gregorio Marañón, puede revisarlo y te responde por escrito en menos de ${when} h.\n\nEnviar mi resultado a Gonzalo (${price}): ${links.pay}\n\nNo se cobra nada hasta que lo confirmas. Si no te sirve, te devolvemos el dinero.\n${followup ? 'Es el único recordatorio: hoy borramos tu resultado y tu correo.' : 'En 2 días te escribiremos una sola vez por si quieres hacerlo.'}\nNo quiero más correos: ${links.stop}\n\nNo es un servicio de urgencias: si es urgente, llama al 112.`;
  return { subject, html, text };
}
/** Seguimiento a los 2 días (en la pasada horaria). Si ya pagó (su consulta guardada ya no existe), no se le escribe. */
export async function menoFollowups(env) {
  let n = 0; let cursor;
  do {
    const page = await env.KV.list({ prefix: 'meno:', cursor });
    for (const k of page.keys) {
      const raw = await env.KV.get(k.name, 'json');
      if (!raw || raw.fu || Date.now() - raw.at < MENO_FOLLOW_MS) continue;
      const id = k.name.slice(5);
      if (raw.hid && !(await env.KV.get(`hold:${raw.hid}`))) { await env.KV.delete(k.name); continue; } // ya pagó (o caducó su consulta)
      const m = JSON.parse(await openEmail(env, raw.x));
      const ok = await sendMail(env, { to: m.email, replyTo: 'contacto@hera-gine.com', ...menoEmail(m, await menoLinks(env, id), true) });
      if (ok) { await env.KV.delete(k.name); if (!m.team) { await bump(env, 'menopausia_seguimiento'); await record(env, { e: 'menopausia:seguimiento' }, sendMail); } n++; }
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return n;
}
const holdLinks = async (env, id) => { const s = await holdSig(env, id); return ({ ...Object.fromEntries(['suelta', 'bono', 'mensual', 'acomp', 'bf1', 'prio29'].map((p) => [p, `${WORKER_URL}/pagar?c=${id}&s=${s}&plan=${p}`])) }); };

// reminder: false (correo al guardar), 1 (primer recordatorio, 1 h) o 2 (último, 24 h). true cuenta como 1.
export function holdEmail(pro, text, links, reminder = false, others = '', offer = '') {
  const last = reminder === 2; const daysLeft = (d) => `${d} ${d === 1 ? 'día' : 'días'}`;
  const bf = offer === 'bf' || offer === true; const prio = offer === 'prio';
  // others: la gratis que le queda es con otra especialista (1 gratis por especialista)
  // bf: prueba Black Friday (consulta a 1 € hasta el 1 dic). WhatsApp está en «Próximamente» desde el 19 nov: ya no se ofrece aquí
  const why = prio ? 'Has elegido la consulta prioritaria (respuesta en menos de 6 h)' : offer === 'pago' ? 'Cada consulta por escrito cuesta 5 €' : bf ? 'Con la oferta de Black Friday, cada consulta cuesta 1 € hasta el 1 de diciembre' : others ? `Tu consulta gratis con ${pro.short} ya la usaste (la que te queda es para ${others})` : 'Ya has usado tus consultas gratis';
  const price = prio ? '29 €' : bf ? '1 €' : '5 €'; const link = prio ? links.prio29 : bf ? links.bf1 : links.suelta;
  const excerpt = text.length > 220 ? `${text.slice(0, 220).trim()}…` : text;
  const btn = `<p style="margin:16px 0"><a href="${link}" style="display:inline-block;background:#45574C;color:#ffffff;text-decoration:none;font-weight:600;border-radius:8px;padding:12px 20px">Pagar ${price} y enviarla</a></p>`;
  const quote = `<div style="background:#F6E0E2;border-radius:10px;padding:12px;margin:12px 0;font-size:14px">«${esc(excerpt)}»</div>`;
  const subject = last ? `Último aviso: tu consulta a ${pro.short} sigue guardada` : reminder ? `¿Seguimos con tu consulta a ${pro.short}?` : `Tu consulta a ${pro.short} está guardada · falta el pago`;
  // Noza, 21 nov: recordatorios que resuelven dudas (cómo se paga, qué hacer si falla), no solo insisten
  const how = '<p style="font-size:14px">Se paga en un momento con tarjeta, Apple Pay o Google Pay. Todavía no ha llegado a nadie: en cuanto pagues, se la enviamos.</p>';
  const help = `<p style="font-size:14px">¿Te quedó alguna duda antes de pagar o has tenido algún problema con el pago? Responde a este correo y lo resolvemos.</p>`;
  const foot = last ? `Es el último recordatorio. Si no pagas, la borramos en ${daysLeft(HOLD_DAYS - 1)}.` : `Te lo recordaremos una vez más mañana. Si no pagas, la borramos en ${daysLeft(HOLD_DAYS)}.`;
  const more = bf || prio ? '' : `<p style="font-size:14px">¿Vas a preguntar más veces? <a href="${links.acomp}" style="color:#45574C;font-weight:600">acompañamiento mensual por 99 €</a> (respuesta en menos de 6 h, videollamada y WhatsApp).</p>`;
  const html = reminder
    ? shell(`<p>Hola,</p><p>Tu consulta para ${esc(pro.short)} sigue guardada y esperando el pago${bf ? ' (1 €, oferta de Black Friday hasta el 1 de diciembre)' : prio ? ' (consulta prioritaria, 29 €)' : ''}:</p>${quote}${btn}${how}${help}<p style="font-size:13px;color:#6E6C67">${foot}</p>`)
    : shell(`<p>Hola,</p><p>${esc(why)}, así que hemos <b>guardado tu consulta</b> para ${esc(pro.name)}, ${esc(pro.role)}:</p>${quote}<p>Para que le llegue, solo falta el pago. En cuanto pagues, se la enviamos y te responde en menos de ${prio ? '6' : '24'} h; no tienes que volver a escribirla.</p>${btn}${more}<p style="font-size:13px;color:#6E6C67">Si no pagas en ${HOLD_DAYS} días, borramos tu consulta. No es un servicio de urgencias: si algo no va bien, llama al 112 o acude a tu centro de salud.</p>`);
  const text2 = reminder
    ? `Hola,\n\nTu consulta para ${pro.short} sigue guardada y esperando el pago:\n\n«${excerpt}»\n\nPagar ${price} y enviarla: ${link}\n\nSe paga en un momento con tarjeta, Apple Pay o Google Pay. Todavía no ha llegado a nadie: en cuanto pagues, se la enviamos.\n¿Te quedó alguna duda antes de pagar o has tenido algún problema con el pago? Responde a este correo y lo resolvemos.\n\n${foot}`
    : `Hola,\n\n${why}, así que hemos guardado tu consulta para ${pro.name}, ${pro.role}:\n\n«${excerpt}»\n\nPara que le llegue, solo falta el pago. En cuanto pagues, se la enviamos; no tienes que volver a escribirla.\n\nPagar ${price} y enviarla: ${link}${bf || prio ? '' : `\nAcompañamiento mensual por 99 € (respuesta en menos de 6 h, videollamada y WhatsApp): ${links.acomp}`}\n\nSi no pagas en ${HOLD_DAYS} días, borramos tu consulta. No es un servicio de urgencias: si algo no va bien, llama al 112 o acude a tu centro de salud.`;
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
  if (j.ok && !held.team) { await bump(env, 'guardada_pagada'); await bump(env, `guardada_pagada_tras:${raw.rem === true ? 1 : Number(raw.rem) || 0}`); }
  else console.log(`hold ${id}: no se pudo enviar ${JSON.stringify(j)}`);
  return !!j.ok;
}

/** Cron (cada 15 min): dos recordatorios a quien no ha pagado su consulta guardada (Noza, 21 nov; antes, uno a las 3 h).
 *  1.º a la hora (cuando más se recupera: la duda sigue fresca) y 2.º y último a las 24 h. Nunca más de dos. */
export async function remindHolds(env) {
  let cursor;
  do {
    const page = await env.KV.list({ prefix: 'hold:', cursor });
    for (const k of page.keys) {
      const raw = await env.KV.get(k.name, 'json');
      if (!raw) continue;
      const stage = raw.rem === true ? 1 : Number(raw.rem) || 0;
      const age = Date.now() - raw.at;
      // El 2.º, a las 24 h y al menos 12 h después del 1.º (por si el 1.º salió tarde, p. ej. consultas de antes del cambio)
      const next = stage === 0 && age >= 3600000 ? 1 : stage === 1 && age >= 24 * 3600000 && Date.now() - (raw.r1 || 0) >= 12 * 3600000 ? 2 : 0;
      if (!next) continue;
      const id = k.name.slice(5);
      const held = JSON.parse(await openEmail(env, raw.x));
      const pro = PROS[held.to] || PROS.gineco;
      // Pasado Black Friday, el enlace de 1 € lleva a la consulta suelta: el correo ya no dice «1 €»
      const offer = raw.bf && Date.now() < BF_END ? 'bf' : raw.prio ? 'prio' : '';
      await sendMail(env, { to: held.email, replyTo: 'contacto@hera-gine.com', ...holdEmail(pro, held.text, await holdLinks(env, id), next, '', offer) });
      const left = Math.max(60, Math.floor((raw.at + HOLD_DAYS * 86400000 - Date.now()) / 1000));
      await env.KV.put(k.name, JSON.stringify({ ...raw, rem: next, ...(next === 1 ? { r1: Date.now() } : {}) }), { expirationTtl: left });
      await bump(env, next === 1 ? 'guardada_recordatorio' : 'guardada_recordatorio2');
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

/** Oferta de pago tras la primera respuesta (solo consultas que vinieron de anuncio; Noza, 20 nov) */
export function offerBlock(pro, freeLeft = 0, bf = false) {
  const base = 'https://hera-gine.com/videollamada/?de=oferta';
  const btn = (href, t, sub, price) => `<a href="${href}" style="display:block;text-decoration:none;color:#2F3631;border:1px solid #E5E1D8;border-radius:10px;padding:11px 12px;margin-top:8px;background:#ffffff"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-size:14.5px"><b style="display:block">${t}</b><span style="font-size:12.5px;color:#6E6C67">${sub}</span></td><td align="right" style="font-size:15px;font-weight:600;color:#45574C;white-space:nowrap">${price} ›</td></tr></table></a>`;
  const next = freeLeft > 0 ? `te queda ${freeLeft === 1 ? '1 consulta gratis' : `${freeLeft} consultas gratis`}` : bf ? '1 € hasta el 1 de diciembre' : '5 €';
  const ask = 'https://hera-gine.com/?de=oferta#ask';
  return {
    html: `<div style="margin:18px 0 0;padding:14px;border-radius:12px;background:#F6E0E2"><div style="font-family:Georgia,serif;font-size:19px;color:#45574C;margin-bottom:2px">¿Quieres hablarlo con ${esc(pro.short)}?</div><div style="font-size:13.5px;color:#4F4E49">Para seguir con esta duda, responder a este correo es gratis. Si prefieres hablarlo de viva voz:</div>${btn(`${base}#llamada-${pro.key}`, 'Llamada de 15 min', `${esc(pro.short)} te llama a la hora que elijas`, '25 €')}${btn(`${base}#reservar-${pro.key}`, 'Videollamada de 30 min', `Con ${esc(pro.short)}, por Google Meet`, '55 €')}<div style="font-size:13px;color:#4F4E49;margin-top:10px">¿Tienes otra duda distinta? <a href="${ask}" style="color:#45574C;font-weight:600">Haz una consulta nueva · ${next}</a></div></div>`,
    text: `¿Quieres hablarlo con ${pro.short}? Para seguir con esta duda, responder a este correo es gratis. Si prefieres hablarlo de viva voz:\n· Llamada de 15 min (25 €): ${base}#llamada-${pro.key}\n· Videollamada de 30 min (55 €): ${base}#reservar-${pro.key}\n¿Otra duda distinta? Consulta nueva (${next}): ${ask}`,
  };
}

export function relayEmail(pro, role, id, body, nAttach, rate = null, invite = null, offer = null) {
  const head = role === 'p' ? `<p style="font-size:13px;color:#6E6C67;margin-bottom:6px">${esc(pro.name)}, ${esc(pro.role)}, te responde:</p>`
    : `<p style="font-size:13px;color:#6E6C67;margin-bottom:6px">La usuaria de la consulta #${id.toUpperCase()} ha escrito:</p>`;
  const att = nAttach ? `<p style="font-size:13px;color:#6E6C67">${nAttach} ${nAttach === 1 ? 'archivo adjunto' : 'archivos adjuntos'}</p>` : '';
  const foot = role === 'p'
    ? 'Si necesitas aclarar algo, responde a este correo. No es un servicio de urgencias: si algo no va bien, llama al 112 o acude a tu centro de salud.'
    : `Responde a este correo para contestarle; le llegará desde ${pro.email}.`;
  // Debajo de cada respuesta de la profesional: la videollamada con ella (vera-backlog#86)
  const vlink = `https://hera-gine.com/videollamada/?de=respuesta#reservar-${pro.key}`;
  const video = role === 'p' && pro.key && !offer ? {
    html: `<div style="margin:16px 0 0;padding:12px 14px;border:1px solid #E5E1D8;border-radius:10px;background:#ffffff;font-size:14px">¿Prefieres hablarlo cara a cara? <a href="${vlink}" style="color:#45574C;font-weight:600">Videollamada de 30 min con ${esc(pro.short)} · 55 €</a></div>`,
    text: `¿Prefieres hablarlo cara a cara? Videollamada de 30 min con ${pro.short} (55 €): ${vlink}`,
  } : null;
  const html = shell(`${head}<div style="white-space:normal">${nl2br(body)}</div>${att}${rate ? rate.html : ''}${offer ? offer.html : ''}${video ? video.html : ''}${invite ? invite.html : ''}<p style="font-size:12px;color:#8A8A8E;margin-top:18px">${esc(foot)}</p>`);
  const text = `${role === 'p' ? `${pro.name}, ${pro.role}, te responde:` : `La usuaria de la consulta #${id.toUpperCase()} ha escrito:`}\n\n${body}\n\n${nAttach ? `[${nAttach} adjunto(s)]\n\n` : ''}${rate ? `${rate.text}\n\n` : ''}${offer ? `${offer.text}\n\n` : ''}${video ? `${video.text}\n\n` : ''}${invite ? `${invite.text}\n\n` : ''}${foot}`;
  return { html, text };
}

/** Aviso al profesional cuando una consulta lleva 16 h sin respuesta */
export function reminderEmail(pro, id, prio = false) {
  const [h, plazo] = prio ? [4, 6] : [16, 24];
  const html = shell(`<p>Hola, ${esc(pro.short)}:</p><p>La consulta${prio ? ' <b>prioritaria</b>' : ''} <b>#${id.toUpperCase()}</b> lleva ${h} horas sin respuesta y el plazo que damos a las usuarias es de ${plazo} h.</p>
<p>Puedes responder a este mismo correo y le llegará a ella.</p>`);
  return { html, text: `Hola, ${pro.short}: la consulta${prio ? ' prioritaria' : ''} #${id.toUpperCase()} lleva ${h} horas sin respuesta (plazo: ${plazo} h). Puedes responder a este mismo correo y le llegará a la usuaria.` };
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
          const paidEur = s.amount_total != null ? s.amount_total / 100 : PLANS[plan].eur;
          const priceTxt = `${eurText(paidEur)}${s.metadata?.pais === 'AR' ? ' (Argentina)' : ''}`;
          const to = s.customer_details?.email || s.customer_email;
          const tel = normalizePhone(s.customer_details?.phone || '');
          if (tel) await addWaConsult(env, { phone: tel, pro: '', limit: 0, bump, paid: true, code });
          if (to) await sendMail(env, { to, replyTo: 'contacto@hera-gine.com', ...waPaidEmail(code, eurText(paidEur)) });
          if (s.metadata?.src === 'ads') { const ak = /_latam$/.test(String(s.metadata?.camp || '')) ? 'latam' : 'anuncio'; await bump(env, `${ak}_pago:${plan}`); await bump(env, `${ak}_eur`, madridDay(), paidEur); }
          await notify(env, `Pago · WhatsApp · ${priceTxt} · código ${code}${s.metadata?.src === 'ads' ? ' · desde anuncio' : ''}${s.livemode ? '' : ' · prueba'}`,
            `Consulta por WhatsApp pagada (${priceTxt}${s.livemode ? '' : ', modo de prueba'}).\n\nCódigo: ${code}\nMóvil: ${tel ? maskPhone(tel) : 'no lo dio'}\n\nYa está en el panel («Consultas por WhatsApp», Pagada · ${code}). Cuando te escriba con ese código, pásale la duda a la profesional que elija.`, sendMail);
          return;
        }
        if (PLANS[plan].acomp) {
          const pro = PROS[s.metadata?.pro] || PROS.gineco;
          const to = s.customer_details?.email || s.customer_email;
          const tel = normalizePhone(s.customer_details?.phone || '');
          if (to) await sendMail(env, { to, replyTo: 'contacto@hera-gine.com', ...acompPaidEmail(pro, PLANS[plan]) });
          if (s.metadata?.src === 'ads') { const ak = /_latam$/.test(String(s.metadata?.camp || '')) ? 'latam' : 'anuncio'; await bump(env, `${ak}_pago:${plan}`); await bump(env, `${ak}_eur`, madridDay(), PLANS[plan].eur); }
          if (/^[a-z0-9]{8}$/.test(String(s.metadata?.hold || ''))) await deliverHold(env, s.metadata.hold, ctx);
          const dash = `https://dashboard.stripe.com/${s.livemode ? '' : 'test/'}${s.subscription ? `subscriptions/${typeof s.subscription === 'string' ? s.subscription : s.subscription.id}` : 'subscriptions'}`;
          await notify(env, `Pago · Acompañamiento mensual con ${pro.short} · ${PLANS[plan].eur} €/mes${s.metadata?.src === 'ads' ? ' · desde anuncio' : ''}${s.livemode ? '' : ' · prueba'}`,
            `Nueva suscripción al acompañamiento mensual con ${pro.name} (${PLANS[plan].eur} € al mes${s.livemode ? '' : ', modo de prueba'}).\n\nMóvil: ${tel ? maskPhone(tel) : 'no lo dio'} (completo en Stripe)\n\nQué toca:\n1. Escribirle por WhatsApp desde el número de Hera en menos de 24 h para que lo guarde (de 9:00 a 21:00).\n2. Cuando responda al correo de bienvenida con 3 franjas, cuadrar la videollamada de este mes con ${pro.short} y mandarle el enlace de Meet.\n3. Sus consultas por escrito ya llegan marcadas con respuesta en menos de 6 h.\n\nSi pide que le devolvamos el dinero: reembolso del pago y cancelar la suscripción, las dos cosas en Stripe.\n\nVer en Stripe: ${dash}`, sendMail);
          return;
        }
        if (PLANS[plan].video) {
          const pro = PROS[s.metadata?.pro] || PROS.matrona;
          const to = s.customer_details?.email || s.customer_email;
          // Con su enlace para invitar (invite.js): quien paga una videollamada es quien más confía
          const h0 = /^[0-9a-f]{64}$/.test(String(s.metadata?.h || '')) ? s.metadata.h : '';
          const inv = env.NO_FREE !== '1' && to && h0 ? inviteBlock(await inviteCode(env, h0, await sealEmail(env, to))) : null;
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
      cancelled: async (plan) => { await bump(env, plan === 'acomp' ? 'pago:baja_acomp' : 'pago:baja_mensual'); },
      // Pago que caduca sin pagar: cuenta para el embudo y sale en el recorrido de esa persona (si se sabe quién era)
      expired: async (plan, s) => {
        await bump(env, `pago_caducado:${plan}`);
        const who = /^[0-9A-F]{4}$/.test(String(s.metadata?.p || '')) ? s.metadata.p : '';
        await record(env, { e: `pago_caducado:${plan}`, p: who, note: s.livemode ? '' : 'modo de prueba' }, sendMail, ctx);
      },
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
      if (plan === 'prio29' && !raw.prio) return Response.redirect(`${WORKER_URL}/pagar?c=${id}&s=${url.searchParams.get('s')}&plan=suelta`, 303);
      if (plan === 'bf1' && (!raw.bf || Date.now() >= BF_END)) return Response.redirect(`${WORKER_URL}/pagar?c=${id}&s=${url.searchParams.get('s')}&plan=suelta`, 303);
      const held = JSON.parse(await openEmail(env, raw.x));
      try {
        const who = await personTag(env, request, madridDay());
        const u = await createCheckout(env, { email: held.email, plan, h: raw.h, origin: 'https://hera-gine.com', back: 'web', ad: held.src === 'ads', camp: /^[a-z0-9_]{1,24}$/.test(String(held.camp || '')) ? held.camp : '', hold: id, pro: PROS[raw.to] ? raw.to : '', p: who });
        // Modo equipo (la consulta guardada lo recuerda): no cuenta en métricas
        if (held.team !== true) {
          await bump(env, `pago_inicio:${plan}`);
          await record(env, { e: `pago_abierto:${plan}`, p: who, note: 'desde el correo de la consulta guardada' }, sendMail, ctx);
        }
        return Response.redirect(u, 303);
      } catch (e) { console.log(e.message); return new Response('No se ha podido abrir el pago. Inténtalo en un rato.', { status: 502 }); }
    }
    // Cuestionario de menopausia: enlaces de los correos (pagar o no recibir más)
    if (request.method === 'GET' && (url.pathname === '/menopausia/pagar' || url.pathname === '/menopausia/baja')) {
      const id = String(url.searchParams.get('c') || ''); const what = url.pathname.endsWith('pagar') ? 'pagar' : 'baja';
      const raw = /^[a-z0-9]{8}$/.test(id) && url.searchParams.get('s') === await menoSig(env, id, what) ? await env.KV.get(`meno:${id}`, 'json') : null;
      const page = (t, p) => new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font:16px/1.5 -apple-system,sans-serif;max-width:32em;margin:40px auto;padding:0 16px;color:#2F3631"><h1 style="font:400 26px Georgia,serif;color:#45574C">${t}</h1><p>${p}</p><p><a href="https://hera-gine.com/menopausia/" style="color:#45574C;font-weight:600">Volver a Hera</a></p>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      if (what === 'baja') {
        if (raw) { await env.KV.delete(`meno:${id}`); await bump(env, 'menopausia_baja'); }
        return page('Hecho', 'No te escribiremos más y hemos borrado tu resultado y tu correo.');
      }
      if (!raw) return page('Este enlace ya no está activo', 'Tu resultado se borra a los 3 días. Puedes volver a hacer el cuestionario o escribir tu duda en hera-gine.com.');
      const m = JSON.parse(await openEmail(env, raw.x));
      let hid = raw.hid && await env.KV.get(`hold:${raw.hid}`) ? raw.hid : '';
      if (!hid) {
        hid = newThreadId();
        const held = { email: m.email, to: 'gineco', text: `${String(m.text || '').replace(/\s*Mi duda:\s*$/, '').trim()}\n\nTe envío mi resultado del cuestionario de menopausia para que lo revises. Si tengo una duda concreta, te la escribo respondiendo a este correo.`, context: 'Cuestionario de menopausia', situation: '', follow: false, src: m.src || '', camp: m.camp || '', team: m.team === true, ...(m.ab === 'prio' ? { ab: 'prio' } : { ab: 'pago' }) };
        await env.KV.put(`hold:${hid}`, JSON.stringify({ x: await sealEmail(env, JSON.stringify(held)), at: Date.now(), h: raw.h, to: 'gineco', rem: 2, ...(m.ab === 'prio' ? { prio: 1 } : {}) }), { expirationTtl: HOLD_DAYS * 86400 });
        await env.KV.put(`meno:${id}`, JSON.stringify({ ...raw, hid }), { expirationTtl: Math.max(60, Math.round((raw.at + MENO_TTL * 1000 - Date.now()) / 1000)) });
      }
      if (!m.team) { await bump(env, 'menopausia_pagar_correo'); await record(env, { e: 'menopausia:pagar_correo', p: await personTag(env, request, madridDay()) }, sendMail, ctx); }
      return Response.redirect(`${WORKER_URL}/pagar?c=${hid}&s=${await holdSig(env, hid)}&plan=${m.ab === 'prio' ? 'prio29' : 'suelta'}`, 303);
    }
    // Consulta por WhatsApp: abre el pago de Stripe (pide correo y móvil) y vuelve a hera-gine.com/whatsapp/
    // Precio de WhatsApp para esta visita (la web lo enseña): la mitad en Argentina
    // Cifras públicas de la portada (Noza, 21 nov): consultas y respondidas en 30 días y horas de media. Sin datos personales.
    if (request.method === 'GET' && url.pathname === '/cifras') {
      let out = { n: 0, r: 0, h: 0 };
      try {
        const from = madridDay(new Date(Date.now() - 29 * 86400000));
        const rows = (await env.DB.prepare("SELECT k, SUM(n) n FROM counts WHERE day >= ?1 AND (k LIKE 'consulta:%' OR k LIKE 'respondida:%' OR k LIKE 'resp_horas:%') GROUP BY k").bind(from).all()).results || [];
        const sum = (pre) => rows.filter((x) => new RegExp(`^${pre}:(gineco|matrona|pediatra)$`).test(x.k)).reduce((a, x) => a + x.n, 0);
        const n = sum('consulta'), r = Math.min(sum('respondida'), n), hs = sum('resp_horas');
        out = { n, r, h: r ? Math.max(1, Math.round(hs / r)) : 0 };
      } catch (e) { console.log(`cifras ${e.message}`); }
      return new Response(JSON.stringify(out), { headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' } });
    }
    if (request.method === 'GET' && url.pathname === '/precio') return reply(200, { wa: eurText(waEur(request)), ar: request.cf?.country === 'AR' });
    if (url.pathname === '/reasignar') return reassign(env, request, url);
    if (request.method === 'GET' && url.pathname === '/wa/pagar') {
      const back = 'https://hera-gine.com/whatsapp/';
      if (!env.STRIPE_SECRET_KEY) return Response.redirect(`${back}?pago=error`, 303);
      if (await rateLimited(env, request.headers.get('CF-Connecting-IP'))) return Response.redirect(`${back}?pago=error`, 303);
      try {
        const h = [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('');
        const camp = /^[a-z0-9_]{1,24}$/.test(url.searchParams.get('camp') || '') ? url.searchParams.get('camp') : '';
        const who = await personTag(env, request, madridDay(), url.searchParams.get('p') || '');
        const to = await createCheckout(env, { email: '', plan: 'whatsapp', h, origin: 'https://hera-gine.com', back: 'wa', ad: url.searchParams.get('src') === 'ads', camp, country: request.cf?.country || '', p: who });
        if (url.searchParams.get('t') !== '1') {
          await bump(env, 'pago_inicio:whatsapp');
          if (url.searchParams.get('de') === 'recordatorio') await bump(env, 'wa_desde_recordatorio');
          await record(env, { e: 'whatsapp_pagar', p: who }, sendMail, ctx);
          await record(env, { e: 'pago_abierto:whatsapp', p: who }, sendMail, ctx);
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
    // Borrar una consulta guardada sin pagar (pruebas): solo con la clave del panel
    if (request.method === 'POST' && url.pathname === '/panel/guardada') {
      const f = await request.formData().catch(() => null);
      if (!f || !env.DASH_KEY || f.get('k') !== env.DASH_KEY) return new Response('Not found', { status: 404 });
      const id = String(f.get('id') || '');
      if (/^[a-z0-9]{8}$/.test(id)) await env.KV.delete(`hold:${id}`);
      return new Response(null, { status: 303, headers: { Location: `/panel?k=${encodeURIComponent(env.DASH_KEY)}#guardadas`, 'referrer-policy': 'no-referrer' } });
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
    // Enlace de canal (?via=ig_marina…): solo letras, números y guion bajo
    const via = /^[a-z0-9_]{1,20}$/.test(String(body.via || '')) ? body.via : '';
    const viaName = LINK_NAME[via] || ''; // uno de nuestros enlaces (Noza, 19 nov: que se vea en los asuntos)
    const cc = /^[A-Z]{2}$/.test(request.cf?.country || '') ? request.cf.country : ''; // país de la consulta (Noza, 20 nov)
    // Amigas que prueban Hera (enlace de Maite, 20 nov): más consultas gratis hasta una fecha y sin la regla de 1 por especialista
    const friend = FRIEND_LINKS[via] && Date.now() < Date.parse(FRIEND_LINKS[via].until) ? FRIEND_LINKS[via] : null;
    // Sin consultas gratis (Noza, 22 nov; NO_FREE="1" en wrangler.toml): todas se pagan desde la primera, salvo los enlaces
    // de amigas (FRIEND_LINKS) y los de las profesionales y el grupo de Maite (FREE_VIA), que siguen con las 2 gratis de siempre.
    const freeVia = FREE_VIA.includes(via);
    const noFree = env.NO_FREE === '1' && !friend && !freeVia;
    // Consulta prioritaria (Noza, 21 nov): campaña propia «prioritaria», sin gratis, 29 € y respuesta en menos de 6 h
    // y prueba de precio 9 € / 29 € (PRICE_AB="1", Noza 22 nov; apagada hasta que las profesionales confirmen las 6 h)
    const partner = PARTNER_LINKS[via] || '';
    let prio = !friend && (partner ? partner === 'prio' : body.ab === 'prio' && ((body.src === 'ads' && String(body.camp || '') === 'prioritaria') || (env.PRICE_AB === '1' && !freeVia)));
    // Black Friday (hasta el 1 dic): 1 € por consulta. Con NO_FREE, para todos; antes, solo la prueba de anuncios (ab=bf)
    const bf = !friend && !freeVia && !prio && Date.now() < Math.min(BF_END, Number(env.BF_OFFER_END_MS) || BF_OFFER_END) && (noFree || (body.ab === 'bf' && body.src === 'ads'));
    const limit = friend ? friend.free : bf || prio || noFree ? 0 : Number(env.FREE_LIMIT || 2);

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
      // País (Noza, 20 nov): personas distintas por país y día (web o app), solo las 2 letras de Cloudflare
      if ((e === 'portada' || e === 'apertura') && /^[A-Z]{2}$/.test(request.cf?.country || '')) await countPerson(env, request, `pais_${request.cf.country}`);
      if (e.startsWith('anuncio_visita')) await countPerson(env, request, /_latam$/.test(e) ? 'latam' : 'anuncio');
      return reply(200, { ok: true, p });
    }

    if (url.pathname === '/checkout') {
      if (!env.STRIPE_SECRET_KEY || !paymentsOn(env, body)) return reply(404, { error: 'not_found' });
      const norm = normalizeEmail(body.email);
      if (!norm) return reply(400, { error: 'bad_email' });
      if (!PLANS[body.plan]) return reply(400, { error: 'bad_plan' });
      if (body.plan === 'prio29' && (!/^[a-z0-9]{8}$/.test(String(body.hold || '')) || !(await env.KV.get(`hold:${body.hold}`, 'json'))?.prio)) return reply(400, { error: 'bad_plan' });
      if (body.plan === 'bf1' && (!/^[a-z0-9]{8}$/.test(String(body.hold || '')) || Date.now() >= BF_END || !(await env.KV.get(`hold:${body.hold}`, 'json'))?.bf)) return reply(400, { error: 'bad_plan' });
      const vpro = body.plan === 'lactancia' ? 'matrona' : PLANS[body.plan].video || PLANS[body.plan].acomp ? body.pro : '';
      if ((PLANS[body.plan].video || PLANS[body.plan].acomp) && !VIDEO_PROS.includes(vpro)) return reply(400, { error: 'bad_pro' });
      if (await rateLimited(env, request.headers.get('CF-Connecting-IP'))) return reply(429, { error: 'rate' });
      try {
        // Quién va a Stripe (vera-backlog: embudo de pago): la misma etiqueta anónima del día que sus otros eventos
        const who = await personTag(env, request, madridDay(), body.p);
        const checkoutUrl = await createCheckout(env, { email: String(body.email).trim(), plan: body.plan, h: await hmac(env.HASH_SALT, norm), origin, back: ['web', 'video', 'consultas'].includes(body.back) ? body.back : 'app', ad: body.src === 'ads', pro: vpro, camp: /^[a-z0-9_]{1,24}$/.test(String(body.camp || '')) ? body.camp : '', hold: /^[a-z0-9]{8}$/.test(String(body.hold || '')) && await env.KV.get(`hold:${body.hold}`) ? body.hold : '', p: who });
        // Modo equipo: el pago se abre igual, pero no cuenta en métricas (antes sumaba en «Fueron a Stripe»)
        if (body.team !== true) {
          await bump(env, `pago_inicio:${body.plan}`);
          await record(env, { e: `pago_abierto:${body.plan}`, p: who }, sendMail, ctx);
        }
        return reply(200, { url: checkoutUrl });
      } catch (e) { console.log(e.message); return reply(502, { error: 'stripe' }); }
    }

    // Cuestionario de menopausia: «Quiero mi resultado por correo»
    if (url.pathname === '/menopausia/resultado') {
      const norm = normalizeEmail(body.email);
      if (!norm) return reply(400, { error: 'bad_email' });
      const text = String(body.text || '').slice(0, 1500);
      if (!/^Mi cuestionario de menopausia/.test(text)) return reply(400, { error: 'bad_text' });
      if (await rateLimited(env, request.headers.get('CF-Connecting-IP'))) return reply(429, { error: 'rate' });
      const id = newThreadId();
      const m = { email: String(body.email).trim(), text, ab: body.ab === 'prio' ? 'prio' : 'pago', src: body.src === 'ads' ? 'ads' : '', camp: /^[a-z0-9_]{1,24}$/.test(String(body.camp || '')) ? body.camp : '', team: body.team === true };
      await env.KV.put(`meno:${id}`, JSON.stringify({ x: await sealEmail(env, JSON.stringify(m)), at: Date.now(), h: await hmac(env.HASH_SALT, norm), fu: 0 }), { expirationTtl: MENO_TTL });
      const ok = await sendMail(env, { to: m.email, replyTo: 'contacto@hera-gine.com', ...menoEmail(m, await menoLinks(env, id)) });
      if (!ok) return reply(502, { error: 'send' });
      if (!m.team) {
        await bump(env, 'menopausia_correo_resultado');
        await record(env, { e: 'menopausia:correo_resultado', p: await personTag(env, request, madridDay(), body.p) }, sendMail, ctx);
      }
      {
        // Noza (24 nov): el aviso lleva su correo y su resultado. En modo equipo también llega (para probarlo), marcado como prueba
        const lvl = (text.match(/, (te afectan [^.]+)\./) || [])[1] || '';
        const job = notify(env, `${m.team ? 'Prueba del equipo · ' : ''}Cuestionario de menopausia · ${m.email}${lvl ? ` · ${lvl}` : ''}`, `Alguien ha completado el cuestionario de menopausia y ha pedido su resultado por correo${lvl ? ` (${lvl})` : ''}${m.src === 'ads' ? ', desde un anuncio' : ''}.${m.team ? '\n\n(Es una prueba desde un dispositivo en modo equipo: no cuenta en el panel.)' : ''}\n\nCorreo: ${m.email}\nVersión de precio: ${m.ab === 'prio' ? '29 €' : '5 €'}\n\nSu resultado:\n${String(m.text).replace(/\s*Mi duda:\s*$/, '').trim()}\n\nEn 2 días le escribimos una vez por si quiere enviárselo a Gonzalo.`, sendMail);
        if (ctx?.waitUntil) ctx.waitUntil(job); else await job;
      }
      return reply(200, { ok: true });
    }

    // WhatsApp «Próximamente» (19 nov): quien pulsa «Avísame» deja su correo cifrado para avisarla cuando vuelva (12 meses como mucho)
    if (url.pathname === '/avisame') {
      const norm = normalizeEmail(body.email);
      if (!norm) return reply(400, { error: 'bad_email' });
      const h = (await hmac(env.HASH_SALT, norm)).slice(0, 24);
      if (!(await env.KV.get(`wa_aviso:${h}`))) {
        await env.KV.put(`wa_aviso:${h}`, JSON.stringify({ u: await sealEmail(env, norm), at: Date.now(), src: String(body.src || '').slice(0, 20) }), { expirationTtl: 365 * 86400 });
        await bump(env, 'whatsapp_avisame');
        await record(env, { e: 'whatsapp_avisame', p: await personTag(env, request, madridDay(), body.p) }, sendMail, ctx);
        // Noza (20 nov): aviso al momento con el correo, para poder escribirle cuando vuelva WhatsApp
        const job = notify(env, `Aviso de WhatsApp · ${norm}`, `Alguien ha pulsado «Avísame» de WhatsApp (${body.src === 'whatsapp' ? 'página de WhatsApp' : 'portada'}).\n\nCorreo: ${norm}\n\nEstá en el panel, en «Pidieron aviso cuando vuelva WhatsApp». Se borra solo a los 12 meses.`, sendMail);
        if (ctx?.waitUntil) ctx.waitUntil(job); else await job;
      }
      return reply(200, { ok: true });
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
      // Acompañamiento mensual (22 nov): sus consultas van con respuesta en menos de 6 h y sin el tope de una al día
      const acomp = subscriber && await isAcomp(env, h);
      if (acomp) prio = true;
      const unlimited = beta || subscriber;
      // Se le olvidó algo (Noza, 21 nov): si vuelve a escribir al mismo profesional en 30 min y aún no le han respondido,
      // se añade a su consulta (misma conversación) en vez de abrir otra y gastar otra consulta.
      if (!test && env.RELAY === '1' && body.held !== true && rec.lt?.to === body.to && Date.now() - rec.lt.at < Number(env.ADD_WINDOW_MIN ?? 30) * 60000 && /^[a-z0-9]{8}$/.test(String(rec.lt.id || ''))) {
        const t = await loadThread(env, rec.lt.id);
        if (t && !t.a && t.p === body.to) {
          const mins = Math.max(1, Math.round((Date.now() - t.c) / 60000));
          const { html, text: txt } = relayEmail(pro, 'u', t.id, `${text}\n\n(La usuaria lo añadió ${mins} min después de enviar la consulta.)`, files.length);
          const sentP = await sendMail(env, { to: pro.email, from: `Consulta #${t.id.toUpperCase()} · Hera <consultas@hera-gine.com>`, replyTo: await relayAddress(env, 'p', t.id), subject: `Re: ${t.sp}`, refs: t.rp, html, text: txt, attachments: files });
          if (!sentP) return reply(502, { error: 'send' });
          if (env.COPY_TO) {
            const tc = teamCopy({ subject: `Consulta · #${t.id.toUpperCase()} · la usuaria añadió algo${files.length ? ` · ${files.length} ${files.length === 1 ? 'adjunto' : 'adjuntos'}` : ''}${body.team === true ? ' · prueba del equipo' : ''}`,
              intro: `La usuaria de la consulta #${t.id.toUpperCase()} ha vuelto a escribir a <b>${esc(pro.short)}</b> a los ${mins} min. Se ha añadido a la misma conversación (no cuenta como consulta nueva):`,
              body: text, nFiles: files.length, withFiles: false, extra: '' });
            await sendMail(env, { to: env.COPY_TO, from: TEAM_FROM, replyTo: 'contacto@hera-gine.com', ...tc });
          }
          t.n = (t.n || 0) + 1; await saveThread(env, t);
          if (body.team !== true) { await bump(env, `consulta_anadida:${body.to}`); await record(env, { e: `consulta_anadida:${body.to}`, p: await personTag(env, request, madridDay(), body.p) }, sendMail, ctx); }
          return reply(200, { ok: true, added: true, id: t.id, remaining: Math.max(0, limit - rec.n), freeLimit: limit, ...(unlimited ? { unlimited: true } : {}) });
        }
      }
      const pay = paymentsOn(env, body) && !!env.STRIPE_SECRET_KEY;
      if (!test && subscriber && !acomp && bal.day === madridDay()) return reply(200, { limit: true, daily: true, freeLimit: limit, ...(env.STRIPE_PORTAL_URL ? { portal: env.STRIPE_PORTAL_URL } : {}) });
      const credits = unlimited ? 0 : bal.credits;
      // 2 gratis en total, como mucho 1 por especialista (Noza, 16 nov). fp = especialistas ya usadas gratis (los registros antiguos no lo tienen)
      const fp = Array.isArray(rec.fp) ? rec.fp : [];
      const samePro = !test && !friend && rec.n < limit && fp.includes(body.to);
      const others = samePro ? Object.values(PROS).filter((x) => !fp.includes(x.key)).map((x) => x.short).join(' o ') : '';
      if (!test && !unlimited && (rec.n >= limit || samePro) && credits <= 0) {
        if (body.team !== true && !bf && !prio) {
          if (body.src === 'ads') await bump(env, /_latam$/.test(String(body.camp || '')) ? 'latam_limite' : 'anuncio_limite');
          await bump(env, 'gratuitas_agotadas');
          await record(env, { e: 'gratuitas_agotadas', p: await personTag(env, request, madridDay(), body.p) }, sendMail, ctx);
        }
        // Pendiente de pago: se guarda cifrada y se le manda el enlace (no llega a la profesional hasta que pague)
        if (pay && env.RELAY === '1' && body.held !== true) {
          const hid = newThreadId();
          const held = { email: q.email, to: body.to, text: q.text, context: q.context, situation: q.situation, follow: body.follow === true, src: body.src, camp: body.camp, ref: body.ref, p: body.p, team: body.team === true, ...(bf ? { ab: 'bf' } : prio ? { ab: 'prio' } : noFree ? { ab: 'pago' } : {}) };
          await env.KV.put(`hold:${hid}`, JSON.stringify({ x: await sealEmail(env, JSON.stringify(held)), at: Date.now(), h, to: body.to, rem: 0, ...(bf ? { bf: 1 } : {}), ...(prio ? { prio: 1 } : {}) }), { expirationTtl: HOLD_DAYS * 86400 });
          const links = await holdLinks(env, hid);
          await sendMail(env, { to: q.email, replyTo: 'contacto@hera-gine.com', ...holdEmail(pro, q.text, links, false, others, bf ? 'bf' : prio ? 'prio' : noFree ? 'pago' : '') });
          if (body.team !== true) { await bump(env, bf ? 'bf_guardada' : prio ? 'prio_guardada' : 'consulta_guardada'); await record(env, { e: `consulta_guardada:${body.to}`, p: await personTag(env, request, madridDay(), body.p) }, sendMail, ctx); }
          {
            if (env.COPY_TO) {
              const who = env.COPY_EMAIL === '1' ? `<p style="font-size:13px;color:#6E6C67">Correo de la usuaria: <b>${esc(q.email)}</b></p>` : '';
              const tc = teamCopy({ subject: `Consulta · ${pro.short} · #${hid.toUpperCase()} · PENDIENTE DE PAGO${bf ? ' · Black Friday 1 €' : prio ? ' · Prioritaria 29 €' : ''}${viaName ? ` · desde ${viaName}` : ''}${cc ? ` · ${cc}` : ''}${body.team === true ? ' · prueba del equipo' : ''}`, intro: `Consulta guardada para <b>${esc(pro.name)}</b>. <b style="color:#B3261E">Aún no ha pagado</b>: a ${esc(pro.short)} no le ha llegado.`, body: q.text,
                extra: `${who}<p style="font-size:13px;color:#6E6C67">Le hemos enviado el enlace de pago. Si no paga, recordatorios a la hora y a las 24 h. Se borra en ${HOLD_DAYS} días.${files.length ? ' Los adjuntos no se guardan: podrá enviarlos respondiendo al correo de la profesional.' : ''}</p>` });
              await sendMail(env, { to: env.COPY_TO, from: TEAM_FROM, replyTo: 'contacto@hera-gine.com', ...tc });
            }
          }
          return reply(200, { limit: true, used: rec.n, freeLimit: limit, pay: true, held: hid, ...(bf ? { bf: true } : {}), ...(prio ? { prio: true } : {}), ...(samePro ? { same: others } : {}) });
        }
        return reply(200, { limit: true, used: rec.n, freeLimit: limit, ...(pay ? { pay: true } : {}), ...(samePro ? { same: others } : {}) });
      }
      if (!test && await rateLimited(env, request.headers.get('CF-Connecting-IP'))) return reply(429, { error: 'rate' });
      // La marca de 6 h solo va con lo pagado como prioritaria (la guardada de 29 €, al llegar tras el pago) o con el acompañamiento;
      // quien ve la versión de 29 € pero envía con su bono o su ilimitado va con el plazo normal de 24 h
      if (!acomp && body.held !== true) prio = false;

      // Hilo: el profesional y la usuaria se responden a través de direcciones de Hera de un solo uso
      const id = newThreadId();
      const bcc = test ? undefined : env.COPY_TO || undefined; // COPY_TO (secreto): copia oculta de cada consulta mientras se prueba
      // RELAY="1": respuestas a través de Hera (necesita la regla catch-all → Worker en Email Routing). Las pruebas siempre lo usan.
      const relay = env.RELAY === '1' || !!test;
      const pm = proEmail(pro, { ...q, via: viaName, prio, acomp }, id, relay, relay && !test ? await reassignLinks(env, id, pro.key) : []);
      // Con adjuntos, la copia de control va aparte y sin los archivos: solo los recibe la profesional
      const proReply = relay ? await relayAddress(env, 'p', id) : q.email;
      const sent = await sendMail(env, { to: pro.email, replyTo: proReply, ...pm, attachments: files });
      if (!sent) return reply(502, { error: 'send' });
      // La consulta se guarda ya (antes de contadores y correos): si la usuaria sale de la página y la petición se corta,
      // la respuesta de la profesional igual le llega (B45WUAX3, 18 nov). Al final se vuelve a guardar completa.
      const baseThread = relay ? { id, p: pro.key || body.to, u: await sealEmail(env, q.email), uh: (await hmac(env.HASH_SALT, norm)).slice(0, 24),
        sp: pm.subject, su: `Tu consulta a ${pro.short} · Hera #${id.toUpperCase()}`, rp: [], ru: [], c: Date.now(), a: 0, rem: false, n: 0, h, ...(body.src === 'ads' ? { ad: 1 } : {}), ...(bf ? { bf: 1 } : {}), ...(prio ? { pr: 1 } : {}), ...(sent.id ? { po: sent.id } : {}), ...(body.follow === true ? { f: 1 } : {}) } : null;
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
        await env.KV.put(key, JSON.stringify({ n, first: rec.first || now, last: now, all: nth, ...(fpNext.length ? { fp: fpNext } : {}), ...(relay ? { lt: { id, to: body.to, at: Date.now() } } : {}) }));
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
          await record(env, { e: `consulta:${body.to}`, p: tag, note: [fromAd ? `vino de un anuncio${camp ? ` (${camp})` : ''}` : '', viaName ? `vino desde ${viaName}` : '', paid ? 'consulta pagada' : ''].filter(Boolean).join(', ') }, sendMail, ctx);
          if (fromAd) await record(env, { e: camp ? `consulta_anuncio:${camp}` : 'consulta_anuncio', p: tag }, sendMail, ctx);
          // Conversión para Google Ads: el código del clic (gclid, de esta misma visita) y la hora, 90 días; Google lo recoge del CSV
          if (fromAd && /^[\w-]{10,200}$/.test(String(body.gclid || ''))) await env.KV.put(`conv:${Date.now()}:${id}`, JSON.stringify({ g: body.gclid, n: 'Consulta enviada' }), { expirationTtl: 90 * 86400 });
          // Enlace de canal (?via=…, p. ej. ig_marina): cuántas consultas trae cada uno
          if (cc) await bump(env, `consulta_pais:${cc}`);
          // Prueba Black Friday: consultas enviadas por cada versión (bf = pagada a 1 €; gratis = la de siempre)
          // Pruebas de precio (desde el 22 nov, para todas las visitas, no solo anuncios): pago = 9 €, prio = 29 €
          if (!partner && (body.src === 'ads' || ['pago', 'prio'].includes(body.ab)) && ['bf', 'gratis', 'prio', 'pago'].includes(body.ab)) await bump(env, `consulta_ab:${body.ab}`);
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
      // Modo equipo (Noza, 19 nov): también llega la copia, marcada «prueba del equipo» (sigue sin contar en el panel)
      if (bcc) {
        const withFiles = env.COPY_ATTACH === '1' && files.length > 0;
        // COPY_EMAIL="1" (temporal, Noza 11 nov): la copia dice el correo de la usuaria, por si hay problemas
        const who = env.COPY_EMAIL === '1' ? `<p style="font-size:13px;color:#6E6C67">Correo de la usuaria: <b>${esc(q.email)}</b></p>` : '';
        const extra = `${who}${q.context ? `<p style="font-size:13px;color:#6E6C67">Sobre: ${esc(q.context)}</p>` : ''}${q.situation ? `<p style="font-size:13px;color:#6E6C67">Situación: ${nl2br(q.situation)}</p>` : ''}`;
        const tc = teamCopy({ subject: `Consulta · ${pro.short} · #${id.toUpperCase()}${files.length ? ` · ${files.length} ${files.length === 1 ? 'adjunto' : 'adjuntos'}` : ''}${body.src === 'ads' ? (/_latam$/.test(String(body.camp || '')) ? ' · desde anuncio (Latinoamérica)' : ' · desde anuncio') : ''}${via ? ` · desde ${viaName || via}` : ''}${paid ? ' · pagada' : ''}${nth > 1 ? ` · ${nth}.ª consulta` : ''}${prio ? ' · PRIORITARIA 6 h' : ''}${cc ? ` · ${cc}` : ''}${body.team === true ? ' · prueba del equipo' : ''}`,
          intro: `Nueva consulta para <b>${esc(pro.name)}</b>${body.src === 'ads' ? ' (llegó desde un anuncio)' : ''}.${nth > 1 ? ` <b>Es su ${nth}.ª consulta</b>${prevAt ? ` (la anterior, el ${new Date(prevAt).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short' })})` : ''}.` : ''}`, body: q.text, extra, nFiles: files.length, withFiles });
        await sendMail(env, { to: bcc, from: TEAM_FROM, replyTo: 'contacto@hera-gine.com', ...tc, ...(withFiles ? { attachments: files } : {}) });
      }
      const remaining = Math.max(0, limit - n);
      const paidLeft = remaining === 0 && !unlimited && creditsLeft >= 0 && (paid || credits > 0)
        ? (creditsLeft === 0 ? 'Era la última consulta de tu saldo' : `Te ${creditsLeft === 1 ? 'queda 1 consulta' : `quedan ${creditsLeft} consultas`} en tu saldo`) : '';
      const usedPros = test ? fp : (!unlimited && !paid && !fp.includes(body.to) ? [...fp, body.to] : fp);
      const nextWith = !friend && remaining > 0 && usedPros.length ? Object.values(PROS).filter((x) => !usedPros.includes(x.key)).map((x) => x.short).join(' o ') : '';
      const cm = confirmEmail(pro, { ...q, prio }, remaining, id, unlimited, acomp ? 'Tienes el acompañamiento mensual: te responden en menos de 6 h' : subscriber ? 'Tienes el plan ilimitado: una consulta nueva al día' : paidLeft || (nextWith && remaining === 1 ? `Te queda 1 consulta gratuita, con ${nextWith}` : ''));
      const sentU = await sendMail(env, { to: q.email, replyTo: relay ? await relayAddress(env, 'u', id) : pro.email, ...cm });
      // Sin relay no hay hilo que seguir (ni recordatorios): no se guarda nada más
      if (relay) {
        await saveThread(env, { ...baseThread, su: cm.subject, ...(sentU?.id ? { ou: [sentU.id] } : {}), ...(rf ? { rf } : {}) });
      }
      // «Envíaselo a alguien» en la pantalla de enviada: su enlace personal (invite.js), si quien llega pregunta, 1 consulta para ella
      const invite = relay && !test && body.team !== true ? await inviteCode(env, h, baseThread.u).catch(() => '') : '';
      return reply(200, { ok: true, ...(invite ? { invite } : {}), remaining, freeLimit: limit, ...(nextWith ? { next: nextWith, fp: usedPros } : {}), ...(unlimited ? { unlimited: true } : {}), ...(acomp ? { acomp: true } : {}), ...(paid || credits > 0 ? { credits: creditsLeft } : {}), ...(relay ? { id } : {}), dryRun: env.DRY_RUN === '1' });
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
    // Un solo cron cada 15 min (el plan gratis de Cloudflare permite 5 por cuenta y ya están usados):
    // los recordatorios de pago, siempre; lo demás, una vez por hora (en la pasada de los :15)
    const min = event?.scheduledTime ? new Date(event.scheduledTime).getUTCMinutes() : 15;
    if (min !== 15) { await remindHolds(env); return; }
    await remindOverdue(env);
    await menoFollowups(env).catch((e) => console.log(`meno ${e.message}`));
    await sendFeedbackDue(env, sendMail, PROS);
    // Resumen de actividad por correo: apagado (Noza, 20 nov). La actividad sigue en el panel.
    // await hourlyDigest(env, sendMail);
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
  // Sin gratis (NO_FREE, 22 nov) no se ofrece el enlace para invitar: prometía «2 primeras gratis» a quien invitas
  const invite = env.NO_FREE !== '1' && role === 'p' && !t.a && t.h && t.p !== 'prueba' ? inviteBlock(await inviteCode(env, t.h, t.u)) : null;
  // Primera respuesta a una consulta de anuncio: oferta de llamada, videollamada o consulta nueva (Noza, 20 nov)
  let offer = null;
  if (role === 'p' && !t.a && t.ad && t.p !== 'prueba' && PROS[t.p]) {
    const rc = t.h ? await env.KV.get(`c:${t.h}`, 'json').catch(() => null) : null;
    // Sin gratis (NO_FREE): la consulta nueva cuesta 1 € hasta el 1 dic y 9 € después
    offer = env.NO_FREE === '1' ? offerBlock(pro, 0, Date.now() < Math.min(BF_END, Number(env.BF_OFFER_END_MS) || BF_OFFER_END)) : offerBlock(pro, Math.max(0, Number(env.FREE_LIMIT || 2) - (rc?.n || 0)), !!t.bf);
    await bump(env, 'oferta_respuesta');
  }
  const { html, text } = relayEmail(pro, role, t.id, msg.body || '(Sin texto: mira el archivo adjunto.)', msg.attachments.length, rate, invite, offer);
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

/** Todas las consultas (solo nombre y metadatos), con una sola pasada por KV.
 * 22 nov: antes cada consulta pendiente volvía a listar todas (answeredTwin) y el panel gastaba ~17 listas por visita;
 * el plan gratis de Cloudflare permite 1000 listas al día y llegamos al 90 %. */
async function listThreads(env) {
  const keys = []; let cursor;
  do {
    const page = await env.KV.list({ prefix: 't:', cursor });
    keys.push(...page.keys);
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return keys;
}

/** Consultas abiertas sin respuesta, por profesional (para el panel) */
async function openThreads(env) {
  const out = { pendientes: {}, fuera_plazo: {} };
  const keys = await listThreads(env);
  for (const k of keys) {
    const m = k.metadata || {};
    if (!m.p || m.a || m.p === 'prueba') continue;
    // Consulta repetida (la misma duda enviada dos veces seguidas) ya contestada en la otra: no cuenta como pendiente
    if (await answeredTwin(env, { id: k.name.slice(2), p: m.p, c: m.c, u8: m.u }, keys)) continue;
    out.pendientes[m.p] = (out.pendientes[m.p] || 0) + 1;
    if (Date.now() - m.c > 24 * 3600000) out.fuera_plazo[m.p] = (out.fuera_plazo[m.p] || 0) + 1;
  }
  return out;
}

const TWIN_WINDOW = 3600000;
/** ¿Hay otra consulta de la misma usuaria a la misma profesional, enviada con menos de 1 h de diferencia y respondida
 * después de esta? Usa la lista ya hecha (keys); solo lee un hilo si le faltan los metadatos de la usuaria. */
async function answeredTwin(env, t, keys) {
  const u = String(t.uh || t.u8 || '').slice(0, 8); // ojo: en un hilo completo, t.u es el correo cifrado
  for (const k of keys || await listThreads(env)) {
    const m = k.metadata || {};
    if (k.name === `t:${t.id}` || m.p !== t.p || !(m.a >= t.c) || Math.abs((m.c || 0) - t.c) > TWIN_WINDOW) continue;
    if (m.u && u ? m.u === u : (await loadThread(env, k.name.slice(2)))?.uh?.slice(0, 8) === u) return true;
  }
  return false;
}

export async function remindOverdue(env) {
  let n = 0;
  const keys = await listThreads(env);
  {
    for (const k of keys) {
      const m = k.metadata || {};
      // Prioritaria: recordatorio a las 4 h (plazo de 6 h); el resto, a las 16 h (plazo de 24 h)
      if (!m.p || m.a || m.r || Date.now() - m.c < (m.pr ? 4 : 16) * 3600000) continue;
      const t = await loadThread(env, k.name.slice(2));
      if (!t || t.a || t.rem) continue;
      const pro = PROS[t.p] || (t.p === 'prueba' && env.COPY_TO ? { short: 'Prueba', email: env.COPY_TO } : null);
      if (!pro) continue;
      // La misma usuaria hizo otra consulta a la misma profesional y esa ya está respondida después de esta:
      // casi siempre es la misma duda enviada dos veces (la profesional contestó en el otro hilo). Sin recordatorio.
      if (await answeredTwin(env, t, keys)) { t.rem = true; await saveThread(env, t); await bump(env, 'recordatorio_omitido'); continue; }
      const { html, text } = reminderEmail(pro, t.id, !!t.pr);
      const sent = await sendMail(env, { to: pro.email, replyTo: await relayAddress(env, 'p', t.id), subject: `Re: ${t.sp}`, refs: t.rp, html, text });
      if (sent) { t.rem = true; await saveThread(env, t); if (t.p !== 'prueba') await bump(env, `recordatorio:${t.p}`); n++; }
    }
  }
  return n;
}


// ── Pasar una consulta a otra especialista (20 nov) ──
// El correo de la profesional lleva «Pasársela a…» (enlace firmado). GET enseña una página con un botón (los
// antivirus del correo abren los enlaces solos); POST la reasigna: el correo original se recupera de Resend,
// la nueva profesional lo recibe con su propio hilo de respuesta, la usuaria recibe un aviso, el plazo de 24 h
// empieza de nuevo y su consulta gratis pasa a contar como de la nueva profesional.
async function reassign(env, request, url) {
  const page = (title, msg, form = '') => new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><body style="font:16px/1.5 -apple-system,system-ui,sans-serif;max-width:520px;margin:48px auto;padding:0 20px;color:#2F3631"><h1 style="font:400 26px/1.2 Georgia,serif;color:#45574C">${esc(title)}</h1><p>${msg}</p>${form}</body>`, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'referrer-policy': 'no-referrer' } });
  const f = request.method === 'POST' ? await request.formData().catch(() => null) : null;
  const get = (k) => String((f ? f.get(k) : url.searchParams.get(k)) || '');
  const id = get('t').toLowerCase(), to = get('to'), sig = get('s');
  if (!/^[a-z0-9]{8}$/.test(id) || !PROS[to] || sig !== (await hmac(env.HASH_SALT, `reasignar:${id}`)).slice(0, 16)) return page('Enlace no válido', 'Este enlace no es válido. Si la consulta no es de tu área, escríbenos a contacto@hera-gine.com.');
  const t = await loadThread(env, id);
  if (!t) return page('Consulta no encontrada', `No encuentro la consulta #${id.toUpperCase()} (o tiene más de 30 días).`);
  const from = PROS[t.p], target = PROS[to];
  if (t.p === to) return page('Ya es tuya', `La consulta #${id.toUpperCase()} ya está asignada a ${esc(target.short)}.`);
  if (t.ra) return page('Ya se ha pasado', `La consulta #${id.toUpperCase()} ya se pasó a ${esc((PROS[t.p] || {}).short || 'otra profesional')}. Solo se puede pasar una vez.`);
  if (t.a) return page('Ya está respondida', `La consulta #${id.toUpperCase()} ya tiene respuesta, así que no se puede pasar.`);
  if (request.method !== 'POST') {
    return page(`¿Pasar la consulta a ${target.short}?`, `La consulta #${id.toUpperCase()} le llegará a <b>${esc(target.name)}</b> (${esc(target.role)}), que tendrá 24 h para responder. A la usuaria le avisamos de que la responderá ${esc(target.short)}. No se le cobra nada.`,
      `<form method="post" action="/reasignar"><input type="hidden" name="t" value="${id}"><input type="hidden" name="to" value="${to}"><input type="hidden" name="s" value="${sig}"><button style="font:600 16px system-ui;background:#45574C;color:#fff;border:0;border-radius:10px;padding:14px 22px;cursor:pointer">Pasársela a ${esc(target.short)}</button></form>`);
  }
  // El correo original (texto de la consulta y adjuntos no: los adjuntos solo los tenía la primera profesional)
  let orig = null;
  if (t.po && (env.RESEND_READ_KEY || env.RESEND_API_KEY)) {
    try { const r = await fetch(`https://api.resend.com/emails/${t.po}`, { headers: { Authorization: `Bearer ${env.RESEND_READ_KEY || env.RESEND_API_KEY}` } }); if (r.ok) orig = await r.json(); } catch { /* sin correo */ }
  }
  if (!orig || !(orig.html || orig.text)) {
    await notify(env, `Error · no se pudo pasar la consulta #${id.toUpperCase()}`, `${from?.short || t.p} quería pasar la consulta #${id.toUpperCase()} a ${target.short}, pero no se ha podido recuperar el correo original. Reenvíasela a mano.`);
    return page('No se ha podido pasar', 'No hemos podido recuperar la consulta para reenviarla. Ya hemos avisado al equipo de Hera, que se la pasará a mano. No hace falta que hagas nada más.');
  }
  const links = await reassignLinks(env, id, to);
  const note = `<p style="font-size:13px;background:#FFF6D6;border-radius:8px;padding:8px 12px">${esc(from?.short || 'La profesional')} te ha pasado esta consulta: cree que es más de tu área. Tienes 24 h para responder.</p>`;
  const oldName = from?.name || '';
  let html = String(orig.html || '').replace(/<!--ra-->[\s\S]*?<!--\/ra-->/g, '');
  html = html.replace(`Nueva consulta para <b>${esc(oldName)}</b>`, `Nueva consulta para <b>${esc(target.name)}</b>`);
  html = html.includes('<p>Nueva consulta') ? html.replace('<p>Nueva consulta', `${note}<p>Nueva consulta`) : note + html;
  if (html.includes('</body>')) html = html.replace('</body>', `${reassignHtml(links)}</body>`); else html += reassignHtml(links);
  const text = `${from?.short || 'La profesional'} te ha pasado esta consulta: cree que es más de tu área. Tienes 24 h para responder.\n\n${String(orig.text || '').split('\n\n¿No es de tu área?')[0].replace(`Nueva consulta para ${oldName}`, `Nueva consulta para ${target.name}`)}${reassignText(links)}`;
  const sent = await sendMail(env, { to: target.email, replyTo: await relayAddress(env, 'p', id), subject: orig.subject || t.sp, html, text });
  if (!sent) return page('No se ha podido pasar', 'Ha fallado el envío. Prueba otra vez en un momento.');
  // El hilo pasa a la nueva profesional; el plazo y el recordatorio empiezan de nuevo
  Object.assign(t, { p: to, ra: { from: from?.key || t.p, at: Date.now() }, c: Date.now(), rem: false, rp: [], ...(sent.id ? { po: sent.id } : {}) });
  await saveThread(env, t);
  // Su consulta gratis cuenta ahora como de la nueva profesional
  if (t.h) {
    try {
      const rec = JSON.parse((await env.KV.get(`c:${t.h}`)) || 'null');
      if (rec && Array.isArray(rec.fp) && rec.fp.includes(from?.key)) { rec.fp = [...new Set(rec.fp.map((k) => (k === from.key ? to : k)))]; await env.KV.put(`c:${t.h}`, JSON.stringify(rec)); }
    } catch { /* sin contador */ }
  }
  // Aviso a la usuaria, en el mismo hilo
  try {
    const userTo = await openEmail(env, t.u);
    const msg = `Tu consulta #${id.toUpperCase()} la responderá ${target.name}, ${target.role}, que es quien mejor puede ayudarte con esto. Te responderá en menos de 24 h, en esta misma conversación.`;
    const sentU = await sendMail(env, { to: userTo, replyTo: await relayAddress(env, 'u', id), subject: `Re: ${t.su}`, refs: t.ru, html: shell(`<p>Hola,</p><p>${esc(msg)}</p><p style="font-size:13px;color:#6E6C67">No tienes que hacer nada. Si quieres añadir algo, responde a este correo y le llegará a ${esc(target.short)}.</p>`), text: `Hola,\n\n${msg}\n\nNo tienes que hacer nada. Si quieres añadir algo, responde a este correo y le llegará a ${target.short}.` });
    if (sentU?.id) { t.ou = [...(t.ou || []), sentU.id].slice(-10); await saveThread(env, t); }
  } catch (e) { console.log(`reasignar aviso ${e.message}`); }
  await bump(env, 'reasignada');
  await notify(env, `Consulta reasignada · #${id.toUpperCase()} · ${from?.short || t.p} → ${target.short}`, `${from?.short || t.p} ha pasado la consulta #${id.toUpperCase()} a ${target.short}. A la usuaria se le ha avisado y el plazo de 24 h empieza de nuevo.`);
  return page('Hecho', `La consulta #${id.toUpperCase()} ya le ha llegado a ${esc(target.short)}. A la usuaria le hemos avisado. Gracias.`);
}
