// Genera /pediatria/: página solo de dudas de niños (Noza, 23 nov; por el comentario de Lucía: «la web parece toda de
// salud de la mujer»). Lucía delante, caja para escribir la duda con ejemplos, cómo funciona, un ejemplo de respuesta,
// cuándo ir a urgencias y las guías del bebé. Llevan aquí los anuncios de pediatría.
// La caja no envía nada: al pulsar «Empezar mi consulta» deja la duda en localStorage «hera-ask-prefill» (30 min) y va a
// /#preguntar-pediatra, donde la portada la recoge con Lucía ya elegida (como /menopausia/). SITE_JS añade el gclid y la
// campaña a ese enlace para que Google Ads vea la conversión.
// PENDIENTE: el ejemplo de respuesta y las señales de urgencia, revisados por Lucía.
// Uso: node tools/build-pediatria.mjs
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { SITE, esc, shell } from './web-shell.mjs';

const UPDATED = '2026-11-23';
const ico = (d, s = 20) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const CHEV = ico('<path d="m9 6 6 6-6 6"/>', 16);
const LOCK = ico('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', 13);
// Ejemplos para empezar (los temas de las guías del bebé). Al tocarlos se escriben en la caja.
const CHIPS = [
  ['Tiene fiebre', 'Tiene fiebre: '],
  ['Llora mucho, ¿son cólicos?', 'Llora mucho y no sé si son cólicos: '],
  ['No hace caca', 'No hace caca desde hace '],
  ['Le están saliendo los dientes', 'Le están saliendo los dientes y '],
  ['Granitos en la cara', 'Le han salido granitos en la cara: '],
  ['No quiere comer', 'No quiere comer: '],
];
// Señales de urgencia: sacadas de las guías del bebé (tools/data/guias-bebe.mjs). Pendientes de revisión de Lucía (vera-backlog#88).
const URG = [
  ['<path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0Z"/><path d="M12 11v6"/>', 'Fiebre con menos de 3 meses'],
  ['<path d="M12 4v8"/><path d="M12 12c-1.5-1.5-3-2-4.5-2C5.5 10 4 13 4 16.5 4 19 5.5 20 7 20c2.5 0 5-2 5-5"/><path d="M12 12c1.5-1.5 3-2 4.5-2 2 0 3.5 3 3.5 6.5 0 2.5-1.5 3.5-3 3.5-2.5 0-5-2-5-5"/>', 'Le cuesta respirar'],
  ['<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>', 'Está muy decaído o tan dormido que no se despierta para comer'],
  ['<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="8" cy="9" r="1.3"/><circle cx="15" cy="8" r="1.3"/><circle cx="11" cy="14" r="1.3"/><circle cx="16" cy="15" r="1.3"/>', 'Manchas rojas o moradas que no desaparecen al presionar la piel'],
  ['<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z"/><path d="M9 14h6"/>', 'Moja muchos menos pañales, tiene la boca seca o llora sin lágrimas'],
];
const GUIAS = [
  ['bebe-con-fiebre-que-hago', 'Mi bebé tiene fiebre, ¿qué hago?'],
  ['bebe-llora-mucho-colicos', 'Mi bebé llora mucho, ¿son cólicos?'],
  ['estrenimiento-bebe', 'Estreñimiento en el bebé'],
  ['denticion-bebe-sintomas', 'Dentición: síntomas y cómo aliviarla'],
  ['granitos-cara-bebe', 'Granitos en la cara del bebé'],
  ['bebe-no-quiere-comer', 'Mi bebé no quiere comer'],
  ['alimentacion-complementaria', 'Alimentación complementaria'],
  ['como-duerme-seguro-un-bebe', 'Cómo duerme seguro un bebé'],
];

