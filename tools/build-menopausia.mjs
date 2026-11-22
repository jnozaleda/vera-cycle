// Genera /menopausia/: página propia de menopausia con cuestionario orientativo (Noza, 22 nov; a partir del diseño de Gonzalo).
// El cuestionario NO es una escala clínica (la Escala Cervantes necesita permiso de la AEEM): 12 preguntas de 0 a 4, por áreas.
// Las respuestas no se guardan ni se envían; solo si la persona pulsa «Enviar mi resultado a Gonzalo» pasa un resumen
// a la caja de consulta de la portada (localStorage «hera-ask-prefill», 30 min; lo lee index.html). Textos pendientes de revisar por Gonzalo.
// Uso: node tools/build-menopausia.mjs
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { SITE, PRO, esc, shell, face } from './web-shell.mjs';

const UPDATED = '2026-11-22';
const AREAS = [
  ['Tu cuerpo', ['Sofocos o sudores, de día o de noche', 'Dolor de articulaciones o músculos', 'Cansancio o falta de energía']],
  ['Sueño y ánimo', ['Dormir mal o despertarte a menudo', 'Ánimo bajo o ganas de llorar', 'Nervios, irritabilidad o ansiedad', 'Olvidos o dificultad para concentrarte']],
  ['Intimidad', ['Sequedad o molestias vaginales', 'Menos ganas de tener relaciones', 'Molestias al orinar o escapes de orina']],
  ['Tu día a día', ['Cuánto te afectan en el trabajo o en casa', 'Cuánto te afectan en tu relación con los demás']],
];
const OPTS = ['Nada', 'Poco', 'Bastante', 'Mucho', 'Muchísimo'];
const SYM = [
  ['M12 3c3 4 5 6.5 5 9.5a5 5 0 0 1-10 0C7 9.5 9 7 12 3z', 'Sofocos y sudores', 'Calor repentino en cara y pecho, a menudo de noche.'],
  ['M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z', 'Sueño', 'Te cuesta dormirte o te despiertas a menudo.'],
  ['M8.5 15c1-1.2 2.2-1.8 3.5-1.8s2.5.6 3.5 1.8M9 10h.01M15 10h.01M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17z', 'Ánimo', 'Irritabilidad, tristeza o ansiedad sin motivo claro.'],
  ['M9 4a4 4 0 0 0-4 4c0 1.2.5 2.3 1.4 3A4 4 0 0 0 9 18h6a4 4 0 0 0 2.6-7A4 4 0 0 0 15 4M12 4v14', 'Memoria y concentración', 'La «niebla mental»: olvidos y despistes.'],
  ['M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10z', 'Sequedad y relaciones', 'Sequedad vaginal, dolor o menos deseo.'],
  ['M12 3v18M7 8h10M9 14h6', 'Orina', 'Más ganas, molestias o pequeños escapes.'],
  ['M8.8 8.8l6.4 6.4M7 4.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM17 14.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z', 'Articulaciones', 'Rigidez o dolor, sobre todo al levantarte.'],
  ['M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 10h16M9 3v4M15 3v4', 'Reglas irregulares', 'Más cortas, más largas o más abundantes.'],
];
const CHECK = ['Has tenido cáncer de mama o de endometrio', 'Has tenido una trombosis, una embolia o un ictus', 'Tienes una enfermedad del hígado', 'Migraña con aura', 'Fumas o tienes la tensión alta', 'Te han operado del útero o de los ovarios'];

let n = 0;
const quiz = AREAS.map(([area, qs]) => `<fieldset class="m-area"><legend>${esc(area)}</legend><ol>${qs.map((q) => {
  n++;
  return `<li><span class="m-qn">${n}</span><span class="m-qt" id="q${n}t">${esc(q)}</span><span class="m-ops" role="radiogroup" aria-labelledby="q${n}t">${OPTS.map((o, v) => `<label><input type="radio" name="q${n}" value="${v}" data-area="${esc(area)}"><span>${o}</span></label>`).join('')}</span></li>`;
}).join('')}</ol></fieldset>`).join('');
const TOTAL = n;

