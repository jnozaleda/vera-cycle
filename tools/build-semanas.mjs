// Genera /embarazo/ (índice) y /embarazo/semana-N/ (semanas 4 a 40) con el contenido que ya usa la app:
// el bebé semana a semana (baby.js), lo normal y las dudas de cada etapa (today.js) y las pruebas (pregnancy.js).
// Para que se indexen en Google (vera-backlog#76). Uso: node tools/build-semanas.mjs · añade las URL a sitemap.xml.
// Todo el contenido es BORRADOR pendiente de revisión clínica, como en la app.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { babyCompare, babyWeek } from '../app/js/baby.js';
import { pregnancyNormal, pregnancyFaqs } from '../app/js/today.js';
import { PREGNANCY_TIMELINE, TRIMESTER_LABEL, TRIMESTER_TEXT } from '../app/js/pregnancy.js';
import { SITE, PRO, esc, shell, face } from './web-shell.mjs';

const UPDATED = '2026-11-07';
const FIRST = 4;
const LAST = 40;
const TINT = { 1: '#DCEBE4', 2: '#F4E6E8', 3: '#ECE6F0' };
const trimester = (w) => (w <= 13 ? 1 : w <= 27 ? 2 : 3);
// Pendiente de confirmar con Gonzalo si hay que ir en ayunas (vera-backlog#76): no se repite en estas páginas
const clean = (t) => t.replace(/\s*Hay que ir en ayunas\./g, '');
// Dudas que ya tienen guía propia: se enlazan
const GUIDE = [
  [/O'Sullivan/, 'test-de-o-sullivan'], [/náuseas/i, 'nauseas-en-el-embarazo'], [/alimentos/i, 'alimentos-a-evitar-en-el-embarazo'],
  [/peso/i, 'cuanto-peso-ganar-en-el-embarazo'], [/roto aguas/i, 'como-saber-si-he-roto-aguas'], [/ir al hospital/i, 'cuando-ir-al-hospital-de-parto'],
];
const guideFor = (q) => GUIDE.find(([re]) => re.test(q))?.[1];
const fmtNum = (n) => String(n).replace('.', ',');
const size = (b) => (b.g >= 1000 ? `${fmtNum(Math.round(b.g / 100) / 10)} kg` : b.g >= 1 ? `${b.g} g` : 'menos de 1 g');
// Quién responde dudas del embarazo (las dos opciones, como en la consulta)
const ASK = [['gineco', 'Embarazo, pruebas y medicación'], ['matrona', 'Síntomas, cuidados y parto']];

const weeks = [];
for (let w = FIRST; w <= LAST; w++) {
  const b = babyWeek(w);
  const t = trimester(w);
  const todo = PREGNANCY_TIMELINE.filter((x) => w >= x.from && w <= x.to)
    .map((x) => (x.rh === 'neg' ? { ...x, title: `${x.title} (si eres Rh negativo)`, text: 'Te la pondrán hacia la semana 28, y tras el parto si el bebé es Rh positivo.' } : x));
  weeks.push({
    w, t, b, todo, compare: babyCompare(w).name,
    normal: pregnancyNormal(w), faqs: pregnancyFaqs(w, { rh: 'pos' }),
    slug: `semana-${w}`,
    title: `Semana ${w} de embarazo: cómo está tu bebé y qué notas`,
    desc: `Semana ${w} de embarazo (${TRIMESTER_LABEL[t].toLowerCase()}): ${clean(b.text)} Lo normal estas semanas, las pruebas y las dudas más frecuentes.`.slice(0, 158).replace(/\s\S*$/, '') + '…',
  });
}

const navLink = (w, dir) => (w >= FIRST && w <= LAST ? `<a class="pg ${dir}" href="/embarazo/semana-${w}/"><span>${dir === 'prev' ? '← Anterior' : 'Siguiente →'}</span><b>Semana ${w}</b></a>` : '<span></span>');
// Cuerpo en Inter con etiquetas pequeñas; la serif solo en el título y las cifras del recuadro
const CSS_EXTRA = `<style>.wk{display:flex;flex-wrap:wrap;gap:12px 32px;margin:18px 0 0}.wk b{display:block;font:400 30px/1.1 Newsreader,Georgia,serif;color:#3B2433}.wk span{color:#655B61;font-size:13px}
.secs{display:flex;flex-direction:column;gap:14px;min-width:0}.sec{background:#fff;border:1px solid #E6DFE2;border-radius:12px;padding:20px 22px}.sec.tint{border:0}
.sec h2{font:600 12px/1.3 Inter,system-ui,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#8E6178;margin:0 0 10px}
.sec p,.sec li{font-size:16.5px;line-height:1.6;color:#2E2630}.sec p{margin:0}.sec .big{font-size:18px;line-height:1.55}
.sec ul{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:10px}.sec li{position:relative;padding-left:18px}.sec li:before{content:'';position:absolute;left:0;top:.62em;width:7px;height:7px;border-radius:50%;background:#B28CA0}
.sec li b{font-weight:600}
details{border-top:1px solid #EFE8EB}details:first-of-type{border-top:0}summary{cursor:pointer;list-style:none;display:flex;justify-content:space-between;gap:12px;padding:12px 0;font-weight:600;font-size:16.5px;color:#3B2433}summary::-webkit-details-marker{display:none}summary:after{content:'+';color:#8E6178;font-weight:400;font-size:20px;line-height:1}details[open] summary:after{content:'–'}
details p{padding:0 0 14px}details a{color:#693D55;font-weight:600;white-space:nowrap}
.urg{border-left:3px solid #A8435A;background:#FBEFF1;border-radius:8px;padding:12px 14px;font-size:14.5px;line-height:1.5;color:#4C444C}.urg b{color:#8F2F3F}
.ask2{position:sticky;top:20px;background:#fff;border:1px solid #E6DFE2;border-radius:12px;padding:20px;display:flex;flex-direction:column;gap:14px;font-size:14.5px}.ask2 h2{font:400 23px/1.15 Newsreader,Georgia,serif;color:#3B2433}
.pro{display:grid;grid-template-columns:48px 1fr;gap:4px 12px;align-items:center;padding-top:14px;border-top:1px solid #EFE8EB}.pro img{width:48px;height:48px;border-radius:50%;grid-row:span 2}.pro b{font-weight:600;font-size:15px}.pro span{font-size:13px;color:#655B61}.pro a{grid-column:1/-1;display:block;text-align:center;background:#693D55;color:#fff;border-radius:8px;padding:10px;font-weight:600;text-decoration:none;margin-top:6px}.pro a:hover{background:#563146}
.ask2 small{color:#655B61;font-size:13px}.ask2 .app{color:#693D55;font-size:14px}
.pager{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:22px 0 10px}.pg{display:flex;flex-direction:column;gap:2px;background:#fff;border:1px solid #E6DFE2;border-radius:12px;padding:14px 16px;text-decoration:none}.pg:hover{border-color:#8E6178}.pg span{font-size:13px;color:#655B61}.pg b{font:400 22px/1.15 Newsreader,Georgia,serif;color:#3B2433}.pg.next{text-align:right;grid-column:2}
.all{text-align:center;padding-bottom:30px}.all a{color:#693D55;font-weight:600}
@media(max-width:760px){.ask2{position:static}.sec{padding:18px}.wk b{font-size:26px}}
.wgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}.wgrid a{display:block;background:#fff;border:1px solid #E6DFE2;border-radius:12px;padding:14px;text-decoration:none}.wgrid a:hover{border-color:#8E6178}.wgrid b{display:block;font:400 22px/1.1 Newsreader,Georgia,serif;color:#3B2433}.wgrid span{font-size:13px;color:#655B61}</style>`;

for (const p of weeks) {
  const path = `/embarazo/${p.slug}/`;
  const ld = { '@context': 'https://schema.org', '@type': 'Article', headline: p.title, inLanguage: 'es-ES', dateModified: UPDATED, mainEntityOfPage: SITE + path,
    author: { '@type': 'Organization', name: 'Hera', url: `${SITE}/` }, publisher: { '@type': 'Organization', name: 'Hera', url: `${SITE}/` } };
  const faqs = p.faqs.map((f, i) => { const g = guideFor(f.q); return `<details${i === 0 ? ' open' : ''}><summary>${esc(f.q)}</summary><p>${esc(clean(f.short))}${g ? ` <a href="/guias/${g}/">Leer la guía →</a>` : ''}</p></details>`; }).join('');
  const todo = p.todo.length ? `<section class="sec tint" style="background:${TINT[p.t]}"><h2>Lo que toca estas semanas</h2><ul>${p.todo.map((x) => `<li><b>${esc(x.title)}.</b> ${esc(clean(x.text))}</li>`).join('')}</ul></section>` : '';
  const pros = ASK.map(([k, topics]) => { const pr = PRO[k]; return `<div class="pro">${face(pr)}<b>${pr.name} · ${pr.role}</b><span>${topics}</span><a href="/#preguntar-${k}">Preguntar a ${pr.name}</a></div>`; }).join('');
  mkdirSync(`embarazo/${p.slug}`, { recursive: true });
  writeFileSync(`embarazo/${p.slug}/index.html`, shell({ title: `${p.title} · Hera`, desc: p.desc, path, ld, body: `${CSS_EXTRA}
<div class="w"><div class="band" style="background:${TINT[p.t]}"><p class="ey">Embarazo · ${esc(TRIMESTER_LABEL[p.t])}</p><h1>Semana ${p.w} de embarazo</h1>
<div class="wk"><div><b>${fmtNum(p.b.cm)} cm</b><span>${esc(p.b.measure)}</span></div><div><b>${size(p.b)}</b><span>Peso aproximado</span></div><div><b>${esc(p.compare[0].toUpperCase() + p.compare.slice(1))}</b><span>Tamaño comparable</span></div></div>
<p class="m" style="margin-top:14px">Medidas medias orientativas · Actualizado el 7 nov 2026</p></div>
<div class="art"><article class="secs">
<section class="sec"><h2>Tu bebé esta semana</h2><p class="big">${esc(clean(p.b.text))}</p></section>
<section class="sec"><h2>Lo normal estas semanas</h2><ul>${p.normal.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>
${todo}
<section class="sec"><h2>Dudas frecuentes</h2>${faqs}</section>
<p class="urg"><b>Ve a urgencias o llama al 112</b> si sangras, pierdes líquido, tienes un dolor fuerte o notas que el bebé se mueve menos. Esta información es general y no sustituye la valoración de tu matrona o tu médico.</p></article>
<aside class="ask2"><h2>¿Tienes una duda de tu semana ${p.w}?</h2>${pros}<small>Te responden por escrito en menos de 48 h. Tus dos primeras consultas son gratis, sin nombre ni registro.</small><a class="app" href="/app/">Sigue tu embarazo semana a semana en Hera →</a></aside></div>
<nav class="pager" aria-label="Semanas">${navLink(p.w - 1, 'prev')}${navLink(p.w + 1, 'next')}</nav><p class="all"><a href="/embarazo/">Ver todas las semanas</a></p></div>` }));
}
mkdirSync('embarazo', { recursive: true });
writeFileSync('embarazo/index.html', shell({ title: 'Embarazo semana a semana · Hera', desc: 'Cómo está tu bebé cada semana del embarazo, qué es normal notar, qué pruebas tocan y las dudas más frecuentes, de la semana 4 a la 40.', path: '/embarazo/',
  ld: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Embarazo semana a semana', inLanguage: 'es-ES', url: `${SITE}/embarazo/` }, body: `${CSS_EXTRA}
<div class="w"><div class="ih"><p class="ey">Embarazo</p><h1>Tu embarazo, <em>semana a semana</em></h1><p class="sub">Cómo está tu bebé, qué es normal notar y qué pruebas tocan. Y si tienes una duda, <a href="/#preguntar-matrona">pregunta a Gonzalo o a Marina</a>.</p></div>
${[1, 2, 3].map((t) => `<section class="grp"><div class="grph" style="background:${TINT[t]}"><h2>${TRIMESTER_LABEL[t]}</h2><p>${esc(TRIMESTER_TEXT[t])}</p></div><div class="wgrid">${weeks.filter((p) => p.t === t).map((p) => `<a href="/embarazo/${p.slug}/"><b>Semana ${p.w}</b><span>${fmtNum(p.b.cm)} cm · ${size(p.b)}</span></a>`).join('')}</div></section>`).join('\n')}
<div class="final"><div class="fin"><h2>¿Tienes una duda de tu embarazo?</h2><p>Ginecólogo y matrona te responden por escrito en menos de 48 h.</p><a class="btn" href="/#ask">Preguntar gratis</a></div></div></div>` }));

let sm = readFileSync('sitemap.xml', 'utf8').replace(/\s*<url><loc>[^<]*\/embarazo\/[^<]*<\/loc><lastmod>[^<]*<\/lastmod><\/url>/g, '');
const urls = ['/embarazo/', ...weeks.map((p) => `/embarazo/${p.slug}/`)].map((u) => `  <url><loc>${SITE}${u}</loc><lastmod>${UPDATED}</lastmod></url>`).join('\n');
writeFileSync('sitemap.xml', sm.replace('</urlset>', `${urls}\n</urlset>`));
console.log(`${weeks.length} semanas`);
