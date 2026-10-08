// sw.js
// Service worker de Hera web: permite abrir la app sin conexión.
// Estrategia "red primero": siempre intenta la versión más reciente y usa la caché si no hay red.

const CACHE = 'vera-web-v60';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'js/app.js',
  'js/logic.js',
  'js/predict.js',
  'js/store.js',
  'js/icons.js',
  'js/sync.js',
  'js/config.js',
  'js/beta.js',
  'js/pregnancy.js',
  'js/guide.js',
  'js/baby.js',
  'js/care.js',
  'js/today.js',
  'js/push.js',
  'js/fetus3d.js',
  'js/fetus-core.js',
  'js/fetus-worker.js',
  'vendor/three.min.js',
  'fonts/inter.woff2',
  'fonts/fraunces.woff2',
  'icons/icon-192.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png',
  'brand/favicon.svg',
  'brand/hera-logo.svg',
  'brand/hera-logo-compact.svg',
  'brand/hera-symbol.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req, { cache: 'no-cache' }) // revalida siempre: GitHub Pages cachea 10 min y mezclaba versiones
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))),
  );
});

// Avisos push (vera-backlog#9): el servicio envía {title, body, url} cifrado.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* mensaje vacío */ }
  event.waitUntil(self.registration.showNotification(data.title || 'Hera', {
    body: data.body || '',
    icon: 'icons/icon-192.png',
    badge: 'icons/favicon-32.png',
    tag: 'vera-weekly',
    data: { url: data.url || './' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || './', self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => c.url.startsWith(self.registration.scope));
    return open ? open.focus() : self.clients.openWindow(url);
  }));
});