const CSS = `<style>
.p-hero{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);gap:56px;padding-block:34px 10px;align-items:start}
.p-hero h1{font-size:clamp(36px,5.4vw,54px);margin:10px 0 14px;max-width:13em}
.p-lead{font-size:18px;color:#4F4E49;max-width:34em}
.p-doc{display:flex;gap:14px;align-items:center;margin:22px 0 18px}
.p-doc img{width:84px;height:84px;border-radius:12px;object-fit:cover;object-position:center 25%;flex:none}
.p-doc b{display:block;font:500 22px/1.2 Newsreader,Georgia,serif;color:#2F3631}.p-doc span span{display:block;font-size:13.5px;color:#6E6C67;line-height:1.45}
.p-box{background:#fff;border:1px solid #E5E1D8;border-radius:12px;padding:16px;box-shadow:0 12px 32px -24px rgba(47,54,49,.35)}
.p-box label{display:block;font-size:14px;font-weight:600;color:#45574C;margin-bottom:8px}
.p-box textarea{width:100%;min-height:108px;border:1px solid #E5E1D8;border-radius:6px;background:#FAF9F4;padding:12px 14px;font:400 16px/1.5 Inter,system-ui,sans-serif;color:#2F3631;resize:vertical}
.p-box textarea:focus{outline:none;border-color:#45574C;box-shadow:0 0 0 3px rgba(69,87,76,.18)}
.p-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.p-chips button{font:400 13px/1.3 Inter,system-ui,sans-serif;color:#45574C;background:#fff;border:1px solid #E5E1D8;border-radius:999px;padding:6px 11px;cursor:pointer}
.p-chips button:hover{border-color:#8A7045}
.p-go{display:block;background:#45574C;color:#fff;text-align:center;font-weight:600;font-size:16px;padding:14px;border-radius:8px;margin-top:12px;text-decoration:none}.p-go:hover{background:#384A3F}
.p-fine{font-size:12.5px;color:#6E6C67;text-align:center;margin-top:10px}.p-fine svg{vertical-align:-2px;margin-right:4px}
.route{margin-top:24px}.track{position:relative;height:14px;margin:0 7px}
.track .ln{position:absolute;left:0;right:0;top:6px;height:2px;background:repeating-linear-gradient(90deg,#D3CCBD 0 4px,transparent 4px 8px);background-size:16px 2px;animation:rt-flow 1.6s linear infinite}
@keyframes rt-flow{from{background-position:0 0}to{background-position:16px 0}}
.track .st,.track .halo{position:absolute;top:0;left:0;width:14px;height:14px;margin-left:-7px;border-radius:50%}
.track .st{background:#fff;border:1.5px solid #45574C}.track .s2{left:50%}.track .s3,.track .halo{left:100%;background:#45574C}
.track .halo{animation:rt-pulse 2.8s ease-out infinite}@keyframes rt-pulse{from{transform:scale(.8);opacity:.5}to{transform:scale(2.8);opacity:0}}
.track .dot{position:absolute;top:3px;width:8px;height:8px;margin-left:-4px;border-radius:50%;background:#45574C;animation:rt-go 5s ease-in-out infinite}
@keyframes rt-go{0%{left:0;opacity:0}8%{opacity:1}45%,55%{left:50%}92%{opacity:1}100%{left:100%;opacity:0}}
.route .lb{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));font-size:12.5px;color:#6E6C67;margin-top:8px;line-height:1.35}
.route .lb b{display:block;color:#2F3631;font-weight:600;font-size:13px}.route .lb div:nth-child(2){text-align:center}.route .lb div:nth-child(3){text-align:right}
.p-side{margin-top:64px;display:grid;gap:10px}
.p-tag{justify-self:start;font-size:11px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#8A7045;background:#F6E0E2;border-radius:4px;padding:3px 7px}
.p-sh{font:400 26px/1.15 Newsreader,Georgia,serif;color:#45574C}
.letter{background:#fff;border:1px solid #E5E1D8;border-radius:12px;padding:20px 22px;display:grid;gap:12px}
.letter-q{font-size:14px;color:#6E6C67;padding-bottom:12px;border-bottom:1px solid #E5E1D8}.letter-q b{color:#2F3631}
.letter-a{position:relative;font:400 17px/1.6 Newsreader,Georgia,serif;color:#2F3631}
.letter-s{display:flex;align-items:center;gap:10px;font-size:13px;color:#6E6C67}.letter-s img{width:34px;height:34px;border-radius:50%;object-fit:cover}.letter-s b{display:block;color:#2F3631;font-weight:600}
.typing{position:absolute;top:0;left:0;display:flex;align-items:center;gap:8px;font:400 13px/1.6 Inter,sans-serif;color:#6E6C67;opacity:0}
.typing i{width:6px;height:6px;border-radius:50%;background:#45574C;animation:ty-dot 1.2s infinite}.typing i:nth-child(2){animation-delay:.2s}.typing i:nth-child(3){animation-delay:.4s}
@keyframes ty-dot{0%,80%,100%{opacity:.25}40%{opacity:1}}
.stamp{justify-self:start;display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:#1E6B30;background:#E4F2E7;border-radius:999px;padding:4px 10px}
.letter-q{animation:lt-q 16s infinite}.typing{animation:lt-ty 16s infinite}.letter-a .ph{opacity:0;animation:lt-p1 16s infinite}.letter-a .ph2{animation-name:lt-p2}.letter-a .ph3{animation-name:lt-p3}
.letter-s{opacity:0;animation:lt-s 16s infinite}.stamp{opacity:0;animation:lt-st 16s infinite}
@keyframes lt-q{0%{opacity:0;transform:translateY(6px)}3%,94%{opacity:1;transform:none}100%{opacity:0}}
@keyframes lt-ty{0%,5%{opacity:0}7%,20%{opacity:1}23%,100%{opacity:0}}
@keyframes lt-p1{0%,22%{opacity:0}27%,94%{opacity:1}100%{opacity:0}}
@keyframes lt-p2{0%,31%{opacity:0}36%,94%{opacity:1}100%{opacity:0}}
@keyframes lt-p3{0%,40%{opacity:0}45%,94%{opacity:1}100%{opacity:0}}
@keyframes lt-s{0%,46%{opacity:0;transform:translateY(4px)}50%,94%{opacity:1;transform:none}100%{opacity:0}}
@keyframes lt-st{0%,51%{opacity:0;transform:scale(.9)}54%,94%{opacity:1;transform:none}100%{opacity:0}}
.p-side .note2{font-size:14px;color:#6E6C67}
.p-blk{padding-block:40px 6px;border-top:1px solid #ECE9E1;margin-top:34px}
.p-blk h2{font-size:clamp(28px,4vw,36px);margin-bottom:6px}.p-sub{font-size:16px;color:#4F4E49;margin-bottom:16px;max-width:42em}
.p-urg{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:8px}
.p-urg li{display:flex;gap:12px;align-items:center;background:#FBF1F2;border:1px solid #EFD3D6;border-radius:10px;padding:10px 12px;font-size:15px;line-height:1.4}
.p-urg span{width:36px;height:36px;border-radius:50%;background:#fff;color:#A3474F;display:flex;align-items:center;justify-content:center;flex:none}
.p-gl{display:grid;grid-template-columns:1fr 1fr;column-gap:32px;border-top:1px solid #E5E1D8}
.p-gl a{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:13px 2px;border-bottom:1px solid #E5E1D8;font-size:15.5px;font-weight:500;text-decoration:none}.p-gl a:hover{color:#45574C}.p-gl svg{color:#6E6C67;flex:none}
.p-price{display:flex;align-items:center;justify-content:space-between;gap:16px;background:#fff;border:1px solid #E5E1D8;border-radius:12px;padding:20px;margin-top:4px}
.p-price b{display:block;font:400 26px/1.2 Newsreader,Georgia,serif;color:#45574C;margin-bottom:4px}.p-price span{font-size:15px;color:#4F4E49}
.p-price a{flex:none;background:#45574C;color:#fff;border-radius:8px;padding:12px 18px;font-weight:600;text-decoration:none;white-space:nowrap}.p-price a:hover{background:#384A3F}
.p-other{display:flex;gap:10px;align-items:center;font-size:14.5px;color:#6E6C67;margin:18px 0 34px}.p-other a{color:#45574C;text-underline-offset:3px}
.p-fc{display:flex;flex:none}.p-fc img{width:32px;height:32px;border-radius:50%;object-fit:cover;border:2px solid #FAF9F4}.p-fc img+img{margin-left:-9px}
@media(max-width:860px){.p-hero{grid-template-columns:1fr;gap:30px;padding-top:22px}.p-side{margin-top:0}.p-gl{grid-template-columns:1fr}.p-price{flex-direction:column;align-items:stretch;text-align:left}.p-price a{text-align:center}.p-blk{margin-top:26px;padding-top:30px}}
@media(prefers-reduced-motion:reduce){.track .ln,.track .halo{animation:none}.track .dot,.typing{display:none}.letter-q,.letter-a .ph,.letter-s,.stamp{animation:none;opacity:1}}
</style>`;

