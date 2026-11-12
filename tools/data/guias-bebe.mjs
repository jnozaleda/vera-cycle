// Guías solo para la web (12 nov 2026): dudas del bebé (grupo de anuncios «Pediatra · dudas del bebé») y de lactancia
// (búsquedas del grupo Matrona). Publicadas ANTES de la revisión clínica a petición de Noza; las revisan Lucía (bebé) y
// Marina (lactancia). Mientras tanto firman «Equipo de Hera».
// Cada guía: page = [pregunta, slug, título, profesional, grupo, resumen] · a = respuesta (como en app/js/guide.js) · x = ampliación
// (preguntas frecuentes) · v = formato visual (como en guias-visual.mjs).

const P = '#8A7045', L = '#D2C3A6';

export const BABY_WEB = [
  {
    page: ['Costra láctea: ¿qué es y cómo se quita?', 'costra-lactea-bebe', 'Costra láctea en el bebé: qué es y cómo quitarla', 'pediatra', 'Tu bebé', 'Por qué sale, cómo retirarla sin arrancarla y cuándo consultar.'],
    a: [
      'La costra láctea es normal y no es peligrosa: son escamas amarillentas o blanquecinas, algo grasientas, en el cuero cabelludo. Es una dermatitis seborreica del lactante, suele aparecer en los primeros meses y casi siempre desaparece sola antes del año.',
      'No es por falta de higiene, no se contagia y normalmente no pica. Tampoco tiene que ver con la leche, aunque se llame así.',
      ['Lávale la cabeza con un champú suave para bebés, sin frotar fuerte.', 'Un rato antes del baño, ponle un poco de aceite (por ejemplo, de oliva) o vaselina para ablandar las escamas, y retíralas después con un cepillo suave o una gasa.', 'No las arranques con las uñas: la piel se puede irritar o infectar.'],
      'Consulta con su pediatra si se extiende a la cara, las cejas, detrás de las orejas, los pliegues o la zona del pañal y se ve muy roja, si le pica, sangra o supura, o si no mejora tras unas semanas de cuidados.',
    ],
    x: { updated: '2026-11-12', desc: 'La costra láctea son escamas amarillentas en la cabeza del bebé. Es normal, no contagia y suele irse sola antes del año. Cómo quitarla sin arrancarla y cuándo consultar.', h: 'Más dudas frecuentes', qa: [
      ['¿Se puede quitar con un peine?', 'Sí, con un cepillo o un peine de púas suaves, después de ablandar las escamas con aceite o vaselina. Si hay que tirar o la piel se pone roja, mejor dejarlo para otro día.'],
      ['¿Hay que cortarle el pelo?', 'No hace falta. Con el lavado y el aceite suele mejorar igual.'],
      ['¿Vuelve a salir?', 'Puede reaparecer durante los primeros meses. Basta con repetir los mismos cuidados.'],
      ['¿Es lo mismo que la dermatitis atópica?', 'No. La costra láctea no suele picar y sale sobre todo en la cabeza. La dermatitis atópica da la piel seca, áspera y con picor, a menudo en las mejillas y los pliegues. Si dudas, consulta a su pediatra.'],
    ] },
    v: {
      tiles: [['0–3 meses', 'Cuando suele aparecer'], ['Antes del año', 'Cuando suele desaparecer'], ['No contagia', 'Ni es por falta de higiene'], ['Aceite y cepillo', 'Lo que más ayuda']],
      sem: { g: ['Es normal', 'Escamas en la cabeza, sin picor, y el bebé está bien.'], a: ['Consulta', 'Se extiende a la cara o los pliegues y se ve muy roja, pica, supura o no mejora en unas semanas.'] },
      links: [['/guias/granitos-cara-bebe/', 'Granitos en la cara'], ['/bebe/mes-1/', 'Bebé de 1 mes'], ['/bebe/mes-2/', 'Bebé de 2 meses'], ['/bebe/mes-3/', 'Bebé de 3 meses']],
    },
  },
  {
    page: ['Dentición: ¿qué síntomas da y cómo aliviarla?', 'denticion-bebe-sintomas', 'Dentición del bebé: síntomas y cómo aliviarla', 'pediatra', 'Tu bebé', 'Cuándo salen los primeros dientes, qué es normal y qué evitar.'],
    a: [
      'Los primeros dientes suelen salir entre los 6 y los 10 meses, casi siempre los incisivos de abajo. Es normal que salgan antes o después: algunos bebés no tienen ninguno hasta pasado el año.',
      'Mientras salen, es habitual que babee más, se lo lleve todo a la boca, tenga las encías hinchadas, esté más irritable o duerma peor.',
      ['Dale algo frío para morder: un mordedor que haya estado en la nevera (no en el congelador) o un paño limpio y frío.', 'Masajéale la encía con un dedo limpio.', 'Si está muy molesto, pregunta a su pediatra por un analgésico, como el paracetamol, a la dosis según su peso.'],
      'No se recomiendan los geles anestésicos con benzocaína o lidocaína ni los collares de ámbar, por riesgo de efectos adversos y de asfixia.',
      'La dentición puede dar unas décimas, pero no fiebre de 38 °C o más ni diarrea importante: si aparecen, suele haber otra causa y conviene consultarlo.',
    ],
    x: { updated: '2026-11-12', desc: 'Los primeros dientes suelen salir entre los 6 y los 10 meses. Qué síntomas son normales, cómo aliviar las molestias y qué no conviene usar.', h: 'Más dudas frecuentes', qa: [
      ['¿Hay que lavarle los dientes?', 'Sí, desde que sale el primero, dos veces al día, con un cepillo infantil suave y una cantidad de pasta con flúor del tamaño de un grano de arroz.'],
      ['¿Cuándo tiene todos los dientes de leche?', 'Son 20 y suelen estar todos hacia los 2 años y medio o 3 años.'],
      ['¿Cuándo hay que consultar si no le sale ninguno?', 'Si a los 18 meses aún no le ha salido ningún diente, coméntalo con su pediatra.'],
      ['¿Cuándo es la primera visita al dentista?', 'Se suele recomendar hacia el primer año o con los primeros dientes. Pregunta en tu centro de salud.'],
    ] },
    v: {
      tiles: [['6–10 meses', 'El primer diente, lo habitual'], ['Abajo, delante', 'Los primeros en salir'], ['20 dientes', 'Hacia los 2½–3 años'], ['Frío para morder', 'Lo que más ayuda']],
      sem: { g: ['Es normal', 'Babea, muerde todo, está más irritable o duerme peor.'], a: ['Consulta', 'Fiebre de 38 °C o más, diarrea, rechaza comer, o ningún diente a los 18 meses.'], r: ['Ve a urgencias', 'Fiebre con menos de 3 meses, o está muy decaído o le cuesta respirar.'] },
      chart: { title: 'Cuándo suelen salir', track: [['Antes', 2, L], ['Lo más habitual', 4, P], ['Más tarde, también normal', 6, L]], ticks: ['4 meses', '6 meses', '10 meses', '18 meses'], legend: 'Orientativo: el ritmo de cada bebé es distinto.' },
      links: [['/bebe/mes-6/', 'Bebé de 6 meses'], ['/bebe/mes-8/', 'Bebé de 8 meses'], ['/bebe/mes-10/', 'Bebé de 10 meses'], ['/guias/bebe-con-fiebre-que-hago/', 'Fiebre en el bebé']],
    },
  },
  {
    page: ['Estreñimiento: ¿cuándo preocuparse?', 'estrenimiento-bebe', 'Estreñimiento en el bebé: ¿cuándo preocuparse?', 'pediatra', 'Tu bebé', 'Cuántos días sin caca pueden ser normales y qué ayuda.'],
    a: [
      'Que un bebé pase días sin hacer caca no siempre es estreñimiento. Con lactancia materna exclusiva, a partir del mes o mes y medio, algunos bebés hacen caca varias veces al día y otros una vez cada varios días, a veces una semana o más, y es normal si la caca sale blanda.',
      'Lo que importa es cómo es la caca y si le cuesta: hablamos de estreñimiento cuando las heces son duras, como bolitas, y le duele o le cuesta mucho expulsarlas.',
      'También es normal que un bebé pequeño se ponga rojo, llore o empuje unos minutos antes de hacer una caca blanda: está aprendiendo a coordinarse.',
      ['Si toma biberón, prepara la leche con la proporción exacta de agua y polvo que indica el envase.', 'Si ya come otros alimentos, ofrécele agua, fruta (como pera o ciruela), verdura, legumbres y cereales integrales.', 'Masajéale la tripa en el sentido de las agujas del reloj y flexiona sus piernas hacia la tripa.'],
      'No uses supositorios, laxantes, infusiones ni estimulación con el termómetro sin consultarlo antes con su pediatra.',
    ],
    x: { updated: '2026-11-12', desc: 'Con pecho, un bebé puede pasar días sin hacer caca y estar bien. Cuándo es estreñimiento, qué ayuda y cuándo consultar.', h: 'Más dudas frecuentes', qa: [
      ['¿Y si toma biberón?', 'Con leche de fórmula las cacas suelen ser más espesas y algo menos frecuentes. Si son duras o le duelen, coméntalo con su pediatra antes de cambiar de leche.'],
      ['¿Es normal que cambie al empezar a comer?', 'Sí. Al empezar la alimentación complementaria las cacas cambian de color, olor y consistencia, y a veces aparece estreñimiento. Suele mejorar con agua, fruta, verdura y legumbres.'],
      ['¿Sirve el zumo de naranja?', 'No se recomiendan los zumos en bebés. Mejor la fruta entera, triturada o en trozos según su edad.'],
    ] },
    v: {
      tiles: [['1 semana o más', 'Sin caca puede ser normal con pecho'], ['Duras y con dolor', 'Eso es estreñimiento'], ['Masaje y piernas', 'Lo que puede ayudar'], ['Sin supositorios', 'Sin consultarlo antes']],
      sem: { g: ['Es normal', 'Pasa días sin caca pero sale blanda, come bien y gana peso.'], a: ['Consulta', 'Cacas duras con dolor, sangre en las heces, estreñimiento desde las primeras semanas o la tripa hinchada.'], r: ['Ve a urgencias', 'Vomita verde o todo lo que toma, o tiene la tripa muy hinchada y dura y está decaído.'] },
      links: [['/guias/bebe-llora-mucho-colicos/', 'Llanto y cólicos'], ['/guias/alimentacion-complementaria/', 'Alimentación complementaria'], ['/bebe/mes-2/', 'Bebé de 2 meses'], ['/bebe/mes-6/', 'Bebé de 6 meses']],
    },
  },
  {
    page: ['Granitos en la cara: ¿son normales?', 'granitos-cara-bebe', 'Granitos en la cara del bebé: ¿son normales?', 'pediatra', 'Tu bebé', 'Acné del bebé, puntos blancos y sudamina: qué hacer.'],
    a: [
      'Casi siempre son normales. En las primeras semanas, muchos bebés tienen granitos en la cara que desaparecen solos, sin tratamiento.',
      ['Acné del bebé: granitos rojos o con punta blanca en mejillas, frente y barbilla. Suele salir entre las 2 y las 4 semanas y desaparecer hacia los 3 o 4 meses.', 'Milios: puntitos blancos muy pequeños en la nariz y las mejillas. Se van solos en unas semanas.', 'Sudamina: granitos muy pequeños, rojos o transparentes, en el cuello, la cara o el pecho, por el calor o por abrigarlo de más.'],
      'Lávale la cara con agua, sécala con toques suaves y no aprietes ni pongas cremas, aceites ni productos para el acné sin consultarlo. Si es sudamina, no lo abrigues de más.',
      'Consulta con su pediatra si hay granos con pus o costras amarillentas, si se extienden por el cuerpo, si la piel está muy seca y le pica, o si siguen después de los 4 meses.',
    ],
    x: { updated: '2026-11-12', desc: 'Los granitos en la cara del bebé suelen ser acné del bebé, milios o sudamina, y se van solos. Qué hacer y cuándo consultar.', h: 'Más dudas frecuentes', qa: [
      ['¿Es por la leche o por lo que como yo?', 'No. El acné del bebé se relaciona con las hormonas de los primeros días, no con la leche ni con lo que comes si das el pecho.'],
      ['¿Le puedo poner crema?', 'Mejor no ponerle nada sin consultarlo: las cremas y los aceites pueden empeorar los granitos. Basta con agua.'],
      ['¿Cuándo es urgente?', 'Si aparecen manchas rojas o moradas que no desaparecen al presionar la piel con un vaso, sobre todo con fiebre, ve a urgencias.'],
    ] },
    v: {
      tiles: [['2–4 semanas', 'Cuando suele salir el acné del bebé'], ['3–4 meses', 'Cuando suele desaparecer'], ['Agua, nada más', 'Lo que más ayuda'], ['Sin apretar', 'Ni cremas sin consultar']],
      sem: { g: ['Es normal', 'Granitos en la cara en las primeras semanas, sin fiebre y el bebé está bien.'], a: ['Consulta', 'Granos con pus o costras, se extienden por el cuerpo, la piel pica o siguen después de los 4 meses.'], r: ['Ve a urgencias', 'Manchas rojas o moradas que no desaparecen al presionar, sobre todo con fiebre.'] },
      links: [['/guias/costra-lactea-bebe/', 'Costra láctea'], ['/guias/bebe-amarillo-ictericia/', 'Bebé amarillo'], ['/bebe/mes-1/', 'Bebé de 1 mes'], ['/bebe/mes-2/', 'Bebé de 2 meses']],
    },
  },
  {
    page: ['Alimentación complementaria: ¿cuándo y cómo empezar?', 'alimentacion-complementaria', 'Alimentación complementaria: cuándo y cómo empezar', 'pediatra', 'Tu bebé', 'Cuándo está preparado, purés o trozos y qué evitar el primer año.'],
    a: [
      'Hacia los 6 meses, sin dejar la leche (materna o de fórmula), que sigue siendo su alimento principal durante el primer año. Suele estar preparado cuando se mantiene sentado con poco apoyo, muestra interés por la comida y ya no expulsa los alimentos con la lengua.',
      ['Puedes ofrecer purés o trozos blandos adaptados a su edad (lo que a veces se llama BLW): las dos formas son válidas, y también se pueden combinar.', 'No hay un orden obligatorio de alimentos. Incluye pronto los ricos en hierro: carne, legumbres, huevo y pescado.', 'No hace falta retrasar los alimentos que pueden dar alergia (huevo, pescado, frutos secos molidos): introdúcelos de uno en uno.', 'Que coma siempre sentado, erguido y acompañado.'],
      ['Sin sal ni azúcar añadidos, y nada de miel antes del año.', 'Leche de vaca como bebida, mejor a partir del año.', 'Frutos secos enteros, nunca: solo molidos o en crema, por el riesgo de atragantamiento. Los alimentos redondos, como uvas o tomates cherry, cortados a lo largo.', 'Las verduras de hoja verde, como espinacas o acelgas, en poca cantidad el primer año.'],
      'Su pediatra te orientará en la revisión de los 6 meses.',
    ],
    x: { updated: '2026-11-12', desc: 'La alimentación complementaria se empieza hacia los 6 meses, sin dejar la leche. Purés o trozos, qué alimentos primero y qué evitar el primer año.', h: 'Más dudas frecuentes', qa: [
      ['¿Purés o BLW?', 'Las dos formas son válidas. Lo importante es que la textura vaya avanzando: hacia los 8–10 meses conviene que ya tome trozos blandos y que coma con los dedos.'],
      ['¿Cuánto tiene que comer?', 'Lo decide él. Al principio son unas cucharadas o unos trozos, y eso está bien: ofrécele sin obligar y para cuando muestre que no quiere más.'],
      ['¿Y si se atraganta?', 'Es normal que tenga arcadas: es su forma de protegerse. Que coma siempre sentado y vigilado, y con trozos blandos que se aplasten entre tus dedos. Un curso de primeros auxilios para bebés te dará tranquilidad.'],
      ['¿Puede beber agua?', 'Sí, desde que empieza a comer otros alimentos puedes ofrecerle agua en un vaso, sin forzar.'],
    ] },
    v: {
      tiles: [['Hacia los 6 meses', 'Cuando se empieza'], ['La leche', 'Sigue siendo lo principal hasta el año'], ['Sin sal ni azúcar', 'Ni miel antes del año'], ['Purés o trozos', 'Las dos formas valen']],
      sem: { g: ['Es normal', 'Al principio come muy poco, hace arcadas o escupe: está aprendiendo.'], a: ['Consulta', 'No gana peso, rechaza toda la comida durante días o aparece una reacción después de un alimento nuevo.'], r: ['Ve a urgencias', 'Le cuesta respirar, se le hinchan los labios o la cara, o se atraganta y no puede toser ni llorar (llama al 112).'] },
      links: [['/guias/bebe-no-quiere-comer/', 'No quiere comer'], ['/guias/estrenimiento-bebe/', 'Estreñimiento'], ['/bebe/mes-6/', 'Bebé de 6 meses'], ['/bebe/mes-8/', 'Bebé de 8 meses']],
    },
  },
  {
    page: ['Mi bebé no quiere comer, ¿qué hago?', 'bebe-no-quiere-comer', 'Mi bebé no quiere comer, ¿qué hago?', 'pediatra', 'Tu bebé', 'Cuándo es normal, cómo ayudarle sin forzar y cuándo consultar.'],
    a: [
      'Si gana peso, moja pañales y está activo, lo más probable es que esté comiendo lo que necesita, aunque a ti te parezca poco. El apetito cambia de un día a otro, y hacia el año suele comer menos porque crece más despacio.',
      ['Ofrécele la comida y deja que él decida cuánto come: obligar, insistir o distraerle suele empeorar el rechazo.', 'Comed juntos, sin pantallas, en ratos tranquilos y sin alargar la comida más de unos 30 minutos.', 'Evita llenarle entre horas con zumos, galletas o demasiada leche.', 'Ofrece varias veces los alimentos nuevos: a veces hace falta probarlos muchas veces antes de aceptarlos.'],
      'Si tiene menos de 6 meses y rechaza el pecho o el biberón, coméntalo con su pediatra pronto.',
      'Consulta también si pierde peso o deja de ganarlo, si vomita a menudo, tiene fiebre o está decaído. Ve a urgencias si notas que se deshidrata: moja muchos menos pañales, tiene la boca seca, llora sin lágrimas, la fontanela está hundida o está muy dormido.',
    ],
    x: { updated: '2026-11-12', desc: 'Si gana peso y moja pañales, suele estar comiendo lo que necesita. Cómo ayudarle sin forzar y cuándo consultar con su pediatra.', h: 'Más dudas frecuentes', qa: [
      ['¿Cómo sé si come suficiente?', 'Las mejores señales son que gana peso en las revisiones, moja bastantes pañales al día y está activo y despierto cuando no duerme.'],
      ['¿Le doy vitaminas para el apetito?', 'No se recomiendan sin una indicación de su pediatra.'],
      ['Solo quiere leche, ¿qué hago?', 'A partir del año, demasiada leche puede quitarle el hambre. Pregunta a su pediatra cuánta le conviene según su edad.'],
    ] },
    v: {
      tiles: [['Si gana peso', 'Suele comer lo que necesita'], ['Hacia el año', 'Come menos: crece más despacio'], ['Sin forzar', 'Ofrece, no obligues'], ['Pañales mojados', 'La mejor señal de que bebe bastante']],
      sem: { g: ['Es normal', 'Come poco unos días, pero gana peso, moja pañales y está activo.'], a: ['Consulta', 'Pierde peso o no gana, vomita a menudo, tiene fiebre, o es menor de 6 meses y rechaza el pecho o el biberón.'], r: ['Ve a urgencias', 'Moja muchos menos pañales, tiene la boca seca, llora sin lágrimas o está muy dormido.'] },
      links: [['/guias/alimentacion-complementaria/', 'Alimentación complementaria'], ['/bebe/mes-9/', 'Bebé de 9 meses'], ['/bebe/mes-12/', 'Bebé de 12 meses'], ['/guias/denticion-bebe-sintomas/', 'Dentición']],
    },
  },
  {
    page: ['Crisis de lactancia: ¿qué son y cuánto duran?', 'crisis-de-lactancia', 'Crisis de lactancia: qué son, cuándo llegan y cuánto duran', 'matrona', 'Posparto', 'Por qué de repente pide el pecho todo el rato y qué hacer.'],
    a: [
      'Las crisis de lactancia son normales: unos días en los que el bebé pide el pecho mucho más, está inquieto, se suelta y vuelve a cogerlo, y parece que no se queda satisfecho. No significa que tengas poca leche: al mamar más, tu cuerpo ajusta la producción a lo que necesita.',
      'Suelen describirse hacia los 15–20 días, las 6–7 semanas y los 3 meses, aunque cada bebé tiene su ritmo. Las primeras duran unos días; la de los 3 meses puede alargarse varias semanas, porque el bebé mama más rápido, se distrae con todo y el pecho se nota más blando.',
      ['Ofrece el pecho a demanda, sin horarios: es lo que hace que la producción se ajuste.', 'Busca sitios tranquilos para las tomas si se distrae, y prueba a darle el pecho medio dormido.', 'Descansa cuando él descanse y pide ayuda en casa con lo demás.', 'No hace falta darle biberones de fórmula «por si acaso»: si te preocupa, consúltalo antes.'],
      'Consulta con tu matrona o tu pediatra si no gana peso, moja menos pañales de lo habitual, tienes dolor o grietas en el pezón, o el pecho está rojo, duro y con fiebre.',
    ],
    x: { updated: '2026-11-12', desc: 'Las crisis de lactancia son días en los que el bebé pide el pecho mucho más. Suelen llegar hacia los 15–20 días, las 6–7 semanas y los 3 meses. Qué hacer y cuándo consultar.', h: 'Más dudas frecuentes', qa: [
      ['¿Cuánto dura la crisis de los 15 días?', 'Suele durar unos 2 a 7 días. Si el bebé moja pañales y gana peso, es normal aunque pida muchísimo.'],
      ['¿Y la crisis de los 3 meses?', 'Es la más larga y la que más dudas da: puede durar varias semanas. El bebé mama en pocos minutos y se distrae, y el pecho se nota blando. No es que tengas menos leche: tu cuerpo ya se ha ajustado.'],
      ['¿Cómo sé si se queda con hambre de verdad?', 'Las mejores señales son que moja unos 5 o 6 pañales al día, hace caca con regularidad las primeras semanas y gana peso en las revisiones.'],
      ['¿Me tengo que sacar leche para tener más?', 'No suele hacer falta: ofrecer el pecho a menudo es lo que más ayuda. Si tu matrona lo ve necesario, te dirá cómo.'],
    ] },
    v: {
      tiles: [['15–20 días', 'La primera, lo habitual'], ['6–7 semanas', 'La segunda'], ['3 meses', 'La más larga'], ['A demanda', 'Lo que más ayuda']],
      sem: { g: ['Es normal', 'Pide mucho más unos días, pero moja pañales y gana peso.'], a: ['Consulta', 'No gana peso, moja menos pañales, te duele el pecho o tienes grietas, o el pecho está rojo y con fiebre.'], r: ['Ve a urgencias', 'El bebé está muy dormido y no se despierta para comer, o tiene fiebre con menos de 3 meses.'] },
      chart: { title: 'Cuándo suelen llegar', track: [['15–20 días', 2, P], ['', 3, L], ['6–7 sem.', 2, P], ['', 4, L], ['3 meses', 3, P]], ticks: ['Nacer', '3 semanas', '7 semanas', '3 meses'], legend: 'Orientativo: cada bebé tiene su ritmo.' },
      links: [['/videollamada/#lactancia', 'Asesoría de lactancia con Marina'], ['/guias/subida-de-la-leche/', 'La subida de la leche'], ['/bebe/mes-1/', 'Bebé de 1 mes'], ['/bebe/mes-3/', 'Bebé de 3 meses']],
    },
  },
  {
    page: ['¿Cuándo sube la leche después del parto?', 'subida-de-la-leche', 'Subida de la leche: cuándo llega después del parto y cómo aliviarla', 'matrona', 'Posparto', 'Cuánto tarda, cómo se nota y qué hacer si el pecho se pone muy duro.'],
    a: [
      'La leche suele subir entre el segundo y el cuarto día después del parto. Antes, el bebé toma calostro: poca cantidad, pero justo lo que necesita esos primeros días. Tras una cesárea o en el primer bebé puede tardar algo más.',
      'Lo notarás porque el pecho está más lleno, pesado y caliente, y la leche se vuelve más blanca y abundante. Es normal que el bebé pierda algo de peso los primeros días (hasta un 7–10 %) y que lo recupere hacia las 2 semanas.',
      ['Dale el pecho a menudo, unas 8 a 12 veces al día: es lo que más ayuda a que suba y a que no se ingurgite.', 'Si el pecho está tan duro que le cuesta engancharse, sácate un poco de leche a mano antes de la toma para ablandar la areola.', 'Entre tomas, el frío (una compresa fría envuelta en un paño) alivia la hinchazón.'],
      'Consulta con tu matrona si a los 5 días no ha subido, si el bebé pierde más del 10 % de su peso, moja pocos pañales o está muy amarillo, o si tienes una zona del pecho roja, dura y dolorosa, sobre todo con fiebre.',
    ],
    x: { updated: '2026-11-12', desc: 'La leche suele subir entre el segundo y el cuarto día después del parto. Cómo se nota, cómo aliviar el pecho duro y cuándo consultar con tu matrona.', h: 'Más dudas frecuentes', qa: [
      ['¿Cuánto tarda en subir la leche tras una cesárea?', 'Puede tardar uno o dos días más. Ponerlo al pecho pronto y a menudo ayuda; si a los 5 días no ha subido, coméntalo con tu matrona.'],
      ['¿Cuántos pañales debe mojar?', 'A partir del quinto día, unos 5 o 6 pañales mojados al día y varias cacas, que pasan de negras a amarillas.'],
      ['¿Es normal que me duela?', 'Es normal notar el pecho tenso y algo molesto los días de la subida. El dolor fuerte en el pezón o las grietas no lo son: suelen indicar que el agarre se puede mejorar.'],
    ] },
    v: {
      tiles: [['Día 2–4', 'Cuando suele subir'], ['8–12 tomas', 'Al día, lo que más ayuda'], ['Hasta 7–10 %', 'Peso que puede perder al principio'], ['~2 semanas', 'Cuando recupera su peso']],
      sem: { g: ['Es normal', 'Pecho lleno y caliente entre los días 2 y 4; el bebé moja pañales.'], a: ['Consulta', 'No ha subido al quinto día, pierde más del 10 % de peso, moja pocos pañales o tienes una zona roja y dura.'], r: ['Ve a urgencias', 'El bebé está muy dormido, no come, tiene la boca seca o está muy amarillo y decaído.'] },
      links: [['/videollamada/#lactancia', 'Asesoría de lactancia con Marina'], ['/guias/crisis-de-lactancia/', 'Crisis de lactancia'], ['/guias/cuanto-dura-el-sangrado-despues-del-parto/', 'Sangrado después del parto'], ['/bebe/mes-1/', 'Bebé de 1 mes']],
    },
  },
];
