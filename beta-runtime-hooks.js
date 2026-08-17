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

  let groupsModulePromise=null;
  const loadGroupsModule=()=>{
    if(groupsModulePromise) return groupsModulePromise;
    groupsModulePromise=import('./beta-groups-attendance.js?v=18').catch(err=>{
      console.error('TEDVIO groups module failed to load',err);
      groupsModulePromise=null;
    });
    return groupsModulePromise;
  };

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',loadGroupsModule,{once:true});
  }else{
    loadGroupsModule();
  }
})();
