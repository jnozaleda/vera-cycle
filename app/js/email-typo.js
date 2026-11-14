// email-typo.js
// Correos mal escritos (gmail.co, gmail.cl, hotmial.com…): rebotan y la usuaria nunca recibe la respuesta.
// Devuelve la dirección corregida para PREGUNTAR «¿Querías decir…?» (nunca se cambia sola), o '' si parece bien.

const FIX = {
  'gmial.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gnail.com': 'gmail.com',
  'gmaill.com': 'gmail.com', 'gmail.comm': 'gmail.com', 'gmali.com': 'gmail.com', 'gimail.com': 'gmail.com', 'gemail.com': 'gmail.com',
  'hotmial.com': 'hotmail.com', 'hotmal.com': 'hotmail.com', 'hotmai.com': 'hotmail.com', 'hotmil.com': 'hotmail.com', 'hotamil.com': 'hotmail.com', 'homail.com': 'hotmail.com',
  'hotmial.es': 'hotmail.es', 'hotmal.es': 'hotmail.es',
  'outlok.com': 'outlook.com', 'outllok.com': 'outlook.com', 'outloo.com': 'outlook.com', 'otlook.com': 'outlook.com',
  'yaho.com': 'yahoo.com', 'yahooo.com': 'yahoo.com', 'yhoo.com': 'yahoo.com', 'yaho.es': 'yahoo.es',
  'iclod.com': 'icloud.com', 'icoud.com': 'icloud.com', 'icluod.com': 'icloud.com', 'iclud.com': 'icloud.com',
};
// Terminaciones que casi siempre son «.com» mal tecleado
const BAD_END = /\.(co|con|cm|om|comm|vom|xom|cpm|ccom|coom)$/;
const BIG = /^(gmail|hotmail|outlook|yahoo|icloud|live|msn|aol|proton|protonmail)\./;

export function emailTypo(raw) {
  const e = String(raw || '').trim().toLowerCase();
  const at = e.lastIndexOf('@');
  if (at < 1) return '';
  const user = e.slice(0, at), dom = e.slice(at + 1);
  let fixed = FIX[dom] || '';
  // Gmail solo existe como gmail.com (gmail.co, gmail.cl, gmail.es… rebotan)
  if (!fixed && /^gmail\.[a-z.]+$/.test(dom) && dom !== 'gmail.com') fixed = 'gmail.com';
  // Grandes proveedores con «.com» mal escrito (hotmail.con, icloud.co…); hotmail.es, yahoo.com.mx, live.cl… se dejan
  if (!fixed && BIG.test(dom) && BAD_END.test(dom)) fixed = dom.replace(BAD_END, '.com');
  // Cualquier dominio acabado en .con o .cmo
  if (!fixed && /\.(con|cmo)$/.test(dom)) fixed = dom.replace(/\.(con|cmo)$/, '.com');
  return fixed && fixed !== dom ? `${user}@${fixed}` : '';
}
