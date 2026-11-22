// Página de consultas y planes: /consultas/ (Noza, 22 nov; borrador aprobado)
// Cada tarjeta se rellena y se paga ahí mismo, como en /videollamada/:
//   · Una consulta: profesional + duda + correo → se guarda (POST /ask) → pago de 9 € (o 29 € en la prueba de precio) → llega a la profesional
//   · Bono de 5: correo → pago → vuelve aquí con 5 consultas para usar
//   · Acompañamiento mensual: profesional + correo → suscripción de 99 €/mes (plan «acomp» del servicio)
// La prueba 9 € / 29 € es la misma que en la portada (localStorage «hera-ab-precio»).
//
//   node tools/build-consultas.mjs

import fs from 'node:fs';
import { shell, BEACON } from './web-shell.mjs';

const ROOT = new URL('../', import.meta.url);
const tick = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
const ico = {
  user: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>',
  doc: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>',
  lock: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  back: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
};

const TEAM = [
  ['gineco', 'Dr. Gonzalo Nozaleda', 'Ginecólogo', 'gonzalo.jpg?v=2', 'Hospital Gregorio Marañón'],
  ['matrona', 'Marina Fernández', 'Matrona y asesora de lactancia', 'marina.jpg?v=2', 'Clínica Universidad de Navarra'],
  ['pediatra', 'Dra. Lucía Carrascón', 'Pediatra', 'lucia.jpg?v=3', 'Hospital Gregorio Marañón'],
];
const SHORT = { gineco: 'Gonzalo', matrona: 'Marina', pediatra: 'Lucía' };
const pick = (name) => `<fieldset class="cq-who"><legend>¿Con quién?</legend>${TEAM.map(([k, , role, photo]) => `<label><input type="radio" name="${name}" value="${k}"><img src="/portada/equipo/${photo}" alt="" width="34" height="34" loading="lazy"><span><b>${SHORT[k]}</b><small>${role.split(' y ')[0]}</small></span></label>`).join('')}</fieldset>`;
const mailField = '<label class="cq-f">Tu correo<input type="email" name="email" inputmode="email" autocomplete="email" placeholder="nombre@correo.com" required></label>';

