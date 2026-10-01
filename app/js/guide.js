// guide.js
// Guía de dudas del embarazo y el posparto.
// Embarazo: transcrito de "Dudas frecuentes en el embarazo, semana a semana" (equipo de Vera).
// Las respuestas marcadas con `draft: true` las ha redactado el equipo técnico y están pendientes
// de revisión clínica.
// Cada respuesta es una lista de bloques: un texto es un párrafo; un array es una lista.

export const GUIDE_INTRO = 'Estas son las preguntas más habituales, ordenadas por el momento en que suelen aparecer. Las respuestas siguen el circuito de la sanidad pública en España; los calendarios exactos pueden variar según tu comunidad autónoma y tu hospital. Esta guía informa, pero no sustituye a tu matrona ni a tu ginecólogo.';

export const PREGNANCY_GUIDE = [
  {
    id: 's4', from: 4, to: 10, title: 'Semanas 4 a 10', subtitle: 'Acabas de saber que estás embarazada',
    items: [
      { q: '¿Cuándo pido la primera cita y con quién?', a: ['En cuanto tengas el test positivo, pide cita en tu centro de salud con la matrona o con tu médico de familia. Te abrirán la cartilla del embarazo, te pedirán la primera analítica y te derivarán para la primera ecografía. Lo ideal es que esta primera visita sea antes de la semana 10.'] },
      { q: '¿Cómo se cuentan las semanas?', a: ['Se cuentan desde el primer día de tu última regla, no desde la concepción. Por eso, cuando te das cuenta de la falta, ya estás de unas 4 o 5 semanas. La fecha probable de parto es la semana 40, pero lo normal es dar a luz entre la 37 y la 42.'] },
      { q: '¿Tengo que tomar ácido fólico? ¿Y yodo o hierro?', a: ['Sí al ácido fólico: reduce el riesgo de defectos en la columna del bebé. Lo ideal es empezarlo antes de quedarte embarazada y mantenerlo al menos hasta la semana 12. El yodo también se suele recomendar durante todo el embarazo y la lactancia, además de usar sal yodada. El hierro solo hace falta si la analítica muestra anemia o reservas bajas.'] },
      { q: '¿Es verdad que hay que comer por dos?', a: ['No. En el primer trimestre no necesitas comer más. A partir del segundo, basta con un poco más al día, el equivalente a un tentempié sano. Importa más la calidad: fruta, verdura, legumbres, cereales integrales, lácteos, huevo y pescado.'] },
      { q: '¿Qué alimentos debo evitar?', a: ['Los que pueden transmitir infecciones como la listeria o la toxoplasmosis:', [
        'Carne cruda o poco hecha (carpaccio, steak tartar, carne rosada por dentro).',
        'Quesos de leche cruda y leche sin pasteurizar. Los quesos pasteurizados, curados o frescos, sí puedes tomarlos.',
        'Pescado crudo o ahumado refrigerado (sushi, ceviche, salmón ahumado), salvo que esté cocinado.',
        'Patés refrigerados y brotes crudos (soja, alfalfa).',
        'Huevo crudo o poco hecho (mayonesa casera, tiramisú).',
        'Alcohol: ninguna cantidad es segura durante el embarazo.']] },
      { q: '¿Puedo comer jamón y embutidos?', toxo: true, a: ['Depende de si eres inmune a la toxoplasmosis, algo que te dirá la primera analítica. Si no lo eres, se recomienda evitar los embutidos crudos curados (jamón, chorizo, salchichón, lomo) o tomarlos solo si se han congelado antes. Si ya eres inmune, no hay problema. Los embutidos cocidos, como el jamón de york o la pechuga de pavo, se pueden tomar.'] },
      { q: 'Si no soy inmune a la toxoplasmosis, ¿qué más tengo que hacer?', toxo: true, a: ['Lava muy bien frutas, verduras y hierbas frescas, aunque vengan envasadas. Lávate las manos después de tocar carne cruda o tierra, y usa guantes en el jardín. Puedes tener gato: simplemente que otra persona limpie su arenero cada día, o usa guantes si lo haces tú.'] },
      { q: '¿Cuánto café puedo tomar?', a: ['Hasta unos 200 mg de cafeína al día, que equivale a uno o dos cafés. Recuerda que el té, los refrescos de cola, las bebidas energéticas y el chocolate también llevan cafeína.'] },
      { q: '¿Qué medicamentos puedo tomar?', a: ['Para el dolor o la fiebre, el paracetamol es la opción de elección. Evita el ibuprofeno y otros antiinflamatorios salvo que te los indique tu médico, y no los tomes nunca a partir de la semana 20. Antes de tomar cualquier otro medicamento, suplemento o planta medicinal, consulta.'] },
      { q: 'Tomo medicación habitual, ¿la dejo?', a: ['No la dejes por tu cuenta: para algunas enfermedades es más peligroso suspenderla que seguir. Coméntalo cuanto antes con quien te la receta, que valorará si hay que ajustarla o cambiarla.'] },
      { q: '¿Son normales las náuseas? ¿Hasta cuándo duran?', a: ['Sí, son muy frecuentes y suelen mejorar hacia la semana 12 a 16. Ayuda comer poco y a menudo, evitar el estómago vacío, tomar algo seco al levantarte y evitar olores fuertes. Si vomitas todo lo que comes o bebes, o pierdes peso, consulta: existe tratamiento.'] },
      { q: '¿Es normal manchar un poco al principio?', a: ['Un manchado leve puede ser normal en las primeras semanas. Aun así, coméntalo siempre. Ve a urgencias si el sangrado es como una regla o mayor, o si se acompaña de dolor intenso en la tripa, sobre todo en un lado.'] },
    ],
  },
  {
    id: 's11', from: 11, to: 14, title: 'Semanas 11 a 14', subtitle: 'Primera ecografía y cribado',
    items: [
      { q: '¿Cuántas ecografías me harán?', a: ['En un embarazo sin complicaciones, la sanidad pública hace tres: una entre las semanas 11 y 14, la morfológica hacia la semana 20 y otra en el tercer trimestre, hacia la 32 a 36. Si hace falta vigilar algo, te harán más.'] },
      { q: '¿Qué se ve en la primera ecografía?', a: ['Se confirma que el embarazo está bien situado, cuántos bebés hay y que el corazón late. También se ajusta la fecha probable de parto según el tamaño del bebé y se mide el pliegue de la nuca, que forma parte del cribado.'] },
      { q: '¿Qué es el cribado combinado del primer trimestre?', a: ['Es una prueba que calcula la probabilidad de que el bebé tenga algunas alteraciones cromosómicas, como el síndrome de Down. Combina tu edad, un análisis de sangre y la medida de la nuca en la ecografía. No da un diagnóstico: solo dice si la probabilidad es baja o alta.'] },
      { q: '¿Y si sale de riesgo alto?', a: ['No significa que el bebé tenga un problema; la mayoría de los bebés con resultado de riesgo alto están sanos. Te explicarán las opciones: un test de ADN fetal en sangre o una prueba diagnóstica (biopsia de corion o amniocentesis). Tú decides qué hacer con toda la información.'] },
      { q: '¿Merece la pena hacerme el test de ADN fetal?', a: ['Es un análisis de tu sangre muy fiable para detectar las alteraciones cromosómicas más frecuentes, aunque tampoco es diagnóstico. En la sanidad pública se ofrece sobre todo cuando el cribado sale de riesgo alto o intermedio. Si quieres hacértelo sin esa indicación, suele ser por la privada.'] },
      { q: '¿Qué me miran en la analítica del primer trimestre?', a: ['Tu grupo sanguíneo y Rh, si tienes anemia, la glucosa, un análisis de orina y tu inmunidad frente a infecciones que pueden afectar al bebé: rubéola, toxoplasmosis, sífilis, hepatitis B, VIH y, en algunos centros, otras. Según los resultados te darán recomendaciones concretas.'] },
    ],
  },
  {
    id: 's15', from: 15, to: 23, title: 'Semanas 15 a 23', subtitle: 'Ecografía morfológica y primeros movimientos',
    items: [
      { q: '¿Qué es la ecografía de la semana 20?', a: ['Es la ecografía morfológica, la más detallada del embarazo. Se revisan uno por uno los órganos del bebé, la placenta y el líquido amniótico. Suele durar más que las otras y, si el bebé está en mala postura, a veces hay que repetirla otro día.'] },
      { q: '¿Cuándo voy a notar al bebé moverse?', a: ['En el primer embarazo, normalmente entre las semanas 18 y 22; si ya has tenido hijos, puede ser antes. Al principio se nota como burbujas o cosquillas. A partir de la semana 24 o 26 los movimientos se vuelven más claros y regulares.'] },
      { q: '¿Cuánto peso es normal ganar?', a: ['Depende de tu peso de partida. Si empiezas con un peso normal, lo habitual es ganar entre 11 y 16 kilos en todo el embarazo. Si partes con sobrepeso, algo menos; si partes con bajo peso, algo más. Tu matrona te irá pesando en cada visita.'] },
      { q: '¿Puedo hacer ejercicio?', a: ['Sí, y es muy recomendable. Lo ideal es unos 150 minutos a la semana de actividad moderada: caminar, nadar, bici estática, yoga o pilates para embarazadas. Evita deportes de contacto, con riesgo de caída o de golpes en la tripa, y el buceo con botella. Si ya hacías deporte, probablemente puedas seguir adaptándolo.'] },
      { q: '¿Puedo tener relaciones sexuales?', a: ['Sí, en un embarazo normal no hay ningún problema y no le hacen daño al bebé. Te dirán que las evites si tienes sangrados, placenta previa, riesgo de parto prematuro o has roto la bolsa.'] },
      { q: '¿Puedo viajar en avión?', a: ['Sí. El segundo trimestre es el momento más cómodo. En un embarazo de un solo bebé se puede volar hasta la semana 36, aunque muchas aerolíneas piden un informe médico a partir de la 28. En vuelos largos, levántate a caminar, bebe agua y valora usar medias de compresión. Antes de viajar, comprueba que tu destino no tenga riesgo de infecciones como el zika.'] },
      { q: '¿Puedo ir a la sauna, al spa o a la piscina?', a: ['A la piscina, sí. Evita la sauna, los baños turcos y los jacuzzis muy calientes, sobre todo en el primer trimestre, porque subir mucho la temperatura del cuerpo no es bueno para el bebé.'] },
      { q: '¿Puedo ir al dentista o hacerme una radiografía?', a: ['Sí. Ir al dentista es recomendable, porque las encías se inflaman y sangran más en el embarazo. La anestesia local dental es segura, y una radiografía dental con protección también. Avisa siempre de que estás embarazada.'] },
      { q: '¿Puedo teñirme el pelo o usar mis cosméticos?', a: ['Los tintes parecen seguros; si quieres ser prudente, espera al segundo trimestre y ventila bien. En cosmética, evita los retinoides (retinol, tretinoína), que están desaconsejados. Protector solar y cremas hidratantes, sin problema.'] },
      { q: '¿Hay alguna postura mejor para dormir?', a: ['A partir del segundo trimestre es mejor dormir de lado, preferiblemente sobre el izquierdo. Boca arriba, el peso del útero puede comprimir vasos sanguíneos y hacer que te marees. Si te despiertas boca arriba, no pasa nada: simplemente vuelve a ponerte de lado. Un cojín entre las piernas ayuda.'] },
    ],
  },
  {
    id: 's24', from: 24, to: 28, title: 'Semanas 24 a 28', subtitle: 'Control del azúcar y vacunas',
    items: [
      { q: '¿Qué es el test de O\'Sullivan?', a: ['Es una prueba para detectar la diabetes del embarazo. Se hace entre las semanas 24 y 28: te sacan sangre una hora después de tomar una bebida con azúcar. No hace falta ir en ayunas. Si tienes factores de riesgo, como sobrepeso o diabetes en la familia, puede que te la hagan también en el primer trimestre.'] },
      { q: '¿Y si el O\'Sullivan sale alterado?', a: ['No quiere decir que tengas diabetes. Solo indica que hay que hacer una prueba más larga (la sobrecarga oral de glucosa), que sí confirma o descarta el diagnóstico. La mayoría de las mujeres con un O\'Sullivan alterado no tienen diabetes.'] },
      { q: 'Soy Rh negativo, ¿qué significa?', rh: true, a: ['Si tú eres Rh negativo y el bebé es Rh positivo, tu cuerpo podría fabricar defensas contra su sangre, lo que afectaría a futuros embarazos. Para evitarlo te pondrán una inyección de inmunoglobulina anti-D hacia la semana 28 y otra tras el parto si el bebé es Rh positivo. También si tienes un sangrado, un golpe en la tripa o una amniocentesis.'] },
      { q: '¿Qué vacunas me tengo que poner?', a: ['Tres, todas seguras en el embarazo:', [
        'Tosferina (dTpa): en cada embarazo, preferiblemente entre las semanas 27 y 28. Tus defensas pasan al bebé y lo protegen en sus primeros meses, cuando aún no puede vacunarse.',
        'Gripe: si estás embarazada durante la campaña de otoño e invierno, en cualquier trimestre. Te protege a ti y al bebé.',
        'COVID-19: también se recomienda durante la campaña, en cualquier trimestre.']] },
      { q: '¿Por qué la tosferina en cada embarazo, si ya me vacuné?', a: ['Porque las defensas bajan con el tiempo y lo que se busca es que tengas muchas justo antes del parto para pasárselas al bebé. Por eso se repite en cada embarazo, aunque sean seguidos.'] },
      { q: '¿Y la del virus respiratorio sincitial (VRS), la de la bronquiolitis?', a: ['Existe una vacuna para embarazadas, pero en España la estrategia principal es proteger directamente al bebé con un anticuerpo (nirsevimab) que se le pone al nacer o al empezar la temporada de invierno. Pregunta a tu matrona cómo lo organiza tu comunidad.'] },
      { q: '¿Hay vacunas que no me puedo poner?', a: ['Sí, las de virus vivos, como la triple vírica (sarampión, rubéola, paperas) y la de la varicela. Si no estás protegida, te las pondrán después del parto, y se pueden poner durante la lactancia.'] },
      { q: '¿Tiene que vacunarse también mi pareja o la familia?', a: ['Es muy recomendable que las personas que van a convivir con el bebé estén al día de sus vacunas, sobre todo la de la gripe y la tosferina. Así forman un escudo alrededor del recién nacido.'] },
    ],
  },
  {
    id: 's29', from: 29, to: 36, title: 'Semanas 29 a 36', subtitle: 'Tercer trimestre y preparación',
    items: [
      { q: '¿Qué se mira en la ecografía del tercer trimestre?', a: ['Se hace entre las semanas 32 y 36. Sirve sobre todo para ver cómo está creciendo el bebé, en qué postura está (de cabeza o de nalgas), dónde está la placenta y cuánto líquido hay. El peso que se calcula es aproximado, con un margen de error de un 10 a 15 %.'] },
      { q: '¿Cuándo empiezan las clases de preparación al parto?', a: ['La matrona de tu centro de salud suele organizarlas a partir de la semana 28 a 30. Son gratuitas y muy recomendables: se habla del parto, la respiración, la lactancia y los primeros cuidados del bebé. Tu pareja o acompañante puede ir contigo.'] },
      { q: '¿Qué es un plan de parto?', a: ['Es un documento donde explicas tus preferencias para el parto: acompañante, anestesia, postura, piel con piel, lactancia, etc. Muchos hospitales tienen su propio modelo. Entrégalo hacia la semana 32 a 36 y repásalo con tu matrona. Ten en cuenta que, si surge algo durante el parto, el equipo puede tener que cambiar el plan por tu seguridad o la del bebé.'] },
      { q: '¿Para qué es el exudado vaginal y rectal?', a: ['Entre las semanas 35 y 37 se toma una muestra con un bastoncillo para saber si tienes una bacteria llamada estreptococo del grupo B. Es muy habitual y a ti no te causa problemas, pero podría afectar al bebé al nacer. Si sale positivo, te pondrán antibiótico durante el parto y queda resuelto.'] },
      { q: '¿Qué hago con el ardor, el estreñimiento y las hemorroides?', a: ['Para el ardor: comidas pequeñas, no tumbarte justo después de comer y elevar un poco la cabecera de la cama; si no basta, hay antiácidos seguros. Para el estreñimiento: fibra, agua y moverte a diario. Si aparecen hemorroides, evitar el estreñimiento es lo principal; tu médico puede recetarte una pomada.'] },
      { q: '¿Por qué tengo calambres, piernas hinchadas o dolor de espalda?', a: ['Son molestias muy frecuentes por el peso, las hormonas y la circulación. Ayuda caminar, estirar, elevar las piernas al descansar, usar medias de compresión y evitar estar mucho tiempo de pie. Consulta si la hinchazón aparece de golpe, afecta a la cara o las manos, o una pierna está más hinchada, roja y dolorosa que la otra.'] },
      { q: '¿Qué son las contracciones de Braxton Hicks?', a: ['Son contracciones de "ensayo": la tripa se pone dura unos segundos, sin dolor o con una molestia leve, y son irregulares. Son normales y no significan que empiece el parto. Si se vuelven regulares, dolorosas o muy frecuentes antes de la semana 37, consulta.'] },
      { q: '¿Cómo sé si el bebé se mueve lo suficiente?', a: ['No hay un número exacto: lo importante es que conozcas su patrón habitual. Si notas que se mueve menos de lo normal, túmbate de lado un rato y concéntrate en sus movimientos. Si sigues notándolo menos, ve a urgencias ese mismo día: no esperes al día siguiente.'] },
      { q: '¿Tengo derecho a baja durante el embarazo?', a: ['Si tu trabajo tiene riesgos para el embarazo (esfuerzo físico, turnos nocturnos, productos tóxicos, radiaciones…) y la empresa no puede adaptarte el puesto, puedes pedir la prestación por riesgo durante el embarazo. Si tienes una complicación médica, tu médico puede darte una baja por incapacidad temporal. El embarazo en sí no es motivo de baja.'] },
      { q: '¿Tengo permiso para ir a las revisiones y a las clases?', a: ['Sí. La ley te reconoce permiso retribuido para exámenes prenatales y preparación al parto que coincidan con tu horario de trabajo. Avisa a tu empresa con antelación y lleva justificante.'] },
      { q: '¿Cuánto dura el permiso por nacimiento?', a: ['Desde 2025 son 19 semanas para cada progenitor, pagadas al 100 % por la Seguridad Social. Las 6 primeras tras el parto son obligatorias; 17 semanas se disfrutan hasta que el bebé cumple un año y las otras 2 hasta que cumple 8. En familias monoparentales son 32 semanas. La madre puede empezar el permiso hasta 4 semanas antes de la fecha probable de parto.'] },
    ],
  },
  {
    id: 's37', from: 37, to: 42, title: 'Semanas 37 a 42', subtitle: 'La recta final y el parto',
    items: [
      { q: '¿Cuándo se considera que el embarazo está "a término"?', a: ['Desde la semana 37 hasta la 41 y 6 días. Dar a luz en cualquier momento de ese periodo es normal; solo una minoría de bebés nace justo el día de la fecha probable de parto.'] },
      { q: '¿Qué pasa si me paso de fecha?', a: ['A partir de la semana 40 te harán controles más frecuentes. Si el parto no empieza solo, lo habitual es proponerte provocarlo (inducirlo) durante la semana 41, para no llegar a la 42, cuando aumentan los riesgos para el bebé.'] },
      { q: '¿Qué es la monitorización?', a: ['Es un registro del latido del bebé y de las contracciones, con dos sensores sujetos a la tripa durante unos 20 a 30 minutos. Según el hospital, se empieza a hacer hacia la semana 40 o antes si hay algún motivo.'] },
      { q: '¿Cuándo tengo que ir al hospital?', a: [[
        'Si las contracciones son regulares y dolorosas, cada 5 minutos durante al menos 1 hora (si ya has tenido partos, algo antes).',
        'Si rompes la bolsa, aunque no tengas contracciones.',
        'Si sangras como una regla o más.',
        'Si notas que el bebé se mueve menos.'], 'Si vives lejos del hospital o tu matrona te ha indicado otra cosa, sigue sus instrucciones.'] },
      { q: '¿Cómo sé si he roto aguas?', a: ['Notarás salir líquido por la vagina que no puedes controlar: puede ser un chorro o un goteo continuo que moja la ropa. Suele ser transparente y huele poco. Si es verde, marrón o con sangre, ve al hospital sin esperar. Si tienes dudas, ponte una compresa, obsérvala un rato y consulta.'] },
      { q: '¿Qué llevo en la bolsa del hospital?', a: ['Tu DNI, tarjeta sanitaria, cartilla del embarazo e informes, el plan de parto, ropa cómoda y camisón que se abra por delante, sujetadores de lactancia, bragas cómodas o desechables, compresas de posparto, neceser y cargador. Para el bebé: bodies, pijamas, gorro, calcetines, pañales de recién nacido y la ropa para salir. Y la sillita del coche instalada para volver a casa.'] },
      { q: '¿Cuándo puedo pedir la epidural?', a: ['Cuando estés en fase activa del parto y la necesites; no hay que esperar a una dilatación concreta. Antes, el anestesista revisará que tu analítica y tu coagulación están bien. También hay otras opciones para el dolor: moverte, la pelota, el agua caliente o el óxido nitroso, según el hospital.'] },
      { q: '¿Qué es el piel con piel?', a: ['Es poner al bebé desnudo sobre tu pecho nada más nacer, tapados los dos. Le ayuda a regular su temperatura, se calma antes y facilita que empiece a mamar. Si el parto es por cesárea, muchos hospitales también lo hacen, o lo hace tu acompañante mientras terminan.'] },
      { q: '¿Qué es el pinzamiento tardío del cordón?', a: ['Es esperar un par de minutos antes de cortar el cordón, en lugar de hacerlo inmediatamente. Así pasa más sangre de la placenta al bebé, lo que mejora sus reservas de hierro. Hoy es lo habitual si el bebé nace bien.'] },
    ],
  },
  {
    id: 'emo', from: 0, to: 42, title: 'En cualquier semana', subtitle: 'Cómo te sientes',
    items: [
      { q: '¿Es normal sentirme triste o ansiosa en el embarazo?', a: ['Los cambios de humor son frecuentes, pero la tristeza o la ansiedad que duran semanas, te quitan el sueño o las ganas de todo no son "lo normal del embarazo". Coméntalo con tu matrona o tu médico: tiene tratamiento y pedir ayuda es lo mejor para ti y para el bebé.'] },
      { q: '¿Cómo me preparo para la lactancia?', a: ['No hace falta preparar el pecho. Lo que más ayuda es informarte antes: en las clases de preparación, con tu matrona o en un grupo de apoyo a la lactancia. Tras el parto, el piel con piel y poner al bebé al pecho pronto y a demanda facilitan que todo arranque. Si duele o notas que algo no va bien, pide ayuda pronto: casi todo tiene solución.'] },
    ],
  },
];

