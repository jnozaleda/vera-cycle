// contacts.js
// Sugerencia de a quién preguntar (ginecología o matrona) a partir del texto, del tema de la pantalla de
// origen y de la etapa (vera-backlog#55). Sin IA: reglas simples y revisables. La usuaria siempre valida.

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Cada grupo: [etiqueta para el motivo, contacto, palabras clave (ya sin tildes)]
const GROUPS = [
  ['lactancia', 'matrona', ['lactancia', 'lactar', 'amamant', 'pecho', 'agarre', 'grieta', 'mastitis', 'sacaleches', 'extraccion', 'subida de la leche', 'leche materna', 'biberon', 'destete']],
  ['el posparto', 'matrona', ['puerperio', 'loquios', 'cuarentena', 'cicatriz', 'puntos', 'episiotomia', 'desgarro', 'suelo pelvico', 'incontinencia', 'diastasis', 'tras el parto', 'despues del parto']],
  ['el parto', 'matrona', ['plan de parto', 'preparacion al parto', 'contraccion', 'contracciones', 'dilatacion', 'bolsa del hospital', 'epidural', 'respiracion', 'masaje perineal', 'piel con piel']],
  ['el cuidado del recién nacido', 'matrona', ['cordon', 'banar', 'porteo', 'portabebes', 'colecho']],
  ['la salud del bebé', 'pediatra', ['fiebre del bebe', 'mi bebe tiene fiebre', 'ictericia', 'amarillo', 'vomita', 'vomitos del bebe', 'diarrea', 'bronquiolitis', 'tos', 'mocos', 'dermatitis', 'costra lactea', 'panal', 'pañal', 'cacas', 'colicos', 'reflujo', 'estrenimiento del bebe', 'vacuna', 'vacunas', 'vitamina d', 'dentic', 'dientes', 'gateo', 'desarrollo del bebe', 'peso del bebe', 'percentil', 'pediatra']],
  ['la alimentación del bebé', 'pediatra', ['alimentacion complementaria', 'papilla', 'blw', 'empezar a comer', 'fruta', 'introducir alimentos', 'alergia', 'intolerancia']],
  ['el sueño del bebé', 'pediatra', ['sueno del bebe', 'duerme poco', 'despierta', 'no duerme']],
  ['medicación o salud', 'gineco', ['medicacion', 'medicamento', 'pastilla', 'antibiotico', 'ibuprofeno', 'paracetamol', 'tiroides', 'diabetes', 'tension', 'preeclampsia', 'infeccion', 'flujo', 'picor', 'herpes', 'toxoplasmosis', 'listeria', 'rh negativo', 'anti-d']],
  ['pruebas y ecografías', 'gineco', ['ecografia', 'analitica', 'o sullivan', 'sullivan', 'amniocentesis', 'cribado', 'translucencia', 'resultado', 'monitor']],
  ['anticoncepción', 'gineco', ['anticoncep', 'diu', 'pildora', 'implante', 'preservativo', 'metodo anticonceptivo', 'ovulacion', 'fertil']],
  ['el ciclo o la regla', 'gineco', ['regla', 'menstruacion', 'periodo irregular', 'retraso', 'amenorrea', 'quiste', 'endometriosis', 'dolor pelvico', 'sangrado']],
];

const URGENT = ['sangrado abundante', 'sangro mucho', 'perdida de liquido', 'he roto aguas', 'no se mueve', 'no noto al bebe', 'dolor muy fuerte', 'dolor intenso', 'fiebre alta', 'me desmayo', 'vision borrosa', 'dolor de cabeza fuerte', 'convulsion', 'no respira', 'hacerme dano'];

// Temas de pantalla (los textos de askLink/ctx) que ya orientan
const CTX = [
  [/lactancia|biberon|leche|alimentar/i, 'matrona', 'lactancia'],
  [/contracciones|\bparto\b|hospital|bolsa/i, 'matrona', 'el parto'],
  [/bebe|bebé|recien nacido|recién nacido/i, 'pediatra', 'tu bebé', 'postpartum'],
  [/bebe|bebé/i, 'matrona', 'tu bebé durante el embarazo', 'pregnancy'],
  [/porteo|cordon/i, 'matrona', 'el cuidado del recién nacido'],
  [/medicaci|anticoncep|regla|ciclo|ecograf|anal[ií]tica|prueba/i, 'gineco', 'tu salud'],
];

/** Devuelve { to: 'gineco' | 'matrona' | 'pediatra' | null, reason, urgent } */
export function suggestContact({ text = '', context = '', mode = 'pregnancy' } = {}) {
  const t = norm(text), c = norm(context);
  const urgent = URGENT.some((u) => t.includes(norm(u)));
  const score = { gineco: 0, matrona: 0, pediatra: 0 };
  const why = {};
  for (const [label, who, words] of GROUPS) {
    const hits = words.filter((w) => t.includes(w)).length;
    if (hits) { score[who] += hits * 2; why[who] ??= label; }
  }
  for (const [re, who, label, onlyMode] of CTX) {
    if (onlyMode && onlyMode !== mode) continue;
    if (c && re.test(context)) { score[who] += 1; why[who] ??= label; }
  }
  if (!score.gineco && !score.matrona && !score.pediatra) {
    // Sin pistas: en ciclo y sin nada más, ginecología; en embarazo y posparto, que elija ella
    return { to: mode === 'cycle' ? 'gineco' : null, reason: '', urgent };
  }
  const ranked = Object.entries(score).sort((x, y) => y[1] - x[1]);
  if (ranked[0][1] === ranked[1][1]) return { to: null, reason: '', urgent }; // empate: que elija ella
  const to = ranked[0][0];
  return { to, reason: why[to] || '', urgent };
}
