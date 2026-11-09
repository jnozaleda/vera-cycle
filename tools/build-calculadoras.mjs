// Genera /calculadoras/ y tres calculadoras (fecha de parto, peso en el embarazo, ovulación) para buscadores (vera-backlog#76).
// El cálculo se hace en el navegador: los datos no salen del móvil. Uso: node tools/build-calculadoras.mjs · añade a sitemap.xml.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { SITE, esc, shell, askBox, stickyAsk } from './web-shell.mjs';

const UPDATED = '2026-11-09';
const API = 'https://hera-consultas.tempcheck-app.workers.dev';
const CSS = `<style>.calc{display:flex;flex-direction:column;gap:14px}.calc label{display:flex;flex-direction:column;gap:6px;font-size:14.5px;font-weight:600;color:#3B2433}
.calc input[type=date],.calc input[type=number]{font:16px Inter,system-ui,sans-serif;padding:12px 14px;border:1px solid #D9CFD4;border-radius:10px;background:#fff;color:#2E2630;width:100%}
.calc .row{display:grid;grid-template-columns:1fr 1fr;gap:12px}.calc .ck{flex-direction:row;align-items:center;gap:10px;font-weight:500}.calc .ck input{width:18px;height:18px;accent-color:#693D55}
.calc button{font:600 16px Inter,system-ui,sans-serif;background:#693D55;color:#fff;border:0;border-radius:10px;padding:14px;cursor:pointer}.calc button:hover{background:#563146}
.calc .hint{font-size:13px;color:#655B61;font-weight:400}.err{color:#8F2F3F;font-size:14px}
.res{display:none}.res.on{display:flex;flex-direction:column;gap:14px}.big3{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.big3 div{background:#F4E6E8;border-radius:10px;padding:12px 14px}.big3 b{display:block;font:400 25px/1.1 Newsreader,Georgia,serif;color:#3B2433}.big3 span{display:block;font-size:13px;color:#655B61;margin-top:4px}
.go{display:block;text-align:center;background:#693D55;color:#fff;border-radius:10px;padding:13px;font-weight:600;text-decoration:none}.go.alt{background:#fff;color:#693D55;border:1.5px solid #693D55}
.days{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}.days div{border-radius:7px;padding:6px 2px;text-align:center;font-size:12px;line-height:1.2;background:#F4F0F2;color:#655B61}.days b{display:block;font-size:14px;color:#2E2630}
.days .p{background:#F1D3D8}.days .f{background:#DCEBE4}.days .o{background:#3E8E63;color:#fff}.days .o b{color:#fff}.days .t{outline:2px solid #693D55}
.leg{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:13px;color:#4C444C}.leg i{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:5px;vertical-align:-1px}
.cards3{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;padding-bottom:28px}.cc{display:flex;flex-direction:column;gap:6px;border-radius:12px;padding:20px;text-decoration:none}.cc b{font:400 26px/1.1 Newsreader,Georgia,serif;color:#3B2433}.cc p{font-size:14.5px;color:#4C444C}
@media(max-width:760px){.big3{grid-template-columns:1fr 1fr}.big3 b{font-size:22px}}</style>`;
const list = (items) => `<ul>${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
const faqs = (qa) => qa.map(([q, a], i) => `<details${i === 0 ? ' open' : ''}><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('');
// Utilidades de fecha en el navegador (días enteros en UTC) y aviso anónimo de uso
const JS_BASE = `const $=(id)=>document.getElementById(id);const DAY=864e5;
const dn=(s)=>{const m=/^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(s||'');return m?Math.round(Date.UTC(+m[1],m[2]-1,+m[3])/DAY):null};
const today=()=>{const d=new Date();return Math.round(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())/DAY)};
const fmt=(n,o={day:'numeric',month:'long',year:'numeric'})=>new Intl.DateTimeFormat('es-ES',{...o,timeZone:'UTC'}).format(new Date(n*DAY));
const hit=(e)=>{if(['localhost','127.0.0.1'].includes(location.hostname))return;fetch('${API}/hit',{method:'POST',body:JSON.stringify({e}),keepalive:true}).catch(()=>{})};
$('f').max=new Date().toISOString().slice(0,10);`;

