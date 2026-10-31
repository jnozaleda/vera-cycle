// Adjuntos de la consulta (vera-backlog#78): se validan aquí y se envían por correo a la profesional. No se guardan.
export const MAX_FILES = 3;
export const MAX_BYTES = 10 * 1024 * 1024;

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };

/** El tipo real sale del contenido, no de lo que diga el navegador */
function sniff(b) {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') return 'image/webp';
  if (String.fromCharCode(...b.slice(0, 5)) === '%PDF-') return 'application/pdf';
  return null;
}

function safeName(name, type, i) {
  const base = String(name || '').split(/[\\/]/).pop().replace(/\.[^.]*$/, '').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 60);
  return `${base || `archivo-${i + 1}`}.${EXT[type]}`;
}

/** Devuelve { files } listos para Resend, o { error } si algo no cumple */
export function validateAttachments(list) {
  if (list == null) return { files: [] };
  if (!Array.isArray(list) || list.length > MAX_FILES) return { error: 'bad_files' };
  let total = 0;
  const files = [];
  for (const [i, f] of list.entries()) {
    const content = f?.content;
    if (typeof content !== 'string' || !content || !/^[A-Za-z0-9+/]+={0,2}$/.test(content)) return { error: 'bad_files' };
    total += Math.floor((content.length * 3) / 4);
    if (total > MAX_BYTES) return { error: 'too_large' };
    const head = Uint8Array.from(atob(content.slice(0, 24)), (c) => c.charCodeAt(0));
    const type = sniff(head);
    if (!type) return { error: 'bad_files' };
    files.push({ filename: safeName(f.filename, type, i), content, content_type: type });
  }
  return { files };
}
