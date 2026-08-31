const CACHE='tedvio-2-production-20260831';
const STATIC=[
  '/manifest.webmanifest',
  '/assets/tedvio_icono_app_192.png',
  '/assets/tedvio_icono_app_512.png',
  '/assets/tedvio_official_isotipo.svg',
  '/assets/tedvio_official_horizontal.svg'
];
const TEACHER_SHELL='/teacher';

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
    event.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(key=>caches.delete(key)))));
  }
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET') return;
  const url=new URL(request.url);
  if(url.origin!==location.origin) return;

  const teacherNavigation=request.mode==='navigate'&&(
    url.pathname==='/teacher'||
    url.pathname==='/teacher/'||
    url.pathname==='/teacher-v2'||
    url.pathname==='/teacher-v2/'
  );

  if(teacherNavigation){
    event.respondWith((async()=>{
      try{
        const response=await fetch(new Request(request,{cache:'no-store'}));
        if(response.ok){
          const copy=response.clone();
          caches.open(CACHE).then(cache=>cache.put(TEACHER_SHELL,copy)).catch(()=>{});
        }
        return response;
      }catch{
        return (await caches.match(TEACHER_SHELL))||Response.error();
      }
    })());
    return;
  }

  const isShell=/\.(?:html|js|css|json|webmanifest)$/.test(url.pathname);
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
