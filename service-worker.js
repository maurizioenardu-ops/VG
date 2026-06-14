const VERSION = 'gestionale-2026-06-14-navigazione-rapida-v101';
const CACHE = `gestionale-runtime-${VERSION}`;
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './reset.html',
  './reset-cache.html',
  './database.json',
  './supabaseClient.js',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.allSettled(STATIC_ASSETS.map(asset => cache.add(asset)));
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function updateIndexInBackground(req) {
  try {
    const fresh = await fetch(req, { cache: 'reload' });
    if (fresh && fresh.ok) {
      const cache = await caches.open(CACHE);
      await cache.put('./index.html', fresh.clone());
    }
  } catch (_err) {}
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Navigazione rapida: mostra subito l'app dalla cache e aggiorna in sottofondo.
  // Prima era network-first: su 4G/GitHub Pages aspettava la rete a ogni apertura.
  if (req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/')) {
    event.respondWith((async () => {
      const cached = await caches.match('./index.html') || await caches.match(req);
      const freshPromise = fetch(req, { cache: 'reload' }).then(async fresh => {
        if (fresh && fresh.ok) {
          const cache = await caches.open(CACHE);
          await cache.put('./index.html', fresh.clone());
        }
        return fresh;
      }).catch(() => null);

      if (cached) {
        event.waitUntil(updateIndexInBackground(req));
        return cached;
      }

      return (await freshPromise) || (await caches.match('./reset-cache.html')) || Response.error();
    })());
    return;
  }

  if (url.pathname.endsWith('manifest.json')) {
    event.respondWith((async () => {
      const cached = await caches.match(req) || await caches.match('./manifest.json');
      const freshPromise = fetch(req, { cache: 'no-store' }).then(async fresh => {
        if (fresh && fresh.ok) {
          const cache = await caches.open(CACHE);
          await cache.put('./manifest.json', fresh.clone());
        }
        return fresh;
      }).catch(() => null);
      return cached || (await freshPromise) || Response.error();
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok) {
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
      }
      return fresh;
    } catch (_err) {
      return caches.match(req) || Response.error();
    }
  })());
});
