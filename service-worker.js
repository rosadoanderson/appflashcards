const CACHE_NAME='anking-v13-core';
const CORE_ASSETS=['./','./index.html','./styles.css?v=13','./app.js?v=13','./cards_part1.json','./cards_part2.json','./cards_part3.json','./cards_part4.json','./manifest.json'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(CORE_ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  const url=new URL(event.request.url);
  if(url.pathname.endsWith('.json')){
    event.respondWith(fetch(event.request).then(resp=>{const copy=resp.clone(); caches.open(CACHE_NAME).then(c=>c.put(event.request, copy)); return resp;}).catch(()=>caches.match(event.request)));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(resp=>{const copy=resp.clone(); caches.open(CACHE_NAME).then(c=>c.put(event.request, copy)); return resp;})));
});
