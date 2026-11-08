// Genera /guias/ a partir de las respuestas de la app (app/js/guide.js) para que se indexen en Google (vera-backlog#76).
// Uso: node tools/build-guias.mjs   · Las URL nuevas se añaden a sitemap.xml.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { PREGNANCY_GUIDE, POSTPARTUM_GUIDE } from '../app/js/guide.js';

const UPDATED = '2026-10-31';
const SITE = 'https://hera-gine.com';
const PRO = {
  gineco: { name: 'Gonzalo', role: 'ginecólogo', photo: 'gonzalo.jpg?v=2' },
  matrona: { name: 'Marina', role: 'matrona', photo: 'marina.jpg?v=2' },
  pediatra: { name: 'Lucía', role: 'pediatra', photo: 'lucia.jpg?v=3' },
};
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

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const all = [...PREGNANCY_GUIDE, ...POSTPARTUM_GUIDE].flatMap((s) => s.items);
const TINT = { Embarazo: '#DCEBE4', Posparto: '#ECE6F0', 'Tu bebé': '#F4E6E8' };
const SUB = { Embarazo: 'De la primera falta a la bolsa del hospital.', Posparto: 'Tu recuperación después del parto.', 'Tu bebé': 'Fiebre, sueño, llanto y primeros días.' };
const plain = (a) => a.flat().join(' ');
/** La primera frase se destaca; el resto del texto no cambia */
function answer(a) {
  const parts = a.map((x) => (Array.isArray(x) ? `<ul>${x.map((li) => `<li>${esc(li)}</li>`).join('')}</ul>` : `<p>${esc(x)}</p>`));
  if (typeof a[0] !== 'string') return parts.join('\n');
  const m = /^(.+?[.:?])\s+(.+)$/s.exec(a[0]);
  parts[0] = m ? `<p class="lead">${esc(m[1])}</p><p>${esc(m[2])}</p>` : `<p class="lead">${esc(a[0])}</p>`;
  return parts.join('\n');
}
const BEACON = `<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "edc55b126e2943d8828e3241ae0c4efd"}'></script>`;
const CSS = `@font-face{font-family:Newsreader;src:url('/app/fonts/newsreader.woff2') format('woff2');font-weight:200 800;font-display:swap}
@font-face{font-family:Newsreader;font-style:italic;src:url('/app/fonts/newsreader-italic.woff2') format('woff2');font-weight:200 800;font-display:swap}
@font-face{font-family:Inter;src:url('/app/fonts/inter.woff2') format('woff2');font-weight:100 900;font-display:swap}
*{box-sizing:border-box;margin:0}body{background:#FBF7F1;color:#2E2630;font:16px/1.55 Inter,system-ui,sans-serif}a{color:inherit}
.w{max-width:1120px;margin:0 auto;padding:0 28px}.top{display:flex;justify-content:space-between;align-items:center;gap:12px;padding-top:18px;padding-bottom:18px}.wm{font:400 30px/1 Newsreader,Georgia,serif;color:#3B2433;letter-spacing:-.02em;text-decoration:none}
.top nav{display:flex;align-items:center;gap:18px;font-size:14px;color:#693D55}.top nav a{text-decoration:none}.top nav a:hover{text-decoration:underline}.top nav .pill{background:#693D55;color:#fff;border-radius:999px;padding:8px 15px;font-weight:600;white-space:nowrap}.top nav .pill:hover{background:#563146;text-decoration:none}
h1,h2,h3{font-family:Newsreader,Georgia,serif;font-weight:400;letter-spacing:-.02em;line-height:1.08;color:#3B2433;text-wrap:balance}h1 em{font-weight:300;color:#693D55}.ey{font-size:12px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:#8E6178}
.ih{padding-top:26px;padding-bottom:30px}.ih h1{font-size:clamp(38px,6vw,58px);margin:10px 0 12px;max-width:14em}.ih .sub{font-size:18px;color:#4C444C}.ih .sub a{color:#693D55}
.grp{padding-bottom:26px}.grph{border-radius:12px;padding:20px 22px;margin-bottom:12px}.grph h2{font-size:30px;color:#693D55}.grph p{font-size:14.5px;color:#4C444C}
.gcs{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:12px}.gc{display:flex;flex-direction:column;gap:9px;background:#fff;border:1px solid #E6DFE2;border-radius:12px;padding:18px;text-decoration:none;transition:border-color .15s}.gc:hover{border-color:#8E6178}.gc h3{font-size:22px}.gc p{font-size:14px;color:#655B61;flex:1}.by{display:flex;align-items:center;gap:8px;font-size:12.5px;color:#655B61}.by img,.who img{border-radius:50%;object-fit:cover}.by img{width:24px;height:24px}
.band{padding:clamp(24px,5vw,48px);border-radius:12px;margin-bottom:30px}.band h1{font-size:clamp(38px,6vw,60px);margin:10px 0 12px;max-width:15em}.band .m{font-size:14px;color:#655B61}
.art{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:44px;padding-bottom:34px;align-items:start}.body{font-size:17.5px;line-height:1.65;max-width:38em}.body p{margin-bottom:16px}.body .lead{font:400 25px/1.3 Newsreader,Georgia,serif;color:#3B2433;margin-bottom:20px}.body ul{list-style:none;padding:0;margin:0 0 20px;border-top:1px solid #E6DFE2}.body li{padding:12px 0;border-bottom:1px solid #E6DFE2}
.ask{position:sticky;top:20px;background:#fff;border:1px solid #E6DFE2;border-radius:12px;padding:20px;display:flex;flex-direction:column;gap:12px;font-size:14.5px}.who{display:flex;gap:11px;align-items:center}.who img{width:52px;height:52px}.who b{display:block;font:400 22px/1.1 Newsreader,Georgia,serif}.who span{font-size:13px;color:#655B61}.btn{display:block;background:#693D55;color:#fff;text-align:center;font-weight:600;border-radius:6px;padding:12px;text-decoration:none}.btn:hover{background:#563146}.ask small{color:#655B61;font-size:12.5px}
.note{font-size:14px;color:#655B61;margin-top:22px;padding-top:14px;border-top:1px solid #E6DFE2}.note b{color:#8F2F3F;font-weight:600}.more{padding-bottom:30px}.more h2{font-size:26px;margin-bottom:12px}
.final{margin-bottom:28px;padding:28px;border-radius:12px;background:#E9C7B8 url('/portada/fluido/seda-melocoton.webp') center/cover}.fin{background:#fff;border-radius:12px;padding:22px;max-width:440px}.fin h2{font-size:27px;margin-bottom:6px}.fin p{font-size:14.5px;margin-bottom:12px}
footer{padding-top:18px;padding-bottom:40px;font-size:14px;color:#655B61}footer a{color:#693D55}
@media(max-width:760px){.w{padding:0 18px}.top{padding-top:18px;padding-bottom:18px}.art{grid-template-columns:1fr;gap:24px}.ask{position:static}.top nav a:not(.pill){display:none}.body{font-size:17px}}`;
const shell = ({ title, desc, path, ld, body }) => `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${SITE}${path}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:image" content="${SITE}/portada/compartir.jpg"><meta property="og:type" content="article"><meta property="og:locale" content="es_ES">
<meta name="theme-color" content="#FAF8F5"><link rel="icon" type="image/svg+xml" href="/app/brand/favicon.svg"><link rel="icon" type="image/png" sizes="96x96" href="/app/icons/favicon-96.png"><link rel="icon" href="/favicon.ico" sizes="48x48"><link rel="apple-touch-icon" href="/app/icons/apple-touch-icon.png">
<script type="application/ld+json">${JSON.stringify(ld)}</script><style>${CSS}</style></head><body>
<header class="w top"><a class="wm" href="/">Hera</a><nav aria-label="Principal"><a href="/guias/">Guías</a><a href="/equipo.html">El equipo</a><a class="pill" href="/app/">Abrir Hera</a></nav></header><main>${body}</main>
<footer class="w"><a href="/">Inicio</a> · <a href="/guias/">Guías</a> · <a href="/equipo.html">El equipo</a> · <a href="/privacy.html">Privacidad</a> · <a href="/support.html">Soporte</a></footer>${BEACON}</body></html>
`;
const face = (pro) => `<img src="/portada/equipo/${pro.photo}" alt="" width="52" height="52" loading="lazy">`;

