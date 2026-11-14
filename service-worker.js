/* Radio Player PRO — Service Worker. Кеширует только оболочку, не радиопотоки. */
const CACHE_NAME='radio-player-pro-shell-v1';
const BASE=new URL('./',self.registration.scope);
const SHELL=[
 new URL('./',BASE).href,
 new URL('index.html',BASE).href,
 new URL('manifest.webmanifest',BASE).href,
 new URL('icons/icon.svg',BASE).href,
 new URL('icons/maskable.svg',BASE).href
];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('radio-player-pro-')&&k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 const r=e.request;if(r.method!=='GET')return;
 const u=new URL(r.url);if(u.origin!==self.location.origin)return;
 const basePath=new URL(BASE).pathname;if(!u.pathname.startsWith(basePath))return;
 if(r.mode==='navigate'){
  e.respondWith(fetch(r).then(res=>{if(res.ok)caches.open(CACHE_NAME).then(c=>c.put(new URL('index.html',BASE).href,res.clone()));return res;}).catch(async()=>{const c=await caches.open(CACHE_NAME);return (await c.match(new URL('index.html',BASE).href))||c.match(new URL('./',BASE).href);}));
  return;
 }
 if(SHELL.includes(r.url))e.respondWith(caches.match(r).then(cached=>cached||fetch(r).then(res=>{if(res.ok)caches.open(CACHE_NAME).then(c=>c.put(r,res.clone()));return res;})));
});
