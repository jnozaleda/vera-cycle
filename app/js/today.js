// today.js
// Contenido breve de la pantalla Hoy (embarazo y posparto): resumen de una línea, «Lo normal ahora»
// y «Dudas de esta semana» con respuesta corta. TODO ES BORRADOR pendiente de revisión clínica
// (embarazo y posparto de la madre: vera-backlog#2 · bebé: vera-backlog#36).
//
// Cada duda trae `short` (respuesta corta que se despliega en Hoy) y `ref` (sección y pregunta de la
// Guía que contienen la respuesta completa). Los textos cortos deben coincidir con la Guía.

const w = (from, to, data) => ({ from, to, ...data });
const inRange = (list, weeks) => list.find((x) => weeks >= x.from && weeks <= x.to) ?? list[list.length - 1];

// MARK: - Embarazo

export const PREGNANCY_LINE = {
  1: 'Tu cuerpo se está adaptando muy deprisa. Cuídate y ve a tu ritmo.',
  2: 'Suele ser la etapa más cómoda. Disfruta de la energía.',
  3: 'Recta final: prepara la bolsa y conoce el patrón de movimientos de tu bebé.',
};

const PREGNANCY_NORMAL = [
  w(0, 10, { items: ['Cansancio y mucho sueño.', 'Náuseas, que suelen mejorar hacia la semana 12 a 16.', 'Pechos sensibles y más ganas de orinar.'] }),
  w(11, 14, { items: ['Las náuseas y el cansancio suelen ir mejorando.', 'Los cambios de humor son frecuentes.', 'Flujo algo más abundante, claro o blanquecino.'] }),
  w(15, 23, { items: ['Los primeros movimientos del bebé, entre las semanas 18 y 22: burbujas o cosquillas.', 'La tripa empieza a notarse y vas ganando peso poco a poco.', 'Encías sensibles, nariz congestionada o calambres en las piernas.'] }),
  w(24, 28, { items: ['Movimientos cada vez más claros y regulares.', 'Acidez, pies hinchados o dolor de espalda empiezan a ser habituales.', 'Más cansancio y dificultad para dormir.'] }),
  w(29, 36, { items: ['Contracciones de ensayo (Braxton Hicks): la tripa se pone dura unos segundos, sin dolor o con una molestia leve.', 'Cansancio, ardor y más ganas de orinar.', 'Hinchazón leve de los pies al final del día.'] }),
  w(37, 99, { items: ['Contracciones de ensayo más frecuentes y mucha pesadez.', 'Ardor y dificultad para dormir.', 'Nervios y ganas de que llegue el día: es normal.'] }),
];

export const pregnancyNormal = (weeks) => inRange(PREGNANCY_NORMAL, weeks).items;

