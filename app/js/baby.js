// baby.js
// "Mi bebé": desarrollo semana a semana, tamaño aproximado e imágenes de referencia.
// Textos redactados por el equipo técnico: PENDIENTES DE REVISIÓN CLÍNICA.
// Tamaños: valores medios orientativos (longitud cabeza–nalgas hasta la semana 19;
// cabeza–talones desde la 20). No son una medición de ningún bebé concreto.

export const BABY_WEEKS = {
  4: { cm: 0.1, g: 0, text: 'El embrión acaba de anidar en el útero y empieza a formarse la placenta.' },
  5: { cm: 0.2, g: 0, text: 'Se forma el tubo neural, del que saldrán el cerebro y la médula: por eso el ácido fólico es tan importante ahora.' },
  6: { cm: 0.6, g: 0, text: 'El corazón empieza a latir y ya puede verse en una ecografía. Se esbozan los brazos y las piernas.' },
  7: { cm: 1.0, g: 0, text: 'El cerebro crece muy deprisa y aparecen los esbozos de las manos y los pies.' },
  8: { cm: 1.6, g: 1, text: 'Se forman los dedos, todavía unidos. Los órganos principales siguen desarrollándose.' },
  9: { cm: 2.3, g: 2, text: 'Empieza a moverse, aunque aún es pronto para que lo notes.' },
  10: { cm: 3.1, g: 4, text: 'Termina el periodo embrionario: a partir de ahora se habla de feto. Los órganos principales ya están formados.' },
  11: { cm: 4.1, g: 7, text: 'Se forman las uñas y los folículos del pelo, y los huesos empiezan a endurecerse.' },
  12: { cm: 5.4, g: 14, text: 'Ya puede abrir y cerrar las manos. En muchos centros es la semana de la primera ecografía.' },
  13: { cm: 7.4, g: 23, text: 'Los intestinos, que se formaban en parte fuera del abdomen, se colocan en su sitio.' },
  14: { cm: 8.7, g: 43, text: 'Empieza a hacer gestos con la cara y puede llevarse el dedo a la boca. Comienza el segundo trimestre.' },
  15: { cm: 10.1, g: 70, text: 'Percibe la luz a través de los párpados cerrados y se forman los huesecillos del oído.' },
  16: { cm: 11.6, g: 100, text: 'Los músculos se fortalecen y sus movimientos son cada vez más coordinados.' },
  17: { cm: 13, g: 140, text: 'Empieza a acumular grasa bajo la piel, que le ayudará a regular su temperatura.' },
  18: { cm: 14.2, g: 190, text: 'El sistema nervioso sigue madurando. Puede que empieces a notar sus primeros movimientos.' },
  19: { cm: 15.3, g: 240, text: 'Una capa protectora (el vérnix) cubre su piel y sus sentidos siguen desarrollándose.' },
  20: { cm: 25.6, g: 300, text: 'Mitad del embarazo. Es la semana de la ecografía morfológica.' },
  21: { cm: 26.7, g: 360, text: 'Traga líquido amniótico, lo que entrena su aparato digestivo.' },
  22: { cm: 27.8, g: 430, text: 'Ya puede oír: tu voz y los latidos de tu corazón le llegan amortiguados.' },
  23: { cm: 28.9, g: 500, text: 'Su piel todavía es fina y arrugada; irá ganando grasa en las próximas semanas.' },
  24: { cm: 30, g: 600, text: 'Los pulmones empiezan a fabricar surfactante, una sustancia clave para respirar al nacer.' },
  25: { cm: 34.6, g: 660, text: 'Responde a los sonidos y al tacto, y sus movimientos son cada vez más claros.' },
  26: { cm: 35.6, g: 760, text: 'Empieza a abrir los ojos y alterna periodos de sueño y de actividad.' },
  27: { cm: 36.6, g: 875, text: 'Su cerebro crece muy deprisa. Termina el segundo trimestre.' },
  28: { cm: 37.6, g: 1005, text: 'Ya tiene pestañas y puede parpadear. Comienza el tercer trimestre.' },
  29: { cm: 38.6, g: 1150, text: 'Sus huesos están casi formados, aunque todavía son blandos.' },
  30: { cm: 39.9, g: 1320, text: 'Gana peso rápidamente mientras su cerebro sigue madurando.' },
  31: { cm: 41.1, g: 1500, text: 'Puede girar la cabeza de un lado a otro y sus movimientos se notan con más fuerza.' },
  32: { cm: 42.4, g: 1700, text: 'Practica movimientos de respiración y las uñas ya le llegan a la punta de los dedos.' },
  33: { cm: 43.7, g: 1920, text: 'Los huesos del cráneo siguen sin soldarse para facilitar el parto.' },
  34: { cm: 45, g: 2150, text: 'Sus pulmones y su sistema nervioso siguen madurando.' },
  35: { cm: 46.2, g: 2380, text: 'Tiene menos espacio y notarás sus movimientos de otra manera, pero debes seguir notándolos.' },
  36: { cm: 47.4, g: 2620, text: 'Muchos bebés ya se colocan cabeza abajo. Sigue ganando peso.' },
  37: { cm: 48.6, g: 2860, text: 'Empieza el término: sus órganos están preparados para la vida fuera del útero.' },
  38: { cm: 49.8, g: 3080, text: 'Sigue acumulando grasa y el vello fino que cubría su piel (lanugo) va desapareciendo.' },
  39: { cm: 50.7, g: 3290, text: 'Está listo para nacer y sigue creciendo hasta que llegue el día.' },
  40: { cm: 51.2, g: 3460, text: 'Es la semana de tu fecha probable de parto. Solo una minoría nace justo ese día: lo normal es entre la 37 y la 42.' },
};

