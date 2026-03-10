
const CACHE_NAME="anking-v15"

self.addEventListener("install",e=>{
self.skipWaiting()
})

self.addEventListener("activate",e=>{
caches.keys().then(keys=>{
keys.forEach(k=>{
if(k!==CACHE_NAME) caches.delete(k)
})
})
})

self.addEventListener("fetch",event=>{

event.respondWith(
fetch(event.request).catch(()=>caches.match(event.request))
)

})
