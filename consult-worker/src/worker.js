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
//   GET  /status?ids=a,b                                                   app: ¿respondida? por número de consulta (solo fechas)
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

import { newThreadId, relayAddress, parseRelayAddress, sealEmail, openEmail, saveThread, loadThread, parseIncoming, isAutomatic } from './relay.js';

export const PROS = {
  gineco: { key: 'gineco', name: 'Dr. Gonzalo Nozaleda', short: 'Gonzalo', role: 'ginecólogo', email: 'gonzalo@hera-gine.com' },
  matrona: { key: 'matrona', name: 'Marina Fernández', short: 'Marina', role: 'matrona', email: 'marina@hera-gine.com' },
  pediatra: { key: 'pediatra', name: 'Lucía Carrascón', short: 'Lucía', role: 'pediatra', email: 'lucia@hera-gine.com' },
};

const EMAIL_RE = /^[^\s@<>()",;]{1,64}@[^\s@<>()",;]{1,190}\.[a-z]{2,24}$/i;
const MAX_BODY = 6000;

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
  return `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#2C2C2A;font-size:15px;line-height:1.55">
<div style="font-family:Georgia,serif;font-size:24px;color:#3F584B;margin-bottom:16px">Hera</div>${inner}
<p style="font-size:12px;color:#888780;margin-top:24px;border-top:1px solid #E4DED0;padding-top:12px">Hera · Embarazo, posparto y bebé · <a href="https://hera-gine.com" style="color:#3F584B">hera-gine.com</a></p></div>`;
}

export function proEmail(pro, q, id = '', relay = true) {
  const subject = `Consulta Hera${id ? ` #${id.toUpperCase()}` : ''}${q.context ? ` · ${q.context}` : ''}`;
  const html = shell(`<p>Nueva consulta para <b>${esc(pro.name)}</b>.</p>
<div style="background:#F1EFE8;border-radius:10px;padding:14px;margin:12px 0">${nl2br(q.text)}</div>
${q.context ? `<p style="font-size:13px;color:#5F5E5A">Sobre: ${esc(q.context)}</p>` : ''}
${q.situation ? `<p style="font-size:13px;color:#5F5E5A">Situación: ${nl2br(q.situation)}</p>` : ''}
${relay ? `<p style="font-size:13px;color:#5F5E5A"><b>Para contestar, responde a este correo</b> desde el móvil o el ordenador. Tu respuesta le llegará a la usuaria desde ${esc(pro.email)}: tu correo personal no se muestra. Si ella vuelve a escribir, te llegará en esta misma conversación. Plazo comprometido: 48 h.</p>`
    : `<p style="font-size:13px;color:#5F5E5A">Responde a este correo para contestar directamente a la usuaria (${esc(q.email)}). Plazo comprometido: 48 h.</p>`}`);
  const text = `Nueva consulta para ${pro.name}\n\n${q.text}\n\n${q.context ? `Sobre: ${q.context}\n` : ''}${q.situation ? `Situación: ${q.situation}\n` : ''}\n${relay ? `Para contestar, responde a este correo: tu respuesta le llegará a la usuaria desde ${pro.email}, sin mostrar tu correo personal. Plazo: 48 h.` : `Responde a este correo para contestar a la usuaria (${q.email}).`}`;
  return { subject, html, text };
}

