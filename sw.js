// Food Order Tracker — Service Worker
// IMPORTANT: bump CACHE_VERSION on every release so installed users get the update.
const CACHE_VERSION = 'v12';
const CACHE_NAME = 'food-order-tracker-' + CACHE_VERSION;
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.map((n) => (n !== CACHE_NAME && n !== 'fot-shared' ? caches.delete(n) : null))))
      .then(() => self.clients.claim())
  );
});

function putInCache(request, response) {
  if (response && response.status === 200 && response.type === 'basic') {
    const clone = response.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // A backup file shared INTO the app (WhatsApp → Share → Orders): keep it, then open the app to restore.
  if (req.method === 'POST' && new URL(req.url).pathname.endsWith('/share-restore')) {
    event.respondWith((async () => {
      try {
        const form = await req.formData();
        const f = form.get('backup');
        if (f && typeof f !== 'string') {
          const cache = await caches.open('fot-shared');
          await cache.put('shared-backup', new Response(await f.text(), { headers: { 'Content-Type': 'text/plain' } }));
        }
      } catch (e) {}
      return Response.redirect(new URL('./?shared-restore=1', self.registration.scope).href, 303);
    })());
    return;
  }

  if (req.method !== 'GET') return;

  // Page (HTML): NETWORK-FIRST so new releases arrive as soon as the user is online;
  // falls back to the cached copy when offline.
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(
      fetch(req)
        .then((res) => putInCache(req, res))
        .catch(() => caches.match(req).then((c) => c || caches.match('./index.html')))
    );
    return;
  }

  // Icons / manifest: cache-first (rarely change)
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => putInCache(req, res)))
  );
});