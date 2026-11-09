// Formato visual de las guías (vera-backlog#76): datos clave, semáforo, gráfico (solo con datos reales) y enlaces.
// Sale del texto de cada guía (app/js/guide.js); la forma es nueva y está PENDIENTE DE REVISIÓN CLÍNICA.
// tiles: [cifra, explicación] · sem: { g|a|r: [título, texto] } · chart: track (barra por tramos) o range (rangos) · links: [url, texto]

const R = '#B8424F', A = '#D69A2D', G = '#3E8E63', P = '#8E6178', L = '#C9AEBB';

// Quien ha revisado cada guía: solo se muestra «Revisado por» cuando esté de verdad. Ej.: 'bebe-con-fiebre-que-hago': 'pediatra'
export const REVIEWED = {};

export const VISUAL = {
  'manchar-al-principio-del-embarazo': {
    tiles: [['Leve', 'Puede ser normal las primeras semanas'], ['Siempre', 'Coméntalo con tu matrona o tu médico'], ['Como una regla', 'Ve a urgencias'], ['Dolor en un lado', 'Ve a urgencias']],
    sem: { g: ['Puede ser normal', 'Unas gotas o un manchado leve, sin dolor, en las primeras semanas.'], a: ['Coméntalo', 'Aunque sea leve, avisa a tu matrona o a tu médico.'], r: ['Ve a urgencias', 'Sangrado como una regla o mayor, o dolor intenso en la tripa, sobre todo en un lado.'] },
    links: [['/embarazo/semana-5/', 'Semana 5'], ['/embarazo/semana-6/', 'Semana 6'], ['/embarazo/semana-8/', 'Semana 8']],
  },
  'nauseas-en-el-embarazo': {
    tiles: [['Muy frecuentes', 'Sobre todo al principio'], ['Semana 12–16', 'Cuando suelen mejorar'], ['Poco y a menudo', 'Lo que más ayuda'], ['Si vomitas todo', 'Consulta: hay tratamiento']],
    sem: { g: ['Es lo habitual', 'Náuseas o algún vómito, pero comes, bebes y no pierdes peso.'], a: ['Consulta', 'Si vomitas casi todo lo que comes o bebes, o pierdes peso.'], r: ['Ve a urgencias', 'Si no retienes ni el agua, orinas muy poco o te mareas al ponerte de pie.'] },
    chart: { title: 'Cuándo suelen aparecer', track: [['Más frecuentes', 12, P], ['Van mejorando', 4, L], ['Poco habituales', 24, '#E6DFE2']], ticks: ['Semana 0', '12', '16', '40'], legend: 'Orientativo: en algunas mujeres duran más.' },
    links: [['/embarazo/semana-6/', 'Semana 6'], ['/embarazo/semana-9/', 'Semana 9'], ['/embarazo/semana-12/', 'Semana 12']],
  },
  'alimentos-a-evitar-en-el-embarazo': {
    tiles: [['Listeria', 'Quesos sin pasteurizar, patés, pescado ahumado'], ['Toxoplasmosis', 'Carne cruda o poco hecha'], ['Alcohol', 'Ninguna cantidad es segura'], ['Cocinado', 'Con calor, casi todo se puede']],
    sem: { g: ['Puedes tomarlo', 'Quesos pasteurizados, carne y pescado bien cocinados, huevo bien hecho.'], a: ['Pregunta antes', 'Si no sabes si un queso está pasteurizado o cómo está cocinado algo.'], r: ['Evítalo', 'Carne o pescado crudos, leche cruda, patés refrigerados, huevo crudo y alcohol.'] },
    links: [['/guias/jamon-y-embutidos-en-el-embarazo/', 'Jamón y embutidos'], ['/embarazo/semana-4/', 'Semana 4'], ['/embarazo/semana-8/', 'Semana 8']],
  },
  'jamon-y-embutidos-en-el-embarazo': {
    tiles: [['IgG positiva', 'Eres inmune: puedes comerlos'], ['IgG negativa', 'Evita los curados crudos'], ['Cocidos', 'York o pavo, sí'], ['Cocinado', 'En guisos o croquetas, sí']],
    sem: { g: ['Puedes tomarlo', 'Embutidos cocidos (york, pavo) y curados cocinados (guisos, croquetas). Y todo, si eres inmune.'], a: ['Depende de tu analítica', 'Jamón y curados crudos: solo si eres inmune a la toxoplasmosis.'], r: ['Mejor evitarlo', 'Si no eres inmune: jamón, chorizo, fuet, salchichón o lomo crudos, aunque estén congelados.'] },
    links: [['/guias/alimentos-a-evitar-en-el-embarazo/', 'Alimentos a evitar'], ['/embarazo/semana-4/', 'Semana 4'], ['/embarazo/semana-12/', 'Semana 12']],
  },
  'cuanto-peso-ganar-en-el-embarazo': {
    tiles: [['11,5–16 kg', 'Con un peso de partida normal'], ['Depende', 'Del peso con el que empiezas'], ['0,5–2 kg', 'Lo habitual en el primer trimestre'], ['Cada visita', 'Tu matrona te pesa']],
    sem: { g: ['Va bien', 'Ganas peso poco a poco, dentro de tu rango.'], a: ['Coméntalo', 'Si ganas o pierdes mucho de una visita a otra.'], r: ['Ve a urgencias', 'Si se te hinchan de golpe la cara y las manos, con dolor de cabeza o visión borrosa.'] },
    chart: { title: 'Cuánto ganar en todo el embarazo, según tu peso de partida', range: { max: 20, unit: 'kg', rows: [['Bajo peso (IMC < 18,5)', 12.5, 18], ['Peso normal (18,5–24,9)', 11.5, 16], ['Sobrepeso (25–29,9)', 7, 11.5], ['Obesidad (≥ 30)', 5, 9]] }, legend: 'Embarazo de un solo bebé. Rangos de referencia internacionales; tu matrona te dirá el tuyo.' },
    links: [['/calculadoras/peso-en-el-embarazo/', 'Calcula tu rango de peso'], ['/embarazo/semana-13/', 'Semana 13'], ['/embarazo/semana-20/', 'Semana 20'], ['/embarazo/semana-30/', 'Semana 30']],
  },
  'test-de-o-sullivan': {
    tiles: [['Semanas 24–28', 'Cuándo se hace'], ['1 hora', 'Tras una bebida con azúcar'], ['Análisis de sangre', 'Una sola extracción'], ['No es diagnóstico', 'Si sale alto, se confirma']],
    sem: { g: ['Resultado normal', 'No hace falta nada más.'], a: ['Sale alterado', 'Te harán una prueba más larga para confirmarlo o descartarlo. La mayoría no tienen diabetes.'], r: ['Consulta pronto', 'Si tienes mucha sed, orinas mucho o te encuentras mal: no esperes a la prueba.'] },
    chart: { title: 'Cuándo toca', track: [['', 24, '#E6DFE2'], ['24–28', 4, P], ['', 12, '#E6DFE2']], ticks: ['Semana 0', '24', '28', '40'], legend: 'Si tienes factores de riesgo, también puede hacerse en el primer trimestre.' },
    links: [['/embarazo/semana-24/', 'Semana 24'], ['/embarazo/semana-26/', 'Semana 26'], ['/embarazo/semana-28/', 'Semana 28']],
  },
  'contracciones-de-braxton-hicks': {
    tiles: [['Unos segundos', 'La tripa se pone dura'], ['Irregulares', 'Sin un ritmo fijo'], ['Sin dolor', 'O con una molestia leve'], ['Antes de la 37', 'Si son regulares, consulta']],
    sem: { g: ['Son de ensayo', 'Irregulares, poco dolorosas, y se calman al cambiar de postura o descansar.'], a: ['Consulta', 'Si se vuelven regulares, dolorosas o muy frecuentes antes de la semana 37.'], r: ['Ve al hospital', 'Si van con sangrado, pérdida de líquido o notas que el bebé se mueve menos.'] },
    links: [['/embarazo/semana-28/', 'Semana 28'], ['/embarazo/semana-32/', 'Semana 32'], ['/guias/cuando-ir-al-hospital-de-parto/', 'Cuándo ir al hospital']],
  },
  'como-saber-si-he-roto-aguas': {
    tiles: [['Chorro o goteo', 'Que no puedes controlar'], ['Transparente', 'Y huele poco'], ['Verde o marrón', 'Al hospital sin esperar'], ['Con dudas', 'Compresa, observa y consulta']],
    sem: { g: ['Probablemente no', 'Flujo blanquecino y espeso, o un escape de orina que se controla.'], a: ['Consulta', 'Si dudas: ponte una compresa, obsérvala un rato y llama.'], r: ['Ve al hospital', 'Líquido que no paras de perder, o verde, marrón o con sangre.'] },
    links: [['/guias/cuando-ir-al-hospital-de-parto/', 'Cuándo ir al hospital'], ['/embarazo/semana-37/', 'Semana 37'], ['/embarazo/semana-40/', 'Semana 40']],
  },
  'cuando-ir-al-hospital-de-parto': {
    tiles: [['Cada 5 min', 'Contracciones regulares y dolorosas'], ['Durante 1 hora', 'Antes si ya has tenido partos'], ['Rotura de bolsa', 'Aunque no haya contracciones'], ['Se mueve menos', 'Ve sin esperar']],
    sem: { g: ['Aún en casa', 'Contracciones irregulares o espaciadas: descansa, hidrátate y cronométralas.'], a: ['Prepárate', 'Se hacen regulares y van acercándose: ten la bolsa lista.'], r: ['Ve al hospital', 'Cada 5 minutos durante 1 hora, rotura de bolsa, sangrado como una regla o menos movimientos.'] },
    links: [['/guias/como-saber-si-he-roto-aguas/', 'Cómo saber si he roto aguas'], ['/embarazo/semana-38/', 'Semana 38'], ['/embarazo/semana-40/', 'Semana 40']],
  },
  'cuanto-dura-el-sangrado-despues-del-parto': {
    tiles: [['4–6 semanas', 'Lo que suele durar'], ['Primeros días', 'Como una regla abundante'], ['Se aclara', 'De rojo a rosado y amarillento'], ['Coágulos grandes', 'Consulta']],
    sem: { g: ['Va bien', 'Cada vez menos abundante y más claro.'], a: ['Consulta', 'Si vuelve a aumentar, huele mal o aparecen coágulos grandes.'], r: ['Ve a urgencias', 'Si empapas una compresa en una hora, o hay fiebre o mareo.'] },
    chart: { title: 'Cómo va cambiando', track: [['Rojo', 1, R], ['Rosado o marrón', 2, '#C98A8F'], ['Amarillento o blanco', 3, '#E7D7B9']], ticks: ['Parto', '1 semana', '3 semanas', '6 semanas'], legend: 'Orientativo: en cada mujer cambia a su ritmo.' },
    links: [['/guias/cuando-vuelve-la-regla-despues-del-parto/', 'Cuándo vuelve la regla'], ['/bebe/mes-1/', 'Bebé de 1 mes']],
  },
  'cuando-vuelve-la-regla-despues-del-parto': {
    tiles: [['6–8 semanas', 'Si no das el pecho'], ['Meses', 'Con lactancia, sobre todo exclusiva'], ['Irregular', 'Los primeros ciclos'], ['Antes de la regla', 'Ya puedes ovular']],
    sem: { g: ['Es normal', 'Que tarde meses dando el pecho, o que los primeros ciclos sean irregulares.'], a: ['Coméntalo', 'Si no buscas otro embarazo: necesitas anticoncepción aunque no haya vuelto la regla.'], r: ['Consulta pronto', 'Si sangras de forma muy abundante o con dolor intenso.'] },
    links: [['/ciclo/', 'Las fases del ciclo'], ['/guias/cuanto-dura-el-sangrado-despues-del-parto/', 'Sangrado después del parto']],
  },
  'bebe-amarillo-ictericia': {
    tiles: [['Día 2–3', 'Cuando suele aparecer'], ['1–2 semanas', 'Cuando se va'], ['En 24 horas', 'Si aparece antes, consulta'], ['Sin sol', 'No hace falta ponerlo']],
    sem: { g: ['Es lo habitual', 'Aparece hacia el segundo o tercer día, en la cara, y se va solo.'], a: ['Consulta pronto', 'Si va a más, llega a las piernas, sigue pasadas 2 semanas o hace cacas muy claras.'], r: ['Consulta hoy mismo', 'Si aparece en las primeras 24 horas o está muy dormido y come mal.'] },
    chart: { title: 'Cuándo es normal', track: [['Consulta', 1, R], ['Normal', 13, G], ['Consulta', 6, A]], ticks: ['Nacer', 'Día 1', '2 semanas', '3 semanas'], legend: 'Con lactancia materna puede durar algo más; si pasa de 2 semanas, coméntalo con su pediatra.' },
    links: [['/bebe/mes-1/', 'Bebé de 1 mes'], ['/guias/bebe-con-fiebre-que-hago/', 'Fiebre en el bebé']],
  },
  'bebe-con-fiebre-que-hago': {
    tiles: [['38 °C', 'A partir de aquí es fiebre'], ['< 3 meses', 'Siempre a urgencias'], ['3–6 meses', 'Su pediatra, ese mismo día'], ['> 6 meses', 'Mira cómo está, no solo el número']],
    sem: { g: ['Puedes vigilarlo en casa', 'Tiene más de 6 meses y, entre los picos de fiebre, juega, come y moja pañales.'], a: ['Llama hoy a su pediatra', 'Tiene entre 3 y 6 meses, la fiebre dura más de 48 horas o rechaza las tomas.'], r: ['Ve a urgencias o llama al 112', 'Tiene menos de 3 meses, le cuesta respirar, está muy decaído o tiene manchas que no desaparecen al estirar la piel.'] },
    chart: { title: 'Según su edad', track: [['Urgencias', 1, R], ['Pediatra hoy', 1, A], ['Mira cómo está', 2, G]], ticks: ['0', '3 meses', '6 meses', '12 meses o más'], legend: 'Con fiebre de 38 °C o más. A cualquier edad, si le cuesta respirar o está muy decaído, ve a urgencias.' },
    links: [['/bebe/mes-1/', 'Bebé de 1 mes'], ['/bebe/mes-2/', 'Bebé de 2 meses'], ['/bebe/mes-4/', 'Bebé de 4 meses'], ['/bebe/mes-6/', 'Bebé de 6 meses']],
  },
  'como-duerme-seguro-un-bebe': {
    tiles: [['Boca arriba', 'Siempre, también en las siestas'], ['Cuna vacía', 'Sin almohadas ni peluches'], ['6 meses', 'En vuestra habitación'], ['Sin humo', 'Ni en casa ni en el coche']],
    sem: { g: ['Seguro', 'Boca arriba, en su cuna, con colchón firme y sin nada suelto.'], a: ['Con cuidado', 'Si duerme en tu cama: nunca si fumas, has bebido o tomas medicación que dé sueño.'], r: ['Nunca', 'Dormir con él en un sofá o sillón, o boca abajo sin vigilarlo.'] },
    links: [['/guias/bebe-llora-mucho-colicos/', 'Llanto y cólicos'], ['/bebe/mes-1/', 'Bebé de 1 mes'], ['/bebe/mes-4/', 'Bebé de 4 meses']],
  },
  'bebe-llora-mucho-colicos': {
    tiles: [['6–8 semanas', 'Cuando más llora'], ['3–4 meses', 'Cuando suele mejorar'], ['Por la tarde', 'Cuando son más frecuentes'], ['Brazos y calma', 'Lo que más ayuda']],
    sem: { g: ['Es normal', 'Llora mucho, pero come, gana peso y se calma a ratos.'], a: ['Consulta', 'Si el llanto es muy distinto del habitual, come mal o no gana peso.'], r: ['Ve a urgencias', 'Si tiene fiebre y menos de 3 meses, vomita todo o está muy decaído.'] },
    chart: { title: 'Cómo evoluciona el llanto', track: [['Aumenta', 6, L], ['Pico', 2, P], ['Va mejorando', 8, '#DCC9D3']], ticks: ['Nacer', '6 semanas', '8 semanas', '4 meses'], legend: 'Orientativo: cada bebé tiene su ritmo.' },
    links: [['/guias/como-duerme-seguro-un-bebe/', 'Cómo duerme seguro'], ['/bebe/mes-1/', 'Bebé de 1 mes'], ['/bebe/mes-2/', 'Bebé de 2 meses'], ['/bebe/mes-3/', 'Bebé de 3 meses']],
  },
};
