// Genera /bebe/ (índice) y /bebe/mes-N/ (1 a 12 meses): hitos, comida y sueño, lo que toca, cuándo consultar y las
// dudas de la app para esa edad (today.js). Para buscadores (vera-backlog#76). Uso: node tools/build-bebe.mjs · añade a sitemap.xml.
// Textos BORRADOR pendientes de revisión de la pediatra (tools/data/bebe-meses.mjs).
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { postpartumFaqs } from '../app/js/today.js';
import { MONTHS } from './data/bebe-meses.mjs';
import { SITE, esc, shell, askBox, stickyAsk } from './web-shell.mjs';

const UPDATED = '2026-11-08';
const TINT = ['#F6E0E2', '#E4E2F4', '#DCEBE4'];
const tint = (m) => TINT[m <= 3 ? 0 : m <= 6 ? 1 : 2];
const STAGE = (m) => (m <= 3 ? 'Primeros meses' : m <= 6 ? 'De 4 a 6 meses' : 'De 7 a 12 meses');
const fmt = (n) => n.toFixed(1).replace('.', ',');
const label = (m) => (m === 12 ? '12 meses (1 año)' : m === 1 ? '1 mes' : `${m} meses`);
const GUIDE = [[/fiebre/i, 'bebe-con-fiebre-que-hago'], [/duerme/i, 'como-duerme-seguro-un-bebe'], [/llora/i, 'bebe-llora-mucho-colicos'], [/amarillo/i, 'bebe-amarillo-ictericia']];
const guideFor = (q) => GUIDE.find(([re]) => re.test(q))?.[1];
const ASK = [['pediatra', 'Fiebre, sueño, piel y desarrollo'], ['matrona', 'Lactancia y cuidados del bebé']];

const pages = Object.entries(MONTHS).map(([k, d]) => {
  const m = Number(k);
  return { m, d, slug: `mes-${m}`, faqs: postpartumFaqs(Math.round(m * 4.35), 'baby'),
    title: `Bebé de ${label(m)}: qué hace, cuánto pesa y qué le toca`,
    desc: `Bebé de ${label(m)}: ${d.hace[0].toLowerCase()} Peso y longitud orientativos, comida y sueño, vacunas y revisiones y cuándo consultar.`.slice(0, 158).replace(/\s\S*$/, '') + '…' };
});

const CSS_EXTRA = `<style>.wk{display:flex;flex-wrap:wrap;gap:12px 32px;margin:18px 0 0}.wk b{display:block;font:400 30px/1.1 Newsreader,Georgia,serif;color:#45574C}.wk span{color:#6E6C67;font-size:13px}
.pager{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:22px 0 10px}.pg{display:flex;flex-direction:column;gap:2px;background:#fff;border:1px solid #E5E1D8;border-radius:12px;padding:14px 16px;text-decoration:none}.pg:hover{border-color:#8A7045}.pg span{font-size:13px;color:#6E6C67}.pg b{font:400 22px/1.15 Newsreader,Georgia,serif;color:#45574C}.pg.next{text-align:right;grid-column:2}
.all{text-align:center;padding-bottom:30px}.all a{color:#45574C;font-weight:600}
.wgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}.wgrid a{display:block;background:#fff;border:1px solid #E5E1D8;border-radius:12px;padding:14px;text-decoration:none}.wgrid a:hover{border-color:#8A7045}.wgrid b{display:block;font:400 22px/1.1 Newsreader,Georgia,serif;color:#45574C}.wgrid span{font-size:13px;color:#6E6C67}
@media(max-width:760px){.wk b{font-size:26px}}</style>`;
const navLink = (m, dir) => (MONTHS[m] ? `<a class="pg ${dir}" href="/bebe/mes-${m}/"><span>${dir === 'prev' ? '← Anterior' : 'Siguiente →'}</span><b>${label(m)[0].toUpperCase()}${label(m).slice(1)}</b></a>` : '<span></span>');
const list = (items) => `<ul>${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;

for (const p of pages) {
  const path = `/bebe/${p.slug}/`;
  const ld = { '@context': 'https://schema.org', '@type': 'Article', headline: p.title, inLanguage: 'es-ES', dateModified: UPDATED, mainEntityOfPage: SITE + path,
    author: { '@type': 'Organization', name: 'Hera', url: `${SITE}/` }, publisher: { '@type': 'Organization', name: 'Hera', url: `${SITE}/` } };
  const faqs = p.faqs.map((f, i) => { const g = guideFor(f.q); return `<details${i === 0 ? ' open' : ''}><summary>${esc(f.q)}</summary><p>${esc(f.short)}${g ? ` <a href="/guias/${g}/">Leer la guía →</a>` : ''}</p></details>`; }).join('');
  mkdirSync(`bebe/${p.slug}`, { recursive: true });
  writeFileSync(`bebe/${p.slug}/index.html`, shell({ title: `${p.title} · Hera`, desc: p.desc, path, ld, body: `${CSS_EXTRA}
