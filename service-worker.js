
const CACHE_NAME = 'anking-v17-core';
const CORE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './cards_part1.json',
  './cards_part2.json',
  './cards_part3.json',
  './cards_part4.json',
  './manifest.json'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE)));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(resp => {
      const copy = resp.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      return resp;
    }).catch(() => cached))
  );
});
