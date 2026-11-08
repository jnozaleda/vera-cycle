// Genera /guias/ a partir de las respuestas de la app (app/js/guide.js) para que se indexen en Google (vera-backlog#76).
// Uso: node tools/build-guias.mjs   · Las URL nuevas se añaden a sitemap.xml.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { PREGNANCY_GUIDE, POSTPARTUM_GUIDE } from '../app/js/guide.js';
import { SITE, PRO, esc, shell, face, askBox } from './web-shell.mjs';

const UPDATED = '2026-10-31';
// [pregunta en la app, slug, título para buscadores, profesional, grupo, resumen para las tarjetas]
const PAGES = [
  ['¿Es normal manchar un poco al principio?', 'manchar-al-principio-del-embarazo', '¿Es normal manchar al principio del embarazo?', 'gineco', 'Embarazo', 'Cuándo puede ser normal un manchado leve y cuándo ir a urgencias.'],
  ['¿Son normales las náuseas? ¿Hasta cuándo duran?', 'nauseas-en-el-embarazo', 'Náuseas en el embarazo: ¿son normales y hasta cuándo duran?', 'matrona', 'Embarazo', 'Cuándo suelen mejorar, qué ayuda y cuándo consultar.'],
  ['¿Qué alimentos debo evitar?', 'alimentos-a-evitar-en-el-embarazo', 'Qué alimentos evitar en el embarazo', 'matrona', 'Embarazo', 'Los que pueden transmitir infecciones como la listeria o la toxoplasmosis.'],
  ['¿Puedo comer jamón y embutidos?', 'jamon-y-embutidos-en-el-embarazo', '¿Puedo comer jamón y embutidos en el embarazo?', 'matrona', 'Embarazo', 'Depende de si eres inmune a la toxoplasmosis.'],
  ['¿Cuánto peso es normal ganar?', 'cuanto-peso-ganar-en-el-embarazo', '¿Cuánto peso es normal ganar en el embarazo?', 'matrona', 'Embarazo', 'Depende de tu peso de partida: lo habitual en cada caso.'],
  ["¿Qué es el test de O'Sullivan?", 'test-de-o-sullivan', "¿Qué es el test de O'Sullivan en el embarazo?", 'gineco', 'Embarazo', 'La prueba para detectar la diabetes del embarazo.'],
  ['¿Qué son las contracciones de Braxton Hicks?', 'contracciones-de-braxton-hicks', '¿Qué son las contracciones de Braxton Hicks?', 'matrona', 'Embarazo', 'Las contracciones de «ensayo»: cómo se notan y cuándo consultar.'],
  ['¿Cómo sé si he roto aguas?', 'como-saber-si-he-roto-aguas', '¿Cómo sé si he roto aguas?', 'matrona', 'Embarazo', 'Cómo se nota y cuándo ir al hospital sin esperar.'],
  ['¿Cuándo tengo que ir al hospital?', 'cuando-ir-al-hospital-de-parto', '¿Cuándo tengo que ir al hospital de parto?', 'matrona', 'Embarazo', 'Las señales para ir al hospital al final del embarazo.'],
  ['¿Cuánto dura el sangrado después del parto?', 'cuanto-dura-el-sangrado-despues-del-parto', '¿Cuánto dura el sangrado después del parto?', 'matrona', 'Posparto', 'Cómo evolucionan los loquios y cuándo consultar.'],
  ['¿Cuándo vuelve la regla?', 'cuando-vuelve-la-regla-despues-del-parto', '¿Cuándo vuelve la regla después del parto?', 'gineco', 'Posparto', 'Cuándo suele volver, con lactancia y sin ella.'],
  ['Mi bebé está amarillo, ¿es normal?', 'bebe-amarillo-ictericia', 'Mi bebé está amarillo, ¿es normal?', 'pediatra', 'Tu bebé', 'Qué es la ictericia, cuándo aparece y cuándo consultar.'],
  ['Tiene fiebre, ¿qué hago?', 'bebe-con-fiebre-que-hago', 'Mi bebé tiene fiebre, ¿qué hago?', 'pediatra', 'Tu bebé', 'Qué hacer según su edad y cuándo ir a urgencias.'],
  ['¿Cómo duerme seguro mi bebé?', 'como-duerme-seguro-un-bebe', '¿Cómo duerme seguro un bebé?', 'pediatra', 'Tu bebé', 'Las medidas que reducen el riesgo de muerte súbita del lactante.'],
  ['Llora mucho, ¿son cólicos?', 'bebe-llora-mucho-colicos', 'Mi bebé llora mucho, ¿son cólicos?', 'pediatra', 'Tu bebé', 'Cuándo suele mejorar el llanto y qué se considera cólico.'],
];