const PREGNANCY_FAQS = [
  w(0, 10, { items: [
    { q: '¿Cuándo pido la primera cita?', short: 'En cuanto tengas el test positivo, pide cita con la matrona o con tu médico de familia en tu centro de salud. Te abrirán la cartilla y te pedirán la primera analítica; lo ideal es que sea antes de la semana 10.', ref: { s: 's4', q: '¿Cuándo pido la primera cita y con quién?' } },
    { q: '¿Son normales las náuseas?', short: 'Sí, son muy frecuentes y suelen mejorar hacia la semana 12 a 16. Come poco y a menudo y evita el estómago vacío. Consulta si vomitas todo lo que tomas o pierdes peso.', ref: { s: 's4', q: '¿Son normales las náuseas? ¿Hasta cuándo duran?' } },
    { q: '¿Qué alimentos debo evitar?', short: 'Carne y pescado crudos o poco hechos, huevo crudo, leche y quesos sin pasteurizar, patés y brotes crudos, y el alcohol: ninguna cantidad es segura.', ref: { s: 's4', q: '¿Qué alimentos debo evitar?' } },
  ] }),
  w(11, 14, { items: [
    { q: '¿Qué se ve en la primera ecografía?', short: 'Se confirma que el embarazo está bien situado, cuántos bebés hay y que el corazón late. También se ajusta la fecha de parto y se mide el pliegue de la nuca.', ref: { s: 's11', q: '¿Qué se ve en la primera ecografía?' } },
    { q: '¿Qué es el cribado combinado?', short: 'Calcula la probabilidad de algunas alteraciones cromosómicas combinando tu edad, un análisis de sangre y la medida de la nuca. No es un diagnóstico.', ref: { s: 's11', q: '¿Qué es el cribado combinado del primer trimestre?' } },
    { q: '¿Y si sale de riesgo alto?', short: 'No significa que el bebé tenga un problema: la mayoría están sanos. Te explicarán las opciones (test de ADN fetal en sangre o una prueba diagnóstica) y tú decides.', ref: { s: 's11', q: '¿Y si sale de riesgo alto?' } },
  ] }),
  w(15, 23, { items: [
    { q: '¿Qué es la ecografía de la semana 20?', short: 'Es la ecografía morfológica, la más detallada del embarazo: se revisan uno por uno los órganos del bebé, la placenta y el líquido amniótico.', ref: { s: 's15', q: '¿Qué es la ecografía de la semana 20?' } },
    { q: '¿Cuándo voy a notar al bebé?', short: 'En un primer embarazo, normalmente entre las semanas 18 y 22; si ya has tenido hijos, puede ser antes. Al principio se nota como burbujas o cosquillas.', ref: { s: 's15', q: '¿Cuándo voy a notar al bebé moverse?' } },
    { q: '¿Cuánto peso es normal ganar?', short: 'Depende de tu peso de partida. Con un peso normal, lo habitual es entre 11 y 16 kilos en todo el embarazo.', ref: { s: 's15', q: '¿Cuánto peso es normal ganar?' } },
  ] }),
  w(24, 28, { items: [
    { q: "¿Qué es el test de O'Sullivan?", short: 'Detecta la diabetes del embarazo. Se hace entre las semanas 24 y 28: te sacan sangre una hora después de tomar una bebida con azúcar. Hay que ir en ayunas.', ref: { s: 's24', q: "¿Qué es el test de O'Sullivan?" } },
    { q: '¿Qué vacunas me tengo que poner?', short: 'La tosferina, entre las semanas 27 y 28 de cada embarazo, y la gripe y la COVID-19 durante la campaña de otoño e invierno. Todas son seguras en el embarazo.', ref: { s: 's24', q: '¿Qué vacunas me tengo que poner?' } },
    { q: 'Soy Rh negativo, ¿qué significa?', rhNotPos: true, short: 'Si el bebé es Rh positivo, te pondrán una inyección de inmunoglobulina anti-D hacia la semana 28 y otra tras el parto, para evitar problemas en futuros embarazos.', ref: { s: 's24', q: 'Soy Rh negativo, ¿qué significa?' } },
    { q: "¿Y si el O'Sullivan sale alterado?", short: 'No quiere decir que tengas diabetes: solo que hay que hacer una prueba más larga que lo confirma o lo descarta. La mayoría no tienen diabetes.', ref: { s: 's24', q: "¿Y si el O'Sullivan sale alterado?" } },
  ] }),
  w(29, 33, { items: [
    { q: '¿Qué se mira en la ecografía del tercer trimestre?', short: 'Se hace entre las semanas 32 y 36 y sirve para ver cómo crece el bebé, en qué postura está, dónde está la placenta y cuánto líquido hay.', ref: { s: 's29', q: '¿Qué se mira en la ecografía del tercer trimestre?' } },
    { q: '¿Cuándo empiezan las clases de preparación al parto?', short: 'La matrona de tu centro de salud suele organizarlas a partir de la semana 28 a 30. Son gratuitas y tu pareja o acompañante puede ir contigo.', ref: { s: 's29', q: '¿Cuándo empiezan las clases de preparación al parto?' } },
    { q: '¿Cómo sé si el bebé se mueve lo suficiente?', short: 'No hay un número exacto: conoce su patrón habitual. Si notas que se mueve menos, túmbate de lado un rato; si sigues notándolo menos, ve a urgencias ese mismo día.', ref: { s: 's29', q: '¿Cómo sé si el bebé se mueve lo suficiente?' } },
  ] }),
  w(34, 36, { items: [
    { q: '¿Qué es un plan de parto?', short: 'Un documento donde explicas tus preferencias (acompañante, anestesia, piel con piel…). Entrégalo hacia la semana 32 a 36 y repásalo con tu matrona.', ref: { s: 's29', q: '¿Qué es un plan de parto?' } },
    { q: '¿Qué es el masaje perineal?', short: 'Un masaje suave de la zona entre la vagina y el ano para prepararla. En un primer parto, empezar hacia la semana 34 o 35 reduce el riesgo de desgarros importantes.', ref: { s: 's29', q: '¿Qué es el masaje perineal y cuándo empiezo?' } },
    { q: '¿Cuándo debo ir al hospital?', short: 'Si tienes contracciones regulares cada 5 minutos durante una hora, rompes la bolsa, sangras como una regla o el bebé se mueve menos. También ante un dolor de cabeza fuerte o un picor intenso en palmas y plantas.', ref: { s: 's29', q: 'Desde la semana 36: ¿cuándo debo ir al hospital?' } },
  ] }),
  w(37, 99, { items: [
    { q: '¿Cuándo tengo que ir al hospital?', short: 'Si tienes contracciones regulares cada 5 minutos durante al menos una hora (antes si ya has tenido partos), si rompes la bolsa, si sangras como una regla o si notas que el bebé se mueve menos.', ref: { s: 's37', q: '¿Cuándo tengo que ir al hospital?' } },
    { q: '¿Cómo sé si he roto aguas?', short: 'Sale líquido de la vagina que no puedes controlar, en chorro o en goteo. Ve al hospital; sin esperar si es verde, marrón o con sangre.', ref: { s: 's37', q: '¿Cómo sé si he roto aguas?' } },
    { q: '¿Qué pasa si me paso de fecha?', short: 'Desde la semana 40 te harán controles más frecuentes. Si el parto no empieza solo, lo habitual es proponerte provocarlo (inducirlo) durante la semana 41.', ref: { s: 's37', q: '¿Qué pasa si me paso de fecha?' } },
    { q: '¿Qué llevo en la bolsa del hospital?', short: 'DNI, tarjeta sanitaria, cartilla del embarazo, plan de parto, ropa cómoda, compresas de posparto y neceser. Para el bebé: bodies, pijamas, pañales y ropa para salir, y la sillita del coche instalada.', ref: { s: 's37', q: '¿Qué llevo en la bolsa del hospital?' } },
  ] }),
];