export const BABY_TITLE = (w) => (w < 10 ? 'Embrión' : w < 28 ? 'Feto en crecimiento' : 'Preparándose para nacer');


// Comparación de tamaño con frutas y verduras (orientativa; BORRADOR pendiente de revisión, vera-backlog#2).
// Emoji + nombre con artículo, para «Del tamaño de …». Semanas 4 a 40.
const COMPARE = {
  4: ['·', 'una semilla de amapola'], 5: ['·', 'una semilla de sésamo'], 6: ['🫘', 'una lenteja'], 7: ['🫛', 'un guisante'],
  8: ['🫐', 'un arándano'], 9: ['🫒', 'una aceituna'], 10: ['🍓', 'una fresa'], 11: ['🌰', 'una castaña'],
  12: ['🥝', 'un kiwi'], 13: ['🍋', 'un limón'], 14: ['🍑', 'un melocotón'], 15: ['🍎', 'una manzana'],
  16: ['🥑', 'un aguacate'], 17: ['🍐', 'una pera'], 18: ['🫑', 'un pimiento'], 19: ['🌽', 'una mazorca de maíz'],
  20: ['🍌', 'un plátano'], 21: ['🥕', 'una zanahoria'], 22: ['🍍', 'una piña'], 23: ['🥒', 'un calabacín'],
  24: ['🍈', 'un melón'], 25: ['🥦', 'una coliflor'], 26: ['🥬', 'una lechuga'], 27: ['🧅', 'un puerro'],
  28: ['🍆', 'una berenjena'], 29: ['🎃', 'una calabaza pequeña'], 30: ['🥬', 'un repollo'], 31: ['🥬', 'un repollo'],
  32: ['🍍', 'una piña'], 33: ['🍍', 'una piña'], 34: ['🎃', 'una calabaza'], 35: ['🎃', 'una calabaza'],
  36: ['🥬', 'un manojo de acelgas'], 37: ['🥬', 'un manojo de acelgas'], 38: ['🍉', 'una sandía pequeña'],
  39: ['🍉', 'una sandía pequeña'], 40: ['🍉', 'una sandía'],
};
export const babyCompare = (week) => { const c = COMPARE[Math.min(40, Math.max(4, week))]; return { emoji: c[0] === '·' ? '' : c[0], name: c[1] }; };

export function babyWeek(week) {
  const w = Math.min(40, Math.max(4, week));
  return { week: w, ...BABY_WEEKS[w], measure: w < 20 ? 'Longitud cabeza–nalgas' : 'Longitud cabeza–talones' };
}

// MARK: - Imágenes (Wikimedia Commons) y créditos

export const BABY_MEDIA = {
  illustration: [
    { week: 6, src: 'img/baby/ilus-06.png', credit: '3D Pregnancy · CC BY-SA 2.5', url: 'https://commons.wikimedia.org/wiki/File:6_weeks_pregnant.png' },
    { week: 10, src: 'img/baby/ilus-10.png', credit: 'Melchior Meijer, 3D Pregnancy · CC BY-SA 2.5', url: 'https://commons.wikimedia.org/wiki/File:10_weeks_pregnant.png' },
    { week: 20, src: 'img/baby/ilus-20.png', credit: '3D Pregnancy · CC BY-SA 2.5', url: 'https://commons.wikimedia.org/wiki/File:20_weeks_pregnant.png' },
    { week: 40, src: 'img/baby/ilus-40.png', credit: '3D Pregnancy · CC BY-SA 2.5', url: 'https://commons.wikimedia.org/wiki/File:40_weeks_pregnant.png' },
  ],
  ultrasound: [
    { week: 12, src: 'img/baby/eco-12.jpg', credit: 'Dr. Wolfgang Moroder · CC BY-SA 3.0 (recortada)', url: 'https://commons.wikimedia.org/wiki/File:CRL_Crown_rump_length_12_weeks_ecografia_Dr._Wolfgang_Moroder.jpg', alt: 'Ecografía 2D de un feto de 12 semanas, de perfil' },
    { week: 17, src: 'img/baby/eco-17.jpg', credit: 'jenny cu · CC BY 2.0', url: 'https://commons.wikimedia.org/wiki/File:Sucking_his_thumb_and_waving.jpg', alt: 'Ecografía 3D de un feto de 17 semanas chupándose el dedo' },
    { week: 20, src: 'img/baby/eco-20.jpg', credit: 'Staecker · dominio público', url: 'https://commons.wikimedia.org/wiki/File:3dultrasound_20_weeks.jpg', alt: 'Ecografía 3D de un feto de 20 semanas' },
    { week: 24, src: 'img/baby/eco-24.jpg', credit: 'Prskavka · dominio público', url: 'https://commons.wikimedia.org/wiki/File:3Dultrasound_24weeks_%2B3.jpg', alt: 'Ecografía 3D de la cara de un feto de 24 semanas' },
  ],
};

/** Imagen más cercana a la semana (las ecografías solo si están a 3 semanas o menos) */
export function mediaFor(kind, week) {
  const list = BABY_MEDIA[kind];
  const best = list.reduce((a, b) => (Math.abs(b.week - week) < Math.abs(a.week - week) ? b : a));
  if (kind === 'ultrasound' && Math.abs(best.week - week) > 3) return null;
  return best;
}
