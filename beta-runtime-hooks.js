(()=>{
  const nativeSetInterval=window.setInterval.bind(window);
  const nativeClearInterval=window.clearInterval.bind(window);
  window.__TEDVIO_NATIVE_SET_INTERVAL__=nativeSetInterval;
  window.__TEDVIO_NATIVE_CLEAR_INTERVAL__=nativeClearInterval;
  window.__TEDVIO_INTERVALS_BY_DELAY__=window.__TEDVIO_INTERVALS_BY_DELAY__||{};
  window.setInterval=function(fn,delay,...args){
    const id=nativeSetInterval(fn,delay,...args);
    const key=String(Number(delay)||0);
    (window.__TEDVIO_INTERVALS_BY_DELAY__[key]||(window.__TEDVIO_INTERVALS_BY_DELAY__[key]=[])).push(id);
    if(typeof fn==='function'&&fn.name==='renderStudent'){
      window.__TEDVIO_STUDENT_RENDER__=fn;
      window.__TEDVIO_STUDENT_INTERVAL__=id;
    }
    return id;
  };

  const style=document.createElement('style');
  style.id='tedvio-brand-fix';
  style.textContent=`
    .b-top .b-brand{display:flex!important;align-items:center!important;justify-content:flex-start!important;width:220px!important;min-width:220px!important;height:68px!important;padding:6px 10px!important;background:#fff!important;border-radius:14px!important;overflow:hidden!important;box-sizing:border-box!important}
    .b-top .b-brand img{display:block!important;width:100%!important;height:100%!important;max-width:100%!important;max-height:100%!important;object-fit:contain!important;object-position:left center!important;border:0!important}
    @media(max-width:700px){.b-top .b-brand{width:205px!important;min-width:205px!important;height:62px!important;padding:5px 8px!important}}
  `;
  document.head.appendChild(style);

  const BRAND_SRC='./assets/tedvio_logo_horizontal_650.png?v=19';
  const fixBrand=()=>{
    const img=document.querySelector('.b-top .b-brand img');
    if(!img)return;
    if(!img.src.includes('tedvio_logo_horizontal_650.png')) img.src=BRAND_SRC;
    img.alt='TEDVIO';
  };

  document.addEventListener('error',e=>{
    const img=e.target;
    if(img instanceof HTMLImageElement && img.matches('.b-top .b-brand img') && !img.src.includes('tedvio_logo_horizontal_650.png')){
      img.src=BRAND_SRC;
    }
  },true);

  let groupsModulePromise=null;
  const loadGroupsModule=()=>{
    if(groupsModulePromise) return groupsModulePromise;
    groupsModulePromise=import('./beta-groups-attendance.js?v=19').catch(err=>{
      console.error('TEDVIO groups module failed to load',err);
      groupsModulePromise=null;
    });
    return groupsModulePromise;
  };

  const start=()=>{
    fixBrand();
    const root=document.getElementById('betaApp');
    if(root){
      new MutationObserver(()=>fixBrand()).observe(root,{childList:true});
    }
    loadGroupsModule();
  };

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
