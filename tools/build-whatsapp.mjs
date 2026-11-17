// Página de consulta por WhatsApp: /whatsapp/
// De pago desde la primera (9 €): el botón abre el pago de Stripe (el servicio, /wa/pagar, pide correo y móvil) y, al volver,
// enseña el código y el botón «Abrir WhatsApp». Quien escribe directamente al número recibe este enlace en la bienvenida.
//
//   node tools/build-whatsapp.mjs

import fs from 'node:fs';
import { shell, BEACON } from './web-shell.mjs';

const ROOT = new URL('../', import.meta.url);
const API = 'https://hera-consultas.tempcheck-app.workers.dev';
const WA = '34603295806';
const tick = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
const waIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 20.5 5 16a8.5 8.5 0 1 1 3.2 3.1z"/></svg>';

const STYLE = `<style>
.wa{padding-bottom:20px}.wa-hero{padding-top:18px;max-width:640px}.wa-hero h1{font-size:clamp(38px,6vw,56px);margin:10px 0 12px}.wa-hero h1 em{font-style:italic}
.wa-lead{font-size:18px;color:#4F4E49;margin-bottom:16px}
.wa-ticks{list-style:none;padding:0;margin:0 0 20px;display:flex;flex-wrap:wrap;gap:6px 16px;font-size:14px;font-weight:500;color:#45574C}.wa-ticks li{display:flex;align-items:center;gap:5px}
.wa-box{background:#fff;border:1.5px solid #E8DCD6;border-radius:12px;padding:18px;display:grid;gap:12px;max-width:520px}
.wa-faces{display:flex;align-items:center;gap:10px;font-size:14px;color:#4F4E49}.wa-faces span{display:flex}.wa-faces img{width:34px;height:34px;border-radius:50%;object-fit:cover;border:2px solid #fff;margin-left:-8px}.wa-faces img:first-child{margin-left:0}
.wa-price{display:flex;justify-content:space-between;align-items:baseline;font-size:14px;color:#6E6C67}.wa-price strong{font:600 26px/1 Inter,sans-serif;color:#2F3631}
.wa-btn{display:flex;align-items:center;justify-content:center;gap:8px;font:600 16px/1 Inter,sans-serif;color:#fff;background:#25803A;border:0;border-radius:8px;padding:15px;text-decoration:none;cursor:pointer}.wa-btn:hover{background:#1E6B30}
.wa-small{font-size:12.5px;color:#6E6C67;line-height:1.45;margin:0}
.wa-note{background:#DCEBE4;border-radius:12px;padding:16px 18px;margin:18px 0 0;max-width:520px;display:grid;gap:10px;color:#2D4A3A}.wa-note b.t{font:400 23px/1.2 Newsreader,Georgia,serif}
.wa-code{font:400 34px/1 Newsreader,Georgia,serif;letter-spacing:.08em;color:#2D4A3A}
.wa h2{font-size:30px;color:#45574C;margin:44px 0 6px}
.wa-steps{list-style:none;counter-reset:s;margin:14px 0 0;padding:0;max-width:640px}
.wa-steps li{counter-increment:s;display:grid;grid-template-columns:34px 1fr;gap:14px;padding:14px 0;border-top:1px solid #E5E1D8}
.wa-steps li:before{content:counter(s);width:30px;height:30px;border-radius:50%;background:#F6E0E2;color:#45574C;font:600 14px/30px Inter,sans-serif;text-align:center}
.wa-steps b{display:block;font-size:15.5px}.wa-steps span{font-size:14.5px;color:#4F4E49}
.wa-free{background:#F6E0E2;border-radius:12px;padding:16px 18px;margin-top:26px;max-width:640px;font-size:15px;color:#4F4E49}.wa-free a{color:#45574C;font-weight:600}
.wa-faq{max-width:640px}.wa-faq div{border-top:1px solid #E5E1D8;padding:14px 0}.wa-faq b{display:block;font-size:15.5px;margin-bottom:3px}.wa-faq p{font-size:14.5px;color:#4F4E49}
.wa-box[hidden],.wa-note[hidden]{display:none}
.wa-urg{font-size:13.5px;color:#B3261E;margin:18px 0 26px;max-width:640px}
</style>`;

