const CACHE='tedvio-pilot-v68-20260826-686';
const STATIC=['/assets/tedvio_icono_app_192.png','/assets/tedvio_icono_app_512.png','/assets/tedvio_official_isotipo.svg','/assets/tedvio_official_horizontal.svg'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(STATIC).catch(()=>{})));
  self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message',event=>{
  if(event.data==='SKIP_WAITING') self.skipWaiting();
  if(event.data==='CLEAR_TEDVIO_CACHES'){
    event.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(key=>caches.delete(key))));
  }
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET') return;
  const url=new URL(request.url);
  if(url.origin!==location.origin) return;

  const isShell=request.mode==='navigate'||/\.(?:html|js|css|json|webmanifest)$/.test(url.pathname);
  if(isShell){
    event.respondWith(fetch(new Request(request,{cache:'no-store'})).catch(()=>caches.match(request)));
    return;
  }

  event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{
    if(response.ok){
      const copy=response.clone();
      caches.open(CACHE).then(cache=>cache.put(request,copy)).catch(()=>{});
    }
    return response;
  })));
});