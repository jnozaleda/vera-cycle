// Pagos con Stripe (vera-backlog#56): consulta suelta, bono de 5 e ilimitado mensual.
//
// Flujo: la app pide POST /checkout {email, plan} → sesión de Stripe Checkout → la usuaria paga en Stripe →
// Stripe avisa a POST /stripe/webhook (firmado) y la app, al volver, consulta GET /checkout/status?cs=… .
// Las dos vías llaman a grantSession(), que solo suma una vez por sesión.
//
// A Stripe solo le llegan el correo, el plan y la huella del correo (metadata.h). Nunca el texto de la consulta.
//
// D1 (no KV: KV tarda hasta un minuto en verse igual en todas partes y podría sumar un bono dos veces):
//   pagos(session PK, h, plan, live, at)   cada sesión pagada, una vez (plan «…:devuelto» si se reembolsó)
//   saldo(h PK, n, until, sub, sub_until, day)   consultas pagadas (caducan 12 meses tras la última compra) e ilimitado
//   (day = último día de Madrid con consulta nueva del ilimitado: tope de una al día)
//
// Secretos: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET. Variables: PAYMENTS ("off" | "test" | "on"), STRIPE_PORTAL_URL.
// Los precios se buscan por lookup_key (tools/stripe-setup.mjs los crea en cualquier cuenta).

export const PLANS = {
  suelta: { lookup: 'hera_suelta', mode: 'payment', credits: 1, label: 'Consulta suelta', eur: 9 },
  bono: { lookup: 'hera_bono5', mode: 'payment', credits: 5, label: 'Bono de 5 consultas', eur: 35 },
  mensual: { lookup: 'hera_mensual', mode: 'subscription', credits: 0, label: 'Ilimitado mensual', eur: 15 },
};

const CREDIT_DAYS = 365;
const SUB_GRACE_DAYS = 2;
const APP_URL = 'https://hera-gine.com/app/';

/** ¿Se ofrecen los pagos a esta petición? «test»: solo a quien activa la prueba en la app (?pagos=1) */
export const paymentsOn = (env, body) => env.PAYMENTS === 'on' || (env.PAYMENTS === 'test' && body?.payTest === true);

