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
//   POST /hit          {e}                                                 navegador: evento anónimo de uso (texto plano)
//   GET  /stats?days=N                                                     panel: Authorization: Bearer PANEL_CODE
//
// Medición (vera-backlog#6): D1 «hera-metrics» con recuentos por día (tabla counts) y huellas diarias para contar
// personas distintas (tabla visitors: hash de IP + navegador + día + sal, se borran a las 48 h). Sin IP ni identificadores.
//
// Bindings: KV (KV), HASH_SALT, ADMIN_TOKEN, RESEND_API_KEY, COPY_TO (opcional) (secretos), ALLOWED_ORIGINS, FROM, FREE_LIMIT,
// DRY_RUN ("1" = hace todo menos enviar correos), DB (D1), PANEL_CODE (secreto).

export const PROS = {
  gineco: { name: 'Dr. Gonzalo Nozaleda', short: 'Gonzalo', role: 'ginecólogo', email: 'gonzalo@hera-gine.com' },
  matrona: { name: 'Marina Fernández', short: 'Marina', role: 'matrona', email: 'marina@hera-gine.com' },
  pediatra: { name: 'Lucía Carrascón', short: 'Lucía', role: 'pediatra', email: 'lucia@hera-gine.com' },
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

export function proEmail(pro, q) {
  const subject = `Consulta de Hera${q.context ? ` · ${q.context}` : ''}`;
  const html = shell(`<p>Nueva consulta para <b>${esc(pro.name)}</b>.</p>
<div style="background:#F1EFE8;border-radius:10px;padding:14px;margin:12px 0">${nl2br(q.text)}</div>
${q.context ? `<p style="font-size:13px;color:#5F5E5A">Sobre: ${esc(q.context)}</p>` : ''}
${q.situation ? `<p style="font-size:13px;color:#5F5E5A">Situación: ${nl2br(q.situation)}</p>` : ''}
<p style="font-size:13px;color:#5F5E5A">Responde a este correo para contestar directamente a la usuaria (${esc(q.email)}). Plazo comprometido: 48 h.</p>`);
  const text = `Nueva consulta para ${pro.name}\n\n${q.text}\n\n${q.context ? `Sobre: ${q.context}\n` : ''}${q.situation ? `Situación: ${q.situation}\n` : ''}\nResponde a este correo para contestar a la usuaria (${q.email}).`;
  return { subject, html, text };
}

export function confirmEmail(pro, q, remaining) {
  const excerpt = q.text.length > 160 ? `${q.text.slice(0, 160).trim()}…` : q.text;
  const left = remaining === 0 ? 'Era tu última consulta gratuita' : `Te ${remaining === 1 ? 'queda 1 consulta gratuita' : `quedan ${remaining} consultas gratuitas`}`;
  const subject = `Tu consulta a ${pro.short} está enviada`;
  const html = shell(`<p>Hola,</p>
<p>Tu consulta ha llegado a <b>${esc(pro.name)}, ${esc(pro.role)}</b>. Te responderá a este correo en menos de 48 h.</p>
<div style="background:#F1EFE8;border-radius:10px;padding:12px;margin:12px 0;font-size:14px;color:#444441">«${esc(excerpt)}»${q.context ? `<br><span style="color:#5F5E5A">Sobre: ${esc(q.context)}</span>` : ''}</div>
<p><span style="display:inline-block;background:#E7EDE6;color:#3F584B;border-radius:999px;padding:4px 12px;font-size:13px;font-weight:600">${left}</span></p>
<p style="font-size:13px;color:#5F5E5A">No es un servicio de urgencias. Si algo no va bien, llama al 112 o acude a tu centro de salud.</p>
<p style="font-size:12px;color:#888780">¿No has escrito tú esta consulta? Responde a este correo y la borramos.</p>`);
  const text = `Tu consulta ha llegado a ${pro.name}, ${pro.role}. Te responderá a este correo en menos de 48 h.\n\n«${excerpt}»\n\n${left}.\n\nNo es un servicio de urgencias: si algo no va bien, llama al 112 o acude a tu centro de salud.\n¿No has escrito tú esta consulta? Responde a este correo y la borramos.`;
  return { subject, html, text };
}


// MARK: - Medición de uso

/** Fecha de hoy en Madrid, AAAA-MM-DD */
export function madridDay(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

/** Eventos que acepta /hit (nombre o nombre:valor) */
export const EVENT_RE = /^(apertura|portada|pregunta_portada|abrir_portada|consulta_abierta|push_on|sync_on|etapa:(pregnancy|postpartum|cycle)|pestana:(today|diary|care|guide|cycle|trends|baby)|vista:(tu|bebe))$/;

async function bump(env, k, day = madridDay()) {
  if (!env.DB) return;
  try {
    await env.DB.prepare('INSERT INTO counts (day, k, n) VALUES (?1, ?2, 1) ON CONFLICT(day, k) DO UPDATE SET n = n + 1').bind(day, k).run();
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

async function sendMail(env, { to, replyTo, subject, html, text, bcc }) {
  if (env.DRY_RUN === '1') { console.log(`[ensayo] correo a ${to}: ${subject}`); return true; }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.FROM, to: [to], reply_to: replyTo, subject, html, text, ...(bcc ? { bcc: [bcc] } : {}) }),
  });
  if (!res.ok) console.log(`resend ${res.status} ${await res.text()}`);
  return res.ok;
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

    if (request.method === 'GET' && url.pathname === '/stats') {
      if (!env.PANEL_CODE || request.headers.get('Authorization') !== `Bearer ${env.PANEL_CODE}`) return reply(401, { error: 'unauthorized' });
      const days = Math.min(365, Math.max(1, Number(url.searchParams.get('days')) || 30));
      const from = madridDay(new Date(Date.now() - (days - 1) * 86400000));
      const { results } = await env.DB.prepare('SELECT day, k, n FROM counts WHERE day >= ?1 ORDER BY day').bind(from).all();
      return reply(200, { from, to: madridDay(), rows: results });
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
      const norm = normalizeEmail(body.email);
      if (!norm) return reply(400, { error: 'bad_email' });
      const pro = PROS[body.to];
      if (!pro) return reply(400, { error: 'bad_to' });
      const text = String(body.text || '').trim();
      if (text.length < 5 || text.length > 2000) return reply(400, { error: 'bad_text' });
      const q = { email: String(body.email).trim(), text, context: String(body.context || '').slice(0, 120), situation: String(body.situation || '').slice(0, 500) };

      const key = `c:${await hmac(env.HASH_SALT, norm)}`;
      const rec = (await env.KV.get(key, 'json')) || { n: 0, first: null, last: null };
      if (rec.n >= limit) { await bump(env, 'gratuitas_agotadas'); return reply(200, { limit: true, used: rec.n, freeLimit: limit }); }
      if (await rateLimited(env, request.headers.get('CF-Connecting-IP'))) return reply(429, { error: 'rate' });

      const pm = proEmail(pro, q);
      const sent = await sendMail(env, { to: pro.email, replyTo: q.email, ...pm, bcc: env.COPY_TO || undefined }); // COPY_TO (secreto): copia oculta de cada consulta mientras se prueba
      if (!sent) return reply(502, { error: 'send' });
      const now = new Date().toISOString();
      const n = rec.n + 1;
      await env.KV.put(key, JSON.stringify({ n, first: rec.first || now, last: now }));
      await bump(env, `consulta:${body.to}`);
      const remaining = Math.max(0, limit - n);
      const cm = confirmEmail(pro, q, remaining);
      await sendMail(env, { to: q.email, replyTo: pro.email, ...cm, bcc: env.COPY_TO || undefined });
      return reply(200, { ok: true, remaining, freeLimit: limit, dryRun: env.DRY_RUN === '1' });
    }
    return reply(404, { error: 'not_found' });
  },
};
