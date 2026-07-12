const VERSION = 'gestionale-vg-1.0.5-2026-07-12';
const CACHE = `gestionale-runtime-${VERSION}`;
const REQUIRED_ASSETS = [
  './', './index.html', './manifest.json',
  './icon-v1-192.png', './icon-v1-512.png', './icon-v1-maskable-512.png',
  './apple-touch-icon-v1.png', './favicon-v1-32.png',
  './screenshot-mobile-v1.jpg', './screenshot-wide-v1.jpg'
];
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    for(const asset of REQUIRED_ASSETS){ try{ await cache.add(new Request(asset,{cache:'reload'})); }catch(err){ console.warn('[SW] Asset non memorizzato:',asset,err); } }
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const req=event.request;
  if(req.method!=='GET') return;
  const url=new URL(req.url);
  if(req.mode==='navigate'){
    event.respondWith((async()=>{
      try{
        const fresh=await fetch(req,{cache:'no-store'});
        const cache=await caches.open(CACHE); cache.put('./index.html',fresh.clone());
        return fresh;
      }catch(_e){ return (await caches.match('./index.html')) || Response.error(); }
    })());
    return;
  }
  if(url.origin===self.location.origin && (url.pathname.endsWith('manifest.json') || /icon-|apple-touch|favicon/.test(url.pathname))){
    event.respondWith((async()=>{
      try{ const fresh=await fetch(req,{cache:'no-store'}); const cache=await caches.open(CACHE); cache.put(req,fresh.clone()); return fresh; }
      catch(_e){ return (await caches.match(req)) || Response.error(); }
    })());
    return;
  }
  event.respondWith((async()=>{
    const cached=await caches.match(req);
    if(cached) return cached;
    try{ const fresh=await fetch(req); if(fresh?.ok && url.origin===self.location.origin){ const cache=await caches.open(CACHE); cache.put(req,fresh.clone()); } return fresh; }
    catch(_e){ return cached || Response.error(); }
  })());
});
