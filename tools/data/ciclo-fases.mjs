// Fases del ciclo menstrual para las páginas /ciclo/. BORRADOR pendiente de revisión clínica (ginecología).
// Días orientativos para un ciclo de 28 días: cada ciclo es distinto y lo que más varía es la fase folicular.

export const PHASE_PAGES = [
  {
    slug: 'fase-menstrual', name: 'Fase menstrual', title: 'Fase menstrual: qué pasa en tu cuerpo durante la regla',
    tint: '#F4E6E8', days: 'Días 1 a 5', hormone: 'Estrógenos y progesterona bajos', length: 'De 2 a 7 días',
    lead: 'El primer día de regla es el día 1 del ciclo. Como no ha habido embarazo, bajan los niveles de hormonas y el útero desprende la capa que había preparado.',
    cuerpo: ['La capa interna del útero (endometrio) se desprende y sale como sangrado.', 'Unas sustancias llamadas prostaglandinas hacen que el útero se contraiga: de ahí los dolores tipo cólico.', 'A la vez, en el ovario empiezan a madurar los folículos del ciclo siguiente.'],
    notas: ['Sangrado de 2 a 7 días, más abundante los primeros.', 'Dolor en la parte baja de la tripa o en la zona lumbar.', 'Cansancio, hinchazón o cambios en el tránsito intestinal.'],
    ayuda: ['Calor local (una bolsa de agua caliente) y movimiento suave.', 'Un antiinflamatorio como el ibuprofeno, si puedes tomarlo, alivia el dolor, mejor al principio.', 'Alimentos ricos en hierro si tus reglas son abundantes: legumbres, carne, pescado, frutos secos.'],
    faqs: [
      ['¿Cuánto sangrado es normal?', 'Lo normal es perder menos de 80 ml en toda la regla, aunque es difícil medirlo. Si empapas una compresa o un tampón cada hora durante varias horas, si tienes coágulos grandes o si la regla dura más de 7 días, coméntalo con tu ginecólogo.'],
      ['¿Es normal que duela tanto?', 'Algo de dolor es frecuente, pero no debería impedirte hacer tu vida. Si el dolor no cede con analgésicos o va a más con los años, consulta: puede haber una causa como la endometriosis.'],
    ],
    consulta: ['La regla dura más de 7 días o es tan abundante que te mancha la ropa o te deja agotada.', 'El dolor no mejora con analgésicos o te obliga a faltar a clase o al trabajo.', 'Tienes sangrados entre reglas o después de las relaciones.'],
  },
  {
    slug: 'fase-folicular', name: 'Fase folicular', title: 'Fase folicular: qué es, cuánto dura y qué notas',
    tint: '#DCEBE4', days: 'Días 1 a 13', hormone: 'Estrógenos en aumento', length: 'La que más varía',
    lead: 'Va desde el primer día de la regla hasta la ovulación. En ella madura el óvulo del ciclo y el útero vuelve a prepararse.',
    cuerpo: ['La hormona FSH estimula varios folículos del ovario; normalmente uno se convierte en el dominante.', 'Ese folículo produce estrógenos, que hacen crecer de nuevo la capa interna del útero.', 'Hacia el final, el flujo vaginal se vuelve más abundante, claro y resbaladizo.'],
    notas: ['Al terminar la regla, muchas mujeres se sienten con más energía.', 'El flujo pasa de escaso o pegajoso a más húmedo y cremoso.', 'Pocos síntomas: suele ser la fase más tranquila del ciclo.'],
    ayuda: ['Es buen momento para fijarte en tu flujo: te ayuda a reconocer cuándo se acerca la ovulación.', 'Si llevas el registro del ciclo, apunta el primer día de cada regla.', 'Su duración cambia de un ciclo a otro: por eso la regla no siempre llega el mismo día.'],
    faqs: [
      ['¿Por qué mis ciclos no duran siempre lo mismo?', 'Sobre todo porque la fase folicular puede alargarse o acortarse: el estrés, los viajes, el ejercicio intenso o una enfermedad pueden retrasar la ovulación. Se considera normal un ciclo de entre 21 y 35 días.'],
      ['¿Puedo quedarme embarazada justo después de la regla?', 'Es poco probable, pero posible si ovulas pronto, por ejemplo en ciclos cortos: los espermatozoides pueden vivir hasta 5 días.'],
    ],
    consulta: ['Tus ciclos duran menos de 21 días o más de 35 de forma habitual.', 'Llevas 3 meses sin regla y no estás embarazada.', 'Tienes flujo con mal olor, picor o un color distinto del habitual.'],
  },
  {
    slug: 'ovulacion', name: 'Ovulación', title: 'Ovulación y días fértiles: cómo saber cuándo ovulas',
    tint: '#ECE6F0', days: 'Hacia el día 14', hormone: 'Pico de LH', length: '12 a 24 horas',
    lead: 'Es el momento en que el ovario libera el óvulo. Ocurre unos 14 días antes de la siguiente regla, que no siempre es el día 14 del ciclo.',
    cuerpo: ['Una subida brusca de la hormona LH provoca la ovulación entre 24 y 36 horas después.', 'El óvulo puede ser fecundado durante unas 12 a 24 horas.', 'Como los espermatozoides viven hasta 5 días, los días fértiles son unos 6: los 5 anteriores a la ovulación y el propio día.'],
    notas: ['Flujo transparente y elástico, como la clara de huevo.', 'A veces, un dolor leve en un lado de la tripa durante unas horas.', 'Más deseo sexual en algunas mujeres.'],
    ayuda: ['Los test de ovulación de farmacia detectan el pico de LH y ayudan a saber cuándo vas a ovular.', 'La temperatura basal sube unas décimas después de ovular: confirma que ya ha pasado, no avisa antes.', 'Si buscas embarazo, mantener relaciones cada 1 o 2 días en la ventana fértil es suficiente.'],
    faqs: [
      ['¿Siempre ovulo el día 14?', 'No. Con un ciclo de 28 días suele ser hacia el día 14, pero con ciclos más largos o más cortos cambia. Lo más fiable es contar unos 14 días hacia atrás desde la regla siguiente.'],
      ['¿Sirve la app para evitar un embarazo?', 'No. El cálculo de días fértiles es orientativo y no es un método anticonceptivo. Si no buscas embarazo, usa un método eficaz.'],
    ],
    consulta: ['Llevas un año buscando embarazo sin conseguirlo (6 meses si tienes 35 años o más).', 'El dolor de ovulación es intenso o dura más de un día.', 'Tus ciclos son muy irregulares y quieres saber si ovulas.'],
  },
  {
    slug: 'fase-lutea', name: 'Fase lútea', title: 'Fase lútea: qué es, cuánto dura y síntomas premenstruales',
    tint: '#F3E9DC', days: 'Días 15 a 28', hormone: 'Progesterona alta', length: 'Unos 12 a 14 días',
    lead: 'Va desde la ovulación hasta la siguiente regla. El folículo que liberó el óvulo produce progesterona para preparar el útero por si hay embarazo.',
    cuerpo: ['El folículo vacío se transforma en el cuerpo lúteo y fabrica progesterona.', 'La progesterona sube unas décimas la temperatura y espesa el flujo.', 'Si no hay embarazo, el cuerpo lúteo deja de funcionar, bajan las hormonas y llega la regla.'],
    notas: ['Hinchazón, pechos sensibles o más hambre en los días previos a la regla.', 'Cambios de humor, irritabilidad o cansancio.', 'Granitos o retención de líquidos.'],
    ayuda: ['Dormir bien, moverte y reducir la sal y la cafeína ayuda a muchas mujeres.', 'Apuntar tus síntomas te permite ver si se repiten cada ciclo.', 'Su duración es bastante estable: si la regla se retrasa, puede que la ovulación llegara más tarde.'],
    faqs: [
      ['¿Qué es el síndrome premenstrual?', 'Es el conjunto de síntomas físicos y emocionales de los días antes de la regla, que desaparecen al empezar a sangrar. Es muy frecuente. Si te afecta mucho en tu vida o en tu ánimo, consulta: tiene tratamiento.'],
      ['¿Cuándo hacerme un test de embarazo?', 'Desde el primer día de retraso de la regla. Antes puede dar un falso negativo.'],
    ],
    consulta: ['Los síntomas antes de la regla te afectan mucho en tu vida, tu ánimo o tus relaciones.', 'Tienes un retraso de la regla y el test es positivo: pide cita con tu matrona o tu médico.', 'Sangras de forma irregular antes de la regla con frecuencia.'],
  },
];

export const CYCLE_INTRO = {
  lead: 'El ciclo menstrual va desde el primer día de una regla hasta el día antes de la siguiente. Se considera normal que dure entre 21 y 35 días, y no tiene por qué durar siempre lo mismo.',
  points: ['Tiene dos mitades: la fase folicular, hasta la ovulación, y la fase lútea, después.', 'La regla es el comienzo de la fase folicular.', 'La ovulación suele llegar unos 14 días antes de la regla siguiente.'],
};
