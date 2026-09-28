// logic.js
// Fechas, fases del ciclo y constantes de Vera (port de CycleLogic.swift + AppStore.swift)
//
// Las fechas se manejan como "número de día" (días desde 1970-01-01 en calendario local),
// lo que evita problemas de horario de verano. `nowDN()` añade la fracción del día actual
// para reproducir el comportamiento de `Date()` en la app de iOS.

// MARK: - Helpers de fecha

const MS_DAY = 86400000;

export function dnFromParts(y, m, d) {
  return Math.round(Date.UTC(y, m - 1, d) / MS_DAY);
}

/** "YYYY-MM-DD" → número de día (o null) */
export function dnFromISO(str) {
  if (typeof str !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
  if (!m) return null;
  return dnFromParts(+m[1], +m[2], +m[3]);
}

/** número de día (se admite fracción: se trunca al día) → "YYYY-MM-DD" */
export function isoFromDN(dn) {
  const d = new Date(Math.floor(dn) * MS_DAY);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

export function todayDN() {
  const n = new Date();
  return dnFromParts(n.getFullYear(), n.getMonth() + 1, n.getDate());
}

/** Hoy + fracción del día transcurrida (equivalente a `Date()`) */
export function nowDN() {
  const n = new Date();
  const secs = n.getHours() * 3600 + n.getMinutes() * 60 + n.getSeconds();
  return todayDN() + secs / 86400;
}

export function todayISO() {
  return isoFromDN(todayDN());
}

/** Date JS (a mediodía UTC) para formatear con Intl sin desfases */
export function jsDate(dn) {
  return new Date(Math.floor(dn) * MS_DAY + MS_DAY / 2);
}

export function partsFromDN(dn) {
  const d = new Date(Math.floor(dn) * MS_DAY);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), wd: d.getUTCDay() };
}

const fmtCache = {};
function fmt(opts) {
  const key = JSON.stringify(opts);
  if (!fmtCache[key]) fmtCache[key] = new Intl.DateTimeFormat('es-ES', { ...opts, timeZone: 'UTC' });
  return fmtCache[key];
}

/** "7 oct" */
export const fmtDayMonthShort = (dn) => fmt({ day: 'numeric', month: 'short' }).format(jsDate(dn)).replace('.', '');
/** "7 de octubre" */
export const fmtDayMonthLong = (dn) => fmt({ day: 'numeric', month: 'long' }).format(jsDate(dn));
/** "7 oct 2026" */
export const fmtDayMonthYear = (dn) => fmt({ day: 'numeric', month: 'short', year: 'numeric' }).format(jsDate(dn)).replace('.', '');
/** "octubre de 2026" */
export const fmtMonthYear = (dn) => fmt({ month: 'long', year: 'numeric' }).format(jsDate(dn));
/** "martes, 7 de octubre" */
export const fmtWeekdayLong = (dn) => fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(jsDate(dn));
/** "M" */
export const fmtWeekdayNarrow = (dn) => fmt({ weekday: 'narrow' }).format(jsDate(dn));
/** "martes 7 oct" */
export const fmtWeekdayDayMonth = (dn) => fmt({ weekday: 'long', day: 'numeric', month: 'short' }).format(jsDate(dn)).replace(',', '').replace('.', '');

/** Redondeo como `round()` de Swift (mitades lejos de cero) */
export function roundHalfAway(x) {
  return Math.sign(x) * Math.round(Math.abs(x));
}

// MARK: - Fases del ciclo

export const PHASES = {
  menstrual: {
    label: 'Fase menstrual',
    insightTitle: 'Descanso y calidez',
    insightText: 'Tu cuerpo está trabajando. Prioriza alimentos ricos en hierro (legumbres, pistachos, carne roja), calor local para los cólicos y movimiento suave: yoga, estiramientos o un paseo.',
  },
  follicular: {
    label: 'Fase folicular',
    insightTitle: 'Energía ascendente',
    insightText: 'Los estrógenos suben y con ellos tu vitalidad y concentración. Es el momento ideal para entrenamientos de fuerza, proyectos exigentes y nuevas rutinas. Tu piel suele lucir más luminosa.',
  },
  fertile: {
    label: 'Ventana fértil',
    insightTitle: 'Tu momento de máximo brillo',
    insightText: 'Estás en tu ventana fértil: energía, sociabilidad y libido en su punto más alto. Si buscas embarazo, estos son los días clave; si no, extrema la protección.',
  },
  ovulation: {
    label: 'Ovulación',
    insightTitle: 'Día de ovulación',
    insightText: 'Hoy es tu pico de fertilidad. Puedes notar flujo elástico tipo clara de huevo o una leve molestia pélvica: es normal. Hidrátate bien y escucha a tu cuerpo.',
  },
  luteal: {
    label: 'Fase lútea',
    insightTitle: 'Cuidado y serenidad',
    insightText: 'La progesterona puede traer hinchazón, antojos o sensibilidad. Te ayudarán el magnesio (cacao puro, frutos secos), reducir sal y cafeína, dormir bien y el movimiento moderado.',
  },
};

export const PHASE_TIPS = {
  menstrual: ['Energía en su punto más bajo — respeta tu ritmo',
    'El calor (bolsa de agua caliente) alivia los cólicos',
    'Alimentos ricos en hierro ayudan a recuperarte'],
  follicular: ['Energía y claridad mental en aumento',
    'Buen momento para empezar proyectos o retos nuevos',
    'El estrógeno favorece la memoria y el enfoque'],
  fertile: ['Pico de energía, confianza y sociabilidad',
    'Tu piel puede estar en su mejor momento',
    'Mayor libido natural — efecto del pico de estrógeno'],
  ovulation: ['Vitalidad máxima — aprovéchala',
    'Posible molestia leve en un lado del abdomen (normal)',
    'Tu temperatura basal sube ligeramente tras la ovulación'],
  luteal: ['Progesterona alta: posibles cambios de humor e hinchazón',
    'Los antojos de dulce son normales — el magnesio puede ayudar',
    'Tu cuerpo pide más descanso de lo habitual'],
};

