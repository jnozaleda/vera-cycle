// track.js
// Medición de uso anónima (vera-backlog#6): envía el nombre de un evento al servicio de Hera, que solo
// guarda recuentos por día. Sin cookies ni identificadores. No cuenta en local salvo con ?track.

import { CONSULT_API } from './config.js';

const local = ['localhost', '127.0.0.1'].includes(location.hostname) && !/[?&]track\b/.test(location.search);
const sent = new Set();

/** once: true → solo una vez por sesión de la página */
export function track(e, once = false) {
  if (local || !e) return;
  if (once) { if (sent.has(e)) return; sent.add(e); }
  try {
    fetch(`${CONSULT_API}/hit`, { method: 'POST', body: JSON.stringify({ e }), keepalive: true, mode: 'cors' }).catch(() => {});
  } catch { /* sin conexión: no pasa nada */ }
}