export function confirmEmail(pro, q, remaining, id = '', unlimited = false) {
  const excerpt = q.text.length > 160 ? `${q.text.slice(0, 160).trim()}…` : q.text;
  const left = unlimited ? 'Tienes consultas ilimitadas' : remaining === 0 ? 'Era tu última consulta gratuita' : `Te ${remaining === 1 ? 'queda 1 consulta gratuita' : `quedan ${remaining} consultas gratuitas`}`;
  const subject = `Tu consulta a ${pro.short} · Hera${id ? ` #${id.toUpperCase()}` : ''}`;
  const html = shell(`<p>Hola,</p>
<p>Tu consulta ha llegado a <b>${esc(pro.name)}, ${esc(pro.role)}</b>. Te responderá en esta misma conversación en menos de 48 h.</p>
<div style="background:#F1EFE8;border-radius:10px;padding:12px;margin:12px 0;font-size:14px;color:#444441">«${esc(excerpt)}»${q.context ? `<br><span style="color:#5F5E5A">Sobre: ${esc(q.context)}</span>` : ''}</div>
<p><span style="display:inline-block;background:#E7EDE6;color:#3F584B;border-radius:999px;padding:4px 12px;font-size:13px;font-weight:600">${left}</span></p>
<p style="font-size:13px;color:#5F5E5A">¿Quieres añadir algo o enviar una foto? Responde a este correo y le llegará a ${esc(pro.short)}.</p>
<p style="font-size:13px;color:#5F5E5A">No es un servicio de urgencias. Si algo no va bien, llama al 112 o acude a tu centro de salud.</p>
<p style="font-size:12px;color:#888780">¿No has escrito tú esta consulta? Escríbenos a contacto@hera-gine.com y la borramos.</p>`);
  const text = `Tu consulta ha llegado a ${pro.name}, ${pro.role}. Te responderá en esta misma conversación en menos de 48 h.\n\n«${excerpt}»\n\n${left}.\n\n¿Quieres añadir algo o enviar una foto? Responde a este correo y le llegará a ${pro.short}.\n\nNo es un servicio de urgencias: si algo no va bien, llama al 112 o acude a tu centro de salud.\n¿No has escrito tú esta consulta? Escríbenos a contacto@hera-gine.com y la borramos.`;
  return { subject, html, text };
}


