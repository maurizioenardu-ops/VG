const VERSION = 'gestionale-vg-1.0.111-cloud-attivo';
const CACHE = `gestionale-runtime-${VERSION}`;

const REQUIRED_ASSETS = [
  './',
  './index.html',
  './index_orig.html',
  './manifest.json',
  './icon-v1-192.png',
  './icon-v1-512.png',
  './icon-v1-maskable-512.png',
  './apple-touch-icon-v1.png',
  './favicon-v1-32.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    for (const asset of REQUIRED_ASSETS) {
      try {
        await cache.add(new Request(asset, {cache: 'reload'}));
      } catch (err) {
        console.warn('[SW] Asset non memorizzato:', asset, err);
      }
    }
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(req, {cache: 'no-store'});
      } catch (_) {
        return (await caches.match('./index_orig.html')) ||
               (await caches.match('./index.html')) ||
               Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok && new URL(req.url).origin === self.location.origin) {
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
      }
      return fresh;
    } catch (_) {
      return cached || Response.error();
    }
  })());
});