async function api(env, method, path, params) {
  const body = params ? new URLSearchParams(params).toString() : undefined;
  const res = await fetch(`https://api.stripe.com/v1/${path}${method === 'GET' && body ? `?${body}` : ''}`, {
    method,
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, ...(method !== 'GET' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    body: method !== 'GET' ? body : undefined,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`stripe ${res.status} ${j.error?.message || ''}`);
  return j;
}

const priceCache = {};
async function priceId(env, lookup) {
  if (priceCache[lookup]) return priceCache[lookup];
  const j = await api(env, 'GET', 'prices', { 'lookup_keys[]': lookup, active: 'true' });
  const id = j.data?.[0]?.id;
  if (!id) throw new Error(`stripe: falta el precio ${lookup} (ejecuta tools/stripe-setup.mjs)`);
  return (priceCache[lookup] = id);
}

/** Crea la sesión de pago y devuelve su URL */
export async function createCheckout(env, { email, plan, h, origin, back, ad }) {
  const p = PLANS[plan];
  // Vuelve al mismo sitio desde el que se pagó (la web real, o localhost en pruebas)
  // back = 'web': desde la portada, vuelve a la portada (?web=1 evita que salte a la app instalada)
  const root = origin && origin !== 'https://hera-gine.com' ? origin : APP_URL.replace(/\/app\/$/, '');
  const ret = back === 'web' ? `${root}/?web=1&` : `${root}/app/?`;
  const params = {
    mode: p.mode,
    'line_items[0][price]': await priceId(env, p.lookup),
    'line_items[0][quantity]': '1',
    customer_email: email,
    locale: 'es',
    success_url: `${ret}pago=ok&cs={CHECKOUT_SESSION_ID}`,
    cancel_url: `${ret}pago=no`,
    'metadata[h]': h,
    'metadata[plan]': plan,
    ...(ad ? { 'metadata[src]': 'ads' } : {}),
  };
  if (p.mode === 'subscription') { params['subscription_data[metadata][h]'] = h; params['subscription_data[metadata][plan]'] = plan; }
  const s = await api(env, 'POST', 'checkout/sessions', params);
  return s.url;
}

/** Fin del periodo pagado de una suscripción (la API nueva lo lleva en cada línea) */
const periodEnd = (sub) => sub.current_period_end || sub.items?.data?.[0]?.current_period_end || 0;
const ensure = (env, h) => env.DB.prepare('INSERT OR IGNORE INTO saldo (h, n) VALUES (?1, 0)').bind(h).run();

async function setSubscription(env, h, sub) {
  const until = new Date((periodEnd(sub) + SUB_GRACE_DAYS * 86400) * 1000).toISOString();
  await ensure(env, h);
  await env.DB.prepare('UPDATE saldo SET sub = ?2, sub_until = ?3 WHERE h = ?1').bind(h, sub.id, until).run();
}

/** Lo que tiene pagado esa huella: {credits, sub (ilimitado vigente), day} */
export async function getBalance(env, h) {
  const r = await env.DB.prepare('SELECT n, until, sub_until, day FROM saldo WHERE h = ?1').bind(h).first();
  const now = new Date().toISOString();
  return { credits: r && r.n > 0 && r.until > now ? r.n : 0, sub: !!(r?.sub_until && r.sub_until > now), day: r?.day || null };
}

/** Gasta una consulta pagada; devuelve las que quedan (o -1 si no había) */
export async function spendCredit(env, h) {
  const r = await env.DB.prepare('UPDATE saldo SET n = n - 1 WHERE h = ?1 AND n > 0 AND until > ?2 RETURNING n').bind(h, new Date().toISOString()).first();
  return r ? r.n : -1;
}

/** Ilimitado: apunta el día de la consulta nueva */
export const markDay = (env, h, day) => env.DB.prepare('UPDATE saldo SET day = ?2 WHERE h = ?1').bind(h, day).run();

export async function addCredits(env, h, n) {
  const now = new Date().toISOString();
  const until = new Date(Date.now() + CREDIT_DAYS * 86400000).toISOString();
  await ensure(env, h);
  // Si el saldo anterior había caducado, se empieza de cero; si no, se suma y se alarga la caducidad
  await env.DB.prepare('UPDATE saldo SET n = (CASE WHEN until > ?3 THEN n ELSE 0 END) + ?2, until = ?4 WHERE h = ?1').bind(h, n, now, until).run();
}

/** Suma lo comprado en una sesión pagada (una sola vez). Devuelve {plan, h, granted} o null si no está pagada. */
export async function grantSession(env, s, hooks) {
  const plan = s.metadata?.plan;
  const h = s.metadata?.h;
  if (!PLANS[plan] || !/^[a-f0-9]{64}$/.test(h || '')) return null;
  if (s.status !== 'complete' || (s.payment_status !== 'paid' && s.payment_status !== 'no_payment_required')) return null;
  const ins = await env.DB.prepare('INSERT OR IGNORE INTO pagos (session, h, plan, live, at) VALUES (?1, ?2, ?3, ?4, ?5)')
    .bind(s.id, h, plan, s.livemode ? 1 : 0, new Date().toISOString()).run();
  if (!ins.meta?.changes) return { plan, h, granted: false };
  if (PLANS[plan].mode === 'subscription') {
    const sub = typeof s.subscription === 'string' ? await api(env, 'GET', `subscriptions/${s.subscription}`) : s.subscription;
    await setSubscription(env, h, sub);
  } else {
    await addCredits(env, h, PLANS[plan].credits);
  }
  await hooks?.paid?.(plan, s);
  return { plan, h, granted: true };
}

/** Lo que la app enseña al volver de pagar */
export async function sessionStatus(env, cs, hooks) {
  if (!/^cs_(test|live)_[A-Za-z0-9]{10,200}$/.test(cs || '')) return { error: 'bad_session' };
  const s = await api(env, 'GET', `checkout/sessions/${cs}`);
  const g = await grantSession(env, s, hooks);
  if (!g) return { paid: false };
  const out = { paid: true, plan: g.plan, credits: (await getBalance(env, g.h)).credits };
  if (PLANS[g.plan].mode === 'subscription') { out.unlimited = true; if (env.STRIPE_PORTAL_URL) out.portal = env.STRIPE_PORTAL_URL; }
  return out;
}

async function verify(env, raw, header) {
  if (!env.STRIPE_WEBHOOK_SECRET || !header) return false;
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=')).filter((x) => x.length === 2 && x[0] !== 'v1'));
  const sigs = header.split(',').filter((kv) => kv.startsWith('v1=')).map((kv) => kv.slice(3));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.STRIPE_WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${raw}`)))].map((b) => b.toString(16).padStart(2, '0')).join('');
  return sigs.some((s) => s.length === mac.length && [...s].reduce((d, c, i) => d | (c.charCodeAt(0) ^ mac.charCodeAt(i)), 0) === 0);
}

/** POST /stripe/webhook: devuelve el código HTTP */
export async function handleWebhook(env, request, hooks) {
  const raw = await request.text();
  if (!(await verify(env, raw, request.headers.get('Stripe-Signature')))) return 400;
  let ev;
  try { ev = JSON.parse(raw); } catch { return 400; }
  const o = ev.data?.object || {};
  try {
    if (ev.type === 'checkout.session.completed' || ev.type === 'checkout.session.async_payment_succeeded') {
      await grantSession(env, o, hooks);
    } else if (ev.type === 'invoice.paid') {
      // Renovación mensual: se alarga el ilimitado hasta el nuevo fin de periodo
      const subId = o.subscription || o.parent?.subscription_details?.subscription;
      if (subId) {
        const sub = await api(env, 'GET', `subscriptions/${subId}`);
        if (/^[a-f0-9]{64}$/.test(sub.metadata?.h || '') && sub.status === 'active') await setSubscription(env, sub.metadata.h, sub);
      }
    } else if (ev.type === 'charge.refunded' && o.refunded && o.payment_intent) {
      // Reembolso completo de una suelta o un bono: se quitan esas consultas del saldo (una sola vez)
      const found = await api(env, 'GET', 'checkout/sessions', { payment_intent: o.payment_intent, limit: '1' });
      const cs = found.data?.[0];
      const plan = cs?.metadata?.plan;
      const h = cs?.metadata?.h;
      if (PLANS[plan]?.credits && /^[a-f0-9]{64}$/.test(h || '')) {
        const r = await env.DB.prepare("UPDATE pagos SET plan = plan || ':devuelto' WHERE session = ?1 AND plan NOT LIKE '%:devuelto'").bind(cs.id).run();
        if (r.meta?.changes) {
          await env.DB.prepare('UPDATE saldo SET n = MAX(0, n - ?2) WHERE h = ?1').bind(h, PLANS[plan].credits).run();
          await hooks?.refunded?.(plan, o);
        }
      }
    } else if (ev.type === 'customer.subscription.deleted') {
      const h = o.metadata?.h;
      if (/^[a-f0-9]{64}$/.test(h || '')) {
        const r = await env.DB.prepare('UPDATE saldo SET sub_until = ?3 WHERE h = ?1 AND sub = ?2').bind(h, o.id, new Date().toISOString()).run();
        if (r.meta?.changes) await hooks?.cancelled?.();
      }
    }
  } catch (e) { console.log(`webhook ${ev.type} ${e.message}`); return 500; }
  return 200;
}
