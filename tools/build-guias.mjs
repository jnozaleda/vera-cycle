// Genera /guias/ a partir de las respuestas de la app (app/js/guide.js) para que se indexen en Google (vera-backlog#76).
// Uso: node tools/build-guias.mjs   · Las URL nuevas se añaden a sitemap.xml.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { PREGNANCY_GUIDE, POSTPARTUM_GUIDE } from '../app/js/guide.js';
import { SITE, PRO, esc, shell, face, askBox, stickyAsk } from './web-shell.mjs';
import { VISUAL, REVIEWED } from './data/guias-visual.mjs';

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
// Formato visual (tools/data/guias-visual.mjs): datos clave, semáforo, gráfico, enlaces y barra fija en el móvil
const VCSS = `<style>.tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:18px}.tile{background:rgba(255,255,255,.75);border-radius:10px;padding:12px 14px}.tile b{display:block;font:400 25px/1.1 Newsreader,Georgia,serif;color:#3B2433}.tile span{display:block;font-size:13px;line-height:1.35;color:#655B61;margin-top:4px}
.rev{display:flex;align-items:center;gap:9px;font-size:13.5px;color:#4C444C;margin-top:4px}.rev img{width:30px;height:30px;border-radius:50%}.rev b{color:#3B2433}
.sem{display:flex;flex-direction:column;gap:8px}.lt{display:grid;grid-template-columns:8px 1fr;gap:12px;border-radius:10px;padding:12px 14px 12px 12px}.lt i{border-radius:4px}.lt b{display:block;font-weight:700;font-size:15px}.lt p{font-size:14.5px;line-height:1.45;margin:2px 0 0;color:#2E2630}
.lt.g{background:#EAF3EE}.lt.g i{background:#3E8E63}.lt.g b{color:#2F6B4F}.lt.a{background:#FBF1E2}.lt.a i{background:#D69A2D}.lt.a b{color:#8A5A12}.lt.r{background:#FBEAEC}.lt.r i{background:#B8424F}.lt.r b{color:#8F2F3F}
.track{display:flex;height:36px;border-radius:8px;overflow:hidden;font-size:12.5px;font-weight:700;color:#fff}.track div{display:flex;align-items:center;justify-content:center;text-align:center;line-height:1.1;padding:0 4px;min-width:0}
.ticks{display:flex;justify-content:space-between;font-size:12px;color:#655B61;margin-top:6px}.sec .cleg{font-size:13.5px;line-height:1.45;color:#655B61;margin-top:10px}
.rng{display:flex;flex-direction:column;gap:12px}.rr span{display:block;font-size:14px;margin-bottom:5px}.rr div{position:relative;height:14px;background:#F1ECEE;border-radius:7px}.rr i{position:absolute;top:0;bottom:0;border-radius:7px;background:#8E6178}.rr em{position:absolute;top:-1px;font-style:normal;font-size:12.5px;font-weight:700;color:#3B2433;white-space:nowrap}
.lnk{display:flex;flex-wrap:wrap;gap:8px}.lnk a{font-size:14px;font-weight:600;color:#693D55;text-decoration:none;border:1px solid #E2C9D2;background:#FBF4F6;border-radius:999px;padding:7px 13px}.lnk a:hover{border-color:#8E6178}

@media(max-width:760px){.tiles{grid-template-columns:1fr 1fr}.tile b{font-size:22px}}</style>`;
const LIGHTS = [['g', 'Es normal'], ['a', 'Consulta'], ['r', 'Urgencias']];
function visual(p) {
  const v = VISUAL[p.slug] || {};
  const nb = (t) => esc(t).replace(/(\d) (°C|kg|min|h)\b/g, '$1&nbsp;$2');
  const tiles = v.tiles ? `<div class="tiles">${v.tiles.map(([b, t]) => `<div class="tile"><b>${nb(b)}</b><span>${esc(t)}</span></div>`).join('')}</div>` : '';
  const sem = v.sem ? `<section class="sec"><h2>¿Qué hago ahora?</h2><div class="sem">${LIGHTS.filter(([k]) => v.sem[k]).map(([k]) => `<div class="lt ${k}"><i></i><div><b>${esc(v.sem[k][0])}</b><p>${nb(v.sem[k][1])}</p></div></div>`).join('')}</div></section>` : '';
  let chart = '';
  if (v.chart?.track) {
    chart = `<section class="sec"><h2>${esc(v.chart.title)}</h2><div class="track">${v.chart.track.map(([t, w, c]) => `<div style="flex:${w};background:${c}">${esc(t)}</div>`).join('')}</div><div class="ticks">${v.chart.ticks.map((t) => `<span>${esc(t)}</span>`).join('')}</div><p class="cleg">${nb(v.chart.legend)}</p></section>`;
  } else if (v.chart?.range) {
    const { max, unit, rows } = v.chart.range;
    const f = (n) => String(n).replace('.', ',');
    chart = `<section class="sec"><h2>${esc(v.chart.title)}</h2><div class="rng">${rows.map(([l, lo, hi]) => `<div class="rr"><span>${esc(l)}</span><div><i style="left:${(lo / max) * 100}%;width:${((hi - lo) / max) * 100}%"></i></div><span style="margin:5px 0 0;font-size:13px;color:#655B61">${f(lo)}–${f(hi)}&nbsp;${unit}</span></div>`).join('')}</div><div class="ticks" style="margin-top:10px">${[0, 5, 10, 15, 20].filter((n) => n <= max).map((n) => `<span>${n}&nbsp;${unit}</span>`).join('')}</div><p class="cleg">${esc(v.chart.legend)}</p></section>`;
  }
  const links = v.links ? `<section class="sec"><h2>Sigue leyendo</h2><div class="lnk">${v.links.map(([h, t]) => `<a href="${h}">${esc(t)} →</a>`).join('')}</div></section>` : '';
  const rk = REVIEWED[p.slug];
  const rev = rk ? `<p class="rev">${face(PRO[rk])}<span>Revisado por <b>${esc(PRO[rk].full || PRO[rk].name)}</b>, ${esc(PRO[rk].role)}</span></p>` : '';
  const stick = stickyAsk([p.proKey], '¿Tu caso es distinto?');
  return { tiles, sem, chart, links, rev, stick };
}
const card = (p) => `<a class="gc" href="/guias/${p.slug}/"><h3>${esc(p.title)}</h3><p>${esc(p.sum)}</p><span class="by">${face(p.pro)}<span>${p.pro.name} · ${p.pro.role}</span></span></a>`;

