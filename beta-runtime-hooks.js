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

  let brandPromise=null;
  let groupsPromise=null;

  const loadBrand=()=>{
    if(brandPromise) return brandPromise;
    brandPromise=import('./beta-brand-v2.js?v=21').catch(err=>{
      console.error('TEDVIO brand module failed to load',err);
      brandPromise=null;
    });
    return brandPromise;
  };

  const loadGroupsWhenReady=()=>{
    if(groupsPromise||!document.querySelector('#betaApp .b-top-actions')) return;
    groupsPromise=import('./beta-groups-attendance.js?v=21').catch(err=>{
      console.error('TEDVIO groups module failed to load',err);
      groupsPromise=null;
    });
  };

  const start=()=>{
    loadBrand();
    loadGroupsWhenReady();
    const root=document.getElementById('betaApp');
    if(root) new MutationObserver(loadGroupsWhenReady).observe(root,{childList:true});
  };

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();