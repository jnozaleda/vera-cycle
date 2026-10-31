// attach.js — prepara fotos y PDF para la consulta (vera-backlog#78): las fotos se reducen en el móvil antes de enviarlas.
export const MAX_FILES = 3;
export const MAX_BYTES = 10 * 1024 * 1024;
const MAX_SIDE = 1800;

const toB64 = (buf) => {
  const u8 = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(bin);
};

async function shrink(file) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.82));
  if (!blob) throw new Error('imagen');
  return { buf: await blob.arrayBuffer(), name: file.name.replace(/\.[^.]*$/, '') + '.jpg', type: 'image/jpeg' };
}

/** Añade archivos a la lista actual. Devuelve { files, error } con un mensaje listo para mostrar. */
export async function addFiles(current, picked) {
  const files = [...current];
  for (const file of picked) {
    if (files.length >= MAX_FILES) return { files, error: `Puedes añadir hasta ${MAX_FILES} archivos.` };
    let item;
    try {
      if (file.type === 'application/pdf') item = { buf: await file.arrayBuffer(), name: file.name, type: file.type };
      else if (file.type.startsWith('image/')) item = await shrink(file);
      else return { files, error: 'Solo puedes añadir fotos o archivos PDF.' };
    } catch { return { files, error: `No hemos podido leer «${file.name}».` }; }
    const used = files.reduce((n, f) => n + f.size, 0);
    if (used + item.buf.byteLength > MAX_BYTES) return { files, error: 'Los archivos no pueden pasar de 10 MB en total.' };
    files.push({ filename: item.name, size: item.buf.byteLength, content: toB64(item.buf), content_type: item.type });
  }
  return { files, error: '' };
}
/** Lo que se envía al servicio */
export const filesPayload = (files) => files.map(({ filename, content, content_type }) => ({ filename, content, content_type }));
export const ATTACH_NOTE = 'Evita fotos en las que se te reconozca y tapa tu nombre o tu DNI en los informes.';
