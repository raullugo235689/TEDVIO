(()=>{
  const VERSION='2026.08.28.68.12';
  let currentGroupId=sessionStorage.getItem('tedvio.currentGroupId')||null;
  let loading=null,oldTab=null,oldOpen=null;
  const raf=fn=>requestAnimationFrame(fn);
  function installTab(){
    const tabs=document.querySelector('#gaOverlay .ga360-tabs');
    if(!tabs||tabs.querySelector('[data-ga6812-reports]'))return;
    const b=document.createElement('button');
    b.type='button';b.dataset.ga6812Reports='1';b.textContent='Reportes';
    b.onclick=()=>openReports();
    const analytics=[...tabs.querySelectorAll('button')].find(x=>x.textContent.trim()==='Analítica');
    analytics?tabs.insertBefore(b,analytics):tabs.appendChild(b);
  }
  async function ensureCenter(){
    if(window.__TEDVIO_REPORT_CENTER6812__)return window.__TEDVIO_REPORT_CENTER6812__;
    if(loading)return loading;
    loading=(async()=>{
      const api=window.__TEDVIO_PROGRESSIVE_BOOT68__;
      await api?.loadStyle?.('./report-center-v68-12.css?v=6812');
      await import('./report-center-v68-12.js?v=6812');
      return window.__TEDVIO_REPORT_CENTER6812__;
    })();
    try{return await loading}finally{loading=null}
  }
  async function openReports(){
    currentGroupId=sessionStorage.getItem('tedvio.currentGroupId')||currentGroupId;
    if(!currentGroupId)return alert('Abre primero un grupo.');
    const tabs=document.querySelector('#gaOverlay .ga360-tabs');
    tabs?.querySelectorAll('button').forEach(x=>x.classList.remove('active'));
    const btn=tabs?.querySelector('[data-ga6812-reports]');btn?.classList.add('active');
    const body=document.querySelector('#gaOverlay .ga360-body');
    if(body)body.innerHTML='<div class="ga360-empty">Preparando Centro de Reportes…</div>';
    try{const api=await ensureCenter();if(!api?.open)throw new Error('No pude iniciar el Centro de Reportes.');await api.open(currentGroupId,{host:body})}
    catch(error){console.error('TEDVIO v68.12 Report Center',error);if(body)body.innerHTML=`<div class="ga360-empty">${String(error?.message||'No pude abrir Reportes.')}</div>`}
  }
  function wrap(){
    if(typeof window.ga360Tab==='function'&&!window.ga360Tab.__reports6812){
      oldTab=window.ga360Tab;const wrapped=function(k,...args){if(k==='reports')return openReports();const r=oldTab.call(this,k,...args);raf(installTab);return r};wrapped.__reports6812=true;window.ga360Tab=wrapped;
    }
    if(typeof window.gaOpenGroup==='function'&&!window.gaOpenGroup.__reports6812){
      oldOpen=window.gaOpenGroup;const wrapped=async function(id,...args){currentGroupId=id||currentGroupId;if(id)sessionStorage.setItem('tedvio.currentGroupId',id);const r=await oldOpen.call(this,id,...args);raf(installTab);return r};wrapped.__reports6812=true;window.gaOpenGroup=wrapped;
    }
    raf(installTab);
  }
  wrap();
  window.addEventListener('tedvio:theme',()=>raf(installTab));
  window.__TEDVIO_REPORT_LAUNCHER6812__={version:VERSION,open:openReports,install:installTab};
})();