/** Hasta 3 dudas para la semana (se omite la del Rh si ya sabe que es positivo) */
export function pregnancyFaqs(weeks, pregnancy) {
  return inRange(PREGNANCY_FAQS, weeks).items
    .filter((it) => !(it.rhNotPos && pregnancy?.rh === 'pos'))
    .slice(0, 3);
}

// MARK: - Posparto

export const POSTPARTUM_LINE = [
  w(0, 1, { text: 'Tu cuerpo está empezando a recuperarse. Descansa y acepta ayuda.' }),
  w(2, 5, { text: 'Cada día será un poco más fácil. Ve a tu ritmo.' }),
  w(6, 11, { text: 'Ya pasó la cuarentena. Es buen momento para tu revisión.' }),
  w(12, 999, { text: 'Sigue a tu ritmo: la recuperación completa lleva meses.' }),
];
export const postpartumLine = (weeks) => inRange(POSTPARTUM_LINE, weeks).text;

const POSTPARTUM_NORMAL = [
  w(0, 1, { items: ['Sangrado como una regla abundante que se irá aclarando (loquios).', 'La subida de la leche, entre el segundo y el cuarto día: pechos duros y calientes.', 'Cansancio, llanto fácil y altibajos de ánimo.'] }),
  w(2, 5, { items: ['Cansancio por las tomas y el sueño interrumpido.', 'La tristeza de los primeros días suele pasar sola en unas 2 semanas.', 'El sangrado se va aclarando y disminuyendo.'] }),
  w(6, 11, { items: ['La revisión con tu matrona suele ser hacia las 6 semanas.', 'Si das el pecho, la regla puede tardar meses; los primeros ciclos son irregulares.', 'Puedes ovular antes de tener la primera regla.'] }),
  w(12, 999, { items: ['Tu cuerpo sigue recuperándose: suelo pélvico, abdomen y cansancio.', 'Cuidarte también cuenta: duerme cuando puedas y pide ayuda.', 'Puedes mantener la lactancia al volver al trabajo.'] }),
];
export const postpartumNormal = (weeks) => inRange(POSTPARTUM_NORMAL, weeks).items;

const MOM_BLEEDING = { q: '¿Cuánto dura el sangrado?', short: 'Unas 4 a 6 semanas: al principio como una regla abundante y luego se va aclarando. Consulta si vuelve a aumentar, si empapas una compresa en una hora, si hay coágulos grandes o si huele mal.', ref: { s: 'pp', q: '¿Cuánto dura el sangrado después del parto?' } };
const MOM_EXERCISE = { q: '¿Cuándo vuelvo a hacer ejercicio?', short: 'Puedes caminar desde los primeros días. La fuerza y el abdomen, tras la revisión de las 6 semanas; el ejercicio de impacto (correr, saltar), no antes de unas 12.', ref: { s: 'pp', q: '¿Cuándo puedo volver a hacer ejercicio?' } };
const MOM_PELVIC = { q: '¿Cómo está mi suelo pélvico?', short: 'Si tienes pérdidas de orina, sensación de peso en la vagina o dolor en las relaciones que no mejoran, pide una valoración con fisioterapia de suelo pélvico: tiene tratamiento.', ref: { s: 'pp', q: '¿Cuándo y cómo se valora el suelo pélvico?' } };
const MOM_PERIOD = { q: '¿Cuándo vuelve la regla?', short: 'Sin lactancia, entre las 6 y 8 semanas; con lactancia materna puede tardar meses. Los primeros ciclos suelen ser irregulares.', ref: { s: 'ppc', q: '¿Cuándo vuelve la regla?' } };