/**
 * Cálculo de la fase para una fecha (número de día, admite fracción).
 * Devuelve { day, phase, daysToNext, ovuDay } igual que `cycleInfo` en Swift.
 */
export function cycleInfo(settings, dn = nowDN()) {
  const start = dnFromISO(settings.lastPeriod);
  const len = settings.cycleLen;
  if (start == null) {
    return { day: 1, phase: 'follicular', daysToNext: len, ovuDay: len - 14 };
  }
  const diff = Math.trunc(dn - start);
  const day = ((diff % len) + len) % len; // 0-indexed, siempre positivo
  const ovu = len - 14;

  let phase;
  if (day < settings.periodLen) phase = 'menstrual';
  else if (day === ovu) phase = 'ovulation';
  else if (day >= ovu - 5 && day <= ovu + 1) phase = 'fertile';
  else if (day < ovu) phase = 'follicular';
  else phase = 'luteal';

  return { day: day + 1, phase, daysToNext: len - day, ovuDay: ovu + 1 };
}

/** Fecha estimada de la próxima regla (número de día) */
export function nextPeriodDN(settings) {
  return todayDN() + cycleInfo(settings).daysToNext;
}

// MARK: - Síntomas por fase del ciclo

export const PHASE_SYMPTOMS = {
  menstrual: ['Sangrado', 'Cólicos', 'Dolor lumbar', 'Dolor de cabeza',
    'Fatiga', 'Náuseas', 'Hinchazón', 'Sensibilidad mamaria', 'Cambios de humor'],
  follicular: ['Fatiga residual', 'Acné', 'Flujo blanquecino',
    'Sequedad vaginal', 'Mejor concentración'],
  fertile: ['Flujo elástico', 'Dolor pélvico leve', 'Manchado',
    'Sensibilidad mamaria', 'Hinchazón leve', 'Libido alta'],
  ovulation: ['Flujo elástico', 'Dolor pélvico leve', 'Manchado',
    'Sensibilidad mamaria', 'Hinchazón leve', 'Libido alta'],
  luteal: ['Hinchazón', 'Sensibilidad mamaria', 'Antojos', 'Fatiga',
    'Irritabilidad', 'Ansiedad', 'Acné', 'Insomnio',
    'Dolor de cabeza', 'Retención de líquidos'],
};

/** Síntomas que implican sangrado y activan el selector de cantidad */
export const BLEEDING_SYMPTOMS = new Set(['Sangrado', 'Manchado']);

export const FLOW_OPTIONS = [
  { id: 'manchado', label: 'Manchado', sublabel: 'sin recambio' },
  { id: 'ligero', label: 'Ligero', sublabel: '1-2 cambios/día' },
  { id: 'moderado', label: 'Moderado', sublabel: '3-4 cambios/día' },
  { id: 'abundante', label: 'Abundante', sublabel: '5-6 cambios/día' },
  { id: 'muy_abundante', label: 'Muy abundante', sublabel: '+6 cambios/día' },
];

export const SYMPTOMS = ['Cólicos', 'Dolor de cabeza', 'Sensibilidad mamaria', 'Hinchazón',
  'Acné', 'Fatiga', 'Antojos', 'Náuseas', 'Dolor lumbar', 'Insomnio'];
export const MOODS = ['Serena', 'Radiante', 'Sensible', 'Irritable', 'Baja energía', 'Ansiosa'];
export const INTIMACY = ['Relaciones', 'Libido alta', 'Libido baja', 'Sequedad', 'Flujo abundante'];
export const STRESS_LEVELS = ['Bajo', 'Moderado', 'Alto'];
export const CERVICAL_MUCUS = ['Seco', 'Cremoso', 'Acuoso', 'Elástico'];
export const LH_TEST_RESULTS = ['Negativo', 'Positivo'];
export const HORMONAL_CONDITIONS = ['Ninguna', 'No sé', 'SOP / PCOS (Síndrome de Ovario Poliquístico)', 'Hipotiroidismo', 'Endometriosis', 'Otra'];

// MARK: - Ciclo medio para ciclos irregulares

/** Duración media del ciclo a partir de fechas de inicio de regla. Siempre entre 21 y 45. */
export function averageCycleLength(periods) {
  const sorted = periods.map(dnFromISO).filter((d) => d != null).sort((a, b) => a - b);
  if (sorted.length < 2) return 28;
  let sum = 0;
  for (let i = 1; i < sorted.length; i++) sum += sorted[i] - sorted[i - 1];
  const avg = Math.trunc(sum / (sorted.length - 1));
  return Math.max(21, Math.min(45, avg));
}

export function settingsFromIrregularPeriods(periods, periodLen) {
  const sorted = [...periods].sort();
  const last = sorted[sorted.length - 1] ?? todayISO();
  return {
    lastPeriod: last,
    cycleLen: averageCycleLength(sorted),
    periodLen,
    isRegular: false,
    pastPeriods: sorted,
  };
}

/** Edad en años a partir de "YYYY-MM-DD" */
export function ageFrom(birthDate) {
  const dob = dnFromISO(birthDate);
  if (dob == null) return null;
  const b = partsFromDN(dob);
  const n = new Date();
  let age = n.getFullYear() - b.y;
  if (n.getMonth() + 1 < b.m || (n.getMonth() + 1 === b.m && n.getDate() < b.d)) age -= 1;
  return age;
}
