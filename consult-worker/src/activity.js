// Hera · actividad en tiempo real para el equipo (fase de pruebas).
//
// Cada evento anónimo que llega a /hit (o que genera el propio servicio, como una consulta) se apunta en D1
// (tabla activity, 7 días) con: hora, evento, dispositivo («ios-app», «android-web»…) y una etiqueta de persona
// que cambia cada día (huella de conexión + navegador + día, la misma que ya se usa para contar personas).
// Nunca el contenido: «apuntó síntomas», no cuáles; «añadió su fecha de parto», no la fecha.
//
// Los eventos importantes se avisan al momento por correo a ALERT_TO (o COPY_TO); todo lo demás va en un
// resumen cada hora (ALERTS="1"; destinatario ALERT_TO o, si no, COPY_TO). Los correos salen por Cloudflare (binding MAILER, gratis, solo a direcciones verificadas
// en Email Routing) y, si falla, por Resend.

// nombre → [texto, ¿aviso al momento?]. Un evento puede llevar «:valor» (p. ej. onboarding:pregnancy).
export const EVENTS = {
  apertura: ['Abrió la app', false],
  instalada: ['Instaló la app en el móvil', true],
  portada: ['Visitó la web', false],
  pregunta_portada: ['Empezó a escribir una duda en la web', false],
  enviada_portada: ['Envió una consulta desde la web', false],
  abrir_portada: ['Pulsó «Abrir Hera» en la web', false],
  consulta_abierta: ['Abrió la hoja de consulta', false],
  onboarding: ['Completó la bienvenida', true],
  demo: ['Entró con datos de ejemplo', true],
  fecha_parto: ['Añadió su fecha prevista de parto', true],
  fecha_nacimiento: ['Añadió la fecha de nacimiento del bebé', true],
  ciclo: ['Configuró su ciclo', true],
  ajustes: ['Guardó cambios en Ajustes', false],
  diario: ['Apuntó en el diario', false],
  medicacion: ['Añadió una medicación', false],
  medicacion_tomada: ['Marcó una toma de medicación', false],
  cita: ['Añadió una cita', false],
  peso: ['Apuntó su peso', false],
  peso_bebe: ['Apuntó el peso del bebé', false],
  nacimiento: ['Indicó que el bebé ha nacido', true],
  contraccion: ['Registró una contracción', false],
  abrir_contracciones: ['Abrió el registro de contracciones', false],
  movimientos: ['Apuntó los movimientos del bebé', false],
  tarea: ['Marcó una prueba de «Lo que toca ahora»', false],
  urgencias: ['Abrió «Cuándo ir a urgencias»', false],
  exportar: ['Exportó una copia de sus datos', false],
  borrar_datos: ['Borró todos sus datos', true],
  contacto: ['Pulsó «Contacto» (correo a contacto@)', true],
  push_on: ['Activó el aviso semanal', true],
  sync_on: ['Conectó su Google Drive', true],
  aviso_pago_pedido: ['Pidió aviso de consultas de pago', true],
  etapa: ['Abrió la app en la etapa', false],
  pestana: ['Fue a la pestaña', false],
  vista: ['Cambió de vista', false],
  // Solo del servicio
  consulta: ['Envió una consulta a', true],
  respondida: ['Respondida una consulta por', true],
  gratuitas_agotadas: ['Intentó consultar con las gratuitas agotadas', true],
};

const VALUE_LABEL = {
  pregnancy: 'embarazo', postpartum: 'posparto', cycle: 'ciclo', regular: 'regular', irregular: 'irregular',
  gineco: 'Gonzalo', matrona: 'Marina', pediatra: 'Lucía', prueba: 'prueba',
  today: 'Hoy', diary: 'Diario', care: 'Cuidados', guide: 'Dudas', trends: 'Patrones', baby: 'Tu bebé', tu: 'Tú', bebe: 'Tu bebé',
  sintoma: 'síntomas', animo: 'ánimo', regla: 'regla', dato: 'peso, sueño o temperatura', intimidad: 'relaciones', ovulacion: 'test de ovulación',
  estres: 'estrés', flujo: 'flujo',
};
const DEVICE_LABEL = { ios: 'iPhone', android: 'Android', mac: 'Mac', windows: 'Windows', linux: 'Linux', otro: 'Otro' };

export function isEvent(e) {
  const m = /^([a-z_]{2,24})(?::([a-z0-9_]{1,24}))?$/.exec(String(e || ''));
  return !!(m && EVENTS[m[1]]);
}
export const isDevice = (d) => /^(ios|android|mac|windows|linux|otro)-(app|web)$/.test(String(d || ''));

export function eventText(e) {
  const [name, val] = String(e).split(':');
  const label = EVENTS[name]?.[0] || e;
  return val ? `${label}${name === 'consulta' || name === 'respondida' || name === 'etapa' || name === 'pestana' ? ' ' : ': '}${VALUE_LABEL[val] || val}` : label;
}
export function deviceText(d) {
  if (!d) return '';
  const [p, m] = d.split('-');
  return `${DEVICE_LABEL[p] || p} · ${m === 'app' ? 'app instalada' : 'navegador'}`;
}
const isImmediate = (e) => !!EVENTS[String(e).split(':')[0]]?.[1];

