// Genera /guias/ a partir de las respuestas de la app (app/js/guide.js) para que se indexen en Google (vera-backlog#76).
// Uso: node tools/build-guias.mjs   · Las URL nuevas se añaden a sitemap.xml.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { PREGNANCY_GUIDE, POSTPARTUM_GUIDE } from '../app/js/guide.js';

const UPDATED = '2026-10-31';
const SITE = 'https://hera-gine.com';
const PRO = {
  gineco: { name: 'Gonzalo', role: 'ginecólogo' },
  matrona: { name: 'Marina', role: 'matrona' },
  pediatra: { name: 'Lucía', role: 'pediatra' },
};
// [pregunta en la app, slug, título para buscadores, profesional, grupo]
const PAGES = [
  ['¿Es normal manchar un poco al principio?', 'manchar-al-principio-del-embarazo', '¿Es normal manchar al principio del embarazo?', 'gineco', 'Embarazo'],
  ['¿Son normales las náuseas? ¿Hasta cuándo duran?', 'nauseas-en-el-embarazo', 'Náuseas en el embarazo: ¿son normales y hasta cuándo duran?', 'matrona', 'Embarazo'],
  ['¿Qué alimentos debo evitar?', 'alimentos-a-evitar-en-el-embarazo', 'Qué alimentos evitar en el embarazo', 'matrona', 'Embarazo'],
  ['¿Puedo comer jamón y embutidos?', 'jamon-y-embutidos-en-el-embarazo', '¿Puedo comer jamón y embutidos en el embarazo?', 'matrona', 'Embarazo'],
  ['¿Cuánto peso es normal ganar?', 'cuanto-peso-ganar-en-el-embarazo', '¿Cuánto peso es normal ganar en el embarazo?', 'matrona', 'Embarazo'],
  ["¿Qué es el test de O'Sullivan?", 'test-de-o-sullivan', "¿Qué es el test de O'Sullivan en el embarazo?", 'gineco', 'Embarazo'],
  ['¿Qué son las contracciones de Braxton Hicks?', 'contracciones-de-braxton-hicks', '¿Qué son las contracciones de Braxton Hicks?', 'matrona', 'Embarazo'],
  ['¿Cómo sé si he roto aguas?', 'como-saber-si-he-roto-aguas', '¿Cómo sé si he roto aguas?', 'matrona', 'Embarazo'],
  ['¿Cuándo tengo que ir al hospital?', 'cuando-ir-al-hospital-de-parto', '¿Cuándo tengo que ir al hospital de parto?', 'matrona', 'Embarazo'],
  ['¿Cuánto dura el sangrado después del parto?', 'cuanto-dura-el-sangrado-despues-del-parto', '¿Cuánto dura el sangrado después del parto?', 'matrona', 'Posparto'],
  ['¿Cuándo vuelve la regla?', 'cuando-vuelve-la-regla-despues-del-parto', '¿Cuándo vuelve la regla después del parto?', 'gineco', 'Posparto'],
  ['Mi bebé está amarillo, ¿es normal?', 'bebe-amarillo-ictericia', 'Mi bebé está amarillo, ¿es normal?', 'pediatra', 'Tu bebé'],
  ['Tiene fiebre, ¿qué hago?', 'bebe-con-fiebre-que-hago', 'Mi bebé tiene fiebre, ¿qué hago?', 'pediatra', 'Tu bebé'],
  ['¿Cómo duerme seguro mi bebé?', 'como-duerme-seguro-un-bebe', '¿Cómo duerme seguro un bebé?', 'pediatra', 'Tu bebé'],
  ['Llora mucho, ¿son cólicos?', 'bebe-llora-mucho-colicos', 'Mi bebé llora mucho, ¿son cólicos?', 'pediatra', 'Tu bebé'],
];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const all = [...PREGNANCY_GUIDE, ...POSTPARTUM_GUIDE].flatMap((s) => s.items);
const answer = (a) => a.map((x) => (Array.isArray(x) ? `<ul>${x.map((li) => `<li>${esc(li)}</li>`).join('')}</ul>` : `<p>${esc(x)}</p>`)).join('\n');
const plain = (a) => a.flat().join(' ');
const BEACON = `<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "edc55b126e2943d8828e3241ae0c4efd"}'></script>`;
const CSS = `@font-face{font-family:Newsreader;src:url('/app/fonts/newsreader.woff2') format('woff2');font-weight:200 800;font-display:swap}
@font-face{font-family:Inter;src:url('/app/fonts/inter.woff2') format('woff2');font-weight:100 900;font-display:swap}
*{box-sizing:border-box}body{margin:0;background:#FBF7F1;color:#2E2630;font:17px/1.6 Inter,system-ui,sans-serif}
header,main,footer{max-width:720px;margin:0 auto;padding:0 20px}header{display:flex;justify-content:space-between;align-items:center;padding-top:18px}
.wm{font:400 30px/1 Newsreader,Georgia,serif;letter-spacing:-.02em;color:#3B2433;text-decoration:none}.nav{font-size:14px;color:#693D55}
h1,h2{font-family:Newsreader,Georgia,serif;font-weight:400;color:#693D55;letter-spacing:-.02em;line-height:1.1;text-wrap:balance}h1{font-size:38px;margin:30px 0 10px}h2{font-size:25px;margin:34px 0 10px}
a{color:#693D55}.meta{font-size:14px;color:#655B61;margin:0 0 22px}.ey{font-size:12px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:#8E6178;margin:30px 0 0}.ey+h1{margin-top:10px}
.cta{background:#fff;border:1px solid #E6DFE2;border-radius:12px;padding:20px;margin:30px 0}.cta h2{margin:0 0 6px}.cta p{margin:0 0 14px;font-size:15px}.btn{display:inline-block;background:#693D55;color:#fff;border-radius:6px;padding:12px 20px;font-weight:600;text-decoration:none}
.fine{font-size:13.5px;color:#655B61}ul.l{list-style:none;padding:0}ul.l li{padding:10px 0;border-bottom:1px solid #E6DFE2}footer{padding-top:24px;padding-bottom:40px;font-size:14px;color:#655B61}
.urg{font-size:14px;color:#8F2F3F}`;
const shell = ({ title, desc, path, ld, body }) => `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${SITE}${path}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:image" content="${SITE}/portada/compartir.jpg"><meta property="og:type" content="article"><meta property="og:locale" content="es_ES">
<meta name="theme-color" content="#FAF8F5"><link rel="icon" type="image/svg+xml" href="/app/brand/favicon.svg"><link rel="apple-touch-icon" href="/app/icons/apple-touch-icon.png">
<script type="application/ld+json">${JSON.stringify(ld)}</script><style>${CSS}</style></head><body>
<header><a class="wm" href="/">Hera</a><a class="nav" href="/guias/">Guías</a></header><main>${body}</main>
<footer><a href="/">Inicio</a> · <a href="/guias/">Guías</a> · <a href="/equipo.html">El equipo</a> · <a href="/privacy.html">Privacidad</a> · <a href="/support.html">Soporte</a></footer>${BEACON}</body></html>
`;