const CSS = `<style>
.m-band{background:#EFE6D3;border-radius:14px;padding:clamp(22px,5vw,48px);display:grid;grid-template-columns:minmax(0,1fr) 260px;gap:28px;align-items:end;margin-bottom:8px}
.m-band h1{font-size:clamp(38px,6vw,62px);margin:10px 0 14px;max-width:13em}.m-band h1 em{font-weight:300}
.m-lead{font-size:18px;color:#4F4E49;max-width:34em}
.m-ctas{display:flex;flex-wrap:wrap;gap:10px;margin-top:20px}
.m-btn{display:inline-block;border-radius:999px;padding:12px 20px;font-weight:600;font-size:15px;text-decoration:none;border:0;cursor:pointer;font-family:inherit}
.m-btn.p{background:#45574C;color:#fff}.m-btn.p:hover{background:#384A3F}.m-btn.s{background:#fff;color:#45574C;border:1.5px solid #E5E1D8}
.m-btn[aria-disabled="true"]{background:#D9D3C3;color:#6E6C67;cursor:default}
.m-who{background:#fff;border-radius:12px;padding:16px;display:grid;grid-template-columns:56px 1fr;gap:4px 12px;align-items:center}
.m-who img{width:56px;height:56px;border-radius:50%;object-fit:cover;grid-row:span 2}.m-who b{font:400 21px/1.1 Newsreader,Georgia,serif;color:#45574C}
.m-who span{font-size:13px;color:#6E6C67}.m-who p{grid-column:1/-1;font-size:13.5px;color:#4F4E49;margin-top:6px}
.m-tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;grid-column:1/-1}
.m-tile{background:#F7F1E4;border-radius:10px;padding:12px 14px}.m-tile b{display:block;font:400 25px/1.1 Newsreader,Georgia,serif;color:#45574C}
.m-tile span{display:block;font-size:13px;color:#6E6C67;margin-top:4px;line-height:1.35}
.m-blk{padding-block:40px 6px}.m-blk>h2{font-size:clamp(30px,4vw,40px);margin-bottom:8px}.m-sub{font-size:17px;color:#4F4E49;max-width:40em;margin-bottom:20px}
.m-time{display:flex;height:34px;border-radius:8px;overflow:hidden;font-size:12.5px;font-weight:700;color:#fff;margin-bottom:14px}.m-time div{display:flex;align-items:center;justify-content:center;text-align:center;padding:0 4px}
.m-stages,.m-tx{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.m-stage,.m-tx>div{background:#fff;border:1px solid #E5E1D8;border-radius:12px;padding:18px;display:grid;gap:8px;align-content:start}
.m-when,.m-k{font:600 12px/1.3 Inter,system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#8A7045}
.m-stage h3,.m-tx h3{font-size:24px}.m-stage p,.m-tx p{font-size:15px;color:#4F4E49}
.m-sym{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.m-sym div{background:#fff;border:1px solid #E5E1D8;border-radius:10px;padding:14px;display:grid;gap:6px;align-content:start}
.m-sym svg{width:22px;height:22px;stroke:#8A7045;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}.m-sym b{font-size:15px}.m-sym span{font-size:13.5px;color:#6E6C67;line-height:1.4}
.m-quiz{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:24px;align-items:start}
.m-q{background:#fff;border:1px solid #E5E1D8;border-radius:14px;padding:20px 22px;display:grid;gap:22px;min-width:0}
.m-area{border:0;padding:0;margin:0;min-width:0}.m-area legend{font:600 12px/1.3 Inter,system-ui,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#8A7045;padding:0}
.m-area ol{list-style:none;padding:0;margin:10px 0 0}.m-area li{display:grid;grid-template-columns:26px minmax(0,1fr);gap:6px 10px;padding:12px 0;border-top:1px solid #E5E1D8}
.m-qn{font:500 15px/1.5 Newsreader,Georgia,serif;color:#8A7045}.m-qt{font-size:15.5px}
.m-ops{grid-column:2;display:flex;flex-wrap:wrap;gap:6px}
.m-ops label{cursor:pointer}.m-ops input{position:absolute;opacity:0;pointer-events:none}
.m-ops span{display:inline-block;font-size:13.5px;border:1px solid #E5E1D8;border-radius:999px;padding:6px 12px;color:#4F4E49;background:#FAF9F4}
.m-ops input:checked+span{background:#45574C;border-color:#45574C;color:#fff;font-weight:600}
.m-ops input:focus-visible+span{outline:2px solid #8A7045;outline-offset:2px}
.m-res{position:sticky;top:20px;background:#fff;border:1px solid #E5E1D8;border-radius:14px;padding:20px;display:grid;gap:14px}
.m-res h3{font-size:26px}.m-prog{font-size:13px;color:#6E6C67}
.m-lvl{border-radius:10px;padding:12px 14px;font-size:14.5px;line-height:1.45;background:#F3F1EA}
.m-lvl.l1{background:#EAF3EE}.m-lvl.l2{background:#FBF1E2}.m-lvl.l3{background:#FCEAE6}
.m-bar{display:grid;grid-template-columns:110px minmax(0,1fr) 62px;gap:10px;align-items:center;font-size:13.5px}
.m-bar b{font-weight:600;text-align:right;color:#4F4E49}.m-track{height:10px;background:#E5E1D8;border-radius:5px;overflow:hidden}.m-track i{display:block;height:100%;width:0;background:#8A7045;border-radius:5px;transition:width .3s}
.m-scale{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;font-size:12.5px}.m-scale div{border-radius:8px;padding:8px}.m-scale b{display:block;font-size:13px}
.m-note{font-size:12.5px;color:#6E6C67;line-height:1.45}
.m-check{background:#fff;border:1px solid #E5E1D8;border-radius:14px;padding:20px 22px;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px 28px}
.m-check ul{list-style:none;padding:0;margin:0}.m-check li{font-size:15px;padding:9px 0 9px 26px;border-bottom:1px solid #E5E1D8;position:relative}
.m-check li::before{content:"";position:absolute;left:0;top:13px;width:14px;height:14px;border:1.5px solid #8A7045;border-radius:4px}
.m-final{margin-block:36px 20px;background:#EFE6D3;border-radius:14px;padding:clamp(20px,4vw,36px);display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:20px;align-items:center}
.m-final h2{font-size:clamp(28px,4vw,38px)}.m-final p{color:#4F4E49;margin-top:8px}
.m-opts{display:grid;gap:10px}.m-opt{background:#fff;border-radius:12px;padding:14px 16px;display:flex;justify-content:space-between;gap:14px;align-items:center;text-decoration:none;color:inherit;border:1px solid transparent}.m-opt:hover{border-color:#8A7045}
.m-opt b{display:block;font-size:15.5px}.m-opt span{font-size:13px;color:#6E6C67}.m-opt em{font-style:normal;font-weight:700;color:#45574C;white-space:nowrap}
@media (max-width:860px){.m-band,.m-quiz,.m-check,.m-final{grid-template-columns:1fr}.m-tiles,.m-sym{grid-template-columns:1fr 1fr}.m-stages,.m-tx{grid-template-columns:1fr}.m-res{position:static}}
@media (max-width:420px){.m-bar{grid-template-columns:90px minmax(0,1fr) 56px}}
</style>`;

