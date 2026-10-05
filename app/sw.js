// sw.js
// Service worker de Vera web: permite abrir la app sin conexión.
// Estrategia "red primero": siempre intenta la versión más reciente y usa la caché si no hay red.

const CACHE = 'vera-web-v33';
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
  'js/fetus3d.js',
  'js/fetus-core.js',
  'js/fetus-worker.js',
  'vendor/three.min.js',
  'fonts/jost.woff2',
  'fonts/cormorant.woff2',
  'icons/icon-192.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png',
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
    fetch(req)
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
