// Genera /embarazo/ (índice) y /embarazo/semana-N/ (semanas 4 a 40) con el contenido que ya usa la app:
// el bebé semana a semana (baby.js), lo normal y las dudas de cada etapa (today.js) y las pruebas (pregnancy.js).
// Para que se indexen en Google (vera-backlog#76). Uso: node tools/build-semanas.mjs · añade las URL a sitemap.xml.
// Todo el contenido es BORRADOR pendiente de revisión clínica, como en la app.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { BABY_WEEKS, babyCompare, babyWeek } from '../app/js/baby.js';
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
const pro = PRO.matrona;

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

const navLink = (w, label) => (BABY_WEEKS[w] && w >= FIRST && w <= LAST ? `<a href="/embarazo/semana-${w}/">${label}</a>` : '<span></span>');
const CSS_EXTRA = `<style>.wk{display:flex;flex-wrap:wrap;gap:10px 28px;margin:16px 0 0;font-size:15px}.wk b{display:block;font:400 30px/1.1 Newsreader,Georgia,serif;color:#3B2433}.wk span{color:#655B61;font-size:13px}
.body h2{font-size:28px;margin:30px 0 12px}.body h2:first-child{margin-top:0}.faq{border-top:1px solid #E6DFE2;padding:14px 0}.faq h3{font-size:21px;margin-bottom:6px}.faq p{margin:0}.faq a{color:#693D55;font-size:15px}
.pn{display:flex;justify-content:space-between;gap:12px;padding:18px 0 30px;font-weight:600;color:#693D55}.pn a{text-decoration:none}.pn a:hover{text-decoration:underline}
.wgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}.wgrid a{display:block;background:#fff;border:1px solid #E6DFE2;border-radius:12px;padding:14px;text-decoration:none}.wgrid a:hover{border-color:#8E6178}.wgrid b{display:block;font:400 22px/1.1 Newsreader,Georgia,serif;color:#3B2433}.wgrid span{font-size:13px;color:#655B61}</style>`;

for (const p of weeks) {
  const path = `/embarazo/${p.slug}/`;
  const ld = { '@context': 'https://schema.org', '@type': 'Article', headline: p.title, inLanguage: 'es-ES', dateModified: UPDATED, mainEntityOfPage: SITE + path,
    author: { '@type': 'Organization', name: 'Hera', url: `${SITE}/` }, publisher: { '@type': 'Organization', name: 'Hera', url: `${SITE}/` } };
  const faqs = p.faqs.map((f) => { const g = guideFor(f.q); return `<div class="faq"><h3>${esc(f.q)}</h3><p>${esc(clean(f.short))}${g ? ` <a href="/guias/${g}/">Leer la guía completa</a>` : ''}</p></div>`; }).join('');
  const todo = p.todo.length ? `<h2>Lo que toca estas semanas</h2><ul>${p.todo.map((x) => `<li><b>${esc(x.title)}.</b> ${esc(clean(x.text))}</li>`).join('')}</ul>` : '';
  mkdirSync(`embarazo/${p.slug}`, { recursive: true });
  writeFileSync(`embarazo/${p.slug}/index.html`, shell({ title: `${p.title} · Hera`, desc: p.desc, path, ld, body: `${CSS_EXTRA}
<div class="w"><div class="band" style="background:${TINT[p.t]}"><p class="ey">Embarazo · ${esc(TRIMESTER_LABEL[p.t])}</p><h1>Semana ${p.w} de embarazo</h1>
<div class="wk"><div><b>${fmtNum(p.b.cm)} cm</b><span>${esc(p.b.measure)}, aprox.</span></div><div><b>${size(p.b)}</b><span>Peso aproximado</span></div><div><b>${esc(p.compare[0].toUpperCase() + p.compare.slice(1))}</b><span>Tamaño comparable</span></div></div>
<p class="m" style="margin-top:14px">Equipo de Hera · Actualizado el 7 de noviembre de 2026 · Medidas medias orientativas</p></div>
<div class="art"><article class="body"><h2>Tu bebé esta semana</h2><p class="lead">${esc(clean(p.b.text))}</p>
<h2>Lo normal estas semanas</h2><ul>${p.normal.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
${todo}
<h2>Dudas frecuentes</h2>${faqs}
<p class="note"><b>Si sangras, pierdes líquido, tienes un dolor fuerte o notas que el bebé se mueve menos, ve a urgencias o llama al 112.</b> Información general que no sustituye la valoración de tu matrona o tu médico.</p></article>
<aside class="ask"><div class="who">${face(pro)}<div><b>${pro.name}</b><span>Matrona</span></div></div><p>¿Tienes una duda de tu semana ${p.w}? Te responde por escrito en menos de 48 h.</p><a class="btn" href="/#preguntar-matrona">Preguntar a ${pro.name}</a><small>Tus dos primeras consultas son gratis. Privada, sin nombre ni registro.</small><a href="/app/" style="font-size:14px;color:#693D55">Sigue tu embarazo semana a semana en Hera →</a></aside></div>
<nav class="pn" aria-label="Semanas">${navLink(p.w - 1, `← Semana ${p.w - 1}`)}<a href="/embarazo/">Todas las semanas</a>${navLink(p.w + 1, `Semana ${p.w + 1} →`)}</nav></div>` }));
}

mkdirSync('embarazo', { recursive: true });
writeFileSync('embarazo/index.html', shell({ title: 'Embarazo semana a semana · Hera', desc: 'Cómo está tu bebé cada semana del embarazo, qué es normal notar, qué pruebas tocan y las dudas más frecuentes, de la semana 4 a la 40.', path: '/embarazo/',
  ld: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Embarazo semana a semana', inLanguage: 'es-ES', url: `${SITE}/embarazo/` }, body: `${CSS_EXTRA}
<div class="w"><div class="ih"><p class="ey">Embarazo</p><h1>Tu embarazo, <em>semana a semana</em></h1><p class="sub">Cómo está tu bebé, qué es normal notar y qué pruebas tocan. Y si tienes una duda, <a href="/#preguntar-matrona">pregúntale a Marina</a>.</p></div>
${[1, 2, 3].map((t) => `<section class="grp"><div class="grph" style="background:${TINT[t]}"><h2>${TRIMESTER_LABEL[t]}</h2><p>${esc(TRIMESTER_TEXT[t])}</p></div><div class="wgrid">${weeks.filter((p) => p.t === t).map((p) => `<a href="/embarazo/${p.slug}/"><b>Semana ${p.w}</b><span>${fmtNum(p.b.cm)} cm · ${size(p.b)}</span></a>`).join('')}</div></section>`).join('\n')}
<div class="final"><div class="fin"><h2>¿Tienes una duda de tu embarazo?</h2><p>Ginecólogo y matrona te responden por escrito en menos de 48 h.</p><a class="btn" href="/#ask">Preguntar gratis</a></div></div></div>` }));

let sm = readFileSync('sitemap.xml', 'utf8').replace(/\s*<url><loc>[^<]*\/embarazo\/[^<]*<\/loc><lastmod>[^<]*<\/lastmod><\/url>/g, '');
const urls = ['/embarazo/', ...weeks.map((p) => `/embarazo/${p.slug}/`)].map((u) => `  <url><loc>${SITE}${u}</loc><lastmod>${UPDATED}</lastmod></url>`).join('\n');
writeFileSync('sitemap.xml', sm.replace('</urlset>', `${urls}\n</urlset>`));
console.log(`${weeks.length} semanas`);
