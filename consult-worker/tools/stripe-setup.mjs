// Prepara una cuenta de Stripe para Hera (vera-backlog#56). Se puede ejecutar más de una vez: lo que ya existe se reutiliza.
//
//   node tools/stripe-setup.mjs
//
// Lee STRIPE_SECRET_KEY de .secrets.json (sk_test_… o sk_live_…) y crea:
//   · los 3 precios, con lookup_key fijo (el Worker los busca por ese nombre): hera_suelta, hera_bono5, hera_mensual
//   · el aviso de pago (webhook) hacia el Worker; su secreto se guarda en .secrets.json como STRIPE_WEBHOOK_SECRET
//   · el portal de clientes (cancelar el ilimitado) con página de acceso por correo; imprime su URL para wrangler.toml
//
// Para pasar a la cuenta real: cambiar la clave en .secrets.json, ejecutar esto, subir los dos secretos al Worker
// (wrangler secret put STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET), poner la URL del portal y PAYMENTS = "on", desplegar.

import fs from 'node:fs';

const SECRETS = new URL('../.secrets.json', import.meta.url);
const secrets = JSON.parse(fs.readFileSync(SECRETS, 'utf8'));
const KEY = secrets.STRIPE_SECRET_KEY;
if (!/^sk_(test|live)_/.test(KEY || '')) { console.error('Falta STRIPE_SECRET_KEY en .secrets.json'); process.exit(1); }
const WEBHOOK_URL = 'https://hera-consultas.tempcheck-app.workers.dev/stripe/webhook';
const EVENTS = ['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'invoice.paid', 'customer.subscription.deleted'];

async function api(method, path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`https://api.stripe.com/v1/${path}${method === 'GET' && qs ? `?${qs}` : ''}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: method === 'GET' ? undefined : qs,
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`${path}: ${j.error?.message}`);
  return j;
}

const PRICES = [
  { lookup: 'hera_suelta', name: 'Consulta suelta', desc: 'Una consulta por escrito con una profesional de Hera.', amount: 900 },
  { lookup: 'hera_bono5', name: 'Bono de 5 consultas', desc: 'Cinco consultas por escrito. Válido 12 meses.', amount: 3500 },
  { lookup: 'hera_mensual', name: 'Hera ilimitado', desc: 'Consultas por escrito sin límite (hasta una nueva al día). Sin permanencia.', amount: 1500, monthly: true },
];

const mode = KEY.startsWith('sk_live_') ? 'REAL' : 'prueba';
console.log(`Cuenta de Stripe en modo ${mode}`);

for (const p of PRICES) {
  const found = await api('GET', 'prices', { 'lookup_keys[]': p.lookup, active: 'true' });
  if (found.data.length) { console.log(`· ${p.lookup}: ya existe`); continue; }
  const product = await api('POST', 'products', { name: p.name, description: p.desc });
  await api('POST', 'prices', {
    product: product.id, currency: 'eur', unit_amount: String(p.amount), lookup_key: p.lookup, tax_behavior: 'inclusive',
    ...(p.monthly ? { 'recurring[interval]': 'month' } : {}),
  });
  console.log(`· ${p.lookup}: creado (${p.amount / 100} €${p.monthly ? '/mes' : ''})`);
}

const hooks = await api('GET', 'webhook_endpoints', { limit: '100' });
const existing = hooks.data.find((w) => w.url === WEBHOOK_URL);
if (existing && secrets.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_')) {
  await api('POST', `webhook_endpoints/${existing.id}`, Object.fromEntries(EVENTS.map((e, i) => [`enabled_events[${i}]`, e])));
  console.log('· aviso de pago: ya existe (eventos al día)');
} else {
  if (existing) await api('DELETE', `webhook_endpoints/${existing.id}`);
  const w = await api('POST', 'webhook_endpoints', { url: WEBHOOK_URL, ...Object.fromEntries(EVENTS.map((e, i) => [`enabled_events[${i}]`, e])) });
  secrets.STRIPE_WEBHOOK_SECRET = w.secret;
  fs.writeFileSync(SECRETS, `${JSON.stringify(secrets, null, 2)}\n`);
  console.log('· aviso de pago: creado; secreto guardado en .secrets.json (STRIPE_WEBHOOK_SECRET)');
}

const portals = await api('GET', 'billing_portal/configurations', { limit: '100', active: 'true' });
let portal = portals.data.find((c) => c.metadata?.hera === '1');
if (!portal) {
  portal = await api('POST', 'billing_portal/configurations', {
    'features[subscription_cancel][enabled]': 'true', 'features[subscription_cancel][mode]': 'at_period_end',
    'features[payment_method_update][enabled]': 'true', 'features[invoice_history][enabled]': 'true',
    'login_page[enabled]': 'true', 'business_profile[headline]': 'Hera · tu suscripción', 'metadata[hera]': '1', default_return_url: 'https://hera-gine.com/app/',
  });
  console.log('· portal de clientes: creado');
} else console.log('· portal de clientes: ya existe');
console.log(`STRIPE_PORTAL_URL = "${portal.login_page?.url}"`);