const STYLE = `<style>
.cq{padding-bottom:24px}.cq-hero{padding-top:18px;padding-bottom:4px}.cq-hero h1{font-size:clamp(38px,6vw,58px);margin:10px 0 12px;max-width:13em}.cq-hero h1 em{font-style:italic}
.cq-lead{font-size:18px;color:#4F4E49;max-width:34em}
.cq-team{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px;margin-top:22px}
.cq-p{display:flex;gap:12px;align-items:center;background:#fff;border:1px solid #E5E1D8;border-radius:12px;padding:12px 14px;text-decoration:none}
.cq-p img{width:48px;height:48px;border-radius:50%;object-fit:cover;flex:none}.cq-p b{display:block;font-size:15px}.cq-p span{display:block;font-size:13px;color:#6E6C67;line-height:1.4}
.cq-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:14px;margin-top:26px;align-items:start}
.cq-card{background:#fff;border:1.5px solid #E8DCD6;border-radius:12px;padding:20px;display:flex;flex-direction:column;gap:14px;scroll-margin-top:20px}
.cq-card.cq-top{border-color:#45574C}
.cq-k{font-size:12px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#8A7045}.cq-card.cq-top .cq-k{color:#45574C}
.cq-card h2{font-size:28px;margin:2px 0 0;color:#45574C}
.cq-pr{display:flex;align-items:baseline;gap:8px}.cq-pr strong{font:600 32px/1 Inter,sans-serif;color:#2F3631}.cq-pr span{font-size:14px;color:#6E6C67}
.cq-l{list-style:none;padding:0;margin:0;display:grid;gap:7px;font-size:14.5px;color:#2F3631}.cq-l li{display:flex;gap:8px;align-items:flex-start}.cq-l svg{flex:none;margin-top:4px;color:#45574C}
.cq-btn{font:600 15px/1.2 Inter,sans-serif;color:#fff;background:#45574C;border:0;border-radius:6px;padding:14px;cursor:pointer;width:100%}.cq-btn:hover{background:#384A3F}.cq-btn:disabled{opacity:.6;cursor:default}
.cq-btn2{background:#fff;color:#45574C;border:1.5px solid #45574C}.cq-btn2:hover{background:#F6E0E2}
.cq-form{display:grid;gap:12px;background:#FAF9F4;border-radius:10px;padding:14px}
.cq-f{font-size:13.5px;color:#4F4E49;display:grid;gap:6px}
.cq-form input[type=email],.cq-form textarea{width:100%;border:1px solid #E5E1D8;border-radius:6px;padding:11px 12px;font:400 16px/1.45 Inter,sans-serif;background:#fff;color:#2F3631}
.cq-form textarea{min-height:110px;resize:vertical}
.cq-form input:focus,.cq-form textarea:focus{outline:none;border-color:#45574C;box-shadow:0 0 0 3px rgba(69,87,76,.18)}
.cq-who{border:0;padding:0;margin:0;display:grid;gap:6px}.cq-who legend{font-size:13.5px;color:#4F4E49;margin-bottom:6px;padding:0}
.cq-who label{display:flex;align-items:center;gap:10px;background:#fff;border:1.5px solid #E5E1D8;border-radius:8px;padding:8px 10px;cursor:pointer}
.cq-who label:has(input:checked){border-color:#45574C;background:#F3F6F1}.cq-who input{accent-color:#45574C;margin:0}
.cq-who img{width:34px;height:34px;border-radius:50%;object-fit:cover}.cq-who b{display:block;font-size:14px;font-weight:600}.cq-who small{display:block;font-size:12.5px;color:#6E6C67}
.cq-form small{font-size:12.5px;color:#6E6C67;line-height:1.45}.cq-err{color:#B3261E;font-size:13.5px;margin:0}
.cq-note{background:#DCEBE4;border-radius:12px;padding:16px 18px;margin-top:18px;font-size:15px;color:#2D4A3A}.cq-note b{display:block;font:400 22px/1.2 Newsreader,Georgia,serif;color:#2D4A3A;margin-bottom:4px}.cq-note a{color:#2D4A3A;font-weight:600}
.cq-why{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px;margin-top:44px;padding-top:26px;border-top:1px solid #E5E1D8}
.cq-why div{display:grid;gap:4px}.cq-why svg{color:#45574C}.cq-why b{font-size:15.5px}.cq-why p{font-size:14.5px;color:#4F4E49}
.cq h2.cq-h{font-size:30px;color:#45574C;margin:48px 0 6px}
.cq-faq{max-width:660px;margin-top:10px}.cq-faq div{border-top:1px solid #E5E1D8;padding:14px 0}.cq-faq b{display:block;font-size:15.5px;margin-bottom:3px}.cq-faq p{font-size:14.5px;color:#4F4E49}.cq-faq a{color:#45574C;font-weight:600}
.cq-urg{font-size:13.5px;color:#B3261E;margin:18px 0 26px;max-width:660px}
</style>`;