const POSTPARTUM_MOM_FAQS = [
  w(0, 1, { items: [
    MOM_BLEEDING,
    { q: '¿Es normal que me duela al dar el pecho?', short: 'Algo de molestia al empezar es frecuente, pero el dolor intenso o las grietas, no. Revisa el agarre y pide ayuda pronto a tu matrona: casi todo tiene solución.', ref: { s: 'bal', q: '¿Cómo sé si la lactancia va bien?' } },
    { q: '¿Cómo cuido los puntos o la cicatriz?', short: 'Lávalos cada día con agua y jabón suave y sécalos a toques, sin frotar. Consulta si hay fiebre, mal olor, enrojecimiento que aumenta o se abre la herida.', ref: { s: 'pp', q: '¿Cómo cuido los puntos o la cicatriz?' } },
  ] }),
  w(2, 5, { items: [
    { q: '¿Es normal sentirme triste?', short: 'La tristeza posparto es muy común y suele pasar sola en unas 2 semanas. Si dura más, va a peor o no disfrutas de nada, coméntalo con tu matrona: tiene tratamiento.', ref: { s: 'pp', q: '¿Cómo distingo la tristeza posparto de una depresión?' } },
    MOM_EXERCISE,
    { q: '¿Cuándo me ve la matrona?', short: 'Suele verte en los primeros días tras el alta y de nuevo hacia las 6 semanas, en la revisión del final de la cuarentena.', ref: { s: 'pp', q: '¿Cuándo tengo la revisión después del parto?' } },
    MOM_BLEEDING,
  ] }),
  w(6, 11, { items: [
    MOM_PERIOD,
    { q: '¿Necesito anticoncepción?', short: 'Sí, si no buscas otro embarazo: puedes ovular antes de la primera regla. Hay métodos compatibles con la lactancia; habla con tu matrona o tu médico.', ref: { s: 'ppc', q: '¿La lactancia protege de un nuevo embarazo?' } },
    MOM_PELVIC,
  ] }),
  w(12, 999, { items: [
    MOM_EXERCISE,
    MOM_PELVIC,
    { q: '¿Puedo tomar algo dando el pecho?', short: 'La mayoría de los medicamentos son compatibles con la lactancia. Compruébalo en e-lactancia.org y coméntalo con quien te lo receta.', ref: { s: 'pp', q: '¿Qué puedo tomar durante la lactancia?' } },
    MOM_PERIOD,
  ] }),
];

/** Lo normal en el bebé según su edad (semanas desde el parto). BORRADOR: pendiente de la pediatra (vera-backlog#36). */
const POSTPARTUM_BABY_NORMAL = [
  w(0, 3, { items: ['Duerme la mayor parte del día y se despierta para comer cada 2 o 3 horas.', 'Pierde algo de peso los primeros días (hasta un 7 % aproximadamente) y lo recupera hacia los 10 a 14 días.', 'Sus cacas pasan de negras a amarillas, y a partir del quinto día moja al menos 6 pañales al día.'] }),
  w(4, 11, { items: ['Llora más hacia las 6 a 8 semanas; suele mejorar hacia los 3 o 4 meses.', 'Empieza a sonreír hacia los 2 meses.', 'Duerme en tramos cortos, también de noche: es normal.'] }),
  w(12, 23, { items: ['Sonríe, balbucea y empieza a sostener la cabeza hacia los 4 meses.', 'Le sienta bien el tiempo boca abajo, despierto y vigilado.', 'Las primeras vacunas son a los 2 meses; después, a los 4 y a los 11–12 meses.'] }),
  w(24, 999, { items: ['Hacia los 6 meses empieza a comer otros alimentos, sin dejar la leche.', 'Se sienta con apoyo y puede salirle el primer diente.', 'Cada vez se mueve más: conviene revisar los riesgos de la casa.'] }),
];
export const postpartumBabyNormal = (weeks) => inRange(POSTPARTUM_BABY_NORMAL, weeks).items;

