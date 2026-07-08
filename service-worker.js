const VERSION = 'gestionale-2026-07-08-anteprime-layout-stabile-v110';
const CACHE = `gestionale-runtime-${VERSION}`;
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './reset.html',
  './reset-cache.html',
  './database.json',
  './cat-borse.jpg',
  './cat-cinture.jpg',
  './cat-accessori.jpg',
  './supabaseClient.js',
  './icon-192.png',
  './icon-512.png'
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
      const cached = await caches.match('./index.html');
      const refresh = fetch(req, { cache: 'no-store' }).then(async fresh => {
        const cache = await caches.open(CACHE);
        cache.put('./index.html', fresh.clone());
        return fresh;
      }).catch(() => null);
      return cached || (await refresh) || (await caches.match('./reset-cache.html')) || Response.error();
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