const body = `${CSS}<div class="w">
<div class="p-hero"><div>
  <p class="ey">Pediatría · Por escrito y sin cita</p>
  <h1>Pregunta a una pediatra lo que te preocupa de tu hijo</h1>
  <p class="p-lead">La Dra. Lucía Carrascón lee tu duda y te dice <span id="p-plazo">en menos de 24 h</span> qué necesita y el precio de la respuesta completa, normalmente 5 €. <span id="p-precio">Enviarla es gratis.</span></p>
  <div class="p-doc"><img src="/portada/equipo/lucia-grande.jpg" alt="" width="84" height="84"><span><b>Dra. Lucía Carrascón</b><span>Pediatra · Hospital Gregorio Marañón</span><span>Más de 15 años con bebés y niños · Colegiada</span></span></div>
  <div class="p-box" id="duda">
    <label for="p-ta">¿Qué le pasa?</label>
    <textarea id="p-ta" maxlength="1800" placeholder="Cuéntalo como en la consulta: edad, qué le pasa y desde cuándo."></textarea>
    <div class="p-chips" aria-label="Para empezar">${CHIPS.map(([t, v]) => `<button type="button" data-chip="${esc(v)}">${esc(t)}</button>`).join('')}</div>
    <a class="p-go" id="p-go" href="/#preguntar-pediatra">Enviar mi duda <span id="p-go-p">gratis</span></a>
    <p class="p-fine">${LOCK}Solo la lee Lucía · Si no te sirve, te devolvemos el dinero</p>
  </div>
  <div class="route" aria-label="Cómo funciona"><div class="track" aria-hidden="true"><span class="ln"></span><span class="st"></span><span class="st s2"></span><span class="halo"></span><span class="st s3"></span><span class="dot"></span></div>
    <div class="lb"><div><b>1. Envías tu duda</b>sin registro</div><div><b>2. Lucía te valora</b><span id="p-r2">gratis, en 24 h</span></div><div><b>3. Te responde</b><span id="p-r3">si pagas 5 €</span></div></div></div>
</div>
<div class="p-side">
  <p class="p-tag">Ejemplo orientativo</p>
  <p class="p-sh">Así responde Lucía</p>
  <div class="letter">
    <p class="letter-q"><b>Tu duda:</b> «Mi bebé tiene 5 meses y 38,2 de fiebre desde esta mañana. Come bien y está contento. ¿Tengo que ir a urgencias?»</p>
    <p class="letter-a"><span class="typing" aria-hidden="true"><i></i><i></i><i></i>Lucía está escribiendo</span><span class="ph">Con 5 meses, si come, moja pañales y está activo, puedes vigilarle en casa y darle paracetamol si está molesto. </span><span class="ph ph2">Lo importante es cómo está él, más que el número del termómetro. </span><span class="ph ph3">Ve a urgencias si le cuesta respirar, está muy decaído o le salen manchas que no desaparecen al presionar.</span></p>
    <p class="letter-s"><img src="/portada/equipo/lucia.jpg?v=3" alt="" width="34" height="34" loading="lazy"><span><b>Dra. Lucía Carrascón</b>Pediatra · Hospital Gregorio Marañón</span></p>
    <span class="stamp">${ico('<path d="M20 6 9 17l-5-5"/>', 13)}Respondida por escrito</span>
  </div>
  <p class="note2">Personal, escrita para tu hijo, con qué hacer y cuándo ir a consulta. Si te queda algo, contestas al mismo correo.</p>
</div></div>

<section class="p-blk"><h2>Cuándo no esperar a la respuesta</h2><p class="p-sub" id="p-urg-t">Hera no atiende urgencias. Si pasa algo de esto, llama al 112 o ve a urgencias.</p>
<ul class="p-urg">${URG.map(([d, t]) => `<li><span>${ico(d)}</span>${esc(t)}</li>`).join('')}</ul></section>

<section class="p-blk"><h2>Guías para el día a día</h2><p class="p-sub">Lo que suele ser normal, cuándo consultar y cuándo ir a urgencias.</p>
<div class="p-gl">${GUIAS.map(([s, t]) => `<a href="/guias/${s}/">${esc(t)}${CHEV}</a>`).join('')}</div></section>

<section class="p-blk"><div class="p-price"><span><b id="p-pb">Enviar es gratis · respuesta completa, 5 €</b>Lucía te dice antes qué necesita y el precio; solo pagas si quieres la respuesta, por escrito y con lo que te quede por preguntar. Si no te sirve, te devolvemos el dinero.</span><a href="/#preguntar-pediatra" data-hit="precio">Pregunta a Lucía</a></div>
<p class="p-other"><span class="p-fc"><img src="/portada/equipo/gonzalo.jpg?v=2" alt="" width="32" height="32" loading="lazy"><img src="/portada/equipo/marina.jpg?v=2" alt="" width="32" height="32" loading="lazy"></span><span>¿La duda es tuya, del embarazo o la lactancia? <a href="/" data-hit="otra_profesional">Pregunta a Gonzalo o a Marina</a></span></p></section>
</div>
<script>(()=>{
const A='https://hera-consultas.tempcheck-app.workers.dev',$=(id)=>document.getElementById(id);
const off=(()=>{try{return localStorage.getItem('hera-equipo')==='1'||/^(localhost|127\\.0\\.0\\.1)$/.test(location.hostname)}catch(e){return true}})();
const sent=new Set(),h=(e)=>{if(off||sent.has(e))return;sent.add(e);fetch(A+'/hit',{method:'POST',body:JSON.stringify({e}),keepalive:true}).catch(()=>{})};
h('pediatria:visita');
const ta=$('p-ta');
// Ejemplos: se escriben en la caja para que la madre siga contando
document.querySelectorAll('[data-chip]').forEach((b)=>b.addEventListener('click',()=>{h('pediatria:ejemplo');if(!ta.value.trim())ta.value=b.dataset.chip;else ta.value=ta.value.trimEnd()+'\\n'+b.dataset.chip;ta.focus();ta.setSelectionRange(ta.value.length,ta.value.length)}));
ta.addEventListener('input',()=>h('pediatria:escribe'),{once:true});
// Ir a la portada con Lucía elegida y la duda ya escrita (la portada lee «hera-ask-prefill» si tiene menos de 30 min)
document.querySelectorAll('a[href*="preguntar-pediatra"]').forEach((a)=>a.addEventListener('click',()=>{const t=ta.value.trim();h(t?'pediatria:empezar':'pediatria:empezar_vacia');if(t){try{localStorage.setItem('hera-ask-prefill',JSON.stringify({text:t,at:Date.now()}))}catch(e){}}}));
document.querySelectorAll('[data-hit]').forEach((a)=>a.addEventListener('click',()=>h('pediatria:'+a.dataset.hit)));
// Precio y plazo: los mismos que verá en la portada (24 nov: 5 € la consulta, sin la prueba de 29 €).
// Enlaces de amigas y de las profesionales (hera-via): las primeras consultas, gratis.
try{
  const FREE=['q7m','k2v','g8w','ig_marina','reddit_gonzalo','x4d','p9t'];
  const r=JSON.parse(localStorage.getItem('hera-via')||'null');
  const free=r&&Date.now()-r.at<30*86400000&&FREE.includes(r.v);
  if(free){$('p-precio').textContent=['q7m','k2v'].includes(r.v)?'Tus 5 primeras consultas, gratis.':'Tus 2 primeras consultas son gratis: una con cada profesional.';$('p-go-p').textContent='gratis';$('p-r2').textContent='las primeras, gratis';$('p-pb').textContent='Tus primeras consultas, gratis'}
}catch(e){}
// Latinoamérica (anuncios …_latam, como /menopausia/): teléfono de urgencias de cada país
let latam=false;try{if(/_latam$/.test((new URLSearchParams(location.search).get('utm_campaign')||'').toLowerCase()))sessionStorage.setItem('hera-latam','1');latam=sessionStorage.getItem('hera-latam')==='1'}catch(e){}
if(latam)$('p-urg-t').textContent='Hera no atiende urgencias. Si pasa algo de esto, llama al número de emergencias de tu país (911 en México, 107 en Argentina, 131 en Chile, 123 en Colombia) o ve a urgencias.';
})()</script>`;

const desc = 'Pregunta a una pediatra por escrito y sin cita: la Dra. Lucía Carrascón responde tus dudas sobre la fiebre, los cólicos, la alimentación, el sueño o la piel de tu bebé o tu hijo.';
const ld = { '@context': 'https://schema.org', '@type': 'MedicalWebPage', name: 'Pediatra online: pregunta por escrito y sin cita', inLanguage: 'es-ES', url: `${SITE}/pediatria/`, dateModified: UPDATED, specialty: 'Pediatric' };
mkdirSync('pediatria', { recursive: true });
writeFileSync('pediatria/index.html', shell({ title: 'Pediatra online por escrito y sin cita · Hera', desc, path: '/pediatria/', ld, body }));
let sm = readFileSync('sitemap.xml', 'utf8');
if (!sm.includes(`${SITE}/pediatria/`)) writeFileSync('sitemap.xml', sm.replace('</urlset>', `  <url><loc>${SITE}/pediatria/</loc><lastmod>${UPDATED}</lastmod></url>\n</urlset>`));
console.log('pediatria/index.html');