for (const p of pages) {
  const path = `/guias/${p.slug}/`;
  const related = pages.filter((x) => x.group === p.group && x !== p).slice(0, 3);
  const article = { '@type': 'Article', headline: p.title, inLanguage: 'es-ES', dateModified: p.updated, mainEntityOfPage: SITE + path,
    author: { '@type': 'Organization', name: 'Hera', url: `${SITE}/` }, publisher: { '@type': 'Organization', name: 'Hera', url: `${SITE}/` } };
  const ld = p.x.qa ? { '@context': 'https://schema.org', '@graph': [article, { '@type': 'FAQPage', mainEntity: p.x.qa.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) }] }
    : { '@context': 'https://schema.org', ...article };
  const extra = p.x.qa ? `<section class="sec"><h2>${esc(p.x.h)}</h2>${p.x.qa.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</section>` : '';
  const v = visual(p);
  mkdirSync(`guias/${p.slug}`, { recursive: true });
  writeFileSync(`guias/${p.slug}/index.html`, shell({ title: `${p.title} · Hera`, desc: p.desc, path, ld, body: `
${VCSS}<div class="w"><div class="band" style="background:${TINT[p.group]}"><p class="ey">${esc(p.group)}</p><h1>${esc(p.title)}</h1>${v.rev || '<p class="m">Equipo de Hera</p>'}${v.tiles}</div>
<div class="art"><article class="secs">${v.sem}${v.chart}<section class="sec"><h2>La respuesta</h2>${answer(p.a)}</section>${extra}${v.links}
<p class="urg"><b>Si es urgente, llama al 112 o ve a urgencias.</b> Esta información es general y no sustituye la valoración de un profesional.</p></article>
${askBox('¿Tu caso es distinto?', askFor(p))}</div>
<section class="more"><h2>También te puede interesar</h2><div class="gcs">${related.map(card).join('')}</div></section></div>${v.stick}` }));
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