const CALCS = [
  {
    slug: 'fecha-de-parto', name: 'Fecha de parto', tint: '#DCEBE4', pro: ['gineco', 'matrona'], ask: [['gineco', 'Embarazo, pruebas y medicación'], ['matrona', 'Síntomas, cuidados y parto']], stick: '¿Tienes una duda?',
    title: 'Calculadora de fecha de parto y semanas de embarazo', h1: 'Calcula tu fecha de parto',
    desc: 'Calcula tu fecha probable de parto y en qué semana de embarazo estás a partir del primer día de tu última regla. Gratis, sin registro y sin enviar tus datos.',
    lead: 'Con el primer día de tu última regla te decimos tu fecha probable de parto, en qué semana estás hoy y qué te toca ahora.',
    form: `<label>Primer día de tu última regla<input type="date" id="f" required></label>
<label>Duración habitual de tu ciclo (días)<input type="number" id="c" min="21" max="45" value="28" inputmode="numeric"><span class="hint">Si no lo sabes, deja 28.</span></label>`,
    result: `<div class="big3"><div><b id="r1"></b><span>Fecha probable de parto</span></div><div><b id="r2"></b><span>Semana de embarazo hoy</span></div><div><b id="r3"></b><span>Trimestre</span></div></div><p id="r4"></p><a class="go" id="r5" href="/embarazo/">Ver tu semana</a><a class="go alt" href="/app/">Sigue tu embarazo en Hera</a>`,
    js: `$('btn').onclick=()=>{const f=dn($('f').value),c=Math.min(45,Math.max(21,+$('c').value||28));$('e').textContent='';
if(f==null){$('e').textContent='Elige la fecha de tu última regla.';return}const t=today();if(f>t){$('e').textContent='La fecha no puede ser futura.';return}
const due=f+280+(c-28),ga=t-f-(c-28),w=Math.floor(ga/7),d=ga%7;if(w>44){$('e').textContent='Esa fecha es de hace más de 44 semanas: revísala.';return}
$('r1').textContent=fmt(due);$('r2').textContent=w<0?'—':w+'+'+d;$('r3').textContent=w<14?'Primero':w<28?'Segundo':'Tercero';
$('r4').textContent=w<4?'Aún es muy pronto: un test de embarazo suele dar positivo a partir del primer día de retraso.':w>=40?'Ya has llegado a tu fecha probable: solo una minoría nace justo ese día, lo normal es entre la semana 37 y la 42.':'Faltan '+Math.ceil((due-t)/7)+' semanas para tu fecha probable de parto.';
const ws=Math.min(40,Math.max(4,w));$('r5').href='/embarazo/semana-'+ws+'/';$('r5').textContent='Ver la semana '+ws+' de embarazo →';$('res').classList.add('on');hit('calculadora:parto');$('res').scrollIntoView({behavior:'smooth',block:'start'})};`,
    how: ['Se suman 280 días (40 semanas) al primer día de tu última regla: es la regla de Naegele que usan los profesionales.', 'Si tu ciclo dura más o menos de 28 días, se ajusta la fecha en esos días de diferencia.', 'En la ecografía del primer trimestre te darán la fecha definitiva: si no coincide, manda la de la ecografía.'],
    qa: [['¿Por qué las semanas se cuentan desde la regla y no desde la concepción?', 'Porque el día de la concepción casi nunca se sabe y el de la regla sí. Por eso, en la semana 4 de embarazo el embrión tiene en realidad unas 2 semanas.'], ['¿Cuántas mujeres dan a luz en su fecha probable de parto?', 'Muy pocas, en torno a 1 de cada 20. Lo normal es dar a luz entre la semana 37 y la 42.'], ['¿Y si no recuerdo la fecha de mi última regla?', 'Pon la que creas más probable y confírmala en la primera ecografía, que es la que fija la fecha.']],
  },
  {
    slug: 'peso-en-el-embarazo', name: 'Peso en el embarazo', tint: '#F3E9DC', pro: ['matrona'], ask: [['matrona', 'Alimentación, peso y cuidados'], ['gineco', 'Embarazo, pruebas y medicación']], stick: '¿Tu caso es distinto?',
    title: 'Calculadora de peso en el embarazo: cuántos kilos ganar', h1: '¿Cuánto peso me toca ganar?',
    desc: 'Calcula cuántos kilos es normal ganar en el embarazo según tu peso y altura antes de quedarte embarazada, y lo esperable en tu semana. Gratis y sin enviar tus datos.',
    lead: 'Con tu altura y tu peso de antes del embarazo calculamos tu índice de masa corporal y cuántos kilos es habitual ganar en total y en tu semana.',
    form: `<div class="row"><label>Altura (cm)<input type="number" id="h" min="130" max="210" inputmode="numeric" placeholder="165"></label><label>Peso antes del embarazo (kg)<input type="number" id="k" min="35" max="200" inputmode="decimal" placeholder="60"></label></div>
<label>Semana de embarazo (opcional)<input type="number" id="w" min="1" max="42" inputmode="numeric" placeholder="20"></label>
<label class="ck"><input type="checkbox" id="m"> Espero gemelos o más</label><input type="hidden" id="f">`,
    result: `<div class="big3"><div><b id="r1"></b><span>Tu IMC antes del embarazo</span></div><div><b id="r2"></b><span>Ganancia total habitual</span></div><div><b id="r3"></b><span>Lo esperable en tu semana</span></div></div><p id="r4"></p><a class="go" href="/guias/cuanto-peso-ganar-en-el-embarazo/">Leer la guía del peso</a><a class="go alt" href="/app/">Lleva tu peso semana a semana en Hera</a>`,
    js: `import('/app/js/care.js').then(({bmi,gainRange,gainBandAt})=>{const f1=(x)=>String(Math.round(x*10)/10).replace('.',',');
$('btn').onclick=()=>{$('e').textContent='';const b=bmi(+$('h').value,+$('k').value);if(b==null){$('e').textContent='Revisa la altura (en cm) y el peso (en kg).';return}
const r=gainRange(b,$('m').checked?'multiple':'single');const cat=b<18.5?'bajo peso':b<25?'peso normal':b<30?'sobrepeso':'obesidad';
$('r1').textContent=f1(b);$('r2').textContent=r?f1(r.low)+'–'+f1(r.high)+' kg':'—';const w=+$('w').value;
if(r&&w>=1&&w<=42){const band=gainBandAt(w,r);$('r3').textContent=f1(band.low)+'–'+f1(band.high)+' kg'}else $('r3').textContent='—';
$('r4').textContent='Partes de '+cat+'.'+(r?'':' Con gemelos y bajo peso no hay un rango de referencia: pregunta a tu matrona.')+' Son rangos orientativos: tu matrona te dirá el tuyo.';
$('res').classList.add('on');hit('calculadora:peso');$('res').scrollIntoView({behavior:'smooth',block:'start'})}});`,
    how: ['Calculamos tu índice de masa corporal (IMC) con tu peso y altura de antes del embarazo.', 'Según el IMC, se usa el rango de ganancia total de referencia internacional: de 11,5 a 16 kg si partes de un peso normal.', 'Para tu semana: entre 0,5 y 2 kg al final del primer trimestre y, desde ahí, un aumento progresivo hasta la semana 40.'],
    qa: [['¿Es malo ganar más peso del recomendado?', 'Ganar mucho más aumenta el riesgo de diabetes del embarazo, tensión alta o un bebé muy grande. Ganar mucho menos también tiene riesgos. Si te sales del rango, coméntalo con tu matrona.'], ['¿Tengo que comer por dos?', 'No. En el primer trimestre no hace falta comer más; en el segundo y el tercero, solo un poco más, unas 300 a 450 kilocalorías al día.'], ['¿Y si he perdido peso por las náuseas?', 'Al principio es frecuente y suele recuperarse. Consulta si vomitas casi todo o sigues perdiendo peso.']],
  },
  {
    slug: 'ovulacion', name: 'Ovulación', tint: '#ECE6F0', pro: ['gineco'], ask: [['gineco', 'Regla, ciclo y anticoncepción'], ['matrona', 'Fertilidad y salud sexual']], stick: '¿Una duda sobre tu ciclo?',
    title: 'Calculadora de ovulación y días fértiles', h1: '¿Cuándo ovulo?',
    desc: 'Calcula tus días fértiles, tu día de ovulación aproximado y tu próxima regla a partir de tu última regla y la duración de tu ciclo. Gratis y sin enviar tus datos.',
    lead: 'Con el primer día de tu última regla y la duración de tu ciclo te marcamos tus días fértiles, la ovulación aproximada y la próxima regla.',
    form: `<label>Primer día de tu última regla<input type="date" id="f" required></label>
<label>Duración de tu ciclo (días)<input type="number" id="c" min="21" max="45" value="28" inputmode="numeric"><span class="hint">Del primer día de una regla al día antes de la siguiente. Si no lo sabes, deja 28.</span></label>`,
    result: `<div class="big3"><div><b id="r1"></b><span>Días fértiles</span></div><div><b id="r2"></b><span>Ovulación aproximada</span></div><div><b id="r3"></b><span>Próxima regla</span></div></div>
<div class="days" id="cal"></div><div class="leg"><span><i style="background:#F1D3D8"></i>Regla</span><span><i style="background:#DCEBE4"></i>Días fértiles</span><span><i style="background:#3E8E63"></i>Ovulación</span></div>
<p class="err" style="color:#4C444C"><b>No sirve como método anticonceptivo.</b> Es una estimación: la ovulación puede adelantarse o retrasarse en cualquier ciclo.</p><a class="go" href="/ciclo/ovulacion/">Cómo saber cuándo ovulas</a><a class="go alt" href="/app/">Sigue tu ciclo en Hera</a>`,
    js: `$('btn').onclick=()=>{const f=dn($('f').value),c=Math.min(45,Math.max(21,+$('c').value||28));$('e').textContent='';
if(f==null){$('e').textContent='Elige la fecha de tu última regla.';return}const t=today();if(f>t){$('e').textContent='La fecha no puede ser futura.';return}
let s=f;while(s+c<=t-1)s+=c;const ov=s+c-14,fs=ov-5,nx=s+c;const sh={day:'numeric',month:'short'};
$('r1').textContent=fmt(fs,sh)+' – '+fmt(ov,sh);$('r2').textContent=fmt(ov,sh);$('r3').textContent=fmt(nx,sh);
let h='';for(let d=s;d<s+c;d++){const k=d-s<5?'p':d===ov?'o':d>=fs&&d<ov?'f':'';h+='<div class="'+k+(d===t?' t':'')+'"><b>'+new Date(d*DAY).getUTCDate()+'</b>'+fmt(d,{month:'short'}).replace('.','')+'</div>'}
$('cal').innerHTML=h;$('res').classList.add('on');hit('calculadora:ovulacion');$('res').scrollIntoView({behavior:'smooth',block:'start'})};`,
    how: ['La ovulación suele llegar unos 14 días antes de la regla siguiente: con un ciclo de 28 días, hacia el día 14; con uno de 32, hacia el 18.', 'Los días fértiles son unos 6: los 5 anteriores a la ovulación y el propio día, porque los espermatozoides viven hasta 5 días.', 'Si tus ciclos son irregulares, el cálculo es menos fiable: los test de ovulación de farmacia ayudan a afinar.'],
    qa: [['¿Puedo usar esta calculadora para no quedarme embarazada?', 'No. Es una estimación y la ovulación puede variar de un ciclo a otro. Si no buscas embarazo, usa un método anticonceptivo eficaz.'], ['¿Cuál es el mejor momento para buscar embarazo?', 'Los 2 o 3 días antes de la ovulación y el propio día. Mantener relaciones cada 1 o 2 días en la ventana fértil es suficiente.'], ['¿Y si mis ciclos son irregulares?', 'Usa la duración media de tus últimos ciclos y fíjate en el flujo: cuando es transparente y elástico, como clara de huevo, la ovulación está cerca.']],
  },
];