// Solo en la web: ampliaciones por guía para responder a lo que se busca en Google (Search Console).
// Publicadas antes de la revisión clínica a petición de Noza; las revisa Gonzalo (vera-backlog#76).
const EXTRA = {
  'jamon-y-embutidos-en-el-embarazo': {
    updated: '2026-11-08',
    title: 'Jamón y embutidos en el embarazo: fuet, chorizo, york y croquetas',
    desc: 'Si no eres inmune a la toxoplasmosis, evita los embutidos curados crudos, como el jamón, el chorizo o el fuet. Los cocidos y los platos cocinados, como las croquetas, sí.',
    h: 'Alimento por alimento',
    qa: [
      ['¿Puedo comer jamón serrano o ibérico?', 'Si eres inmune a la toxoplasmosis, sí. Si no lo eres, se recomienda evitarlo mientras esté crudo, igual que el resto de curados. Cocinado (en una sopa, un guiso o una pizza) se puede tomar.'],
      ['¿Y chorizo, fuet, salchichón o lomo embuchado?', 'Son embutidos curados crudos, así que la regla es la misma: sin problema si eres inmune; si no lo eres, mejor evitarlos crudos. El chorizo cocinado, por ejemplo en unas lentejas o un cocido, sí se puede comer.'],
      ['¿Puedo comer croquetas de jamón?', 'Sí. Al freírlas, el jamón del relleno se cocina, y el calor elimina el riesgo de toxoplasmosis. Que estén bien hechas y calientes también por dentro.'],
      ['¿Y jamón de york, pavo o mortadela?', 'Sí, son embutidos cocidos, así que la toxoplasmosis no es un problema. Como cualquier fiambre que se guarda abierto en la nevera, pueden llevar listeria: mejor envases recién abiertos, guardados en frío y que te tomes en pocos días.'],
      ['¿Sirve congelar el embutido? ¿Cuánto tiempo?', 'Congelar el embutido curado varios días a –18 °C o menos reduce el riesgo de toxoplasmosis, pero no lo elimina del todo, y tampoco elimina la listeria. Por eso, si no eres inmune, lo más seguro sigue siendo evitarlo crudo o tomarlo cocinado. Si quieres hacerlo, pregúntale a tu matrona cómo.'],
      ['¿Cómo sé si soy inmune a la toxoplasmosis?', 'Te lo dice la analítica del primer trimestre: si los anticuerpos IgG salen positivos, ya la has pasado y eres inmune. Si salen negativos, no lo eres y suelen repetirla más adelante en el embarazo.'],
    ],
  },
};
const all = [...PREGNANCY_GUIDE, ...POSTPARTUM_GUIDE].flatMap((s) => s.items);
const TINT = { Embarazo: '#DCEBE4', Posparto: '#ECE6F0', 'Tu bebé': '#F4E6E8' };
const SUB = { Embarazo: 'De la primera falta a la bolsa del hospital.', Posparto: 'Tu recuperación después del parto.', 'Tu bebé': 'Fiebre, sueño, llanto y primeros días.' };
const plain = (a) => a.flat().join(' ');
/** La primera frase va destacada; el resto del texto no cambia */
function answer(a) {
  const parts = a.map((x) => (Array.isArray(x) ? `<ul>${x.map((li) => `<li>${esc(li)}</li>`).join('')}</ul>` : `<p>${esc(x)}</p>`));
  if (typeof a[0] !== 'string') return parts.join('\n');
  const m = /^(.+?[.:?])\s+(.+)$/s.exec(a[0]);
  parts[0] = m ? `<p class="big">${esc(m[1])}</p><p>${esc(m[2])}</p>` : `<p class="big">${esc(a[0])}</p>`;
  return parts.join('\n');
}
// Quién aparece en el recuadro para preguntar, según la etapa (la autora de la guía va primero)
const TOPICS = {
  Embarazo: { gineco: 'Embarazo, pruebas y medicación', matrona: 'Síntomas, cuidados y parto' },
  Posparto: { matrona: 'Recuperación, puntos y lactancia', gineco: 'Revisión, regla y anticoncepción' },
  'Tu bebé': { pediatra: 'Fiebre, sueño, piel y desarrollo', matrona: 'Lactancia y cuidados del recién nacido' },
};
const askFor = (p) => Object.entries(TOPICS[p.group]).sort(([a], [b]) => (a === p.proKey ? -1 : b === p.proKey ? 1 : 0));
const pages = PAGES.map(([q, slug, title, pro, group, sum]) => {
  const item = all.find((i) => i.q === q);
  if (!item) throw new Error(`No está en la guía: ${q}`);
  const x = EXTRA[slug] || {};
  return { slug, title: x.title || title, pro: PRO[pro], proKey: pro, group, sum, a: item.a, x, updated: x.updated || UPDATED, desc: x.desc || plain(item.a).slice(0, 150).replace(/\s\S*$/, '') + '…' };
});
const card = (p) => `<a class="gc" href="/guias/${p.slug}/"><h3>${esc(p.title)}</h3><p>${esc(p.sum)}</p><span class="by">${face(p.pro)}<span>${p.pro.name} · ${p.pro.role}</span></span></a>`;

