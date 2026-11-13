// Hera · actividad en tiempo real para el equipo (fase de pruebas).
//
// Cada evento anónimo que llega a /hit (o que genera el propio servicio, como una consulta) se apunta en D1
// (tabla activity, 31 días) con: hora, evento, dispositivo («ios-app», «android-web»…) y una etiqueta de persona
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
  ejemplo_duda: ['Tocó una duda de ejemplo en la web', false],
  elige_pro: ['Cambió de profesional en la web', false],
  correo_portada: ['Llegó al campo de correo en la web', false],
  enviada_portada: ['Envió una consulta desde la web', false],
  abrir_portada: ['Pulsó «Abrir Hera» en la web', false],
  intento_portada: ['Pulsó enviar en la web', false],
  error_portada: ['Falló el envío en la web', false],
  limite_portada: ['Agotó las gratuitas en la web', false],
  adjunto_portada: ['Añadió un archivo en la web', false],
  consulta_adjunto: ['Añadió un archivo en la app', false],
  consulta_abierta: ['Abrió la hoja de consulta', false],
  consulta_escribe: ['Empezó a escribir una duda en la app', false],
  consulta_correo: ['Escribió su correo en la app', false],
  consulta_intento: ['Pulsó enviar en la app', false],
  consulta_enviada: ['Envió una consulta desde la app', false],
  consulta_error: ['Falló el envío en la app', false],
  consulta_limite: ['Agotó las gratuitas en la app', false],
  consulta_ejemplo: ['Tocó una duda de ejemplo en la app', false],
  consulta_cerrada: ['Cerró la hoja de consulta', false],
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
  consulta: ['Envió una consulta a', false], // el equipo ya recibe la copia «Consulta · …» con el texto entero
  respondida: ['Respondida una consulta por', true],
  gratuitas_agotadas: ['Intentó consultar con las gratuitas agotadas', true],
  anuncio_visita: ['Llegó desde un anuncio', false],
  invitacion_vista: ['Vio su enlace para invitar (tras valorar «Sí, mucho»)', false],
  invitacion_whatsapp: ['Compartió su enlace por WhatsApp', false],
  invitacion_copiar: ['Copió su enlace para invitar', false],
  invitacion_visita: ['Llegó con el enlace de una invitación', false],
  via_visita: ['Llegó con un enlace de canal', false],
  guia_compartir: ['Compartió una guía por WhatsApp', false],
  consulta_invitada: ['Envió su primera consulta con una invitación', true],
  consulta_anuncio: ['La consulta vino de un anuncio', false],
  instalada_anuncio: ['La instalación vino de un anuncio', false],
  vuelta_anuncio: ['Volvió a la app otro día después de un anuncio', false],
  scroll: ['Bajó en la web hasta el', false],
  seccion: ['Vio la sección', false],
  clic: ['Pulsó en la web', false],
  tiempo: ['Siguió en la web (segundos)', false],
  calculadora: ['Usó una calculadora', false],
  planes_abiertos: ['Abrió los planes de pago sin agotar las gratuitas', true],
  pago_elegido: ['Eligió un plan de pago', true],
  pago_hecho: ['Volvió de pagar', true],
  video_pagina: ['Vio la página de videollamadas', false],
  video_reserva: ['Pulsó reservar videollamada con', true],
  video_pago: ['Fue a pagar la videollamada con', true],
};

const VALUE_LABEL = {
  pregnancy: 'embarazo', postpartum: 'posparto', cycle: 'ciclo', regular: 'regular', irregular: 'irregular',
  parto: 'fecha de parto', peso: 'peso en el embarazo', ovulacion: 'ovulación', suelta: 'consulta suelta', bono: 'bono de 5', mensual: 'ilimitado mensual', video: 'videollamada de 30 min', lactancia: 'asesoría de lactancia', gineco: 'Gonzalo', matrona: 'Marina', pediatra: 'Lucía', prueba: 'prueba', rapido: 'en menos de 5 s sin escribir', sin_escribir: 'sin escribir', cabecera: 'desde el botón de arriba', barra: 'desde la barra', tema: 'desde un tema', dudas: 'desde Dudas', ajustes: 'desde Ajustes', web: 'desde la web', respuesta: 'desde una respuesta', app: 'desde la app', medias: 'desde el correo de pago a medias',
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
  return val ? `${label}${['consulta', 'respondida', 'etapa', 'pestana', 'video_reserva', 'video_pago'].includes(name) ? ' ' : ': '}${VALUE_LABEL[val] || val}` : label;
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
/** given: la etiqueta que la página recibió en su primer envío y reenvía mientras sigue abierta (vera-backlog: Android
 *  cambia entre IPv4 e IPv6 y, si no, una misma visita salía como dos personas). Solo se acepta con el formato de siempre. */
export async function personTag(env, request, day, given = '') {
  if (/^[0-9A-F]{4}$/.test(String(given || ''))) return given;
  if (!request) return '';
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const ua = request.headers.get('User-Agent') || '';
  return (await hmacHex(`${env.HASH_SALT}:persona:${day}`, `${ip}|${ua}`)).slice(0, 4).toUpperCase();
}

const panelLink = (env) => (env.DASH_KEY ? `\nPanel: https://hera-consultas.tempcheck-app.workers.dev/panel?k=${env.DASH_KEY}` : '');
const madridTime = (ts) => new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' }).format(new Date(ts));
const madridDayTime = (ts) => new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(ts));