const POSTPARTUM_BABY_FAQS = [
  w(0, 3, { items: [
    { q: '¿Cómo cuido el cordón?', short: 'Mantenlo limpio y seco, con el pañal doblado por debajo. Se cae solo entre los 5 y los 15 días. Consulta si hay enrojecimiento, pus o mal olor, o fiebre.', ref: { s: 'b0', q: '¿Cómo cuido el cordón umbilical?' } },
    { q: 'Está amarillo, ¿es normal?', short: 'La ictericia es muy frecuente: aparece hacia el segundo o tercer día y suele irse en 1 o 2 semanas. Consulta pronto si aparece en las primeras 24 horas, va a más o está muy dormido.', ref: { s: 'b0', q: 'Mi bebé está amarillo, ¿es normal?' } },
    { q: '¿Qué es normal en sus cacas?', short: 'Empieza con cacas negras verdosas (meconio) y hacia el tercer o quinto día pasan a amarillas. A partir del quinto día, al menos 6 pañales mojados al día.', ref: { s: 'b0', q: '¿Qué es normal en sus cacas y pañales?' } },
    { q: '¿Cómo sé si come lo suficiente?', short: 'Si moja suficientes pañales, hace cacas amarillas y va ganando peso. Revisa el agarre y pide ayuda pronto si duele o tienes dudas.', ref: { s: 'bal', q: '¿Cómo sé si la lactancia va bien?' } },
  ] }),
  w(4, 11, { items: [
    { q: '¿Cómo duerme seguro?', short: 'Siempre boca arriba, en una cuna con colchón firme y sin almohadas ni peluches, en vuestra habitación los primeros 6 meses y sin humo de tabaco.', ref: { s: 'bsl', q: '¿Cómo duerme seguro mi bebé?' } },
    { q: 'Llora mucho, ¿son cólicos?', short: 'El llanto aumenta hasta las 6 a 8 semanas y mejora hacia los 3 o 4 meses. Cógelo en brazos, mécelo o dale contacto piel con piel. Consulta si tiene fiebre, vomita o no gana peso.', ref: { s: 'bsl', q: 'Llora mucho, ¿son cólicos?' } },
    { q: 'Tiene fiebre, ¿qué hago?', short: 'Hablamos de fiebre a partir de 38 °C. Si tiene menos de 3 meses, llévalo siempre a urgencias; entre los 3 y los 6 meses, consulta con su pediatra ese mismo día.', ref: { s: 'bb', q: 'Tiene fiebre, ¿qué hago?' } },
  ] }),
  w(12, 23, { items: [
    { q: '¿Qué hace en cada etapa?', short: 'Cada bebé tiene su ritmo: sonríe hacia los 2 meses, sostiene la cabeza hacia los 4 y se sienta con apoyo hacia los 6. Consulta si no sonríe a los 3 meses o no sostiene la cabeza a los 4.', ref: { s: 'bdes', q: '¿Qué hace un bebé en cada etapa?' } },
    { q: 'Tiempo boca abajo', short: 'Ponlo boca abajo, despierto y vigilado, varias veces al día para fortalecerlo y evitar que se le aplane la cabeza.', ref: { s: 'bdes', q: 'Tiempo boca abajo y cabeza plana' } },
    { q: '¿Qué vacunas le tocan?', short: 'Las primeras vacunas del calendario son a los 2 meses; después, a los 4 y a los 11–12 meses, entre otras. Tu centro de salud te dará cita.', ref: { s: 'bb', q: '¿Qué vacunas le tocan a mi bebé?' } },
  ] }),
  w(24, 999, { items: [
    { q: '¿Cuándo empieza a comer otros alimentos?', short: 'Hacia los 6 meses, sin dejar la leche, que sigue siendo su alimento principal. Sin sal ni azúcar añadidos y nada de miel antes del año.', ref: { s: 'bb', q: '¿Cuándo empieza a comer otros alimentos?' } },
    { q: 'Los dientes', short: 'El primer diente suele salir hacia los 6 meses (entre los 4 y los 15). Un mordedor frío ayuda; desde el primer diente, cepíllaselos dos veces al día con pasta con flúor.', ref: { s: 'bdes', q: 'Los dientes' } },
    { q: 'Cómo evitar accidentes', short: 'Caídas, atragantamientos y quemaduras son los más frecuentes: no lo dejes solo en el cambiador y guarda fuera de su alcance objetos pequeños y productos de limpieza.', ref: { s: 'bsl', q: 'Cómo evitar accidentes en casa' } },
  ] }),
];

/** kind: 'mom' | 'baby'. Hasta 3 dudas según las semanas desde el parto */
export function postpartumFaqs(weeks, kind) {
  const list = kind === 'baby' ? POSTPARTUM_BABY_FAQS : POSTPARTUM_MOM_FAQS;
  return inRange(list, weeks).items.slice(0, 3);
}
