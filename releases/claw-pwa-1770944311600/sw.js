const CACHE_NAME = 'claw-pwa-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.json',
];

self.addEventListener('install', (evt) => {
  evt.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (evt) => {
  evt.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => { if (k !== CACHE_NAME) return caches.delete(k); })))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (evt) => {
  const url = new URL(evt.request.url);
  // simple network-first for API, cache-first for navigation/assets
  if (url.pathname.startsWith('/auth') || url.pathname.startsWith('/offers') || url.pathname.startsWith('/market')) {
    evt.respondWith(
      fetch(evt.request).catch(() => caches.match(evt.request))
    );
    return;
  }
  evt.respondWith(
    caches.match(evt.request).then((r) => r || fetch(evt.request).then((res) => { return caches.open(CACHE_NAME).then((cache) => { cache.put(evt.request, res.clone()); return res; }); }))
  );
});