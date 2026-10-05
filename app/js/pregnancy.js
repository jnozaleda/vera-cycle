// pregnancy.js
// Embarazo y posparto: cálculo de semanas, calendario de pruebas, síntomas y señales de alarma.
// Contenido basado en "Dudas frecuentes en el embarazo, semana a semana" (circuito de la sanidad
// pública en España). Pendiente de revisión clínica final antes de abrirlo a todas las usuarias.

import { dnFromISO, todayDN } from './logic.js';

// MARK: - Cálculo de semanas

/** Fecha probable de parto a partir del primer día de la última regla (regla de Naegele: +280 días) */
export const dueFromLmp = (lmpDN) => lmpDN + 280;

/** Edad gestacional hoy: { totalDays, weeks, days, trimester, daysLeft } o null si no hay fecha */
export function gestation(pregnancy, today = todayDN()) {
  const due = dnFromISO(pregnancy?.dueDate);
  if (due == null) return null;
  const totalDays = 280 - (due - today);
  const weeks = Math.floor(totalDays / 7);
  const trimester = weeks < 14 ? 1 : weeks < 28 ? 2 : 3;
  return { totalDays, weeks, days: totalDays - weeks * 7, trimester, daysLeft: due - today, due };
}

/** Semanas y días desde el parto */
export function sinceBirth(postpartum, today = todayDN()) {
  const birth = dnFromISO(postpartum?.birthDate);
  if (birth == null) return null;
  const total = Math.max(0, today - birth);
  return { total, weeks: Math.floor(total / 7), days: total % 7, birth };
}

export const TRIMESTER_LABEL = { 1: 'Primer trimestre', 2: 'Segundo trimestre', 3: 'Tercer trimestre' };

export const TRIMESTER_TEXT = {
  1: 'Tu cuerpo se está adaptando muy deprisa: el cansancio, las náuseas y la sensibilidad en el pecho son muy frecuentes y suelen mejorar hacia la semana 12 a 16.',
  2: 'Suele ser la etapa más cómoda. Hacia la semana 18 a 22 empezarás a notar los primeros movimientos, como burbujas o cosquillas.',
  3: 'Recta final: es normal notar más peso, ardor o hinchazón. Conoce el patrón de movimientos de tu bebé y prepara la bolsa para el hospital.',
};

// MARK: - Calendario de pruebas y citas (sanidad pública en España)

export const PREGNANCY_TIMELINE = [
  { from: 4, to: 10, title: 'Primera visita con la matrona', text: 'Pide cita en tu centro de salud en cuanto tengas el test positivo: te abrirán la cartilla y te pedirán la primera analítica. Lo ideal es antes de la semana 10.' },
  { from: 11, to: 14, title: 'Ecografía del primer trimestre y cribado', text: 'Se confirma que todo está bien situado, cuántos bebés hay y se ajusta la fecha de parto. El cribado combinado calcula una probabilidad, no da un diagnóstico.' },
  { from: 19, to: 22, title: 'Ecografía morfológica', text: 'La más detallada del embarazo: se revisan los órganos del bebé, la placenta y el líquido.' },
  { from: 24, to: 28, title: 'Test de O\'Sullivan', text: 'Detecta la diabetes del embarazo. Hay que ir en ayunas. Si sale alterado, se confirma con una prueba más larga.' },
  { from: 27, to: 28, title: 'Vacuna de la tosferina (dTpa)', text: 'En cada embarazo, preferiblemente entre las semanas 27 y 28: tus defensas protegerán al bebé en sus primeros meses.' },
  { from: 26, to: 28, title: 'Inyección anti-D', text: 'Como eres Rh negativo, te la pondrán hacia la semana 28 (y tras el parto si el bebé es Rh positivo).', rh: 'neg' },
  { from: 28, to: 30, title: 'Clases de preparación al parto', text: 'Las organiza la matrona de tu centro de salud. Son gratuitas y tu acompañante puede ir contigo.' },
  { from: 32, to: 36, title: 'Ecografía del tercer trimestre', text: 'Sirve para ver cómo crece el bebé, su postura y la placenta. El peso estimado tiene un margen de error del 10 a 15 %.' },
  { from: 32, to: 36, title: 'Plan de parto', text: 'Escribe tus preferencias (acompañante, anestesia, piel con piel…) y repásalas con tu matrona.' },
  { from: 35, to: 37, title: 'Exudado vaginal y rectal', text: 'Detecta el estreptococo del grupo B. Si sale positivo, te pondrán antibiótico durante el parto.' },
  { from: 36, to: 36, info: true, title: 'Cuándo ir al hospital', text: 'Contracciones regulares y dolorosas, rotura de bolsa, sangrado, menos movimientos, dolor de cabeza fuerte o picor intenso en palmas y plantas. Lo tienes explicado en Dudas.' },
  { from: 40, to: 40, title: 'Monitorización', text: 'Registro del latido del bebé y de las contracciones durante unos 20 a 30 minutos.' },
  { from: 41, to: 41, info: true, title: 'Si el parto no ha empezado', text: 'Lo habitual es proponerte inducirlo durante la semana 41, para no llegar a la 42.' },
];

/** Lo que toca ahora y lo próximo, según la semana y el Rh */
export function timelineFor(weeks, rh) {
  const items = PREGNANCY_TIMELINE.filter((t) => !t.rh || t.rh === rh);
  const now = items.filter((t) => weeks >= t.from && weeks <= t.to);
  const next = items.filter((t) => t.from > weeks).slice(0, 2);
  return { now, next };
}