// Cuestionario: suma por áreas, nivel orientativo y resumen para la consulta (no se guarda ni se envía nada)
const JS = `<script>(()=>{
const T=${TOTAL},MAX=T*4,OPT=${JSON.stringify(OPTS)};
const A='https://hera-consultas.tempcheck-app.workers.dev';
const off=(()=>{try{return localStorage.getItem('hera-equipo')==='1'||/^(localhost|127\\.0\\.0\\.1)$/.test(location.hostname)}catch(e){return true}})();
const sent=new Set(),h=(e)=>{if(off||sent.has(e))return;sent.add(e);fetch(A+'/hit',{method:'POST',body:JSON.stringify({e}),keepalive:true}).catch(()=>{})};
h('menopausia:visita');
const f=document.getElementById('m-form'),$=(id)=>document.getElementById(id);
const areas=[...new Set([...f.querySelectorAll('input')].map((i)=>i.dataset.area))];
function read(){const r={};for(const i of f.querySelectorAll('input:checked'))r[i.name]={v:+i.value,a:i.dataset.area,t:document.getElementById(i.name+'t').textContent};return r}
function update(){
  const r=read(),k=Object.keys(r).length;if(k===1)h('menopausia:test_empezado');
  $('m-prog').textContent=k<T?'Respondidas '+k+' de '+T:'Cuestionario completo';
  let tot=0;const by={};for(const a of areas)by[a]=[0,0];
  for(const q of f.querySelectorAll('.m-ops')){const a=q.querySelector('input').dataset.area;by[a][1]+=4}
  for(const x of Object.values(r)){by[x.a][0]+=x.v;tot+=x.v}
  areas.forEach((a,i)=>{$('m-b'+i).style.width=Math.round(by[a][0]*100/by[a][1])+'%';$('m-n'+i).textContent=by[a][0]+' de '+by[a][1]});
  const lvl=$('m-lvl'),btn=$('m-send');
  if(k<T){lvl.className='m-lvl';$('m-h').textContent='Tu resultado';lvl.textContent='Contesta las '+T+' preguntas para ver cuánto te afectan.';btn.setAttribute('aria-disabled','true');return}
  h('menopausia:test_completo');
  const top=Object.values(r).filter((x)=>x.v>=3).sort((a,b)=>b.v-a.v).slice(0,3);
  const L=tot<=12?[1,'Te afectan poco','Si algo te preocupa, puedes preguntarlo igualmente.']:tot<=24?[2,'Te afectan de forma moderada','Hay tratamientos que ayudan: merece la pena comentarlo con tu ginecólogo.']:[3,'Te afectan mucho','No tienes por qué aguantarlo: coméntalo con tu ginecólogo, hay tratamientos que ayudan.'];
  lvl.className='m-lvl l'+L[0];$('m-h').textContent=L[1];
  lvl.innerHTML='<b>'+tot+' de '+MAX+'.</b> '+(top.length?'Lo que más te afecta: '+top.map((x)=>x.t.toLowerCase()).join('; ')+'. ':'')+L[2];
  btn.removeAttribute('aria-disabled');
  btn.dataset.text='Mi cuestionario de menopausia (orientativo): '+tot+' de '+MAX+', '+L[1].toLowerCase()+'. '+areas.map((a)=>a+' '+by[a][0]+'/'+by[a][1]).join(', ')+'.'+(top.length?' Lo que más me afecta: '+top.map((x)=>x.t.toLowerCase()+' ('+OPT[x.v].toLowerCase()+')').join('; ')+'.':'')+'\\n\\nMi duda: ';
}
f.addEventListener('change',update);
$('m-send').addEventListener('click',(ev)=>{if($('m-send').getAttribute('aria-disabled')==='true'){ev.preventDefault();return}h('menopausia:enviar');try{localStorage.setItem('hera-ask-prefill',JSON.stringify({text:$('m-send').dataset.text,at:Date.now()}))}catch(e){}});
$('m-reset').addEventListener('click',()=>{f.reset();update()});
document.querySelectorAll('[data-hit]').forEach((a)=>a.addEventListener('click',()=>h('menopausia:'+a.dataset.hit)));
// Precio de la consulta por escrito: 1 € hasta el 1 dic (Black Friday), 9 € después
if(Date.now()>=Date.parse('2026-12-01T23:59:59+01:00')){const p=$('m-price');if(p)p.textContent='9 €'}
update();
})()</script>`;