for (const c of CALCS) {
  const path = `/calculadoras/${c.slug}/`;
  const ld = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'WebApplication', name: c.title, url: SITE + path, applicationCategory: 'HealthApplication', operatingSystem: 'Web', inLanguage: 'es-ES', offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' } },
    { '@type': 'FAQPage', mainEntity: c.qa.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
  ] };
  mkdirSync(`calculadoras/${c.slug}`, { recursive: true });
  writeFileSync(`calculadoras/${c.slug}/index.html`, shell({ title: `${c.title} · Hera`, desc: c.desc, path, ld, body: `${CSS}
<div class="w"><div class="band" style="background:${c.tint}"><p class="ey"><a href="/calculadoras/" style="text-decoration:none">Calculadoras</a> · Gratis y sin registro</p><h1>${esc(c.h1)}</h1><p class="m" style="font-size:16px;color:#4C444C;max-width:36em">${esc(c.lead)}</p></div>
<div class="art"><article class="secs">
<section class="sec"><h2>Tus datos</h2><div class="calc">${c.form}<p class="err" id="e" role="alert"></p><button type="button" id="btn">Calcular</button><span class="hint">El cálculo se hace en tu móvil: no guardamos ni enviamos tus datos.</span></div></section>
<section class="sec res" id="res" aria-live="polite"><h2>Tu resultado</h2>${c.result}</section>
<section class="sec"><h2>Cómo lo calculamos</h2>${list(c.how)}</section>
<section class="sec"><h2>Dudas frecuentes</h2>${faqs(c.qa)}</section>
<p class="urg"><b>Es una orientación.</b> No sustituye la valoración de tu matrona o tu médico. Si algo no va bien, llama al 112 o acude a urgencias.</p></article>
${askBox('¿Tu caso es distinto?', c.ask)}</div>
<p class="all" style="text-align:center;padding:22px 0 30px"><a href="/calculadoras/" style="color:#693D55;font-weight:600">Ver las tres calculadoras</a></p></div>${stickyAsk(c.pro, c.stick)}
<script type="module">${JS_BASE}${c.js}</script>` }));
}

