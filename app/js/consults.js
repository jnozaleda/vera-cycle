// consults.js
// Historial de las consultas hechas desde este dispositivo (la app o la portada, mismo dominio) y su estado.
// La pregunta se guarda solo aquí, en el navegador. Del servicio solo se pide si cada consulta está respondida
// (GET /status?ids=…: el número de consulta es aleatorio y solo lo conoce quien la hizo). La respuesta llega por correo.

const KEY = 'hera-consultas';
const MAX = 50;

const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
const write = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))); } catch { /* sin almacenamiento */ } };

export const listConsults = () => read();

export function addConsult({ id, to, text }) {
  if (!id) return;
  write([{ id, to, text: String(text || '').slice(0, 2000), at: Date.now(), a: 0, seen: false }, ...read().filter((c) => c.id !== id)]);
}

export function markSeen(id) { write(read().map((c) => (c.id === id ? { ...c, seen: true } : c))); }
export function clearConsults() { try { localStorage.removeItem(KEY); } catch { /* sin almacenamiento */ } }

/** 'respondida' · 'pendiente' · 'fuera' (más de 48 h sin respuesta) */
export function consultState(c) {
  if (c.a) return 'respondida';
  return Date.now() - c.at > 48 * 3600000 ? 'fuera' : 'pendiente';
}

/** La primera consulta respondida que aún no se ha visto en la app (para avisar en Hoy) */
export const unseenAnswer = () => read().find((c) => c.a && !c.seen) || null;

let lastCheck = 0;
/** Pregunta al servicio por las consultas sin respuesta de los últimos 31 días. Devuelve true si algo cambió. */
export async function refreshConsults(api, { force = false } = {}) {
  if (!force && Date.now() - lastCheck < 5 * 60000) return false;
  lastCheck = Date.now();
  const list = read();
  const open = list.filter((c) => !c.a && Date.now() - c.at < 31 * 86400000).map((c) => c.id).slice(0, 30);
  if (!open.length) return false;
  try {
    const r = await fetch(`${api}/status?ids=${open.join(',')}`);
    if (!r.ok) return false;
    const { status } = await r.json();
    let changed = false;
    const next = read().map((c) => {
      const s = status?.[c.id];
      if (s && s.a && !c.a) { changed = true; return { ...c, a: s.a }; }
      return c;
    });
    if (changed) write(next);
    return changed;
  } catch { return false; }
}
