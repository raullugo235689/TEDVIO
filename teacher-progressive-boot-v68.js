(()=>{
  const VERSION='2026.08.27.685';
  const root=document.querySelector('#betaApp');
  const loaded=new Map();
  const features=new Map();
  let started=false,observer=null,navFrame=0,baseView=null;

  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const yieldToInput=()=>new Promise(resolve=>{
    if('requestIdleCallback' in window){requestIdleCallback(()=>resolve(),{timeout:120});return;}
    requestAnimationFrame(()=>setTimeout(resolve,0));
  });

  function loadScript(src,type='classic'){
    if(loaded.has(src))return loaded.get(src);
    const p=new Promise(resolve=>{
      const s=document.createElement('script');s.src=src;if(type==='module')s.type='module';s.async=false;s.dataset.tedvioDemand='1';
      s.onload=()=>resolve({src,ok:true});
      s.onerror=()=>{console.error('TEDVIO demand loader: no se pudo cargar',src);resolve({src,ok:false})};
      document.head.appendChild(s);
    });
    loaded.set(src,p);return p;
  }
  async function loadOne(src,type='module',pause=28){const r=await loadScript(src,type);await sleep(pause);await yieldToInput();return r}
  async function loadList(items,pause=28){for(const item of items){const[src,type='module']=Array.isArray(item)?item:[item,'module'];await loadOne(src,type,pause)}}

  const XLSX=['https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js','classic'];
  const PDF=[['https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js','classic'],['https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js','classic']];
  const registry={
    groups:[['./beta-academics.js?v=56','module'],['./beta-academics-edit-v1.js?v=56','module'],['./beta-groups-core-v3.js?v=56','module'],['./beta-groups-premium-v1.js?v=56','module'],['./beta-group-center-v2.js?v=56','module'],['./beta-attendance-pro-v1.js?v=56','module'],['./beta-session-delete-v1.js?v=56','module']],
    bank:[XLSX,['./question-studio-v65.js?v=65','module']],
    tasks:[XLSX,['./assignments-v66.js?v=66','module']],
    help:[['./security-commercial-v67.js?v=67','module']],
    onboarding:[['./onboarding-v68.js?v=68','module']],
    admin:[['./admin-v62.js?v=62','module']],
    analytics:[XLSX,...PDF,['./academic-analytics-v61.js?v=61','module']],
    omr:[XLSX,['https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js','classic'],...PDF,['./paper-omr-v1.js?v=56','classic'],['./beta-paper-exams-v2.js?v=56','module']],
    livePro:[['./live-classroom-v58.js?v=58','module']]
  };

  async function ensure(name){
    if(features.has(name))return features.get(name);
    const p=(async()=>{document.documentElement.dataset.tedvioLoadingFeature=name;try{if(['analytics','omr'].includes(name))await ensure('groups');await loadList(registry[name]||[],38);window.dispatchEvent(new CustomEvent('tedvio:feature-ready',{detail:{name,version:VERSION}}));return true}finally{if(document.documentElement.dataset.tedvioLoadingFeature===name)delete document.documentElement.dataset.tedvioLoadingFeature;scheduleNav()}})();
    features.set(name,p);return p;
  }

  function waitFor(selector,timeout=2200){return new Promise(resolve=>{const hit=document.querySelector(selector);if(hit)return resolve(hit);const start=Date.now(),t=setInterval(()=>{const el=document.querySelector(selector);if(el||Date.now()-start>timeout){clearInterval(t);resolve(el||null)}},60)})}
  function busyButton(id,label='Cargando…'){const b=document.querySelector('#'+id);if(b){b.disabled=true;b.textContent=label}return b}

  async function openGroups(){busyButton('tvLazyGroups');document.querySelector('#tvLazyGroups')?.remove();await ensure('groups');const real=await waitFor('#tedvioGroupsBtn');real?.click()}
  async function openTasks(){busyButton('tvLazyTasks');document.querySelector('#tvLazyTasks')?.remove();await ensure('tasks');window.tv66OpenAssignments?.()}
  async function openHelp(){busyButton('tvLazyHelp');document.querySelector('#tvLazyHelp')?.remove();await ensure('help');window.__TEDVIO_SECURITY67__?.open?.()}
  async function openOnboarding(){busyButton('tvLazySetup');document.querySelector('#tvLazySetup')?.remove();await ensure('onboarding');window.tv68Open?.('overview')}
  async function openOmr(){busyButton('tvLazyOmr');document.querySelector('#tvLazyOmr')?.remove();await ensure('omr');if(typeof window.peOpenHome==='function')window.peOpenHome();else(await waitFor('#tedvioPaperBtn'))?.click()}
  async function openAdmin(){busyButton('tvLazyAdmin');document.querySelector('#tvLazyAdmin')?.remove();await ensure('admin');(await waitFor('#tvAdminBtn'))?.click()}

  function addBtn(bar,id,text,handler,cls='dark'){
    if(bar.querySelector('#'+id))return;const b=document.createElement('button');b.id=id;b.className=`b-btn ${cls}`;b.textContent=text;b.onclick=handler;const primary=bar.querySelector('.b-btn.primary');primary?bar.insertBefore(b,primary):bar.appendChild(b)
  }
  function installLazyNav(){
    const bar=document.querySelector('.b-top-actions');if(!bar||document.querySelector('.b-login'))return;
    if(!document.querySelector('#tedvioGroupsBtn'))addBtn(bar,'tvLazyGroups','Grupos',openGroups);
    if(!document.querySelector('#tv66AssignmentsBtn'))addBtn(bar,'tvLazyTasks','Tareas',openTasks);
    if(!document.querySelector('#tedvioPaperBtn'))addBtn(bar,'tvLazyOmr','Exámenes',openOmr);
    if(!document.querySelector('#tv67HelpBtn'))addBtn(bar,'tvLazyHelp','Ayuda',openHelp,'secondary');
    if(!document.querySelector('#tv68OnboardingBtn'))addBtn(bar,'tvLazySetup','Configurar',openOnboarding,'secondary');
    if(document.documentElement.dataset.tedvioRole==='admin'&&!document.querySelector('#tvAdminBtn'))addBtn(bar,'tvLazyAdmin','Admin',openAdmin);
  }
  function scheduleNav(){if(navFrame)return;navFrame=requestAnimationFrame(()=>{navFrame=0;installLazyNav()})}

  function installBankHook(){
    if(typeof window.betaView!=='function'||window.betaView.__tedvioDemand685)return;
    baseView=window.betaView;
    const wrapped=function(v,...args){const r=baseView.call(this,v,...args);if(v==='bank')setTimeout(()=>ensure('bank'),0);return r};wrapped.__tedvioDemand685=true;window.betaView=wrapped;
  }

  function installLazyShims(){
    const shim=(name,feature)=>{if(typeof window[name]==='function')return;const fn=async(...args)=>{await ensure(feature);const real=window[name];if(real&&real!==fn)return real(...args)};window[name]=fn};
    for(const n of ['gaOpenGroup','gaNewGroup','ga360Tab','tvAttendanceProOpen'])shim(n,'groups');
    for(const n of ['peOpenHome','peNewExam','ga360OpenExams','peExportResults'])shim(n,'omr');
    for(const n of ['ga61Excel','ga61Pdf','ga61Student'])shim(n,'analytics');
  }

  async function boot(){
    if(started)return;started=true;observer?.disconnect();observer=null;
    document.documentElement.dataset.tedvioBoot='demand';document.documentElement.dataset.tedvioPerformance='demand-driven';performance.mark?.('tedvio-teacher-demand-start');
    await yieldToInput();
    await loadList([
      ['./beta-brand-v2.js?v=56','classic'],['./beta-premium-shell-v1.js?v=56','classic'],['./beta-dashboard-v2.js?v=56','classic'],['./beta-ui-v44.js?v=56','classic'],['./account-guard-v62.js?v=62','module'],['./beta-pilot-ready-v57.js?v=57','module'],['./entitlements-v63.js?v=63','module'],['https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js','classic']
    ],30);
    installBankHook();installLazyShims();installLazyNav();
    const navObserver=new MutationObserver(scheduleNav);navObserver.observe(root,{childList:true});
    window.addEventListener('tedvio:entitlements',scheduleNav);window.addEventListener('hashchange',()=>{scheduleNav();installBankHook()});
    setTimeout(scheduleNav,900);
    document.documentElement.dataset.tedvioBoot='ready';document.documentElement.dataset.tedvioBootStage='core-ready';performance.mark?.('tedvio-teacher-demand-ready');
    try{performance.measure?.('tedvio-teacher-demand','tedvio-teacher-demand-start','tedvio-teacher-demand-ready')}catch{}
    window.dispatchEvent(new CustomEvent('tedvio:teacher-ready',{detail:{version:VERSION,mode:'demand'}}));
  }

  function check(){if(root?.querySelector('.b-app')&&!location.hash.startsWith('#join')&&!location.hash.startsWith('#student'))boot()}
  if(root){observer=new MutationObserver(check);observer.observe(root,{childList:true});check()}
  window.addEventListener('hashchange',check);
  window.__TEDVIO_PROGRESSIVE_BOOT68__={version:VERSION,mode:'demand',ensure,get stage(){return document.documentElement.dataset.tedvioBootStage||'waiting'},get ready(){return document.documentElement.dataset.tedvioBoot==='ready'}};
})();