/** Apunta un evento y, si es importante, avisa al momento. send: función de respaldo para enviar con Resend. */
export async function record(env, { e, d = '', p = '', note = '' }, send, ctx) {
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
  const line = `${eventText(e)}${note ? ` · ${note}` : ''}`;
  const text = `${line}\n\n${who}${d ? ` · ${deviceText(d)}` : ''} · ${madridDayTime(ts)}\n\nResumen de todo cada 3 horas.${panelLink(env)}`;
  const job = notify(env, `Actividad · ${line}`, text, send);
  if (ctx?.waitUntil) ctx.waitUntil(job); else await job;
}

/** Resumen cada 3 horas (el cron corre cada hora; solo envía a las 0, 3, 6… de Madrid): todo, agrupado por persona */
export async function hourlyDigest(env, send, force = false) {
  if (env.ALERTS !== '1' || !env.DB || !(env.ALERT_TO || env.COPY_TO)) return 0;
  const now = Date.now();
  if (!force && Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', hourCycle: 'h23' }).format(new Date(now))) % 3 !== 0) return 0;
  const since = Number((await env.KV.get('digest:last')) || now - 3600000);
  const { results = [] } = await env.DB.prepare('SELECT ts, e, d, p FROM activity WHERE ts > ?1 AND ts <= ?2 ORDER BY ts').bind(since, now).all();
  await env.KV.put('digest:last', String(now));
  try { await env.DB.prepare('DELETE FROM activity WHERE ts < ?1').bind(now - 31 * 86400000).run(); } catch { /* sin tabla */ }
  if (!results.length) return 0;
  const groups = new Map();
  for (const r of results) {
    const key = r.p || 'Hera';
    if (!groups.has(key)) groups.set(key, { d: r.d, rows: [] });
    const g = groups.get(key); if (r.d) g.d = r.d; g.rows.push(r);
  }
  const people = [...groups.keys()].filter((k) => k !== 'Hera').length;
  const parts = [...groups.entries()].map(([k, g]) => `${k === 'Hera' ? 'Servicio' : `Persona ${k}`}${g.d ? ` · ${deviceText(g.d)}` : ''}\n${g.rows.map((r) => `  ${madridTime(r.ts)}  ${eventText(r.e)}`).join('\n')}`);
  const subject = `Actividad - Resumen · ${madridTime(since)}–${madridTime(now)} · ${results.length} ${results.length === 1 ? 'acción' : 'acciones'} de ${people} ${people === 1 ? 'persona' : 'personas'}`;
  const text = `${subject}\n${madridDayTime(since)} – ${madridTime(now)}\n\n${parts.join('\n\n')}\n\n«Persona XXXX» es una etiqueta anónima que cambia cada día. ${panelLink(env)}`;
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
        'From: =?UTF-8?B?' + b64('Hera · Equipo') + '?= <alertas@hera-gine.com>', `To: <${to}>`, `Subject: =?UTF-8?B?${b64(subject)}?=`,
        `Message-ID: <${crypto.randomUUID()}@hera-gine.com>`, `Date: ${new Date().toUTCString()}`, 'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(text).replace(/(.{76})/g, '$1\r\n'),
      ].join('\r\n');
      await env.MAILER.send(new EmailMessage('alertas@hera-gine.com', to, raw));
      return true;
    } catch (err) { console.log(`mailer ${err.message}`); }
  }
  if (!send) return false;
  return !!(await send(env, { to, subject, text, html: `<pre style="font:14px/1.5 -apple-system,Segoe UI,sans-serif;white-space:pre-wrap">${text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</pre>`, from: 'Hera · Equipo <alertas@hera-gine.com>' }));
}