const g = PRO.gineco;
const body = `${CSS}<div class="w">
<div class="m-band">
  <div><p class="ey">Menopausia</p><h1>Esta etapa no se aguanta. <em>Se trata.</em></h1>
  <p class="m-lead">Sofocos, mal sueño, cambios de ánimo, sequedad… Mide en 3 minutos cuánto te están afectando y llévale el resultado a tu ginecólogo.</p>
  <div class="m-ctas"><a class="m-btn p" href="#cuestionario" data-hit="clic_cuestionario">Hacer el cuestionario · 3 min</a><a class="m-btn s" href="/#preguntar-gineco" data-hit="clic_preguntar">Preguntar a ${g.name}</a></div></div>
  <div class="m-who">${face(g)}<b>Dr. Gonzalo Nozaleda</b><span>Ginecólogo</span><p>Te responde por escrito en menos de 24 h, o por videollamada si prefieres hablarlo.</p></div>
  <div class="m-tiles"><div class="m-tile"><b>51 años</b><span>Edad media de la menopausia en España</span></div><div class="m-tile"><b>45–55</b><span>Lo habitual</span></div><div class="m-tile"><b>12 meses</b><span>Sin regla: entonces es menopausia</span></div><div class="m-tile"><b>Antes de 40</b><span>Consulta: es precoz</span></div></div>
</div>

<section class="m-blk" id="etapas"><h2>Tres etapas</h2>
  <p class="m-sub">La menopausia es un momento concreto: cuando llevas 12 meses seguidos sin regla. Lo que se nota empieza años antes y puede seguir después.</p>
  <div class="m-time" aria-hidden="true"><div style="flex:5;background:#8A7045">Perimenopausia</div><div style="flex:1;background:#45574C">12 meses</div><div style="flex:6;background:#BCA172">Posmenopausia</div></div>
  <div class="m-stages">
    <div class="m-stage"><span class="m-when">Desde los 40–45, varios años</span><h3>Perimenopausia</h3><p>Reglas irregulares, primeros sofocos, peor sueño y cambios de ánimo. Todavía puedes quedarte embarazada.</p></div>
    <div class="m-stage"><span class="m-when">Hacia los 51</span><h3>Menopausia</h3><p>Se confirma al cumplir 12 meses sin regla, mirando hacia atrás. No hace falta un análisis si tienes más de 45.</p></div>
    <div class="m-stage"><span class="m-when">Después</span><h3>Posmenopausia</h3><p>Los sofocos suelen ir a menos, y ganan peso el hueso, el corazón y la zona genital y urinaria.</p></div>
  </div></section>

<section class="m-blk" id="sintomas"><h2>¿Te suena alguno?</h2><p class="m-sub">No todas los tienen, ni con la misma intensidad. Casi todos tienen tratamiento.</p>
  <div class="m-sym">${SYM.map(([d, t, s]) => `<div><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg><b>${esc(t)}</b><span>${esc(s)}</span></div>`).join('')}</div></section>

<section class="m-blk" id="cuestionario"><h2>Cuestionario: ¿cuánto te afectan?</h2>
  <p class="m-sub">${TOTAL} preguntas sobre el último mes. Es orientativo: no es un diagnóstico ni una escala clínica, sirve para ordenar lo que te pasa y llevarlo a la consulta.</p>
  <div class="m-quiz">
    <form class="m-q" id="m-form" onsubmit="return false">${quiz}</form>
    <aside class="m-res" aria-live="polite">
      <span class="m-prog" id="m-prog">Respondidas 0 de ${TOTAL}</span>
      <h3 id="m-h">Tu resultado</h3>
      <div class="m-lvl" id="m-lvl">Contesta las ${TOTAL} preguntas para ver cuánto te afectan.</div>
      ${AREAS.map(([a], i) => `<div class="m-bar"><span>${esc(a)}</span><div class="m-track"><i id="m-b${i}"></i></div><b id="m-n${i}">0</b></div>`).join('')}
      <div class="m-scale"><div style="background:#EAF3EE"><b>0–12</b>Te afectan poco</div><div style="background:#FBF1E2"><b>13–24</b>Moderado</div><div style="background:#FCEAE6"><b>25–48</b>Te afectan mucho</div></div>
      <a class="m-btn p" id="m-send" href="/#preguntar-gineco" aria-disabled="true" style="text-align:center">Enviar mi resultado a ${g.name}</a>
      <button type="button" class="m-btn s" id="m-reset">Empezar de nuevo</button>
      <p class="m-note">Tus respuestas no se guardan ni se envían. Si pulsas «Enviar mi resultado», el resumen aparece en la caja de consulta para que lo revises antes de enviarlo.</p>
    </aside>
  </div></section>

<section class="m-blk" id="antes"><h2>Antes de hablar de tratamiento</h2>
  <p class="m-sub">Si alguna de estas cosas es tu caso, díselo a tu ginecólogo: cambia qué tratamiento te conviene y cómo tomarlo. No hace falta que lo marques en ningún sitio.</p>
  <div class="m-check"><ul>${CHECK.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
    <div style="display:grid;gap:12px;align-content:start"><p class="urg"><b>Si sangras después de 12 meses sin regla, consúltalo siempre</b>, aunque sea poco. No suele ser grave, pero hay que mirarlo. <a href="/guias/sangrado-despues-de-la-menopausia/" style="color:#45574C;font-weight:600">Más información</a></p>
    <p class="m-note">El ginecólogo valora siempre tu caso completo: edad, tiempo desde la última regla, antecedentes y lo que prefieres.</p></div></div></section>

<section class="m-blk" id="tratamientos"><h2>Lo que ayuda</h2><p class="m-sub">Hay más opciones de las que parece. Se eligen contigo, según tus síntomas y tu historia.</p>
  <div class="m-tx">
    <div><span class="m-k">Con hormonas</span><h3>Terapia hormonal</h3><p>Lo más eficaz para los sofocos en muchas mujeres. En parches, gel o pastillas; la dosis y la forma se ajustan a ti.</p></div>
    <div><span class="m-k">Sin hormonas</span><h3>Otros tratamientos</h3><p>Medicamentos sin hormonas para los sofocos cuando las hormonas no están indicadas o no las quieres, y tratamiento local para la sequedad.</p></div>
    <div><span class="m-k">Cada día</span><h3>Hábitos que cuentan</h3><p>Ejercicio de fuerza, cuidar el sueño, suelo pélvico y revisar hueso y corazón. Pequeños cambios que se notan.</p></div>
  </div>
  <div class="lnk" style="margin-top:16px"><a href="/guias/sintomas-menopausia/">Síntomas de la menopausia →</a><a href="/guias/sangrado-despues-de-la-menopausia/">Sangrado después de la menopausia →</a><a href="/guias/sangrado-entre-reglas/">Sangrado entre reglas →</a></div></section>

<div class="m-final" id="consulta"><div><h2>Habla con ${g.name}</h2><p>Cuéntale lo que te pasa, con tu resultado si quieres. Te responde él, por escrito o cara a cara.</p></div>
  <div class="m-opts"><a class="m-opt" href="/#preguntar-gineco" data-hit="clic_escrito"><div><b>Consulta por escrito</b><span>Te responde en menos de 24 h</span></div><em id="m-price">1 € · Black Friday</em></a>
  <a class="m-opt" href="/videollamada/#reservar-gineco" data-hit="clic_videollamada"><div><b>Videollamada de 30 min</b><span>Para hablarlo con calma</span></div><em>55 €</em></a></div></div>
<p class="urg" style="margin-bottom:30px"><b>Si es urgente, llama al 112 o ve a urgencias.</b> Esta información es general y no sustituye la valoración de un profesional.</p>
</div>${JS}`;

const desc = 'Cuestionario orientativo de síntomas de la menopausia (3 min), las tres etapas, qué ayuda y cuándo consultar. Pregúntale a Gonzalo, ginecólogo, por escrito o por videollamada.';
const ld = { '@context': 'https://schema.org', '@type': 'MedicalWebPage', name: 'Menopausia: síntomas, cuestionario y tratamientos', inLanguage: 'es-ES', url: `${SITE}/menopausia/`, dateModified: UPDATED, about: { '@type': 'MedicalCondition', name: 'Menopausia' } };
mkdirSync('menopausia', { recursive: true });
writeFileSync('menopausia/index.html', shell({ title: 'Menopausia: síntomas, cuestionario y qué ayuda · Hera', desc, path: '/menopausia/', ld, body }));
let sm = readFileSync('sitemap.xml', 'utf8');
if (!sm.includes(`${SITE}/menopausia/`)) writeFileSync('sitemap.xml', sm.replace('</urlset>', `  <url><loc>${SITE}/menopausia/</loc><lastmod>${UPDATED}</lastmod></url>\n</urlset>`));
console.log('menopausia/index.html');
