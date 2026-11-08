// Bebé mes a mes (1 a 12 meses) para las páginas /bebe/. BORRADOR pendiente de revisión de la pediatra (vera-backlog#36).
// Hitos: edades típicas con mucho margen: cada bebé tiene su ritmo. Peso y longitud: medianas de los patrones de
// crecimiento de la OMS (niñas / niños), redondeadas; solo orientativas.
// Vacunas y revisiones: se nombran sin detallar, porque el calendario cambia según la comunidad autónoma.

export const MONTHS = {
  1: {
    kg: [4.2, 4.5], cm: [53.7, 54.7],
    hace: ['Fija la mirada en las caras cercanas, sobre todo en la tuya.', 'Se sobresalta con los ruidos fuertes y se calma con tu voz.', 'Boca abajo, levanta la cabeza un momento.'],
    come: ['Leche a demanda, materna o de fórmula: suelen ser 8 a 12 tomas al día.', 'Duerme mucho, en tramos cortos de día y de noche.'],
    toca: [['Revisión del niño sano', 'En el centro de salud, en las primeras semanas. Cada comunidad tiene su calendario.'], ['Vitamina D', 'Su pediatra suele recomendarla durante el primer año.']],
    consulta: ['Fiebre de 38 °C o más: con menos de 3 meses, a urgencias siempre.', 'Moja pocos pañales, rechaza varias tomas seguidas o está muy dormido y le cuesta despertar.'],
  },
  2: {
    kg: [5.1, 5.6], cm: [57.1, 58.4],
    hace: ['Primeras sonrisas cuando le hablas.', 'Sigue con la mirada un objeto que se mueve.', 'Hace gorjeos y otros sonidos suaves.'],
    come: ['Sigue con leche a demanda; las tomas pueden espaciarse un poco.', 'El llanto suele llegar a su pico entre las 6 y las 8 semanas.'],
    toca: [['Vacunas de los 2 meses', 'Las primeras del calendario. Tu centro de salud te da la cita.']],
    consulta: ['Fiebre de 38 °C o más: con menos de 3 meses, a urgencias siempre.', 'Llanto que no se calma con nada, vómitos repetidos o que no gane peso.'],
  },
  3: {
    kg: [5.8, 6.4], cm: [59.8, 61.4],
    hace: ['Sostiene mejor la cabeza cuando lo tienes en brazos.', 'Se lleva las manos a la boca y las mira.', 'Responde a tu sonrisa y "conversa" con sonidos.'],
    come: ['Leche a demanda: todavía no necesita otros alimentos.', 'El llanto de las primeras semanas suele ir mejorando.'],
    toca: [['Tiempo boca abajo', 'Varias veces al día, despierto y vigilado: fortalece cuello y espalda.']],
    consulta: ['Si no sonríe todavía a los 3 meses, coméntalo con su pediatra.', 'Fiebre de 38 °C o más a partir de los 3 meses: consulta ese mismo día.'],
  },
  4: {
    kg: [6.4, 7.0], cm: [62.1, 63.9],
    hace: ['Sostiene la cabeza con firmeza.', 'Se ríe a carcajadas.', 'Agarra los juguetes y se los lleva a la boca.'],
    come: ['Sigue con leche: la OMS recomienda lactancia materna exclusiva hasta los 6 meses.', 'El sueño puede cambiar y despertarse más: suele ser pasajero.'],
    toca: [['Vacunas de los 4 meses', 'Segunda visita de vacunas del calendario.']],
    consulta: ['Si no sostiene la cabeza a los 4 meses, coméntalo con su pediatra.', 'Fiebre de 38 °C o más: consulta con su pediatra ese mismo día.'],
  },
  5: {
    kg: [6.9, 7.5], cm: [64.0, 65.9],
    hace: ['Puede darse la vuelta, sobre todo de boca abajo a boca arriba.', 'Alarga los brazos para coger lo que le interesa.', 'Reconoce las caras conocidas y los tonos de voz.'],
    come: ['Todavía solo leche: la comida llega hacia los 6 meses.', 'Al darse la vuelta, no lo dejes solo en el cambiador ni en la cama.'],
    toca: [['Prepara la alimentación complementaria', 'Pregunta en la revisión cómo empezar a los 6 meses.']],
    consulta: ['Si no intenta coger objetos o no reacciona a los sonidos, coméntalo con su pediatra.', 'Fiebre de 38 °C o más: consulta con su pediatra ese mismo día.'],
  },
  6: {
    kg: [7.3, 7.9], cm: [65.7, 67.6],
    hace: ['Se sienta con apoyo.', 'Responde cuando le llamas por su nombre.', 'Puede salirle el primer diente (entre los 4 y los 15 meses es normal).'],
    come: ['Empieza a comer otros alimentos, sin dejar la leche, que sigue siendo lo principal.', 'Sin sal ni azúcar añadidos y nada de miel antes del año.'],
    toca: [['Revisión del niño sano', 'Hacia los 6 meses en muchas comunidades.'], ['Inicio de la alimentación complementaria', 'Ofrece un alimento nuevo cada pocos días y observa cómo le sienta.']],
    consulta: ['Si se atraganta y no puede toser, llorar ni respirar, llama al 112.', 'Si no intenta sentarse con apoyo, coméntalo con su pediatra.'],
  },
  7: {
    kg: [7.6, 8.3], cm: [67.3, 69.2],
    hace: ['Se sienta sin apoyo durante ratos cada vez más largos.', 'Pasa los objetos de una mano a la otra.', 'Balbucea sílabas como «ba-ba» o «ma-ma».'],
    come: ['Ve pasando de purés a texturas con grumos y trocitos blandos.', 'Come siempre sentado y vigilado.'],
    toca: [['Revisa la casa', 'Enchufes, escaleras y objetos pequeños: empieza a moverse cada vez más.']],
    consulta: ['Si no balbucea o no se sienta ni con apoyo, coméntalo con su pediatra.', 'Fiebre de 38 °C o más con mal estado general: consulta ese mismo día.'],
  },
  8: {
    kg: [7.9, 8.6], cm: [68.7, 70.6],
    hace: ['Puede empezar a reptar o a gatear: algunos bebés no gatean nunca y es normal.', 'Busca un objeto que has escondido delante de él.', 'Extraña a las personas que no conoce y puede llorar al separarse de ti.'],
    come: ['Puede comer alimentos blandos con la mano.', 'Sigue tomando leche a demanda.'],
    toca: [['Los dientes', 'Desde el primer diente, cepíllaselos dos veces al día con pasta con flúor.']],
    consulta: ['Si no busca objetos con la mirada ni reacciona a su nombre, coméntalo con su pediatra.', 'Si se atraganta y no puede toser, llorar ni respirar, llama al 112.'],
  },
  9: {
    kg: [8.2, 8.9], cm: [70.1, 72.0],
    hace: ['Se pone de pie agarrado a los muebles.', 'Empieza a coger cosas pequeñas con el índice y el pulgar.', 'Entiende el «no» y algunas palabras conocidas.'],
    come: ['Puede comer muchos alimentos de la mesa familiar, adaptados y sin sal.', 'Evita los frutos secos enteros y los alimentos duros y redondos.'],
    toca: [['Seguridad en casa', 'Guarda fuera de su alcance productos de limpieza, pilas de botón e imanes.']],
    consulta: ['Si no se sienta sin apoyo a los 9 meses, coméntalo con su pediatra.', 'Fiebre de 38 °C o más con mal estado general: consulta ese mismo día.'],
  },
  10: {
    kg: [8.5, 9.2], cm: [71.5, 73.3],
    hace: ['Gatea o se desplaza con soltura.', 'Dice «papá» o «mamá», todavía sin saber del todo lo que significan.', 'Dice adiós con la mano y aplaude.'],
    come: ['Come en familia y cada vez con más autonomía.', 'Sigue con la leche, materna o de fórmula, durante el primer año.'],
    toca: [['Juego y palabras', 'Leerle cuentos, cantar y nombrar las cosas le ayudan con el lenguaje.']],
    consulta: ['Si no balbucea, no señala ni hace gestos, coméntalo con su pediatra.', 'Si se atraganta y no puede toser, llorar ni respirar, llama al 112.'],
  },
  11: {
    kg: [8.7, 9.4], cm: [72.8, 74.5],
    hace: ['Da pasos agarrado a los muebles.', 'Imita gestos y sonidos.', 'Puede decir sus primeras palabras con sentido.'],
    come: ['Come casi de todo, en trocitos y sin sal ni azúcar añadidos.', 'Nada de miel hasta que cumpla el año.'],
    toca: [['Vacunas de los 11 meses', 'Tu centro de salud te dará la cita.']],
    consulta: ['Si no se pone de pie agarrado, coméntalo con su pediatra.', 'Fiebre de 38 °C o más con mal estado general: consulta ese mismo día.'],
  },
  12: {
    kg: [8.9, 9.6], cm: [74.0, 75.7],
    hace: ['Puede dar sus primeros pasos solo: entre los 9 y los 18 meses es normal.', 'Dice algunas palabras y señala lo que quiere.', 'Entiende órdenes sencillas, como «dame».'],
    come: ['Ya puede comer la comida de la familia, sin sal ni azúcar añadidos.', 'Ya puede tomar leche de vaca entera; la lactancia materna puede seguir todo lo que queráis.'],
    toca: [['Vacunas de los 12 meses', 'Entre ellas, la triple vírica. Revisa el calendario de tu comunidad.'], ['Revisión del niño sano', 'Hacia el año en muchas comunidades.']],
    consulta: ['Si no se pone de pie con apoyo, no señala o no dice ninguna palabra, coméntalo con su pediatra.', 'Si pierde habilidades que ya tenía, consulta pronto.'],
  },
};
