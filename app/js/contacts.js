// contacts.js
// Sugerencia de a quién preguntar (ginecología o matrona) a partir del texto, del tema de la pantalla de
// origen y de la etapa (vera-backlog#55). Sin IA: reglas simples y revisables. La usuaria siempre valida.

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Cada grupo: [etiqueta para el motivo, contacto, palabras clave (ya sin tildes)]
const GROUPS = [
  ['lactancia', 'matrona', ['lactancia', 'lactar', 'amamant', 'pecho', 'agarre', 'grieta', 'mastitis', 'sacaleches', 'extraccion', 'subida de la leche', 'leche materna', 'biberon', 'destete']],
  ['el posparto', 'matrona', ['puerperio', 'loquios', 'cuarentena', 'cicatriz', 'puntos', 'episiotomia', 'desgarro', 'suelo pelvico', 'incontinencia', 'diastasis', 'tras el parto', 'despues del parto']],
  ['el parto', 'matrona', ['plan de parto', 'preparacion al parto', 'contraccion', 'contracciones', 'dilatacion', 'bolsa del hospital', 'epidural', 'respiracion', 'masaje perineal', 'piel con piel']],
  ['el cuidado del bebé', 'matrona', ['cordon', 'banar', 'pañal', 'panal', 'porteo', 'portabebes', 'colecho', 'sueno del bebe', 'colicos', 'cacas']],
  ['medicación o salud', 'gineco', ['medicacion', 'medicamento', 'pastilla', 'antibiotico', 'ibuprofeno', 'paracetamol', 'tiroides', 'diabetes', 'tension', 'preeclampsia', 'infeccion', 'flujo', 'picor', 'herpes', 'toxoplasmosis', 'listeria', 'rh negativo', 'anti-d']],
  ['pruebas y ecografías', 'gineco', ['ecografia', 'analitica', 'o sullivan', 'sullivan', 'amniocentesis', 'cribado', 'translucencia', 'resultado', 'monitor']],
  ['anticoncepción', 'gineco', ['anticoncep', 'diu', 'pildora', 'implante', 'preservativo', 'metodo anticonceptivo', 'ovulacion', 'fertil']],
  ['el ciclo o la regla', 'gineco', ['regla', 'menstruacion', 'periodo irregular', 'retraso', 'amenorrea', 'quiste', 'endometriosis', 'dolor pelvico', 'sangrado']],
];

const URGENT = ['sangrado abundante', 'sangro mucho', 'perdida de liquido', 'he roto aguas', 'no se mueve', 'no noto al bebe', 'dolor muy fuerte', 'dolor intenso', 'fiebre alta', 'me desmayo', 'vision borrosa', 'dolor de cabeza fuerte', 'convulsion', 'no respira', 'hacerme dano'];

// Temas de pantalla (los textos de askLink/ctx) que ya orientan
const CTX = [
  [/lactancia|biberon|leche|alimentar/i, 'matrona', 'lactancia'],
  [/contracciones|parto|hospital|bolsa/i, 'matrona', 'el parto'],
  [/bebe|bebé|recien nacido|recién nacido|porteo|cordon/i, 'matrona', 'el cuidado del bebé'],
  [/medicaci|anticoncep|regla|ciclo|ecograf|anal[ií]tica|prueba/i, 'gineco', 'tu salud'],
];

/** Devuelve { to: 'gineco' | 'matrona' | null, reason, urgent } */
export function suggestContact({ text = '', context = '', mode = 'pregnancy' } = {}) {
  const t = norm(text), c = norm(context);
  const urgent = URGENT.some((u) => t.includes(norm(u)));
  const score = { gineco: 0, matrona: 0 };
  const why = {};
  for (const [label, who, words] of GROUPS) {
    const hits = words.filter((w) => t.includes(w)).length;
    if (hits) { score[who] += hits * 2; why[who] ??= label; }
  }
  for (const [re, who, label] of CTX) {
    if (c && re.test(context)) { score[who] += 1; why[who] ??= label; }
  }
  if (!score.gineco && !score.matrona) {
    // Sin pistas: en ciclo y sin nada más, ginecología; en embarazo y posparto, que elija ella
    return { to: mode === 'cycle' ? 'gineco' : null, reason: '', urgent };
  }
  if (score.gineco === score.matrona) return { to: null, reason: '', urgent };
  const to = score.gineco > score.matrona ? 'gineco' : 'matrona';
  return { to, reason: why[to] || '', urgent };
}
