const CACHE_NAME='vg-cache-v10_2-portafogli';
const VERSION = 'v10_2';
const CACHE = `vg-runtime-${VERSION}`;
const STATIC_ASSETS = [
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './reset-cache.html',
  './assets/categoria-borse.jpg',
  './assets/categoria-portafogli.jpg'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(STATIC_ASSETS)));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) {
      client.postMessage({ type: 'VG_SW_UPDATED', version: VERSION });
    }
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Always go to network first for HTML and navigation requests.
  if (req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/')) {
    event.respondWith((async () => {
      try {
        return await fetch(req, { cache: 'reload' });
      } catch (err) {
        return (await caches.match('./index.html')) || (await caches.match('./reset-cache.html')) || Response.error();
      }
    })());
    return;
  }

  // Manifest should always be fresh.
  if (url.pathname.endsWith('manifest.json')) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: 'no-store' });
        const cache = await caches.open(CACHE);
        cache.put('./manifest.json', fresh.clone());
        return fresh;
      } catch (err) {
        return (await caches.match('./manifest.json')) || Response.error();
      }
    })());
    return;
  }

  // Icons and reset page: cache-first is fine.
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    const fresh = await fetch(req);
    const cache = await caches.open(CACHE);
    cache.put(req, fresh.clone());
    return fresh;
  })());
});
