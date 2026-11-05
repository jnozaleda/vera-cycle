// Opinión tras la consulta (correo 24 h después de la primera respuesta) y seguimiento con permiso.
// Las valoraciones se cuentan por profesional; los comentarios se guardan sin el correo ni el número de consulta.
// El seguimiento lo hace la profesional por el mismo hilo de Hera, así que no hace falta guardar el correo más de 30 días.
import { loadThread, saveThread, relayAddress, openEmail } from './relay.js';
import { notify } from './activity.js';

const PANEL = 'https://hera-consultas.tempcheck-app.workers.dev/panel';

export const RATING = { 1: 'Sí, mucho', 2: 'Más o menos', 3: 'No' };
const SITE = 'https://hera-gine.com';
const DAY = 86400000;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function hex(secret, text) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text)))].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export const feedbackSig = async (env, id) => (await hex(env.HASH_SALT, `opinion:${id}`)).slice(0, 16);

/** Correo de opinión, con el estilo de la marca y tres botones de un toque */
export function feedbackEmail(pro, id, sig) {
  const link = (q) => `${SITE}/opinion/?t=${id}&s=${sig}&${q}`;
  const btn = (r, solid) => `<a href="${link(`r=${r}`)}" style="display:block;text-align:center;text-decoration:none;font-weight:600;font-size:15px;border-radius:8px;padding:12px;margin:0 0 8px;border:1.5px solid #693D55;${solid ? 'background:#693D55;color:#ffffff' : 'background:#ffffff;color:#693D55'}">${RATING[r]}</a>`;
  const html = `<div style="background:#FBF7F1;padding:24px 16px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#2E2630">
<div style="max-width:460px;margin:0 auto">
<div style="font-family:Georgia,serif;font-size:28px;color:#3B2433;margin-bottom:18px">Hera</div>
<p style="font-size:15px;line-height:1.5;margin:0 0 12px">Hola,</p>
<p style="font-size:15px;line-height:1.5;margin:0 0 16px">Ayer <b>${esc(pro.short)}</b>, ${esc(pro.role)} de Hera, respondió a tu consulta. Nos ayudaría mucho saber si te sirvió: es un toque.</p>
<p style="font-family:Georgia,serif;font-size:21px;color:#3B2433;margin:0 0 12px">¿Te ayudó su respuesta?</p>
${btn(1, true)}${btn(2)}${btn(3)}
<p style="font-size:13px;color:#655B61;line-height:1.5;margin:14px 0">¿Te ha surgido otra duda sobre lo mismo? Responde al correo de ${esc(pro.short)}: no gasta consultas.</p>
<p style="font-size:12px;color:#8A8A8E;line-height:1.5;border-top:1px solid #E6DFE2;padding-top:10px;margin:16px 0 0">Consulta #${id.toUpperCase()}. No es un servicio de urgencias: si algo no va bien, llama al 112.<br>Solo te escribimos una vez por consulta. <a href="${link('baja=1')}" style="color:#8A8A8E">No quiero recibir más correos como este</a>.</p>
</div></div>`;
  const text = `Hola,\n\nAyer ${pro.short}, ${pro.role} de Hera, respondió a tu consulta. ¿Te ayudó su respuesta?\n\n${[1, 2, 3].map((r) => `${RATING[r]}: ${link(`r=${r}`)}`).join('\n')}\n\n¿Otra duda sobre lo mismo? Responde al correo de ${pro.short}: no gasta consultas.\n\nNo quiero recibir más correos como este: ${link('baja=1')}`;
  return { subject: `¿Te ayudó la respuesta de ${pro.short}?`, html, text };
}