const pages = PAGES.map(([q, slug, title, pro, group]) => {
  const item = all.find((i) => i.q === q);
  if (!item) throw new Error(`No está en la guía: ${q}`);
  return { q, slug, title, pro: PRO[pro], proKey: pro, group, a: item.a, desc: plain(item.a).slice(0, 150).replace(/\s\S*$/, '') + '…' };
});

for (const p of pages) {
  const path = `/guias/${p.slug}/`;
  const related = pages.filter((x) => x.group === p.group && x !== p).slice(0, 3);
  const ld = { '@context': 'https://schema.org', '@type': 'Article', headline: p.title, inLanguage: 'es-ES', dateModified: UPDATED, mainEntityOfPage: SITE + path,
    author: { '@type': 'Organization', name: 'Hera', url: `${SITE}/` }, publisher: { '@type': 'Organization', name: 'Hera', url: `${SITE}/` } };
  mkdirSync(`guias/${p.slug}`, { recursive: true });
  writeFileSync(`guias/${p.slug}/index.html`, shell({ title: `${p.title} · Hera`, desc: p.desc, path, ld, body: `
<p class="ey">${esc(p.group)}</p><h1>${esc(p.title)}</h1><p class="meta">Equipo de Hera · Actualizado el 31 de octubre de 2026</p>
${answer(p.a)}
<div class="cta"><h2>¿Tu caso es distinto?</h2><p>Pregúntaselo a ${p.pro.name}, ${p.pro.role} de Hera, y te responde por escrito en menos de 48 h. Tus dos primeras consultas son gratis.</p><a class="btn" href="/#preguntar-${p.proKey}">Preguntar a ${p.pro.name}</a></div>
<p class="fine">Información general que no sustituye la valoración de un profesional.</p><p class="urg">Si es urgente, llama al 112 o ve a urgencias.</p>
<h2>También te puede interesar</h2><ul class="l">${related.map((r) => `<li><a href="/guias/${r.slug}/">${esc(r.title)}</a></li>`).join('')}</ul>` }));
}
const groups = [...new Set(pages.map((p) => p.group))];
mkdirSync('guias', { recursive: true });
writeFileSync('guias/index.html', shell({ title: 'Guías de embarazo, posparto y bebé · Hera', desc: 'Respuestas claras a las dudas más frecuentes del embarazo, el posparto y los primeros meses de tu bebé.', path: '/guias/',
  ld: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Guías de Hera', inLanguage: 'es-ES', url: `${SITE}/guias/` }, body: `
<p class="ey">Guías</p><h1>Dudas frecuentes, con respuestas claras</h1><p>Información general para orientarte. Si tu caso es distinto, <a href="/#ask">pregunta a nuestro equipo</a>.</p>
${groups.map((g) => `<h2>${esc(g)}</h2><ul class="l">${pages.filter((p) => p.group === g).map((p) => `<li><a href="/guias/${p.slug}/">${esc(p.title)}</a></li>`).join('')}</ul>`).join('\n')}` }));

let sm = readFileSync('sitemap.xml', 'utf8').replace(/\s*<url><loc>[^<]*\/guias\/[^<]*<\/loc><lastmod>[^<]*<\/lastmod><\/url>/g, '');
const urls = ['/guias/', ...pages.map((p) => `/guias/${p.slug}/`)].map((u) => `  <url><loc>${SITE}${u}</loc><lastmod>${UPDATED}</lastmod></url>`).join('\n');
writeFileSync('sitemap.xml', sm.replace('</urlset>', `${urls}\n</urlset>`));
console.log(`${pages.length} guías`);
