const VERSION = 'v44_copy_buttons_fixed';
const CACHE = `vg-runtime-${VERSION}`;
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './reset.html',
  './reset-cache.html',
  './database.json',
  './cat-accessori.jpg',
  './cat-borse.jpg',
  './cat-cinture.jpg',
  './supabaseClient.js'
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
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/')) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: 'reload' });
        const cache = await caches.open(CACHE);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch (_err) {
        return (await caches.match('./index.html')) || (await caches.match('./reset-cache.html')) || Response.error();
      }
    })());
    return;
  }

  if (url.pathname.endsWith('manifest.json')) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: 'no-store' });
        const cache = await caches.open(CACHE);
        cache.put('./manifest.json', fresh.clone());
        return fresh;
      } catch (_err) {
        return (await caches.match('./manifest.json')) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      const cache = await caches.open(CACHE);
      cache.put(req, fresh.clone());
      return fresh;
    } catch (_err) {
      return caches.match(req);
    }
  })());
});
