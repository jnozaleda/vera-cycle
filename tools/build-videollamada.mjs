// Página de videollamadas (vera-backlog#86): /videollamada/
// Pago con Stripe (planes «video» y «lactancia» del servicio de consultas) y, después, correo con los pasos para elegir hora.
//
//   node tools/build-videollamada.mjs

import fs from 'node:fs';
import { shell, BEACON } from './web-shell.mjs';

const ROOT = new URL('../', import.meta.url);
const tick = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';

const CARDS = [
  { k: 'gineco', name: 'Dr. Gonzalo Nozaleda', role: 'Ginecólogo', photo: 'gonzalo.jpg?v=2', short: 'Gonzalo',
    topics: ['Regla, ciclo y anticoncepción', 'Revisar un informe o una analítica', 'Embarazo y menopausia'],
    offers: [['video', '30 min', 55, 'Reservar con Gonzalo']] },
  { k: 'matrona', name: 'Marina Fernández', role: 'Matrona y asesora de lactancia', photo: 'marina.jpg?v=2', short: 'Marina',
    topics: ['Lactancia: agarre, dolor, crisis, sacaleches', 'Preparar el parto', 'Posparto y recuperación'],
    offers: [['video', '30 min', 55, 'Reservar con Marina'], ['lactancia', 'Asesoría de lactancia · 1 h 30', 99, 'Reservar asesoría de lactancia']] },
  { k: 'pediatra', name: 'Dra. Lucía Carrascón', role: 'Pediatra', photo: 'lucia.jpg?v=3', short: 'Lucía',
    topics: ['Sueño, alimentación y tomas', 'Piel, granitos, cólicos', 'Desarrollo del bebé'],
    offers: [['video', '30 min', 55, 'Reservar con Lucía']] },
];

const card = (c) => `<article class="vc-card" id="${c.k}">
  <div class="vc-h"><img src="/portada/equipo/${c.photo}" alt="" width="56" height="56" loading="lazy"><span><b>${c.name}</b><small>${c.role}</small></span></div>
  <ul class="vc-t">${c.topics.map((t) => `<li>${t}</li>`).join('')}</ul>
  ${c.offers.map(([plan, dur, eur, label]) => `<div class="vc-o">
    <div class="vc-p"><span>${dur}</span><strong>${eur} €</strong></div>
    <button type="button" class="vc-btn${plan === 'lactancia' ? ' vc-btn2' : ''}" data-plan="${plan}" data-pro="${c.k}" data-eur="${eur}" data-who="${c.short}">${label}</button>
  </div>`).join('')}
</article>`;

