// Guías solo para la web (18 nov 2026): regla, anticoncepción y menopausia, a partir de lo que más se busca en los anuncios
// («dudas anticonceptivos», «dudas menopausia», retraso de la regla, pastilla del día después).
// Publicadas ANTES de la revisión clínica a petición de Noza; las revisa Gonzalo. Mientras tanto firman «Equipo de Hera».
// Mismo formato que guias-bebe.mjs: page = [pregunta, slug, título, profesional, grupo, resumen] · a = respuesta · x = ampliación · v = formato visual.

export const GINE_WEB = [
  {
    page: ['Se me ha retrasado la regla, ¿qué hago?', 'retraso-de-la-regla', 'Se me ha retrasado la regla: qué hacer y cuándo consultar', 'gineco', 'Regla', 'Cuándo hacer el test de embarazo, otras causas frecuentes y cuándo consultar.'],
    a: [
      'Si puedes estar embarazada, haz un test de embarazo desde el primer día de retraso. Es lo primero que hay que descartar. El de farmacia es fiable si sigues las instrucciones; con la primera orina de la mañana es aún más sensible.',
      'Un ciclo normal dura entre 21 y 35 días, y que alguna regla se adelante o se retrase unos días es frecuente. Si el test sale negativo, las causas más habituales son:',
      ['Estrés, viajes, cambios de horario o una temporada difícil.', 'Cambios de peso importantes, dietas o mucho ejercicio.', 'Empezar, dejar o cambiar un anticonceptivo hormonal, o haber tomado la pastilla del día después.', 'La lactancia.', 'Problemas hormonales, como el síndrome de ovario poliquístico o alteraciones de la tiroides.'],
      'Si el test sale negativo y la regla sigue sin venir, repítelo a la semana. Consulta si pasan 3 meses sin regla, si tus ciclos son muy irregulares desde hace tiempo o si además tienes otros síntomas, como acné o vello nuevos, o salida de leche por el pecho.',
    ],
    x: { updated: '2026-11-18', desc: 'Si puedes estar embarazada, haz un test desde el primer día de retraso. Si sale negativo, el estrés, el peso o los anticonceptivos son causas frecuentes. Cuándo repetirlo y cuándo consultar.', h: 'Más dudas frecuentes', qa: [
      ['¿Cuántos días de retraso son normales?', 'Que la regla se adelante o se retrase unos días de vez en cuando es frecuente. Hablamos de retraso cuando tu ciclo dura más de lo habitual para ti o más de 35 días.'],
      ['¿Puede dar negativo un test si estoy embarazada?', 'Sí, si se hace muy pronto. Si sale negativo y la regla no llega, repítelo a la semana, mejor con la primera orina de la mañana.'],
      ['¿La pastilla del día después retrasa la regla?', 'Puede adelantarla o retrasarla unos días. Si se retrasa más de una semana sobre la fecha esperada, haz un test de embarazo.'],
      ['¿El estrés puede quitar la regla?', 'Sí. El estrés intenso, dormir poco o los cambios bruscos de rutina pueden retrasarla o hacer que un mes no venga.'],
    ] },
    v: {
      tiles: [['21–35 días', 'Lo que dura un ciclo normal'], ['1.er día', 'De retraso: ya puedes hacer el test'], ['1 semana', 'Para repetirlo si sale negativo'], ['3 meses', 'Sin regla: consulta']],
      sem: { g: ['Es normal', 'Un retraso de unos días aislado, con test negativo y sin otros síntomas.'], a: ['Consulta', 'Test negativo y sigue sin venir, 3 meses sin regla, o ciclos muy irregulares desde hace tiempo.'], r: ['Urgencias', 'Test positivo con dolor fuerte en un lado del abdomen, sangrado abundante o mareo.'] },
      links: [['/guias/sangrado-entre-reglas/', 'Sangrado entre reglas'], ['/guias/pastilla-del-dia-despues/', 'Pastilla del día después']],
    },
  },
  {
    page: ['Tengo un sangrado entre reglas, ¿es normal?', 'sangrado-entre-reglas', 'Sangrado entre reglas: ¿es normal y cuándo consultar?', 'gineco', 'Regla', 'Las causas más frecuentes, cuándo no es nada y cuándo conviene consultar.'],
    a: [
      'Un manchado leve entre reglas es frecuente y muchas veces no es nada. Pero si se repite, hay que consultarlo.',
      'Las causas más habituales son:',
      ['La ovulación: algunas mujeres manchan un poco a mitad del ciclo.', 'Los anticonceptivos hormonales, sobre todo en los primeros 3 meses o si se olvida alguna pastilla.', 'Un embarazo al principio.', 'Pólipos o miomas en el útero, que suelen ser benignos.', 'Infecciones, como la clamidia, o lesiones en el cuello del útero.'],
      'Consulta con tu ginecólogo si se repite durante varios ciclos, si sangras después de las relaciones sexuales, si tienes dolor, fiebre o un flujo distinto, o si puedes estar embarazada. Ve a urgencias si el sangrado es abundante (empapas una compresa cada hora durante 2 horas seguidas) o te mareas.',
    ],
    x: { updated: '2026-11-18', desc: 'Un manchado leve entre reglas suele ser por la ovulación o los anticonceptivos. Si se repite, aparece tras las relaciones o hay dolor, consulta. Cuándo ir a urgencias.', h: 'Más dudas frecuentes', qa: [
      ['¿Es normal manchar con la pastilla anticonceptiva?', 'Sí, en los primeros 3 meses es frecuente y suele mejorar solo. Si sigue después, o aparece tras meses sin manchar, consúltalo.'],
      ['¿Y si sangro después de las relaciones?', 'Conviene consultarlo siempre, aunque sea poco: puede venir del cuello del útero y hay que revisarlo.'],
      ['¿Puede ser un embarazo?', 'Sí. Algunas mujeres manchan un poco al principio del embarazo. Si puede ser, haz un test.'],
    ] },
    v: {
      tiles: [['Leve y aislado', 'Suele no ser nada'], ['3 meses', 'De margen al empezar la pastilla'], ['Tras relaciones', 'Consulta siempre'], ['1 compresa/h', 'Durante 2 h: urgencias']],
      sem: { g: ['Es normal', 'Un manchado leve a mitad del ciclo, o en los primeros meses de un anticonceptivo.'], a: ['Consulta', 'Se repite varios ciclos, aparece tras las relaciones, o hay dolor, fiebre o flujo distinto.'], r: ['Urgencias', 'Sangrado abundante, mareo, o dolor fuerte con posible embarazo.'] },
      links: [['/guias/retraso-de-la-regla/', 'Retraso de la regla'], ['/guias/olvido-pastilla-anticonceptiva/', 'Olvidé la pastilla']],
    },
  },
  {
    page: ['¿Cómo funciona la pastilla del día después?', 'pastilla-del-dia-despues', 'Pastilla del día después: hasta cuándo se puede tomar y efectos', 'gineco', 'Regla', 'Hasta cuántas horas funciona, qué efectos puede dar y qué pasa con la regla.'],
    a: [
      'Cuanto antes la tomes, mejor funciona. Hay dos tipos, y en España las dos se compran en la farmacia sin receta:',
      ['Levonorgestrel: hasta 72 horas (3 días) después de la relación.', 'Ulipristal: hasta 120 horas (5 días) después.'],
      'Retrasa la ovulación: no es abortiva y no sirve si ya hay un embarazo. Tampoco protege de las infecciones de transmisión sexual. Si vomitas en las 3 horas siguientes a tomarla, hay que tomar otra.',
      'Puede dar náuseas, dolor de cabeza, tensión en el pecho o un pequeño manchado. La siguiente regla puede adelantarse o retrasarse unos días. Si se retrasa más de 7 días sobre la fecha esperada, haz un test de embarazo.',
      'Si tomas la pastilla anticonceptiva, sigue con ella al día siguiente y usa preservativo durante 7 días (si tomaste ulipristal, espera 5 días para retomarla y usa preservativo hasta que lleves 7 días tomándola). Si tienes sobrepeso, pregunta en la farmacia: el ulipristal puede funcionar mejor.',
    ],
    x: { updated: '2026-11-18', desc: 'La pastilla del día después funciona hasta 72 h (levonorgestrel) o 120 h (ulipristal), mejor cuanto antes. No es abortiva. Efectos, qué pasa con la regla y cuándo hacer un test.', h: 'Más dudas frecuentes', qa: [
      ['¿Necesito receta?', 'No. En España se compra en la farmacia sin receta.'],
      ['¿Cuántas veces se puede tomar?', 'No tiene un límite de veces, pero es un método de emergencia: si la necesitas a menudo, merece la pena buscar un anticonceptivo habitual que te vaya bien.'],
      ['¿Es normal sangrar después de tomarla?', 'Un pequeño manchado unos días después es frecuente. No es la regla: la regla llegará más o menos en su fecha.'],
      ['¿Y si la regla no llega?', 'Si se retrasa más de 7 días sobre la fecha esperada, haz un test de embarazo.'],
    ] },
    v: {
      tiles: [['72 h', 'Levonorgestrel'], ['120 h', 'Ulipristal'], ['Sin receta', 'En la farmacia'], ['+7 días', 'De retraso: haz un test']],
      sem: { g: ['Es normal', 'Náuseas, dolor de cabeza o un pequeño manchado; la regla unos días antes o después.'], a: ['Consulta', 'La regla se retrasa más de 7 días, o vomitaste en las 3 h siguientes.'], r: ['Urgencias', 'Dolor fuerte en un lado del abdomen, sobre todo con la regla retrasada.'] },
      links: [['/guias/retraso-de-la-regla/', 'Retraso de la regla'], ['/guias/olvido-pastilla-anticonceptiva/', 'Olvidé la pastilla']],
    },
  },
  {
    page: ['Olvidé tomar la pastilla anticonceptiva, ¿qué hago?', 'olvido-pastilla-anticonceptiva', 'Olvidé tomar la pastilla anticonceptiva: qué hacer', 'gineco', 'Regla', 'Qué hacer según las horas de retraso y cuándo usar preservativo.'],
    a: [
      'Tómala en cuanto te acuerdes, aunque eso suponga tomar dos el mismo día, y sigue con el resto a tu hora de siempre. Lo que cambia es cuánto te has retrasado. Cada marca lo explica en su prospecto; esta es la regla general:',
      ['Menos de 12 horas de retraso: sigues protegida. No hace falta nada más.', 'Más de 12 horas, o más de una pastilla olvidada: usa también preservativo durante los 7 días siguientes.', 'Si el olvido fue en la primera semana del envase y tuviste relaciones en los días anteriores, puedes necesitar la pastilla del día después: pregunta en la farmacia.', 'Si fue en la última semana, empieza el siguiente envase sin hacer el descanso.'],
      'Si tomas la minipíldora (solo progestágeno), el margen depende de cuál sea: con algunas es de 3 horas y con otras de 12. Míralo en el prospecto. Y si tienes dudas sobre tu caso, pregúntalo: es de las consultas más frecuentes.',
    ],
    x: { updated: '2026-11-18', desc: 'Si olvidaste la pastilla, tómala en cuanto te acuerdes. Con menos de 12 h de retraso sigues protegida; con más, usa preservativo 7 días. Cuándo hace falta la del día después.', h: 'Más dudas frecuentes', qa: [
      ['¿Y si vomito o tengo diarrea?', 'Si vomitas en las 3–4 horas después de tomarla, o tienes una diarrea fuerte, es como si la hubieras olvidado: sigue las mismas indicaciones.'],
      ['¿Puedo tomar dos pastillas a la vez?', 'Sí, si es para recuperar la olvidada. Es normal y no es peligroso.'],
      ['¿Me bajará la regla?', 'Puede que manches un poco. La regla suele llegar en la semana de descanso como siempre.'],
    ] },
    v: {
      tiles: [['< 12 h', 'Sigues protegida'], ['> 12 h', 'Preservativo 7 días'], ['1.ª semana', 'Valora la del día después'], ['Última semana', 'Sin descanso']],
      sem: { g: ['Es normal', 'Retraso de menos de 12 h: la tomas y sigues.'], a: ['Consulta', 'Más de 12 h, varias olvidadas, o relaciones en los días anteriores: pregunta en la farmacia o a tu ginecólogo.'] },
      links: [['/guias/pastilla-del-dia-despues/', 'Pastilla del día después'], ['/guias/sangrado-entre-reglas/', 'Sangrado entre reglas']],
    },
  },
  {
    page: ['¿Cuáles son los síntomas de la menopausia?', 'sintomas-menopausia', 'Síntomas de la menopausia: a qué edad empieza y qué ayuda', 'gineco', 'Menopausia', 'Los síntomas más frecuentes, a qué edad llega y qué se puede hacer.'],
    a: [
      'La menopausia es la última regla. Se confirma cuando llevas 12 meses seguidos sin regla, y en España llega de media hacia los 51 años (lo habitual es entre los 45 y los 55).',
      'Los síntomas suelen empezar unos años antes, en la perimenopausia:',
      ['Reglas irregulares: más cerca, más separadas, más o menos abundantes.', 'Sofocos y sudores por la noche.', 'Dormir peor, cansancio y cambios de humor.', 'Sequedad vaginal y molestias en las relaciones.', 'Dificultad para concentrarse o «niebla mental», y dolores en las articulaciones.'],
      'No todas las mujeres los tienen ni con la misma intensidad. Ayudan el ejercicio, dormir con la habitación fresca, limitar el alcohol y el tabaco, y para la sequedad, hidratantes y lubricantes vaginales. Si los síntomas te afectan en tu día a día, hay tratamientos, hormonales y no hormonales: habla con tu ginecólogo para ver cuál te conviene.',
      'Consulta también si la regla se retira antes de los 40 años, o si sangras después de llevar 12 meses sin regla.',
    ],
    x: { updated: '2026-11-18', desc: 'La menopausia llega de media hacia los 51 años y se confirma tras 12 meses sin regla. Sofocos, sueño, ánimo, sequedad y niebla mental: qué es normal, qué ayuda y cuándo consultar.', h: 'Más dudas frecuentes', qa: [
      ['¿Cuánto duran los sofocos?', 'Varía mucho: en muchas mujeres duran unos años, y en algunas bastante más. Si te afectan, hay tratamientos que funcionan.'],
      ['¿Puedo quedarme embarazada en la perimenopausia?', 'Sí, mientras tengas reglas, aunque sean irregulares. Se recomienda seguir con anticoncepción hasta 12 meses sin regla (2 años si es antes de los 50).'],
      ['¿La niebla mental es normal?', 'Sí, es frecuente notar más despistes o dificultad para concentrarse. Suele mejorar con el tiempo. Si es intensa o empeora, consúltalo.'],
      ['¿Es peligrosa la terapia hormonal?', 'Depende de cada mujer, de su edad y sus antecedentes. Para muchas, sus beneficios superan los riesgos. Es una decisión para valorar con tu ginecólogo.'],
    ] },
    v: {
      tiles: [['51 años', 'Edad media en España'], ['45–55', 'Lo habitual'], ['12 meses', 'Sin regla: menopausia'], ['Antes de 40', 'Consulta']],
      sem: { g: ['Es normal', 'Reglas irregulares, sofocos, dormir peor o cambios de humor a partir de los 45.'], a: ['Consulta', 'Los síntomas te afectan en el día a día, o la regla se retira antes de los 40.'], r: ['Pide cita pronto', 'Cualquier sangrado después de 12 meses sin regla.'] },
      links: [['/guias/sangrado-despues-de-la-menopausia/', 'Sangrado después de la menopausia']],
    },
  },
  {
    page: ['He sangrado después de la menopausia, ¿es grave?', 'sangrado-despues-de-la-menopausia', 'Sangrado después de la menopausia: por qué hay que consultarlo', 'gineco', 'Menopausia', 'Por qué cualquier sangrado tras la menopausia se consulta y qué causas suele tener.'],
    a: [
      'Cualquier sangrado después de llevar 12 meses sin regla hay que consultarlo, aunque sea poco o una sola vez. Pide cita con tu ginecólogo en las próximas semanas; no hace falta ir a urgencias salvo que sea abundante.',
      'La mayoría de las veces la causa es benigna:',
      ['La sequedad y el adelgazamiento de la mucosa de la vagina o del útero (atrofia).', 'Pólipos en el útero o en el cuello del útero.', 'La terapia hormonal, sobre todo en los primeros meses.'],
      'Aun así hay que revisarlo, porque en una parte de los casos puede deberse a un engrosamiento del endometrio o a un cáncer de endometrio, y cuanto antes se mira, mejor. Lo habitual es una ecografía vaginal y, si hace falta, una biopsia sencilla en la consulta.',
    ],
    x: { updated: '2026-11-18', desc: 'Cualquier sangrado después de 12 meses sin regla se consulta, aunque sea poco. Suele ser benigno (atrofia, pólipos), pero hay que descartar problemas del endometrio. Qué pruebas se hacen.', h: 'Más dudas frecuentes', qa: [
      ['¿Y si solo ha sido un manchado?', 'También hay que consultarlo. Lo importante no es la cantidad, sino que ocurra después de la menopausia.'],
      ['¿Es normal sangrar con la terapia hormonal?', 'En los primeros meses puede pasar. Si sigue, aparece más tarde o cambia, coméntalo con tu ginecólogo.'],
      ['¿Qué pruebas me harán?', 'Lo habitual es una ecografía vaginal para medir el endometrio. Según el resultado, puede hacer falta una biopsia, que suele hacerse en la propia consulta.'],
    ] },
    v: {
      tiles: [['Siempre', 'Se consulta'], ['Semanas', 'Pide cita pronto'], ['Casi siempre', 'Causa benigna'], ['Ecografía', 'La primera prueba']],
      sem: { a: ['Pide cita pronto', 'Cualquier sangrado o manchado después de 12 meses sin regla.'], r: ['Urgencias', 'Sangrado abundante o mareo.'] },
      links: [['/guias/sintomas-menopausia/', 'Síntomas de la menopausia']],
    },
  },
];
