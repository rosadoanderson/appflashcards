const CACHE_NAME = 'anking-v14-core';
const CORE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './cards_part1.json',
  './cards_part2.json',
  './cards_part3.json',
  './cards_part4.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('anking-v') && key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const isCore = CORE_ASSETS.some((asset) => url.pathname.endsWith(asset.replace('./', '/')));
  const isAppFile = /\.(html|js|css|json)$/i.test(url.pathname);

  if (isCore || isAppFile) {
    event.respondWith((async () => {
      try {
        const network = await fetch(event.request, { cache: 'no-store' });
        const cache = await caches.open(CACHE_NAME);
        cache.put(event.request, network.clone());
        return network;
      } catch {
        const cached = await caches.match(event.request, { ignoreSearch: true });
        return cached || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(event.request, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const network = await fetch(event.request);
      const cache = await caches.open(CACHE_NAME);
      cache.put(event.request, network.clone());
      return network;
    } catch {
      return cached || Response.error();
    }
  })());
});