<div class="w"><div class="band" style="background:${tint(p.m)}"><p class="ey"><a href="/bebe/" style="text-decoration:none">Tu bebé</a> · ${STAGE(p.m)}</p><h1>Bebé de ${label(p.m)}</h1>
<div class="wk"><div><b>${fmt(p.d.kg[0])} – ${fmt(p.d.kg[1])} kg</b><span>Peso medio (niñas – niños)</span></div><div><b>${fmt(p.d.cm[0])} – ${fmt(p.d.cm[1])} cm</b><span>Longitud media (niñas – niños)</span></div></div>
<p class="m" style="margin-top:14px">Medianas de la OMS, orientativas: cada bebé sigue su propia curva</p></div>
<div class="art"><article class="secs">
<section class="sec"><h2>Qué hace a esta edad</h2>${list(p.d.hace)}<p style="margin-top:12px;font-size:14.5px;color:#6E6C67">Cada bebé tiene su ritmo: estas edades son orientativas.</p></section>
<section class="sec"><h2>Comida y sueño</h2>${list(p.d.come)}</section>
<section class="sec tint" style="background:${tint(p.m)}"><h2>Lo que toca</h2><ul>${p.d.toca.map(([t, x]) => `<li><b>${esc(t)}.</b> ${esc(x)}</li>`).join('')}</ul></section>
<section class="sec"><h2>Dudas frecuentes</h2>${faqs}</section>
<section class="sec"><h2>Cuándo consultar</h2>${list(p.d.consulta)}</section>
<p class="urg"><b>Ve a urgencias o llama al 112</b> si le cuesta respirar, está muy decaído, tiene manchas en la piel que no desaparecen al presionar o convulsiona. Esta información es general y no sustituye la valoración de su pediatra.</p></article>
${askBox(`¿Tienes una duda de tu bebé de ${label(p.m)}?`, ASK, '<a class="app" href="/app/">Sigue a tu bebé mes a mes en Hera →</a>')}</div>
<nav class="pager" aria-label="Meses">${navLink(p.m - 1, 'prev')}${navLink(p.m + 1, 'next')}</nav><p class="all"><a href="/bebe/">Ver todos los meses</a></p></div>${stickyAsk(['pediatra'], '¿Una duda de tu bebé?')}` }));
}

mkdirSync('bebe', { recursive: true });
const groups = [[1, 3], [4, 6], [7, 12]];
writeFileSync('bebe/index.html', shell({ title: 'Tu bebé mes a mes · Hera', desc: 'Qué hace tu bebé cada mes del primer año, peso y longitud orientativos, comida y sueño, vacunas y revisiones y cuándo consultar.', path: '/bebe/',
  ld: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Tu bebé mes a mes', inLanguage: 'es-ES', url: `${SITE}/bebe/` }, body: `${CSS_EXTRA}
<div class="w"><div class="ih"><p class="ey">Tu bebé</p><h1>Tu bebé, <em>mes a mes</em></h1><p class="sub">Qué hace, cuánto suele pesar y qué le toca durante su primer año. Y si tienes una duda, <a href="/#preguntar-pediatra">pregúntale a Lucía</a>.</p></div>
${groups.map(([a, b]) => `<section class="grp"><div class="grph" style="background:${tint(a)}"><h2>${STAGE(a)}</h2></div><div class="wgrid">${pages.filter((p) => p.m >= a && p.m <= b).map((p) => `<a href="/bebe/${p.slug}/"><b>${label(p.m)[0].toUpperCase()}${label(p.m).slice(1)}</b><span>${fmt(p.d.kg[0])}–${fmt(p.d.kg[1])} kg</span></a>`).join('')}</div></section>`).join('\n')}
<div class="final"><div class="fin"><h2>¿Tienes una duda de tu bebé?</h2><p>Pediatra y matrona te responden por escrito en menos de 48 h.</p><a class="btn" href="/#ask">Preguntar gratis</a></div></div></div>` }));

let sm = readFileSync('sitemap.xml', 'utf8').replace(/\s*<url><loc>[^<]*\/bebe\/[^<]*<\/loc><lastmod>[^<]*<\/lastmod><\/url>/g, '');
const urls = ['/bebe/', ...pages.map((p) => `/bebe/${p.slug}/`)].map((u) => `  <url><loc>${SITE}${u}</loc><lastmod>${UPDATED}</lastmod></url>`).join('\n');
writeFileSync('sitemap.xml', sm.replace('</urlset>', `${urls}\n</urlset>`));
console.log(`${pages.length} meses`);