const body = `${STYLE}<div class="w cq">
<section class="cq-hero">
  <p class="ey">Consultas</p>
  <h1>Pregunta a tu especialista. <em>Una respuesta pensada solo para ti.</em></h1>
  <p class="cq-lead">Gonzalo, Marina y Lucía leen tu caso entero y te responden por escrito, con calma. Sin cita, sin desplazarte y desde el móvil.</p>
  <div class="cq-team">${TEAM.map(([k, name, role, photo, where]) => `<a class="cq-p" href="/equipo.html#${{ gineco: 'gonzalo', matrona: 'marina', pediatra: 'lucia' }[k]}"><img src="/portada/equipo/${photo}" alt="" width="48" height="48" loading="lazy"><span><b>${name}</b><span>${role}</span><span>${where} · más de 15 años</span></span></a>`).join('')}</div>
  <div class="cq-note" id="cq-note" hidden aria-live="polite"></div>
</section>

<div class="cq-cards">
  <article class="cq-card" id="consulta">
    <div><p class="cq-k">Por escrito</p><h2 id="c1-t">Una consulta</h2></div>
    <div class="cq-pr"><strong id="c1-eur">9 €</strong><span id="c1-sub">respuesta en menos de 24 h</span></div>
    <ul class="cq-l" id="c1-l">
      <li>${tick}<span id="c1-l1">Respuesta personal y detallada en menos de 24 h</span></li>
      <li>${tick}<span>Seguimiento incluido: puedes responderle por correo</span></li>
      <li>${tick}<span>Puedes enviarle fotos o informes respondiendo al correo</span></li>
    </ul>
    <button type="button" class="cq-btn" data-open="consulta">Escribir mi consulta</button>
  </article>

  <article class="cq-card" id="bono">
    <div><p class="cq-k">Por escrito</p><h2>Bono de 5</h2></div>
    <div class="cq-pr"><strong>35 €</strong><span>7 € cada consulta</span></div>
    <ul class="cq-l">
      <li>${tick}<span>5 consultas con quien quieras de las tres</span></li>
      <li>${tick}<span>Válido 12 meses</span></li>
      <li>${tick}<span>Seguimiento por correo incluido en cada una</span></li>
    </ul>
    <button type="button" class="cq-btn cq-btn2" data-open="bono">Comprar el bono</button>
  </article>

  <article class="cq-card cq-top" id="acompanamiento">
    <div><p class="cq-k">Lo más completo</p><h2>Acompañamiento mensual</h2></div>
    <div class="cq-pr"><strong>99 €</strong><span>al mes · sin permanencia</span></div>
    <ul class="cq-l">
      <li>${tick}<span>Consultas por escrito cuando lo necesites</span></li>
      <li>${tick}<span>Respuesta en menos de 6 h</span></li>
      <li>${tick}<span>Una videollamada de 30 min al mes</span></li>
      <li>${tick}<span>WhatsApp con la profesional que elijas, de 9:00 a 21:00</span></li>
      <li>${tick}<span>Para embarazo, posparto, crianza o menopausia</span></li>
    </ul>
    <button type="button" class="cq-btn" data-open="acomp">Empezar el acompañamiento</button>
  </article>
</div>

<div class="cq-why">
  <div>${ico.user}<b>Especialistas colegiados</b><p>Nada de chats automáticos: te responde la profesional que eliges.</p></div>
  <div>${ico.doc}<b>Tu caso, entero</b><p>Leen lo que cuentas y te responden a ti, no con un texto general.</p></div>
  <div>${ico.lock}<b>Privado</b><p>Solo la lee tu profesional. No ve tu correo y no lo compartimos con nadie.</p></div>
  <div>${ico.back}<b>Garantía</b><p>Si no quedas satisfecha, te devolvemos el dinero. Basta con responder al correo.</p></div>
</div>

<h2 class="cq-h">Lo que conviene saber</h2>
<div class="cq-faq">
  <div><b>¿Quién responde a mi consulta?</b><p>El ginecólogo Gonzalo Nozaleda, la matrona Marina Fernández o la pediatra Lucía Carrascón, según a quién elijas. Te responde esa persona, con su nombre, no un chat automático. <a href="/equipo.html">Conoce al equipo</a>.</p></div>
  <div><b>¿Por qué no buscarlo en internet?</b><p>En foros y buscadores las respuestas se contradicen, no sabes quién las escribe y están pensadas para cualquiera. Aquí te responde una profesional con nombre, a ti, con tu semana de embarazo o la edad de tu bebé, y te dice cuándo sí hay que ir a urgencias.</p></div>
  <div><b>¿Tengo que crear una cuenta o instalar algo?</b><p>No. Escribes tu duda y tu correo, y la respuesta te llega por correo. La app de Hera es gratis y opcional: <a href="/support.html">cómo instalarla</a>.</p></div>
  <div><b>¿Cuándo se cobra la consulta?</b><p>Primero escribes tu duda y después pagas. Hasta que no pagas no se cobra nada, y la consulta no le llega a la profesional.</p></div>
  <div><b>¿Y si la respuesta no me sirve?</b><p>Puedes responderle por correo con lo que te falte. Si aun así no quedas satisfecha, escríbenos y te devolvemos el dinero.</p></div>
  <div><b>¿Qué incluye el WhatsApp del acompañamiento?</b><p>Un número de Hera para hablar con la profesional que elijas, de 9:00 a 21:00 (hora de España), para dudas rápidas. Para algo largo, mejor por escrito o en la videollamada. Te escribimos nosotros en menos de 24 h desde que empiezas.</p></div>
  <div><b>¿Cómo se reserva la videollamada del mes?</b><p>Respondes al correo de bienvenida con 3 franjas que te vengan bien y te proponemos día y hora en menos de 24 h laborables.</p></div>
  <div><b>¿Puedo dejar el acompañamiento cuando quiera?</b><p>Sí. No hay permanencia: lo dejas respondiendo a cualquier correo nuestro y no se te vuelve a cobrar.</p></div>
  <div><b>¿Solo quieres hablar una vez?</b><p>También hay <a href="/videollamada/">videollamada de 30 minutos (55 €) y llamada de 15 minutos (25 €)</a> sin suscripción.</p></div>
</div>

<p class="cq-urg">No es para urgencias. Si hay sangrado abundante, pérdida de líquido, el bebé no se mueve, dolor muy fuerte o fiebre alta en un bebé pequeño, llama al 112 o ve a urgencias.</p>
</div>

<template id="t-consulta"><form class="cq-form" novalidate>
  ${pick('to')}
  <label class="cq-f">Tu duda<textarea name="text" placeholder="Cuéntaselo con tus palabras: qué te pasa, desde cuándo, tu edad o tu semana de embarazo…" required></textarea></label>
  ${mailField}
  <button class="cq-btn" type="submit"></button>
  <p class="cq-err" hidden></p>
  <small>No se cobra nada hasta que lo confirmas. Tarjeta, Apple Pay o Google Pay. Si no quedas satisfecha, te devolvemos el dinero.</small>
</form></template>
<template id="t-bono"><form class="cq-form" novalidate>
  ${mailField}
  <button class="cq-btn" type="submit">Pagar 35 €</button>
  <p class="cq-err" hidden></p>
  <small>El bono va a nombre de este correo: úsalo siempre al preguntar. Tarjeta, Apple Pay o Google Pay.</small>
</form></template>
<template id="t-acomp"><form class="cq-form" novalidate>
  ${pick('pro')}
  ${mailField}
  <button class="cq-btn" type="submit">Empezar · 99 € al mes</button>
  <p class="cq-err" hidden></p>
  <small>En el pago te pedimos el móvil para el WhatsApp. Sin permanencia: lo dejas cuando quieras. Si no quedas satisfecha, te devolvemos el dinero.</small>
</form></template>
<script type="module">
  import { device, isTeam } from '/app/js/track.js';
  const API = 'https://hera-consultas.tempcheck-app.workers.dev';
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  let ptag = ''; let line = null;
  const hit = (e) => {
    if (local || isTeam()) return;
    const send = () => fetch(API + '/hit', { method: 'POST', body: JSON.stringify({ e, d: device(), p: ptag }), keepalive: true }).then((r) => r.json()).then((j) => { if (/^[0-9A-F]{4}$/.test(j?.p || '')) ptag = j.p; }).catch(() => {});
    line = !ptag && line ? line.then(send) : send();
  };
  const store = { get: (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const isEmail = (e) => /^[^\\s@<>()",;]+@[^\\s@<>()",;]+\\.[a-z]{2,24}$/i.test(e.trim());
  const NAMES = { gineco: 'Gonzalo', matrona: 'Marina', pediatra: 'Lucía' };
  const q = new URLSearchParams(location.search);
  hit('consultas_pagina');
  // Anuncios: misma marca de 30 días que la portada (sin cookies)
  const AD_KEY = 'hera-src';
  if (q.has('gclid') || /^(cpc|ppc|paid)$/i.test(q.get('utm_medium') || '')) {
    const c = (q.get('utm_campaign') || '').toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 24);
    store.set(AD_KEY, JSON.stringify({ c, at: Date.now() }));
    hit(c ? 'anuncio_visita:' + c : 'anuncio_visita');
  }
  const ad = () => { try { const a = JSON.parse(store.get(AD_KEY) || 'null'); return a && Date.now() - a.at < 30 * 86400000 ? { src: 'ads', ...(a.c ? { camp: a.c } : {}) } : {}; } catch { return {}; } };
  // Prueba de precio 9 € / 29 € (la misma que la portada, fija por dispositivo)
  let ab = store.get('hera-ab-precio');
  if (ab !== 'pago' && ab !== 'prio') { ab = Math.random() < 0.5 ? 'pago' : 'prio'; store.set('hera-ab-precio', ab); }
  hit('ab_visita:' + ab);
  const PRIO = ab === 'prio';
  const PRICE = PRIO ? '29 €' : '9 €';
  if (PRIO) {
    document.getElementById('c1-t').textContent = 'Consulta prioritaria';
    document.getElementById('c1-eur').textContent = '29 €';
    document.getElementById('c1-sub').textContent = 'respuesta en menos de 6 h';
    document.getElementById('c1-l1').textContent = 'Respuesta personal y detallada en menos de 6 h';
    const li = document.createElement('li'); li.innerHTML = document.querySelector('#c1-l li').innerHTML; li.querySelector('span').textContent = 'Revisa tus analíticas, ecografías o informes';
    document.getElementById('c1-l').appendChild(li);
  }

  const note = document.getElementById('cq-note');
  const say = (html) => { note.innerHTML = html; note.hidden = false; note.scrollIntoView({ block: 'center' }); };
  const checkout = async (plan, email, extra) => {
    const r = await fetch(API + '/checkout', { method: 'POST', body: JSON.stringify({ email, plan, back: 'consultas', p: ptag, ...(isTeam() ? { team: true } : {}), ...ad(), ...extra }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.url) throw new Error();
    location.href = j.url;
  };
  let open = null;
  function openForm(btn, auto = false) {
    if (open) { open.form.remove(); open.btn.hidden = false; }
    const kind = btn.dataset.open;
    const form = document.getElementById('t-' + kind).content.firstElementChild.cloneNode(true);
    const send = form.querySelector('button[type=submit]');
    const label = kind === 'consulta' ? 'Pagar ' + PRICE + ' y enviar' : send.textContent;
    send.textContent = label;
    const email = form.querySelector('input[type=email]');
    email.value = store.get('hera-ask-email');
    btn.hidden = true; btn.after(form); open = { form, btn };
    if (!auto) hit('clic:consultas_' + kind);
    const first = form.querySelector('input[type=radio]:checked, textarea') || form.querySelector('input[type=radio]');
    if (!auto && kind === 'bono') setTimeout(() => email.focus({ preventScroll: true }), 50);
    const err = form.querySelector('.cq-err');
    const fail = (t) => { err.textContent = t; err.hidden = false; send.disabled = false; send.textContent = label; };
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      err.hidden = true;
      const who = form.querySelector('input[type=radio]:checked')?.value || '';
      const text = form.querySelector('textarea')?.value.trim() || '';
      if (form.querySelector('.cq-who') && !who) return fail('Elige con quién.');
      if (kind === 'consulta' && text.length < 10) return fail('Cuéntanos un poco más tu duda.');
      if (!isEmail(email.value)) return fail('Revisa tu correo: ahí te llega la respuesta.');
      const mail = email.value.trim(); store.set('hera-ask-email', mail);
      send.disabled = true; send.textContent = 'Un momento…';
      try {
        if (kind === 'bono') { hit('pago_elegido:bono'); return await checkout('bono', mail, {}); }
        if (kind === 'acomp') { hit('pago_elegido:acomp'); return await checkout('acomp', mail, { pro: who }); }
        // Consulta: se guarda primero (no llega a la profesional hasta pagar) y después se paga
        const r = await fetch(API + '/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: mail, to: who, text, context: '', situation: '', p: ptag, ab, ...(isTeam() ? { team: true } : {}), ...ad() }) });
        const j = await r.json().catch(() => ({}));
        if (r.status === 429) return fail('Has enviado varias consultas seguidas. Espera unos minutos y vuelve a intentarlo.');
        if (j.error === 'bad_email') return fail('Revisa tu correo: parece que no es válido.');
        if (j.ok) { hit('enviada_consultas'); form.remove(); btn.hidden = false; open = null; say('<b>Consulta enviada a ' + esc(NAMES[who]) + '</b>Te responderá por correo en menos de ' + (j.acomp ? '6' : '24') + ' h. Mira también en «Promociones» o «Spam».'); return; }
        if (!j.held) return fail('No se ha podido enviar. Inténtalo de nuevo en un rato.');
        const plan = j.prio ? 'prio29' : 'suelta';
        hit('pago_elegido:' + plan);
        try { await checkout(plan, mail, { hold: j.held }); }
        catch { form.remove(); btn.hidden = false; open = null; say('<b>Tu consulta está guardada</b>No se ha podido abrir el pago. Te hemos mandado un correo a ' + esc(mail) + ' con el enlace para pagar ' + (j.prio ? '29 €' : '9 €') + ' y enviarla.'); }
      } catch { fail('No hemos podido abrir el pago. Inténtalo en un momento o escríbenos a contacto@hera-gine.com.'); }
    });
  }
  document.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openForm(b)));
  // Enlaces directos desde la portada: /consultas/#bono, #acompanamiento, #consulta
  const direct = { '#consulta': 'consulta', '#bono': 'bono', '#acompanamiento': 'acomp' }[location.hash];
  if (direct && !q.get('pago')) { const b = document.querySelector('[data-open=' + direct + ']'); if (b) { b.closest('.cq-card').scrollIntoView({ block: 'start' }); openForm(b, true); } }
  // Vuelta de Stripe
  const pago = q.get('pago');
  if (pago === 'no') { const pl = (q.get('plan') || '').toLowerCase(); hit(/^[a-z0-9]{1,24}$/.test(pl) ? 'pago_cancelado:' + pl : 'pago_cancelado'); }
  if (pago) {
    history.replaceState(null, '', location.pathname);
    if (pago === 'no') say('<b>No se ha hecho ningún pago</b>Puedes volver a intentarlo cuando quieras. Si tu consulta estaba escrita, sigue guardada: te hemos mandado el enlace por correo.');
    else {
      say('<b>Comprobando el pago…</b>');
      fetch(API + '/checkout/status?cs=' + encodeURIComponent(q.get('cs') || '')).then((r) => r.json()).then((j) => {
        if (!j.paid) throw new Error();
        hit('pago_hecho:' + j.plan);
        const mail = esc(store.get('hera-ask-email') || 'tu correo');
        if (j.held) say('<b>Pago hecho. Tu consulta ya ha llegado a ' + esc(NAMES[j.pro] || 'la profesional') + '</b>Te responderá por correo en menos de ' + (j.plan === 'prio29' ? '6' : '24') + ' h, a ' + mail + '. Si no lo ves, mira en «Promociones» o «Spam».');
        else if (j.acomp) say('<b>Bienvenida al acompañamiento con ' + esc(NAMES[j.pro] || 'tu profesional') + '</b>Te hemos enviado un correo a ' + mail + ': respóndelo con 3 franjas para tu videollamada de este mes. En menos de 24 h te escribimos por WhatsApp desde el número de Hera. Ya puedes escribir tus consultas: te responden en menos de 6 h. <a href="#consulta" id="cq-go">Escribir una consulta</a>');
        else say('<b>Pago hecho</b>Tienes ' + (j.credits === 1 ? '1 consulta' : (j.credits || 5) + ' consultas') + ' a nombre de ' + mail + '. <a href="#consulta" id="cq-go">Escribe tu primera consulta</a>');
        document.getElementById('cq-go')?.addEventListener('click', (ev) => { ev.preventDefault(); const b = document.querySelector('[data-open=consulta]'); b.closest('.cq-card').scrollIntoView({ block: 'start' }); openForm(b, true); });
      }).catch(() => say('<b>Aún no podemos confirmar el pago</b>Si te han cobrado, te llegará el correo en unos minutos. Si no, escríbenos a contacto@hera-gine.com.'));
    }
  }
</script>`;

const html = shell({
  title: 'Consultas con ginecólogo, matrona o pediatra · Hera',
  desc: 'Pregunta por escrito a Gonzalo (ginecólogo), Marina (matrona) o Lucía (pediatra) y recibe una respuesta personal. Consulta, bono de 5 o acompañamiento mensual con videollamada y WhatsApp.',
  path: '/consultas/',
  ld: { '@context': 'https://schema.org', '@type': 'Service', name: 'Consultas por escrito con profesionales de Hera', provider: { '@type': 'Organization', name: 'Hera', url: 'https://hera-gine.com' },
    offers: [{ '@type': 'Offer', name: 'Una consulta por escrito', price: '9', priceCurrency: 'EUR' }, { '@type': 'Offer', name: 'Bono de 5 consultas', price: '35', priceCurrency: 'EUR' }, { '@type': 'Offer', name: 'Acompañamiento mensual', price: '99', priceCurrency: 'EUR' }] },
  body,
});
fs.mkdirSync(new URL('consultas/', ROOT), { recursive: true });
fs.writeFileSync(new URL('consultas/index.html', ROOT), html);
console.log('consultas/index.html', html.length, BEACON ? 'ok' : '');