const body = `${STYLE}<div class="w wa">
<section class="wa-hero">
  <p class="ey">Consulta por WhatsApp</p>
  <h1>Pregunta a tu ginecólogo, matrona o pediatra <em>por WhatsApp</em></h1>
  <p class="wa-lead">Escribe tu duda a Gonzalo, Marina o Lucía y te responden por el mismo chat en menos de 24 h.</p>
  <ul class="wa-ticks"><li>${tick}Sin instalar nada</li><li>${tick}Tu número no lo ven las profesionales</li><li>${tick}Puedes mandar fotos</li></ul>
  <div class="wa-box" id="wa-box">
    <div class="wa-faces"><span><img src="/portada/equipo/gonzalo.jpg?v=2" alt=""><img src="/portada/equipo/marina.jpg?v=2" alt=""><img src="/portada/equipo/lucia.jpg?v=3" alt=""></span>Gonzalo, Marina o Lucía, tú eliges</div>
    <div class="wa-price"><span>Una consulta por WhatsApp</span><strong>9 €</strong></div>
    <a class="wa-btn" id="wa-pay" href="${API}/wa/pagar">${waIcon}Pagar 9 € y escribir por WhatsApp</a>
    <p class="wa-small">Pagas con tarjeta, Apple Pay o Google Pay en una página de pago segura; te pedimos el correo (para mandarte el código) y el móvil. Al terminar te damos un código y se abre WhatsApp.</p>
  </div>
  <div class="wa-note" id="wa-note" hidden aria-live="polite"></div>
</section>

<div class="wa-free">¿Prefieres gratis? <a href="/#ask">Pregunta por la web</a>: tus 2 primeras consultas son gratis y te responden por correo.</div>

<h2>Cómo funciona</h2>
<ol class="wa-steps">
  <li><div><b>Pagas 9 €</b><span>En la página de pago. Te mandamos el código también por correo, por si cierras la página.</span></div></li>
  <li><div><b>Abres WhatsApp con tu código</b><span>El mensaje ya va escrito con tu código. Añade tu duda y dinos a quién se la preguntas.</span></div></li>
  <li><div><b>Te responde la profesional</b><span>Por el mismo chat, en menos de 24 h. Si te queda algo, puedes contestar.</span></div></li>
</ol>

<h2>Lo que conviene saber</h2>
<div class="wa-faq">
  <div><b>¿Quién me contesta?</b><p>Gonzalo Nozaleda (ginecólogo), Marina Fernández (matrona) o Lucía Carrascón (pediatra), la que elijas. El WhatsApp es de Hera: ni ves su número ni ellas el tuyo.</p></div>
  <div><b>¿Y si escribo al WhatsApp sin pagar?</b><p>Te contestamos con este enlace para pagar. En cuanto llega el pago, le pasamos tu duda a la profesional.</p></div>
  <div><b>¿Qué pasa con mis datos?</b><p>La conversación pasa por WhatsApp (Meta). Guardamos tu número cifrado 30 días para llevar la cuenta de tu consulta. Más en la <a href="/privacy.html">política de privacidad</a>.</p></div>
</div>
<p class="wa-urg">No es para urgencias. Si hay sangrado abundante, pérdida de líquido, el bebé no se mueve, dolor muy fuerte o fiebre alta en un bebé pequeño, llama al 112 (o al número de emergencias de tu país) o ve a urgencias.</p>
</div>
<script type="module">
  import { device, isTeam } from '/app/js/track.js';
  const API = '${API}';
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  let ptag = '';
  const hit = (e) => { if (local || isTeam()) return; fetch(API + '/hit', { method: 'POST', body: JSON.stringify({ e, d: device(), p: ptag }), keepalive: true }).then((r) => r.json()).then((j) => { if (/^[0-9A-F]{4}$/.test(j?.p || '')) ptag = j.p; }).catch(() => {}); };
  const q = new URLSearchParams(location.search);
  hit('whatsapp_pagina');
  // Anuncios: misma marca de 30 días que la portada (sin cookies)
  let ad = {};
  try { const a = JSON.parse(localStorage.getItem('hera-src') || 'null'); if (a && Date.now() - a.at < 30 * 86400000) ad = { src: 'ads', camp: a.c || '' }; } catch {}
  const pay = document.getElementById('wa-pay');
  const u = new URL(pay.href);
  if (ad.src) { u.searchParams.set('src', 'ads'); if (ad.camp) u.searchParams.set('camp', ad.camp); }
  if (local || isTeam()) u.searchParams.set('t', '1');
  pay.href = u.toString();
  pay.addEventListener('click', () => { if (ptag) { const v = new URL(pay.href); v.searchParams.set('p', ptag); pay.href = v.toString(); } });
  const note = document.getElementById('wa-note');
  const say = (html) => { note.innerHTML = html; note.hidden = false; note.scrollIntoView({ block: 'center' }); };
  const pago = q.get('pago');
  if (pago) {
    history.replaceState(null, '', location.pathname);
    if (pago === 'no') say('<b class="t">No se ha hecho ningún pago</b><span>Puedes intentarlo otra vez cuando quieras.</span>');
    else if (pago === 'error') say('<b class="t">No hemos podido abrir el pago</b><span>Inténtalo en un momento o escríbenos a contacto@hera-gine.com.</span>');
    else {
      say('<b class="t">Comprobando el pago…</b>');
      fetch(API + '/checkout/status?cs=' + encodeURIComponent(q.get('cs') || '')).then((r) => r.json()).then((j) => {
        if (!j.paid || !j.code) throw new Error();
        const link = 'https://wa.me/${WA}?text=' + encodeURIComponent('Hola, he pagado mi consulta por WhatsApp (código ' + j.code + '). Mi duda: ');
        document.getElementById('wa-box').hidden = true;
        say('<b class="t">Pago hecho. Ahora escríbenos tu duda</b><span>Tu código</span><span class="wa-code">' + j.code + '</span><a class="wa-btn" href="' + link + '">${waIcon.replace(/'/g, "\\'")}Abrir WhatsApp</a><span style="font-size:13.5px">El mensaje ya lleva tu código: añade tu duda y dinos si es para Gonzalo, Marina o Lucía. También te lo hemos mandado por correo. Si el botón no funciona, escribe al +34 603 29 58 06.</span>');
      }).catch(() => say('<b class="t">Aún no podemos confirmar el pago</b><span>Si te han cobrado, en unos minutos te llega un correo con tu código. Si no, escríbenos a contacto@hera-gine.com.</span>'));
    }
  }
</script>`;

const html = shell({
  title: 'Consulta por WhatsApp con ginecólogo, matrona o pediatra · Hera',
  desc: 'Pregunta tu duda a Gonzalo (ginecólogo), Marina (matrona) o Lucía (pediatra) por WhatsApp y te responden por el mismo chat en menos de 24 h. 9 € la consulta.',
  path: '/whatsapp/',
  ld: { '@context': 'https://schema.org', '@type': 'Service', name: 'Consulta por WhatsApp con profesionales de Hera', provider: { '@type': 'Organization', name: 'Hera', url: 'https://hera-gine.com' },
    offers: [{ '@type': 'Offer', name: 'Consulta por WhatsApp', price: '9', priceCurrency: 'EUR' }] },
  body,
});
fs.mkdirSync(new URL('whatsapp/', ROOT), { recursive: true });
fs.writeFileSync(new URL('whatsapp/index.html', ROOT), html);
console.log('whatsapp/index.html', html.length, BEACON ? 'ok' : '');