mkdirSync('calculadoras', { recursive: true });
writeFileSync('calculadoras/index.html', shell({ title: 'Calculadoras de embarazo y ciclo · Hera', desc: 'Calcula tu fecha de parto, cuánto peso ganar en el embarazo y tus días fértiles. Gratis, sin registro y sin enviar tus datos.', path: '/calculadoras/',
  ld: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Calculadoras de Hera', inLanguage: 'es-ES', url: `${SITE}/calculadoras/` }, body: `${CSS}
<div class="w"><div class="ih"><p class="ey">Calculadoras</p><h1>Tus cuentas, <em>en un momento</em></h1><p class="sub">Gratis y sin registro. El cálculo se hace en tu móvil: no guardamos ni enviamos tus datos.</p></div>
<div class="cards3">${CALCS.map((c) => `<a class="cc" href="/calculadoras/${c.slug}/" style="background:${c.tint}"><b>${esc(c.h1)}</b><p>${esc(c.lead)}</p></a>`).join('')}</div>
<div class="final"><div class="fin"><h2>¿Tienes una duda?</h2><p>Ginecólogo, matrona y pediatra te responden por escrito en menos de 48 h.</p><a class="btn" href="/#ask">Preguntar gratis</a></div></div></div>` }));

let sm = readFileSync('sitemap.xml', 'utf8').replace(/\s*<url><loc>[^<]*\/calculadoras\/[^<]*<\/loc><lastmod>[^<]*<\/lastmod><\/url>/g, '');
const urls = ['/calculadoras/', ...CALCS.map((c) => `/calculadoras/${c.slug}/`)].map((u) => `  <url><loc>${SITE}${u}</loc><lastmod>${UPDATED}</lastmod></url>`).join('\n');
writeFileSync('sitemap.xml', sm.replace('</urlset>', `${urls}\n</urlset>`));
console.log(`${CALCS.length} calculadoras`);