/** Cron: correo de opinión 24 h después de la primera respuesta, una vez por consulta */
export async function sendFeedbackDue(env, sendMail, PROS, now = Date.now()) {
  let cursor; let n = 0;
  do {
    const page = await env.KV.list({ prefix: 't:', cursor });
    for (const k of page.keys) {
      const m = k.metadata || {};
      if (!m.a || m.f || now - m.a < DAY) continue;
      const t = await loadThread(env, k.name.slice(2));
      if (!t || !t.a || t.fb) continue;
      const pro = PROS[t.p];
      t.fb = now;
      if (pro && !(await env.KV.get(`nf:${t.uh}`))) {
        const fe = feedbackEmail(pro, t.id, await feedbackSig(env, t.id));
        if (await sendMail(env, { to: await openEmail(env, t.u), replyTo: 'contacto@hera-gine.com', ...fe })) n++;
      }
      await saveThread(env, t);
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return n;
}

/** Aviso a la profesional por el hilo: la usuaria no quedó satisfecha y quiere seguimiento */
async function askFollowUp(env, t, pro, sendMail) {
  const r = RATING[t.fr] || '';
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#2E2630;max-width:520px">
<p>La usuaria de la consulta <b>#${t.id.toUpperCase()}</b> dice que tu respuesta le ayudó «${esc(r.toLowerCase())}» y ha pedido seguimiento.</p>
${t.ft ? `<div style="background:#F4E6E8;border-radius:10px;padding:12px;margin:10px 0">«${esc(t.ft)}»</div>` : ''}
<p><b>Responde a este correo</b> para escribirle: le llegará por Hera, sin que veáis vuestros correos.</p></div>`;
  const text = `La usuaria de la consulta #${t.id.toUpperCase()} dice que tu respuesta le ayudó «${r.toLowerCase()}» y ha pedido seguimiento.${t.ft ? `\n\n«${t.ft}»` : ''}\n\nResponde a este correo para escribirle: le llegará por Hera.`;
  const sent = await sendMail(env, { to: pro.email, replyTo: await relayAddress(env, 'p', t.id), subject: `Seguimiento · Re: ${t.sp}`, refs: t.rp, html, text });
  if (sent) t.fs = Date.now();
  return !!sent;
}

async function threadFor(env, body) {
  const id = String(body.t || '').toLowerCase();
  if (!/^[a-z0-9]{8}$/.test(id) || String(body.s || '') !== await feedbackSig(env, id)) return null;
  return loadThread(env, id);
}

/** POST /opinion {t,s,r} · /opinion/comentario {t,s,text,name,publish,follow} · /opinion/baja {t,s} */
export async function handleOpinion(env, path, body, { PROS, sendMail, bump }) {
  const t = await threadFor(env, body);
  if (!t) return [404, { error: 'not_found' }];
  const pro = PROS[t.p] || null;
  const info = { pro: pro?.short || 'la profesional', role: pro?.role || '', followAsked: !!t.f };
  if (path === '/opinion/baja') {
    await env.KV.put(`nf:${t.uh}`, '1');
    return [200, { ok: true }];
  }
  if (path === '/opinion') {
    const r = Number(body.r);
    if (!RATING[r]) return [400, { error: 'bad_rating' }];
    if (!t.fr) {
      t.fr = r;
      if (pro) await bump(env, `opinion:${t.p}:${r}`);
      // Si ya dio permiso al preguntar y no quedó satisfecha, la profesional recibe el aviso al momento
      if (r > 1 && t.f && !t.fs && pro) await askFollowUp(env, t, pro, sendMail);
      await saveThread(env, t);
      // Aviso al equipo de cada opinión, positiva o negativa (sin el correo de la usuaria)
      if (t.p !== 'prueba') await notify(env, `Hera · opinión: «${RATING[r]}» para ${pro?.short || t.p}`,
        `Nueva opinión sobre una consulta respondida por ${pro?.short || t.p}: «${RATING[r]}».${r > 1 ? (t.f ? '\nPidió seguimiento al preguntar: la profesional ya tiene el aviso.' : '\nTodavía no ha pedido seguimiento.') : ''}\n\nSi deja un comentario, te llegará en otro aviso. Panel: ${PANEL}`, sendMail);
    }
    return [200, { ok: true, r: t.fr, done: !!t.fc, followSent: !!t.fs, ...info }];
  }
  if (path === '/opinion/comentario') {
    if (!t.fr) return [409, { error: 'no_rating' }];
    if (t.fc) return [200, { ok: true, repeated: true }];
    const text = String(body.text || '').trim().slice(0, 1000);
    const name = String(body.name || '').trim().slice(0, 40);
    const publish = body.publish === true && t.fr === 1 && !!text && !!name;
    if (text && env.DB) {
      // Sin correo ni número de consulta: solo profesional, valoración, texto y, si deja publicarlo, el nombre que elija
      await env.DB.prepare('INSERT INTO opiniones (ts, pro, rating, texto, nombre, publicable) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
        .bind(Date.now(), t.p, t.fr, text, publish ? name : null, publish ? 1 : 0).run();
    }
    t.fc = Date.now();
    if (text && t.fr > 1) t.ft = text.slice(0, 500);
    if (body.follow === true && t.fr > 1) t.f = 1;
    const before = !!t.fs;
    if (t.f && t.fr > 1 && !t.fs && pro) await askFollowUp(env, t, pro, sendMail);
    await saveThread(env, t);
    if (t.p !== 'prueba' && (text || (t.fs && !before))) await notify(env, `Hera · comentario: «${RATING[t.fr]}» para ${pro?.short || t.p}`,
      `${text ? `Comentario sobre la respuesta de ${pro?.short || t.p} («${RATING[t.fr]}»):\n\n«${text}»\n\n${publish ? `Se puede publicar en la web como «${name}».` : 'No dio permiso para publicarlo.'}` : `Sin comentario.`}${t.fs && !before ? `\n\nHa pedido seguimiento: ${pro?.short || 'la profesional'} ya tiene el aviso para escribirle.` : ''}\n\nPanel: ${PANEL}`, sendMail);
    return [200, { ok: true, followSent: !!t.fs }];
  }
  return [404, { error: 'not_found' }];
}