export const POSTPARTUM_GUIDE = [
  {
    id: 'pp', title: 'Después del parto', subtitle: 'Las primeras semanas',
    items: [
      { q: '¿Cómo distingo la tristeza posparto de una depresión?', a: ['La tristeza posparto (baby blues) es muy común: llanto fácil, sensibilidad y cansancio en los primeros días, que se pasan solos en unas dos semanas. Si dura más, va a peor, no disfrutas de nada, te sientes incapaz o tienes pensamientos de hacerte daño a ti o al bebé, puede ser una depresión posparto. Pide ayuda cuanto antes; si esos pensamientos aparecen, ve a urgencias o llama al 112.'] },
      { q: '¿Cómo empiezo con la lactancia?', a: ['El piel con piel y poner al bebé al pecho pronto y a demanda facilitan que todo arranque. Si duele o notas que algo no va bien, pide ayuda pronto a tu matrona o a un grupo de apoyo a la lactancia: casi todo tiene solución.'] },
      { draft: true, q: '¿Cuánto dura el sangrado después del parto?', a: ['El sangrado tras el parto se llama loquios. Los primeros días es como una regla abundante y después se va aclarando y disminuyendo; suele durar entre 4 y 6 semanas. Consulta si vuelve a aumentar, si empapas una compresa en una hora, si expulsas coágulos grandes o si huele mal.'] },
      { draft: true, q: '¿Cuándo tengo la revisión después del parto?', a: ['La matrona de tu centro de salud suele verte en los primeros días tras el alta y de nuevo hacia las 6 semanas (la revisión del final de la cuarentena). Es un buen momento para hablar de cómo te encuentras, la lactancia, el suelo pélvico y la anticoncepción.'] },
      { draft: true, q: '¿Qué hago con las pérdidas de orina o el suelo pélvico?', a: ['Las pérdidas de orina son frecuentes en las primeras semanas. Los ejercicios de suelo pélvico ayudan a recuperarlo; pregunta a tu matrona cómo hacerlos. Si persisten pasados unos meses, existe la fisioterapia de suelo pélvico.'] },
    ],
  },
  {
    id: 'ppc', title: 'La regla y la anticoncepción', subtitle: 'Cuando vuelva tu ciclo',
    items: [
      { draft: true, q: '¿Cuándo vuelve la regla?', a: ['Si no das el pecho, suele volver entre 6 y 8 semanas después del parto. Si das lactancia materna, puede tardar meses, sobre todo si es exclusiva. Los primeros ciclos suelen ser irregulares, así que las predicciones de Vera serán poco fiables hasta que registres dos o tres reglas.'] },
      { draft: true, q: '¿La lactancia protege de un nuevo embarazo?', a: ['Solo de forma limitada: puedes ovular antes de tener la primera regla. Si no quieres un nuevo embarazo, habla de anticoncepción con tu matrona o tu médico antes de retomar las relaciones; hay métodos compatibles con la lactancia.'] },
    ],
  },
];

/** Sección de la guía que corresponde a una semana de embarazo */
export function guideSectionFor(weeks) {
  return PREGNANCY_GUIDE.find((s) => s.id !== 'emo' && weeks >= s.from && weeks <= s.to)
    ?? (weeks < 4 ? PREGNANCY_GUIDE[0] : PREGNANCY_GUIDE.find((s) => s.id === 's37'));
}