/** Tareas cuya ventana de semanas ya pasó (las informativas no cuentan) */
export function pastItems(weeks, rh) {
  return PREGNANCY_TIMELINE.filter((t) => (!t.rh || t.rh === rh) && !t.info && t.to < weeks);
}

/** Campaña de gripe y COVID-19 (otoño-invierno) */
export function fluCampaign(date = new Date()) {
  const m = date.getMonth() + 1;
  return m >= 10 || m <= 2;
}

// MARK: - Síntomas

export const PREGNANCY_SYMPTOMS = ['Náuseas', 'Vómitos', 'Cansancio', 'Acidez', 'Estreñimiento', 'Dolor lumbar',
  'Calambres', 'Piernas hinchadas', 'Dificultad para dormir', 'Contracciones de ensayo', 'Hemorroides', 'Preocupación'];

/** Síntomas que requieren valoración sin esperar (embarazo) */
export const PREGNANCY_ALARMS = ['Sangrado vaginal', 'Pérdida de líquido', 'Dolor de tripa intenso', 'Contracciones regulares',
  'Dolor de cabeza fuerte o visión borrosa', 'Picor en palmas y plantas', 'Fiebre (38 °C o más)', 'Vómito todo lo que tomo',
  'Pierna hinchada y dolorosa', 'Falta de aire'];

export const BABY_MOVEMENT = ['Como siempre', 'Menos de lo habitual'];

export const POSTPARTUM_SYMPTOMS = ['Loquios (sangrado posparto)', 'Dolor en los puntos o la cicatriz', 'Dolor en el pecho',
  'Grietas en el pezón', 'Cansancio', 'Dificultad para dormir', 'Pérdidas de orina', 'Estreñimiento', 'Tristeza', 'Ansiedad'];

/** Síntomas que requieren valoración sin esperar (posparto) */
export const POSTPARTUM_ALARMS = ['Fiebre (38 °C o más)', 'Sangrado muy abundante o coágulos grandes', 'Pecho rojo, caliente y doloroso con fiebre',
  'Pierna hinchada y dolorosa', 'Falta de aire', 'Dolor de cabeza fuerte o visión borrosa', 'Pensamientos de hacerme daño'];

// MARK: - Cuándo ir a urgencias

export const URGENT_PREGNANCY = [
  'Sangrado vaginal como una regla o más abundante.',
  'Dolor de tripa intenso o que no se calma.',
  'Pérdida de líquido por la vagina.',
  'Contracciones regulares antes de la semana 37.',
  'Que el bebé se mueve menos de lo habitual.',
  'Dolor de cabeza fuerte que no se va, visión borrosa o lucecitas, dolor en la boca del estómago o hinchazón brusca de cara y manos (posible preeclampsia).',
  'Picor intenso en las palmas de las manos y las plantas de los pies, sobre todo por la noche, sin granos (posible colestasis).',
  'Fiebre de 38 °C o más.',
  'Vomitar todo lo que comes y bebes.',
  'Una pierna hinchada, roja y dolorosa, o falta de aire repentina.',
];

export const URGENT_POSTPARTUM = [
  'Fiebre de 38 °C o más.',
  'Sangrado que empapa una compresa en una hora, coágulos grandes o sangrado que vuelve a aumentar.',
  'Pecho rojo, caliente y doloroso con fiebre o malestar general.',
  'Dolor de cabeza fuerte, visión borrosa o hinchazón brusca de cara y manos: la preeclampsia también puede aparecer tras el parto.',
  'Una pierna hinchada, roja y dolorosa, o falta de aire repentina.',
  'Dolor en la tripa o en la cicatriz que va a más, o mal olor de los loquios.',
  'Pensamientos de hacerte daño a ti o al bebé: llama al 112 o al 024.',
];

// MARK: - Medicación en el embarazo

const PREGNANCY_MED_WARNINGS = [
  { keys: ['ibuprofeno', 'dalsy', 'espidifen', 'neobrufen', 'naproxeno', 'diclofenaco', 'voltaren', 'dexketoprofeno', 'enantyum', 'aspirina', 'ácido acetilsalicílico', 'acido acetilsalicilico', 'antiinflamatorio'],
    text: 'Los antiinflamatorios (ibuprofeno y similares) se evitan en el embarazo salvo indicación médica, y nunca a partir de la semana 20. Para el dolor o la fiebre, el paracetamol es la opción de elección.' },
  { keys: ['retinol', 'retinoide', 'tretinoína', 'tretinoina', 'isotretinoína', 'isotretinoina', 'vitamina a'],
    text: 'Los retinoides y los suplementos con retinol (vitamina A) están desaconsejados en el embarazo.' },
  { keys: ['hierba', 'planta', 'infusión', 'infusion', 'fitoterapia', 'natural', 'homeopat'],
    text: 'Los productos naturales y las plantas medicinales no siempre son seguros en el embarazo: consulta antes de tomarlos.' },
];

/** Avisos para la lista de medicación en modo embarazo */
export function pregnancyMedWarnings(meds) {
  const names = meds.map((m) => `${m.name} ${m.dose}`.toLowerCase());
  return PREGNANCY_MED_WARNINGS.filter((w) => names.some((n) => w.keys.some((k) => n.includes(k)))).map((w) => w.text);
}