async function hmacHex(secret, text) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
/** Etiqueta de persona del día (cambia cada día; no permite saber quién es) */
export async function personTag(env, request, day) {
  if (!request) return '';
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const ua = request.headers.get('User-Agent') || '';
  return (await hmacHex(`${env.HASH_SALT}:persona:${day}`, `${ip}|${ua}`)).slice(0, 4).toUpperCase();
}

const madridTime = (ts) => new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' }).format(new Date(ts));
const madridDayTime = (ts) => new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(ts));

/** Apunta un evento y, si es importante, avisa al momento. send: función de respaldo para enviar con Resend. */
export async function record(env, { e, d = '', p = '' }, send, ctx) {
  const ts = Date.now();
  if (env.DB) {
    try { await env.DB.prepare('INSERT INTO activity (ts, e, d, p) VALUES (?1, ?2, ?3, ?4)').bind(ts, e, d || null, p || null).run(); }
    catch (err) { console.log(`activity ${err.message}`); }
  }
  if (env.ALERTS !== '1' || !isImmediate(e) || !(env.ALERT_TO || env.COPY_TO)) return;
  // Un mismo aviso por persona y evento como mucho cada 30 min
  const k = `al:${p || '-'}:${e}`;
  if (p && env.KV) { if (await env.KV.get(k)) return; await env.KV.put(k, '1', { expirationTtl: 1800 }); }
  const who = p ? `Persona ${p}` : 'Hera';
  const line = `${eventText(e)}`;
  const text = `${line}\n\n${who}${d ? ` · ${deviceText(d)}` : ''} · ${madridDayTime(ts)}\n\nResumen de todo cada hora. Panel: https://hera-gine.com/panel.html`;
  const job = notify(env, `Hera · ${line}`, text, send);
  if (ctx?.waitUntil) ctx.waitUntil(job); else await job;
}

/** Resumen de la última hora (cron): todo lo que ha pasado, agrupado por persona */
export async function hourlyDigest(env, send) {
  if (env.ALERTS !== '1' || !env.DB || !(env.ALERT_TO || env.COPY_TO)) return 0;
  const now = Date.now();
  const since = Number((await env.KV.get('digest:last')) || now - 3600000);
  const { results = [] } = await env.DB.prepare('SELECT ts, e, d, p FROM activity WHERE ts > ?1 AND ts <= ?2 ORDER BY ts').bind(since, now).all();
  await env.KV.put('digest:last', String(now));
  try { await env.DB.prepare('DELETE FROM activity WHERE ts < ?1').bind(now - 7 * 86400000).run(); } catch { /* sin tabla */ }
  if (!results.length) return 0;
  const groups = new Map();
  for (const r of results) {
    const key = r.p || 'Hera';
    if (!groups.has(key)) groups.set(key, { d: r.d, rows: [] });
    const g = groups.get(key); if (r.d) g.d = r.d; g.rows.push(r);
  }
  const people = [...groups.keys()].filter((k) => k !== 'Hera').length;
  const parts = [...groups.entries()].map(([k, g]) => `${k === 'Hera' ? 'Servicio' : `Persona ${k}`}${g.d ? ` · ${deviceText(g.d)}` : ''}\n${g.rows.map((r) => `  ${madridTime(r.ts)}  ${eventText(r.e)}`).join('\n')}`);
  const subject = `Hera · última hora: ${results.length} ${results.length === 1 ? 'acción' : 'acciones'} de ${people} ${people === 1 ? 'persona' : 'personas'}`;
  const text = `${subject}\n${madridDayTime(since)} – ${madridTime(now)}\n\n${parts.join('\n\n')}\n\n«Persona XXXX» es una etiqueta anónima que cambia cada día. Panel: https://hera-gine.com/panel.html`;
  await notify(env, subject, text, send);
  return results.length;
}

const b64 = (s) => { const u8 = new TextEncoder().encode(s); let bin = ''; for (const c of u8) bin += String.fromCharCode(c); return btoa(bin); };

/** Correo de texto al equipo: Cloudflare (MAILER) y, si no, Resend */
export async function notify(env, subject, text, send) {
  const to = env.ALERT_TO || env.COPY_TO;
  if (!to) return false;
  if (env.DRY_RUN === '1') { console.log(`[ensayo] aviso: ${subject}`); return true; }
  if (env.MAILER) {
    try {
      const { EmailMessage } = await import('cloudflare:email');
      const raw = [
        'From: Hera · Actividad <alertas@hera-gine.com>', `To: <${to}>`, `Subject: =?UTF-8?B?${b64(subject)}?=`,
        `Message-ID: <${crypto.randomUUID()}@hera-gine.com>`, `Date: ${new Date().toUTCString()}`, 'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(text).replace(/(.{76})/g, '$1\r\n'),
      ].join('\r\n');
      await env.MAILER.send(new EmailMessage('alertas@hera-gine.com', to, raw));
      return true;
    } catch (err) { console.log(`mailer ${err.message}`); }
  }
  if (!send) return false;
  return !!(await send(env, { to, subject, text, html: `<pre style="font:14px/1.5 -apple-system,Segoe UI,sans-serif;white-space:pre-wrap">${text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</pre>`, from: 'Hera · Actividad <alertas@hera-gine.com>' }));
}