const STYLE = `<style>
.vc{padding-bottom:20px}.vc-hero{padding-top:18px;padding-bottom:6px}.vc-hero h1{font-size:clamp(38px,6vw,56px);margin:10px 0 12px;max-width:14em}.vc-hero h1 em{font-style:italic}
.vc-lead{font-size:18px;color:#4C444C;max-width:34em;margin-bottom:16px}
.vc-ticks{list-style:none;padding:0;display:flex;flex-wrap:wrap;gap:6px 16px;font-size:14px;font-weight:500;color:#693D55}.vc-ticks li{display:flex;align-items:center;gap:5px}
.vc-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:14px;margin-top:26px;align-items:start}
.vc-card{background:#fff;border:1.5px solid #E8DCD6;border-radius:12px;padding:18px;display:flex;flex-direction:column;gap:12px;scroll-margin-top:20px}
.vc-h{display:flex;gap:12px;align-items:center}.vc-h img{width:56px;height:56px;border-radius:50%;object-fit:cover;flex:none}.vc-h b{display:block;font-size:16px}.vc-h small{display:block;font-size:13px;color:#655B61}
.vc-t{margin:0;padding-left:18px;font-size:14px;color:#4C444C}.vc-t li{margin-bottom:3px}
.vc-o{display:flex;flex-direction:column;gap:10px;border-top:1px solid #E6DFE2;padding-top:12px}
.vc-p{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-size:14px;color:#655B61}.vc-p strong{font:600 22px/1 Inter,sans-serif;color:#2E2630}
.vc-btn{font:600 15px/1 Inter,sans-serif;color:#fff;background:#693D55;border:0;border-radius:6px;padding:14px;cursor:pointer}.vc-btn:hover{background:#563146}
.vc-btn2{background:#fff;color:#693D55;border:1.5px solid #693D55}.vc-btn2:hover{background:#F4E6E8}
.vc-form{display:grid;gap:10px;background:#FBF7F1;border-radius:10px;padding:14px}.vc-form label{font-size:13.5px;color:#4C444C;display:grid;gap:6px}
.vc-form input{width:100%;border:1px solid #E6DFE2;border-radius:6px;padding:11px 12px;font:400 16px/1.4 Inter,sans-serif;background:#fff;color:#2E2630}
.vc-form input:focus{outline:none;border-color:#693D55;box-shadow:0 0 0 3px rgba(105,61,85,.18)}
.vc-form .vc-btn{width:100%}.vc-form small{font-size:12.5px;color:#655B61;line-height:1.45}.vc-err{color:#9A4A5E;font-size:13.5px;margin:0}
.vc-note{background:#DCEBE4;border-radius:12px;padding:16px 18px;margin-top:18px;font-size:15px;color:#2D4A3A}.vc-note b{display:block;font:400 22px/1.2 Newsreader,Georgia,serif;color:#2D4A3A;margin-bottom:4px}
.vc h2{font-size:30px;color:#693D55;margin:48px 0 6px}.vc .vc-sub{color:#4C444C;max-width:36em}
.vc-steps{list-style:none;counter-reset:s;margin:18px 0 0;padding:0;max-width:640px}
.vc-steps li{counter-increment:s;display:grid;grid-template-columns:34px 1fr;gap:14px;padding:14px 0;border-top:1px solid #E6DFE2}
.vc-steps li:before{content:counter(s);width:30px;height:30px;border-radius:50%;background:#F4E6E8;color:#693D55;font:600 14px/30px Inter,sans-serif;text-align:center}
.vc-steps b{display:block;font-size:15.5px}.vc-steps span{font-size:14.5px;color:#4C444C}
.vc-faq{max-width:640px;margin-top:10px}.vc-faq div{border-top:1px solid #E6DFE2;padding:14px 0}.vc-faq b{display:block;font-size:15.5px;margin-bottom:3px}.vc-faq p{font-size:14.5px;color:#4C444C}
.vc-alt{background:#DCEBE4;border-radius:12px;padding:22px 20px;margin:48px 0 0;display:grid;gap:8px}.vc-alt h3{font-size:24px;color:#2D4A3A}.vc-alt p{color:#35473C;font-size:15px}.vc-alt a{color:#2D4A3A;font-weight:600}
.vc-urg{font-size:13.5px;color:#9A4A5E;margin:18px 0 26px;max-width:640px}
</style>`;

