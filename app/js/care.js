// care.js
// Cuidados del embarazo: alimentación ("¿Puedo comer esto?"), ganancia de peso y agenda de citas.
// Alimentación basada en "Dudas frecuentes en el embarazo, semana a semana"; las entradas con
// `draft: true` vienen de recomendaciones generales (AESAN) y están pendientes de revisión clínica.

// MARK: - Alimentación

export const FOOD_CATEGORIES = ['Lácteos', 'Carnes', 'Pescados', 'Huevos', 'Vegetales', 'Bebidas'];

/** status: 'ok' (puedes tomarlo) | 'care' (con precauciones) | 'avoid' (evítalo) */
export const FOODS = [
  { cat: 'Lácteos', name: 'Leche pasteurizada o UHT', status: 'ok' },
  { cat: 'Lácteos', name: 'Yogur', status: 'ok' },
  { cat: 'Lácteos', name: 'Quesos pasteurizados (curados o frescos)', status: 'ok' },
  { cat: 'Lácteos', name: 'Quesos de leche cruda y leche sin pasteurizar', status: 'avoid', note: 'Pueden transmitir listeria.' },
  { cat: 'Carnes', name: 'Carne y pollo bien hechos', status: 'ok' },
  { cat: 'Carnes', name: 'Carne cruda o poco hecha (carpaccio, steak tartar, carne rosada)', status: 'avoid', note: 'Puede transmitir toxoplasmosis.' },
  { cat: 'Carnes', name: 'Jamón y embutidos curados (chorizo, salchichón, lomo)', status: 'toxo' },
  { cat: 'Carnes', name: 'Embutidos cocidos (jamón de york, pechuga de pavo)', status: 'ok' },
  { cat: 'Carnes', name: 'Patés refrigerados', status: 'avoid', note: 'Pueden transmitir listeria.' },
  { cat: 'Pescados', name: 'Pescado bien cocinado (salmón, merluza, sardina…)', status: 'ok', note: 'Muy recomendable dentro de una dieta variada.' },
  { cat: 'Pescados', name: 'Pescado crudo (sushi, ceviche)', status: 'avoid', note: 'Solo si está cocinado.' },
  { cat: 'Pescados', name: 'Pescado ahumado refrigerado (salmón ahumado)', status: 'avoid', note: 'Salvo que esté cocinado.' },
  { cat: 'Pescados', name: 'Pez espada, tiburón, atún rojo y lucio', status: 'avoid', note: 'Por su contenido en mercurio.', draft: true },
  { cat: 'Pescados', name: 'Marisco bien cocinado', status: 'care', note: 'Siempre bien cocinado, nunca crudo.', draft: true },
  { cat: 'Huevos', name: 'Huevo bien cocinado (cuajado, cocido, tortilla hecha)', status: 'ok' },
  { cat: 'Huevos', name: 'Huevo crudo o poco hecho (mayonesa casera, tiramisú)', status: 'avoid', note: 'Puede transmitir salmonela.' },
  { cat: 'Vegetales', name: 'Fruta, verdura y hierbas frescas', status: 'care', note: 'Lávalas muy bien, aunque vengan envasadas.' },
  { cat: 'Vegetales', name: 'Legumbres y cereales integrales', status: 'ok' },
  { cat: 'Vegetales', name: 'Frutos secos', status: 'ok' },
  { cat: 'Vegetales', name: 'Brotes crudos (soja, alfalfa)', status: 'avoid' },
  { cat: 'Bebidas', name: 'Café, té y refrescos de cola', status: 'care', note: 'Hasta unos 200 mg de cafeína al día: uno o dos cafés.' },
  { cat: 'Bebidas', name: 'Bebidas energéticas', status: 'care', note: 'Llevan mucha cafeína: cuentan para el límite de 200 mg al día.' },
  { cat: 'Bebidas', name: 'Alcohol', status: 'avoid', note: 'Ninguna cantidad es segura durante el embarazo.' },
];

export const FOOD_STATUS = {
  ok: { label: 'Puedes tomarlo', tone: 'sage' },
  care: { label: 'Con precauciones', tone: 'gold' },
  avoid: { label: 'Evítalo', tone: 'rose' },
};

/** Resuelve los alimentos que dependen de la inmunidad a la toxoplasmosis */
export function foodFor(item, toxo) {
  if (item.status !== 'toxo') return item;
  if (toxo === 'immune') return { ...item, status: 'ok', note: 'Como eres inmune a la toxoplasmosis, puedes tomarlos.' };
  return { ...item, status: toxo === 'not' ? 'avoid' : 'care',
    note: toxo === 'not'
      ? 'Como no eres inmune a la toxoplasmosis, evítalos. Congelarlos reduce el riesgo de toxoplasmosis, pero no elimina la listeria.'
      : 'Depende de si eres inmune a la toxoplasmosis (te lo dirá la primera analítica). Si no lo eres, evítalos: congelarlos reduce el riesgo de toxoplasmosis, pero no elimina la listeria.' };
}

// MARK: - Ganancia de peso (referencia poblacional por IMC previo)

/** Rangos de ganancia total (kg) por IMC previo; embarazo único y múltiple */
const GAIN = {
  single: [[18.5, 12.5, 18], [25, 11.5, 16], [30, 7, 11.5], [Infinity, 5, 9]],
  multiple: [[18.5, null, null], [25, 17, 25], [30, 14, 23], [Infinity, 11, 19]],
};

export function bmi(heightCm, weightKg) {
  if (!(heightCm > 100 && heightCm < 230) || !(weightKg > 30 && weightKg < 250)) return null;
  return weightKg / (heightCm / 100) ** 2;
}

/** { low, high } de ganancia total recomendada, o null si no hay referencia */
export function gainRange(bmiValue, multiple) {
  if (bmiValue == null) return null;
  const table = GAIN[multiple === 'multiple' ? 'multiple' : 'single'];
  const row = table.find(([max]) => bmiValue < max);
  return row && row[1] != null ? { low: row[1], high: row[2] } : null;
}

/** Banda orientativa a una semana dada: 0,5–2 kg en el primer trimestre y lineal hasta la 40 */
export function gainBandAt(week, range) {
  if (week <= 13) {
    const f = Math.max(0, week) / 13;
    return { low: 0.5 * f, high: 2 * f };
  }
  const f = (Math.min(40, week) - 13) / 27;
  return { low: 0.5 + (range.low - 0.5) * f, high: 2 + (range.high - 2) * f };
}

// MARK: - Agenda: archivo de calendario (.ics)

function icsEscape(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

export function appointmentICS(appt) {
  const d = appt.date.replace(/-/g, '');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  let when;
  if (appt.time) {
    const [h, m] = appt.time.split(':').map(Number);
    const end = h * 60 + m + 60;
    const pad = (n) => String(n).padStart(2, '0');
    when = `DTSTART:${d}T${pad(h)}${pad(m)}00\r\nDTEND:${d}T${pad(Math.min(23, Math.floor(end / 60)))}${pad(end >= 1440 ? 59 : end % 60)}00`;
  } else {
    when = `DTSTART;VALUE=DATE:${d}`;
  }
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Hera//Agenda//ES', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT', `UID:${appt.id}@vera`, `DTSTAMP:${stamp}`, when,
    `SUMMARY:${icsEscape(appt.title)}`, 'DESCRIPTION:Cita guardada en Hera', 'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
}