const pages = PAGES.map(([q, slug, title, pro, group, sum]) => {
  const item = all.find((i) => i.q === q);
  if (!item) throw new Error(`No está en la guía: ${q}`);
  return { slug, title, pro: PRO[pro], proKey: pro, group, sum, a: item.a, desc: plain(item.a).slice(0, 150).replace(/\s\S*$/, '') + '…' };
});
const card = (p) => `<a class="gc" href="/guias/${p.slug}/"><h3>${esc(p.title)}</h3><p>${esc(p.sum)}</p><span class="by">${face(p.pro)}<span>${p.pro.name} · ${p.pro.role}</span></span></a>`;

for (const p of pages) {
  const path = `/guias/${p.slug}/`;
  const related = pages.filter((x) => x.group === p.group && x !== p).slice(0, 3);
  const ld = { '@context': 'https://schema.org', '@type': 'Article', headline: p.title, inLanguage: 'es-ES', dateModified: UPDATED, mainEntityOfPage: SITE + path,
    author: { '@type': 'Organization', name: 'Hera', url: `${SITE}/` }, publisher: { '@type': 'Organization', name: 'Hera', url: `${SITE}/` } };
  mkdirSync(`guias/${p.slug}`, { recursive: true });
  writeFileSync(`guias/${p.slug}/index.html`, shell({ title: `${p.title} · Hera`, desc: p.desc, path, ld, body: `
<div class="w"><div class="band" style="background:${TINT[p.group]}"><p class="ey">${esc(p.group)}</p><h1>${esc(p.title)}</h1><p class="m">Equipo de Hera · Actualizado el 31 de octubre de 2026</p></div>
<div class="art"><article class="body">${answer(p.a)}
<p class="note"><b>Si es urgente, llama al 112 o ve a urgencias.</b> Información general que no sustituye la valoración de un profesional.</p></article>
<aside class="ask"><div class="who">${face(p.pro)}<div><b>${p.pro.name}</b><span>${p.pro.role[0].toUpperCase()}${p.pro.role.slice(1)}</span></div></div><p>¿Tu caso es distinto? Te responde por escrito en menos de 48 h.</p><a class="btn" href="/#preguntar-${p.proKey}">Preguntar a ${p.pro.name}</a><small>Tus dos primeras consultas son gratis. Privada, sin nombre ni registro.</small></aside></div>
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
const urls = ['/guias/', ...pages.map((p) => `/guias/${p.slug}/`)].map((u) => `  <url><loc>${SITE}${u}</loc><lastmod>${UPDATED}</lastmod></url>`).join('\n');
writeFileSync('sitemap.xml', sm.replace('</urlset>', `${urls}\n</urlset>`));
console.log(`${pages.length} guías`);