const body = `${STYLE}<div class="w vc">
<section class="vc-hero">
  <p class="ey">Videollamada</p>
  <h1>Habla con tu ginecólogo, tu matrona o tu pediatra, <em>cara a cara</em></h1>
  <p class="vc-lead">30 minutos cara a cara con el ginecólogo, la matrona o la pediatra que elijas, desde casa y a la hora que te venga bien.</p>
  <ul class="vc-ticks"><li>${tick}Sin desplazarte</li><li>${tick}Día y hora a tu medida</li><li>${tick}Sin instalar nada en el ordenador</li></ul>
  <div class="vc-note" id="vc-note" hidden aria-live="polite"></div>
</section>
<div class="vc-cards">${CARDS.map(card).join('')}</div>

<h2>Cómo funciona</h2>
<p class="vc-sub">Cinco pasos. Hera coordina la agenda contigo y con la profesional por correo.</p>
<ol class="vc-steps">
  <li><div><b>Elige con quién y paga</b><span>Con tarjeta, Apple Pay o Google Pay, en una página de pago segura. Hera no ve tu tarjeta.</span></div></li>
  <li><div><b>Te llega el correo de pago completado</b><span>Respóndelo con 3 franjas que te vengan bien (por ejemplo: «martes por la tarde, jueves de 10 a 12…») y, si quieres, una línea sobre tu duda.</span></div></li>
  <li><div><b>Te proponemos día y hora</b><span>Lo cuadramos con la profesional y te escribimos en menos de 24 h laborables.</span></div></li>
  <li><div><b>Recibes el enlace de Google Meet</b><span>En el ordenador se abre en el navegador. En el móvil, con la app de Google Meet.</span></div></li>
  <li><div><b>Habláis</b><span>A la hora acordada, entra en el enlace. Ten a mano lo que quieras enseñar: un informe, una foto, el bebé.</span></div></li>
</ol>

<h2>Lo que conviene saber</h2>
<div class="vc-faq">
  <div><b>¿Y si no puedo a la hora acordada?</b><p>Puedes cambiarla o cancelarla hasta 1 hora antes y te devolvemos el dinero entero. Si avisas con menos de 1 hora o no te conectas, no se devuelve.</p></div>
  <div><b>¿Se graba la llamada?</b><p>No. La llamada no se graba y en ella solo estáis tú y la profesional.</p></div>
  <div><b>¿Necesito una cuenta de Google?</b><p>En el ordenador, no: basta con abrir el enlace en el navegador. En el móvil, la app de Google Meet puede pedirte iniciar sesión.</p></div>
  <div><b>¿Para qué no sirve?</b><p>No es para urgencias ni sustituye una exploración en persona. Si la profesional cree que necesitas que te vean, te lo dirá.</p></div>
</div>

<div class="vc-alt">
  <h3>¿Te basta con una respuesta por escrito?</h3>
  <p>Escribe tu duda y la profesional te responde en menos de 48 h. Tus 2 primeras consultas son gratis, sin tarjeta.</p>
  <p><a href="/#ask">Preguntar gratis por escrito</a></p>
</div>
<p class="vc-urg">No es para urgencias. Si hay sangrado abundante, pérdida de líquido, el bebé no se mueve, dolor muy fuerte o fiebre alta en un bebé pequeño, llama al 112 o ve a urgencias.</p>
</div>
<template id="vc-form-t"><form class="vc-form" novalidate>
  <label>Tu correo, para enviarte los pasos<input type="email" name="email" inputmode="email" autocomplete="email" placeholder="nombre@correo.com" required></label>
  <button class="vc-btn" type="submit"></button>
  <p class="vc-err" hidden></p>
  <small>Después del pago te llega un correo: respóndelo con 3 franjas que te vengan bien y te proponemos hora en menos de 24 h laborables. Cancelación gratis hasta 1 hora antes.</small>
</form></template>
<script type="module">
  import { device, isTeam } from '/app/js/track.js';
  const API = 'https://hera-consultas.tempcheck-app.workers.dev';
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  const hit = (e) => { if (local || isTeam()) return; fetch(API + '/hit', { method: 'POST', body: JSON.stringify({ e, d: device() }), keepalive: true }).catch(() => {}); };
  const store = { get: (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const isEmail = (e) => /^[^\\s@<>()",;]+@[^\\s@<>()",;]+\\.[a-z]{2,24}$/i.test(e.trim());
  const q = new URLSearchParams(location.search);
  hit(['respuesta', 'app'].includes(q.get('de')) ? 'video_pagina:' + q.get('de') : 'video_pagina');
  // Anuncios: misma marca de 30 días que la portada (sin cookies)
  const AD_KEY = 'hera-src';
  if (q.has('gclid') || /^(cpc|ppc|paid)$/i.test(q.get('utm_medium') || '')) {
    const c = (q.get('utm_campaign') || '').toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 24);
    store.set(AD_KEY, JSON.stringify({ c, at: Date.now() }));
    hit(c ? 'anuncio_visita:' + c : 'anuncio_visita');
  }
  const fromAd = () => { try { const a = JSON.parse(store.get(AD_KEY) || 'null'); return !!(a && Date.now() - a.at < 30 * 86400000); } catch { return false; } };

  const note = document.getElementById('vc-note');
  const say = (html) => { note.innerHTML = html; note.hidden = false; };
  let open = null;
  function openForm(btn) {
    if (open) { open.form.remove(); open.btn.hidden = false; }
    const form = document.getElementById('vc-form-t').content.firstElementChild.cloneNode(true);
    const { plan, pro, eur, who } = btn.dataset;
    const send = form.querySelector('button');
    send.textContent = 'Pagar ' + eur + ' €';
    const email = form.querySelector('input');
    email.value = store.get('hera-ask-email');
    btn.hidden = true; btn.after(form); open = { form, btn };
    hit('video_reserva:' + pro);
    setTimeout(() => email.focus({ preventScroll: true }), 50);
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const err = form.querySelector('.vc-err');
      err.hidden = true;
      if (!isEmail(email.value)) { err.textContent = 'Revisa tu correo: ahí te enviamos los pasos.'; err.hidden = false; return; }
      store.set('hera-ask-email', email.value.trim());
      send.disabled = true; send.textContent = 'Abriendo el pago…';
      hit('video_pago:' + pro);
      try {
        const r = await fetch(API + '/checkout', { method: 'POST', body: JSON.stringify({ email: email.value.trim(), plan, pro, back: 'video', ...(fromAd() ? { src: 'ads' } : {}) }) });
        const j = await r.json();
        if (!j.url) throw new Error();
        location.href = j.url;
      } catch {
        send.disabled = false; send.textContent = 'Pagar ' + eur + ' €';
        err.textContent = 'No hemos podido abrir el pago. Inténtalo en un momento o escríbenos a contacto@hera-gine.com.'; err.hidden = false;
      }
    });
  }
  document.querySelectorAll('.vc-btn[data-plan]').forEach((b) => b.addEventListener('click', () => openForm(b)));
  // Enlace directo: /videollamada/#reservar-matrona o #lactancia
  const m = /^#(reservar-(gineco|matrona|pediatra)|lactancia)$/.exec(location.hash);
  if (m) {
    const b = m[1] === 'lactancia' ? document.querySelector('[data-plan=lactancia]') : document.querySelector('[data-plan=video][data-pro=' + m[2] + ']');
    if (b) { b.closest('.vc-card').scrollIntoView({ block: 'start' }); openForm(b); }
  }
  // Vuelta de Stripe
  const pago = q.get('pago');
  if (pago) {
    history.replaceState(null, '', location.pathname);
    if (pago === 'no') say('<b>No se ha hecho ningún pago</b>Puedes volver a intentarlo cuando quieras.');
    else {
      say('<b>Comprobando el pago…</b>');
      fetch(API + '/checkout/status?cs=' + encodeURIComponent(q.get('cs') || '')).then((r) => r.json()).then((j) => {
        if (!j.paid) throw new Error();
        hit('pago_hecho:' + j.plan);
        const who = { gineco: 'Gonzalo', matrona: 'Marina', pediatra: 'Lucía' }[j.pro] || 'la profesional';
        say('<b>Pago hecho. Ahora, elige tu hora</b>Te hemos enviado un correo a ' + esc(store.get('hera-ask-email') || 'tu dirección') + '. Respóndelo con 3 franjas que te vengan bien y te proponemos día y hora con ' + who + ' en menos de 24 h laborables. Si no lo ves, mira en «Promociones» o «Spam».');
      }).catch(() => say('<b>Aún no podemos confirmar el pago</b>Si te han cobrado, te llegará el correo en unos minutos. Si no, escríbenos a contacto@hera-gine.com.'));
    }
    note.scrollIntoView({ block: 'center' });
  }
</script>`;

const html = shell({
  title: 'Videollamada con ginecólogo, matrona o pediatra · Hera',
  desc: '30 minutos por videollamada con el ginecólogo, la matrona o la pediatra de Hera, desde casa y a la hora que te venga bien. 55 €. Asesoría de lactancia de 1 h 30 con Marina, 99 €.',
  path: '/videollamada/',
  ld: { '@context': 'https://schema.org', '@type': 'Service', name: 'Videollamada con profesionales de Hera', provider: { '@type': 'Organization', name: 'Hera', url: 'https://hera-gine.com' },
    offers: [{ '@type': 'Offer', name: 'Videollamada de 30 minutos', price: '55', priceCurrency: 'EUR' }, { '@type': 'Offer', name: 'Asesoría de lactancia (1 h 30)', price: '99', priceCurrency: 'EUR' }] },
  body,
});
fs.mkdirSync(new URL('videollamada/', ROOT), { recursive: true });
fs.writeFileSync(new URL('videollamada/index.html', ROOT), html);
console.log('videollamada/index.html', html.length, BEACON ? 'ok' : '');
