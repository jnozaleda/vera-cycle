// Genera /ciclo/ (las fases del ciclo menstrual) y una página por fase, para buscadores (vera-backlog#76).
// Uso: node tools/build-ciclo.mjs · añade las URL a sitemap.xml. Textos BORRADOR en tools/data/ciclo-fases.mjs.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { PHASE_PAGES, CYCLE_INTRO } from './data/ciclo-fases.mjs';
import { SITE, esc, shell, askBox, stickyAsk } from './web-shell.mjs';

const UPDATED = '2026-11-08';
const ASK = [['gineco', 'Regla, ciclo y anticoncepción'], ['matrona', 'Fertilidad y salud sexual']];
const list = (items) => `<ul>${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
const CSS_EXTRA = `<style>.wk{display:flex;flex-wrap:wrap;gap:12px 32px;margin:18px 0 0}.wk b{display:block;font:400 26px/1.15 Newsreader,Georgia,serif;color:#45574C}.wk span{color:#6E6C67;font-size:13px}
.pager{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:22px 0 10px}.pg{display:flex;flex-direction:column;gap:2px;background:#fff;border:1px solid #E5E1D8;border-radius:12px;padding:14px 16px;text-decoration:none}.pg:hover{border-color:#8A7045}.pg span{font-size:13px;color:#6E6C67}.pg b{font:400 22px/1.15 Newsreader,Georgia,serif;color:#45574C}.pg.next{text-align:right;grid-column:2}
.all{text-align:center;padding-bottom:30px}.all a{color:#45574C;font-weight:600}
.phs{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;padding-bottom:28px}.ph{display:flex;flex-direction:column;gap:6px;border-radius:12px;padding:20px;text-decoration:none}.ph b{font:400 26px/1.1 Newsreader,Georgia,serif;color:#45574C}.ph span{font-size:13px;font-weight:600;color:#8A7045;letter-spacing:.04em}.ph p{font-size:14.5px;color:#4F4E49}
@media(max-width:760px){.wk b{font-size:23px}}</style>`;
const navLink = (i, dir) => { const p = PHASE_PAGES[i]; return p ? `<a class="pg ${dir}" href="/ciclo/${p.slug}/"><span>${dir === 'prev' ? '← Anterior' : 'Siguiente →'}</span><b>${p.name}</b></a>` : '<span></span>'; };

PHASE_PAGES.forEach((p, i) => {
  const path = `/ciclo/${p.slug}/`;
  const ld = { '@context': 'https://schema.org', '@type': 'Article', headline: p.title, inLanguage: 'es-ES', dateModified: UPDATED, mainEntityOfPage: SITE + path,
    author: { '@type': 'Organization', name: 'Hera', url: `${SITE}/` }, publisher: { '@type': 'Organization', name: 'Hera', url: `${SITE}/` } };
  const faqs = p.faqs.map(([q, a], k) => `<details${k === 0 ? ' open' : ''}><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('');
  mkdirSync(`ciclo/${p.slug}`, { recursive: true });
  writeFileSync(`ciclo/${p.slug}/index.html`, shell({ title: `${p.title} · Hera`, desc: `${p.lead}`.slice(0, 158).replace(/\s\S*$/, '') + '…', path, ld, body: `${CSS_EXTRA}
<div class="w"><div class="band" style="background:${p.tint}"><p class="ey"><a href="/ciclo/" style="text-decoration:none">Ciclo menstrual</a> · Fase ${i + 1} de 4</p><h1>${esc(p.name)}</h1>
<div class="wk"><div><b>${esc(p.days)}</b><span>En un ciclo de 28 días</span></div><div><b>${esc(p.length)}</b><span>Duración</span></div><div><b>${esc(p.hormone)}</b><span>Hormonas</span></div></div>
<p class="m" style="margin-top:14px">Días orientativos: cada ciclo es distinto</p></div>
<div class="art"><article class="secs">
<section class="sec"><h2>Qué es</h2><p class="big">${esc(p.lead)}</p></section>
<section class="sec"><h2>Qué pasa en tu cuerpo</h2>${list(p.cuerpo)}</section>
<section class="sec"><h2>Qué puedes notar</h2>${list(p.notas)}</section>
<section class="sec tint" style="background:${p.tint}"><h2>Qué te puede ayudar</h2>${list(p.ayuda)}</section>
<section class="sec"><h2>Dudas frecuentes</h2>${faqs}</section>
<section class="sec"><h2>Cuándo consultar</h2>${list(p.consulta)}</section>
<p class="urg"><b>Ve a urgencias o llama al 112</b> si tienes un sangrado muy abundante con mareo, un dolor muy fuerte y repentino o fiebre con dolor de tripa. Esta información es general y no sustituye la valoración de un profesional.</p></article>
${askBox('¿Tienes una duda sobre tu ciclo?', ASK, (p.slug === 'ovulacion' ? '<a class="app" href="/calculadoras/ovulacion/">Calcula tus días fértiles →</a>' : '') + '<a class="app" href="/app/">Sigue tu ciclo y tus fases en Hera →</a>')}</div>
<nav class="pager" aria-label="Fases">${navLink(i - 1, 'prev')}${navLink(i + 1, 'next')}</nav><p class="all"><a href="/ciclo/">Ver las cuatro fases</a></p></div>${stickyAsk(['gineco'], '¿Una duda sobre tu ciclo?')}` }));
});

mkdirSync('ciclo', { recursive: true });
writeFileSync('ciclo/index.html', shell({ title: 'Las fases del ciclo menstrual · Hera', desc: 'Las cuatro fases del ciclo menstrual explicadas: regla, fase folicular, ovulación y fase lútea. Qué pasa en tu cuerpo, qué notas y cuándo consultar.', path: '/ciclo/',
  ld: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Las fases del ciclo menstrual', inLanguage: 'es-ES', url: `${SITE}/ciclo/` }, body: `${CSS_EXTRA}
<div class="w"><div class="ih"><p class="ey">Ciclo menstrual</p><h1>Las fases de tu ciclo, <em>explicadas</em></h1><p class="sub">${esc(CYCLE_INTRO.lead)}</p></div>
<div class="phs">${PHASE_PAGES.map((p) => `<a class="ph" href="/ciclo/${p.slug}/" style="background:${p.tint}"><span>${esc(p.days)}</span><b>${esc(p.name)}</b><p>${esc(p.lead.split('. ')[0])}.</p></a>`).join('')}</div>
<section class="sec" style="margin-bottom:28px"><h2>Para entenderlo</h2>${list(CYCLE_INTRO.points)}</section>
<div class="final"><div class="fin"><h2>¿Tienes una duda sobre tu ciclo?</h2><p>Ginecólogo y matrona te responden por escrito en menos de 48 h.</p><a class="btn" href="/#preguntar-gineco">Preguntar gratis</a></div></div></div>` }));

let sm = readFileSync('sitemap.xml', 'utf8').replace(/\s*<url><loc>[^<]*\/ciclo\/[^<]*<\/loc><lastmod>[^<]*<\/lastmod><\/url>/g, '');
const urls = ['/ciclo/', ...PHASE_PAGES.map((p) => `/ciclo/${p.slug}/`)].map((u) => `  <url><loc>${SITE}${u}</loc><lastmod>${UPDATED}</lastmod></url>`).join('\n');
writeFileSync('sitemap.xml', sm.replace('</urlset>', `${urls}\n</urlset>`));
console.log(`${PHASE_PAGES.length} fases`);
