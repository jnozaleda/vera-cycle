// Menú lateral de Hera (Noza, 22 nov: «demasiada información en la portada»): botón de tres rayas en la cabecera que abre
// un panel por la derecha con todas las páginas. El mismo en la portada, las páginas generadas (web-shell.mjs) y las
// páginas hechas a mano (equipo, soporte, privacidad), donde lo copia tools/build-menu.mjs entre <!-- menu --> y <!-- /menu -->.
// Mide con /hit: menu:abrir y menu:<opción> (sin contar el modo equipo ni localhost).

export const MENU_ITEMS = [
  ['Consultar', [['/#ask', 'Pregunta tu duda por escrito', 'preguntar'], ['/consultas/', 'Consultas y precios', 'consultas'], ['/videollamada/', 'Videollamada y llamada', 'videollamada']]],
  ['Para cada etapa', [['/ciclo/', 'Tu ciclo', 'ciclo'], ['/embarazo/', 'Embarazo semana a semana', 'embarazo'], ['/bebe/', 'Tu bebé mes a mes', 'bebe'], ['/menopausia/', 'Menopausia', 'menopausia'], ['/guias/', 'Guías', 'guias'], ['/calculadoras/', 'Calculadoras', 'calculadoras']]],
  ['Hera', [['/equipo.html', 'El equipo', 'equipo'], ['/app/', 'La app, gratis', 'app'], ['/support.html', 'Ayuda y preguntas frecuentes', 'ayuda'], ['/privacy.html', 'Privacidad', 'privacidad']]],
];

const chev = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';

export const MENU_BUTTON = '<button type="button" class="hm-btn" aria-label="Abrir el menú" aria-expanded="false" aria-controls="hm"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>';

export const MENU_PANEL = `<div class="hm" id="hm" hidden><div class="hm-bg" data-hm-close></div><nav class="hm-p" role="dialog" aria-modal="true" aria-label="Menú">
<div class="hm-h"><a class="hm-wm" href="/">Hera</a><button type="button" class="hm-x" aria-label="Cerrar el menú" data-hm-close><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
<div class="hm-l">${MENU_ITEMS.map(([g, items]) => `<p class="hm-g">${g}</p><ul>${items.map(([h, t, k]) => `<li><a href="${h}" data-hm="${k}"><span>${t}</span>${chev}</a></li>`).join('')}</ul>`).join('')}</div>
<div class="hm-f"><a class="hm-cta" href="/#ask" data-hm="cta_preguntar">Pregunta tu duda</a></div></nav></div>`;

export const MENU_CSS = `.hm-btn,.hm-x{border:0!important;box-shadow:none!important;padding:0!important;min-width:0;font:inherit}
.hm-btn{display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;margin-left:6px;border:0;border-radius:999px;background:transparent;color:#45574C;cursor:pointer;flex:none}
.hm-btn:hover{background:#EFEDE6}.hm-btn:focus-visible,.hm-x:focus-visible,.hm-p a:focus-visible{outline:2px solid #45574C;outline-offset:2px}
.hm{position:fixed;inset:0;z-index:60}.hm-bg{position:absolute;inset:0;background:rgba(47,54,49,.42)}
.hm-p{position:absolute;top:0;right:0;bottom:0;width:min(360px,86vw);background:#FAF9F4;box-shadow:-10px 0 30px rgba(47,54,49,.18);display:flex;flex-direction:column;padding-top:env(safe-area-inset-top,0px);padding-right:env(safe-area-inset-right,0px);animation:hm-in .2s ease-out}
@keyframes hm-in{from{transform:translateX(24px);opacity:.4}to{transform:none;opacity:1}}@media (prefers-reduced-motion:reduce){.hm-p{animation:none}}
.hm-h{display:flex;justify-content:space-between;align-items:center;padding:12px 16px 12px 20px;border-bottom:1px solid #E5E1D8}
.hm-wm{font:400 28px/1 Newsreader,Georgia,serif;color:#45574C;text-decoration:none;letter-spacing:-.02em}
.hm-x{width:42px;height:42px;border:0;border-radius:999px;background:transparent;color:#45574C;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}.hm-x:hover{background:#EFEDE6}
.hm-l{flex:1;overflow-y:auto;padding:4px 20px 12px}.hm-g{font:600 11px/1.3 Inter,system-ui,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#8A7045;margin:16px 0 2px}
.hm-l ul{list-style:none;margin:0;padding:0}.hm-l a{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:11px 0;border-bottom:1px solid #ECE9E1;font:500 15.5px/1.3 Inter,system-ui,sans-serif;color:#2F3631;text-decoration:none}
.hm-l a:hover{color:#45574C}.hm-l a svg{color:#A8A59D;flex:none}.hm-l a[aria-current]{color:#45574C;font-weight:600}
.hm-f{padding:14px 20px calc(14px + env(safe-area-inset-bottom,0px));border-top:1px solid #E5E1D8}
.hm-cta{display:block;text-align:center;background:#45574C;color:#fff;border-radius:8px;padding:14px;font:600 15px/1 Inter,system-ui,sans-serif;text-decoration:none}.hm-cta:hover{background:#384A3F}
html.hm-open{overflow:hidden}`;

export const MENU_JS = `<script>(()=>{const m=document.getElementById('hm'),b=document.querySelector('.hm-btn');if(!m||!b)return;
const off=(()=>{try{return localStorage.getItem('hera-equipo')==='1'}catch{return false}})()||/^(localhost|127\\.0\\.0\\.1)$/.test(location.hostname);
const hit=(e)=>{if(!off)fetch('https://hera-consultas.tempcheck-app.workers.dev/hit',{method:'POST',body:JSON.stringify({e}),keepalive:true}).catch(()=>{})};
const p=location.pathname.replace(/index\\.html$/,'');m.querySelectorAll('.hm-l a').forEach((a)=>{const h=a.getAttribute('href');if(h!=='/'&&!h.includes('#')&&p.startsWith(h))a.setAttribute('aria-current','page')});
const open=()=>{m.hidden=false;document.documentElement.classList.add('hm-open');b.setAttribute('aria-expanded','true');hit('menu:abrir');setTimeout(()=>m.querySelector('.hm-x').focus(),30)};
const close=(back=true)=>{m.hidden=true;document.documentElement.classList.remove('hm-open');b.setAttribute('aria-expanded','false');if(back)b.focus()};
b.addEventListener('click',open);m.querySelectorAll('[data-hm-close]').forEach((x)=>x.addEventListener('click',()=>close()));
document.addEventListener('keydown',(e)=>{if(e.key==='Escape'&&!m.hidden)close()});
m.querySelectorAll('a[data-hm]').forEach((a)=>a.addEventListener('click',()=>{hit('menu:'+a.dataset.hm);close(false)}));})();</script>`;