for (const p of pages) {
  const path = `/guias/${p.slug}/`;
  const related = pages.filter((x) => x.group === p.group && x !== p).slice(0, 3);
  const article = { '@type': 'Article', headline: p.title, inLanguage: 'es-ES', dateModified: p.updated, mainEntityOfPage: SITE + path,
    author: { '@type': 'Organization', name: 'Hera', url: `${SITE}/` }, publisher: { '@type': 'Organization', name: 'Hera', url: `${SITE}/` } };
  const ld = p.x.qa ? { '@context': 'https://schema.org', '@graph': [article, { '@type': 'FAQPage', mainEntity: p.x.qa.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) }] }
    : { '@context': 'https://schema.org', ...article };
  const fecha = new Date(`${p.updated}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  const extra = p.x.qa ? `<section class="sec"><h2>${esc(p.x.h)}</h2>${p.x.qa.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</section>` : '';
  mkdirSync(`guias/${p.slug}`, { recursive: true });
  writeFileSync(`guias/${p.slug}/index.html`, shell({ title: `${p.title} · Hera`, desc: p.desc, path, ld, body: `
<div class="w"><div class="band" style="background:${TINT[p.group]}"><p class="ey">${esc(p.group)}</p><h1>${esc(p.title)}</h1><p class="m">Equipo de Hera · Actualizado el ${fecha}</p></div>
<div class="art"><article class="secs"><section class="sec"><h2>La respuesta</h2>${answer(p.a)}</section>${extra}
<p class="urg"><b>Si es urgente, llama al 112 o ve a urgencias.</b> Esta información es general y no sustituye la valoración de un profesional.</p></article>
${askBox('¿Tu caso es distinto?', askFor(p))}</div>
<section class="more"><h2>También te puede interesar</h2><div class="gcs">${related.map(card).join('')}</div></section></div>` }));
}
const groups = Object.keys(TINT);
mkdirSync('guias', { recursive: true });
writeFileSync('guias/index.html', shell({ title: 'Guías de embarazo, posparto y bebé · Hera', desc: 'Respuestas claras a las dudas más frecuentes del embarazo, el posparto y los primeros meses de tu bebé.', path: '/guias/',
  ld: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Guías de Hera', inLanguage: 'es-ES', url: `${SITE}/guias/` }, body: `
<div class="w"><div class="ih"><p class="ey">Guías</p><h1>Las dudas de cada etapa, <em>con una respuesta clara</em></h1><p class="sub">Para orientarte. Y si tu caso es distinto, <a href="/#ask">pregúntanos</a>.</p></div>
${groups.map((g) => `<section class="grp"><div class="grph" style="background:${TINT[g]}"><h2>${esc(g)}</h2><p>${SUB[g]}</p></div><div class="gcs">${pages.filter((p) => p.group === g).map(card).join('')}</div></section>`).join('\n')}
<div class="final"><div class="fin"><h2>¿No encuentras tu duda?</h2><p>Ginecólogo, matrona y pediatra te responden por escrito en menos de 48 h.</p><a class="btn" href="/#ask">Preguntar gratis</a></div></div></div>` }));

let sm = readFileSync('sitemap.xml', 'utf8').replace(/\s*<url><loc>[^<]*\/guias\/[^<]*<\/loc><lastmod>[^<]*<\/lastmod><\/url>/g, '');
const urls = ['/guias/', ...pages.map((p) => `/guias/${p.slug}/`)].map((u) => `  <url><loc>${SITE}${u}</loc><lastmod>${(pages.find((p) => u === `/guias/${p.slug}/`) || {}).updated || UPDATED}</lastmod></url>`).join('\n');
writeFileSync('sitemap.xml', sm.replace('</urlset>', `${urls}\n</urlset>`));
console.log(`${pages.length} guías`);