/** Mensaje reenviado por el hilo: del profesional a la usuaria o de la usuaria al profesional */
export function relayEmail(pro, role, id, body, nAttach) {
  const head = role === 'p' ? `<p style="font-size:13px;color:#5F5E5A;margin-bottom:6px">${esc(pro.name)}, ${esc(pro.role)}, te responde:</p>`
    : `<p style="font-size:13px;color:#5F5E5A;margin-bottom:6px">La usuaria de la consulta #${id.toUpperCase()} ha escrito:</p>`;
  const att = nAttach ? `<p style="font-size:13px;color:#5F5E5A">📎 ${nAttach} ${nAttach === 1 ? 'archivo adjunto' : 'archivos adjuntos'}</p>` : '';
  const foot = role === 'p'
    ? 'Si necesitas aclarar algo, responde a este correo. No es un servicio de urgencias: si algo no va bien, llama al 112 o acude a tu centro de salud.'
    : `Responde a este correo para contestarle; le llegará desde ${pro.email}.`;
  const html = shell(`${head}<div style="white-space:normal">${nl2br(body)}</div>${att}<p style="font-size:12px;color:#888780;margin-top:18px">${esc(foot)}</p>`);
  const text = `${role === 'p' ? `${pro.name}, ${pro.role}, te responde:` : `La usuaria de la consulta #${id.toUpperCase()} ha escrito:`}\n\n${body}\n\n${nAttach ? `[${nAttach} adjunto(s)]\n\n` : ''}${foot}`;
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

/** Eventos que acepta /hit (nombre o nombre:valor) */
export const EVENT_RE = /^(apertura|portada|pregunta_portada|enviada_portada|abrir_portada|consulta_abierta|push_on|sync_on|etapa:(pregnancy|postpartum|cycle)|pestana:(today|diary|care|guide|cycle|trends|baby)|vista:(tu|bebe))$/;

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
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: from || env.FROM, to: [to], reply_to: replyTo, subject, html, text, ...(bcc ? { bcc: [bcc] } : {}),
      ...(headers ? { headers } : {}), ...(attachments?.length ? { attachments } : {}) }),
  });
  if (!res.ok) { console.log(`resend ${res.status} ${await res.text()}`); return null; }
  const j = await res.json().catch(() => ({}));
  return { id: j.id || null };
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
  async fetch(request, env) {
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
      if (raw.length > MAX_BODY) return reply(413, { error: 'too_large' });
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

    if (url.pathname === '/hit') {
      const e = String(body.e || '');
      if (!EVENT_RE.test(e)) return reply(400, { error: 'bad_event' });
      await bump(env, e);
      if (e === 'apertura') await countPerson(env, request, 'app');
      if (e === 'portada') await countPerson(env, request, 'portada');
      return reply(200, { ok: true });
    }

    if (url.pathname === '/notify') {
      const norm = normalizeEmail(body.email);
      if (!norm) return reply(400, { error: 'bad_email' });
      if (body.consent !== true) return reply(400, { error: 'consent' });
      const h = await hmac(env.HASH_SALT, norm);
      await env.KV.put(`w:${h}`, JSON.stringify({ email: String(body.email).trim(), at: new Date().toISOString() }));
      await bump(env, 'aviso_pago');
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
      const text = String(body.text || '').trim();
      if (text.length < 5 || text.length > 2000) return reply(400, { error: 'bad_text' });
      const q = { email: String(body.email).trim(), text, context: String(body.context || '').slice(0, 120), situation: String(body.situation || '').slice(0, 500) };
      // Prueba de principio a fin (solo con ADMIN_TOKEN): el «profesional» es COPY_TO y no cuenta como consulta gratuita
      const test = body.to === 'prueba' && env.ADMIN_TOKEN && request.headers.get('Authorization') === `Bearer ${env.ADMIN_TOKEN}` && env.COPY_TO;

      const key = `c:${await hmac(env.HASH_SALT, norm)}`;
      const rec = (await env.KV.get(key, 'json')) || { n: 0, first: null, last: null };
      // Consultas ilimitadas (beta testers / plan ilimitado): no gastan gratuitas
      const vip = await env.KV.get(`v:${await hmac(env.HASH_SALT, norm)}`, 'json');
      const unlimited = !!vip && (!vip.until || Date.parse(vip.until) > Date.now());
      if (!test && !unlimited && rec.n >= limit) { await bump(env, 'gratuitas_agotadas'); return reply(200, { limit: true, used: rec.n, freeLimit: limit }); }
      if (!test && await rateLimited(env, request.headers.get('CF-Connecting-IP'))) return reply(429, { error: 'rate' });

      // Hilo: el profesional y la usuaria se responden a través de direcciones de Hera de un solo uso
      const id = newThreadId();
      const bcc = test ? undefined : env.COPY_TO || undefined; // COPY_TO (secreto): copia oculta de cada consulta mientras se prueba
      // RELAY="1": respuestas a través de Hera (necesita la regla catch-all → Worker en Email Routing). Las pruebas siempre lo usan.
      const relay = env.RELAY === '1' || !!test;
      const pm = proEmail(pro, q, id, relay);
      const sent = await sendMail(env, { to: pro.email, replyTo: relay ? await relayAddress(env, 'p', id) : q.email, ...pm, bcc });
      if (!sent) return reply(502, { error: 'send' });
      const now = new Date().toISOString();
      const n = test || unlimited ? rec.n : rec.n + 1;
      if (!test) {
        if (!unlimited) await env.KV.put(key, JSON.stringify({ n, first: rec.first || now, last: now }));
        await bump(env, `consulta:${body.to}`);
        if (unlimited) await bump(env, 'consulta_ilimitada');
      }
      const remaining = Math.max(0, limit - n);
      const cm = confirmEmail(pro, q, remaining, id, unlimited);
      const sentU = await sendMail(env, { to: q.email, replyTo: relay ? await relayAddress(env, 'u', id) : pro.email, ...cm, bcc });
      // Sin relay no hay hilo que seguir (ni recordatorios): no se guarda nada más
      if (relay) {
        await saveThread(env, { id, p: pro.key || body.to, u: await sealEmail(env, q.email), uh: (await hmac(env.HASH_SALT, norm)).slice(0, 24),
          sp: pm.subject, su: cm.subject, rp: [], ru: [], c: Date.now(), a: 0, rem: false, n: 0 });
      }
      return reply(200, { ok: true, remaining, freeLimit: limit, ...(unlimited ? { unlimited: true } : {}), ...(relay ? { id } : {}), dryRun: env.DRY_RUN === '1' });
    }
    return reply(404, { error: 'not_found' });
  },

  /** Correo entrante (Email Routing, regla catch-all → este Worker) */
  async email(message, env) {
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
  const { html, text } = relayEmail(pro, role, t.id, msg.body || '(Sin texto: mira el archivo adjunto.)', msg.attachments.length);
  const refsMine = toUser ? t.ru : t.rp;
  const sent = await sendMail(env, {
    to: toUser ? await openEmail(env, t.u) : pro.email,
    from: toUser ? `${pro.short} · Hera <${PROS[t.p] ? pro.email : 'consultas@hera-gine.com'}>` : `Consulta #${t.id.toUpperCase()} · Hera <consultas@hera-gine.com>`,
    replyTo: await relayAddress(env, toUser ? 'u' : 'p', t.id),
    subject: `Re: ${toUser ? t.su : t.sp}`,
    refs: refsMine, html, text, attachments: msg.attachments,
    bcc: t.p === 'prueba' ? undefined : env.COPY_TO || undefined,
  });
  if (!sent) return { ok: false, why: 'send' };
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
