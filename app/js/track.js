// track.js
// Medición de uso anónima (vera-backlog#6): envía el nombre de un evento y el tipo de dispositivo
// («ios-app», «android-web»…) al servicio de Hera. Sin cookies ni identificadores, nunca el contenido
// (se envía «apuntó síntomas», no cuáles). No cuenta en local salvo con ?track.

import { CONSULT_API } from './config.js';

const local = ['localhost', '127.0.0.1'].includes(location.hostname) && !/[?&]track\b/.test(location.search);
const sent = new Set();
const recent = new Map();

/** «ios-app», «android-web», «mac-web»… */
export function device() {
  const ua = navigator.userAgent || '';
  const p = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'ios'
    : /Android/.test(ua) ? 'android' : /Macintosh|Mac OS/.test(ua) ? 'mac' : /Windows/.test(ua) ? 'windows' : /Linux/.test(ua) ? 'linux' : 'otro';
  const app = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  return `${p}-${app ? 'app' : 'web'}`;
}

/** once: true → solo una vez por sesión de la página. El mismo evento seguido se envía como mucho una vez por minuto. */
export function track(e, once = false) {
  if (local || !e) return;
  if (once) { if (sent.has(e)) return; sent.add(e); }
  const last = recent.get(e) || 0;
  if (!once && Date.now() - last < 60000) return;
  recent.set(e, Date.now());
  try {
    fetch(`${CONSULT_API}/hit`, { method: 'POST', body: JSON.stringify({ e, d: device() }), keepalive: true, mode: 'cors' }).catch(() => {});
  } catch { /* sin conexión: no pasa nada */ }
}
