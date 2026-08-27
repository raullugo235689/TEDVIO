(()=>{
  const VERSION='2026.08.27.684';
  const root=document.querySelector('#betaApp');
  const loaded=new Map();
  let started=false,observer=null;

  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const yieldToInput=()=>new Promise(resolve=>{
    if('requestIdleCallback' in window){requestIdleCallback(()=>resolve(),{timeout:140});return;}
    requestAnimationFrame(()=>setTimeout(resolve,0));
  });

  function loadScript(src,type='classic'){
    if(loaded.has(src))return loaded.get(src);
    const p=new Promise(resolve=>{
      const s=document.createElement('script');
      s.src=src;
      if(type==='module')s.type='module';
      s.async=false;
      s.dataset.tedvioProgressive='1';
      s.onload=()=>resolve({src,ok:true});
      s.onerror=()=>{console.error('TEDVIO progressive boot: no se pudo cargar',src);resolve({src,ok:false})};
      document.head.appendChild(s);
    });
    loaded.set(src,p);
    return p;
  }

  async function loadOne(src,type='module',pause=55){
    await loadScript(src,type);
    await sleep(pause);
    await yieldToInput();
  }

  async function stage(name,items,pause=55){
    document.documentElement.dataset.tedvioBootStage=name;
    for(const item of items){
      const [src,type='module']=Array.isArray(item)?item:[item,'module'];
      await loadOne(src,type,pause);
    }
    window.dispatchEvent(new CustomEvent('tedvio:boot-stage',{detail:{name,version:VERSION}}));
  }

  async function boot(){
    if(started)return;
    started=true;
    observer?.disconnect();
    observer=null;
    document.documentElement.dataset.tedvioBoot='progressive';
    performance.mark?.('tedvio-teacher-progressive-start');

    // First paint: tiny classic UI patches + account safety only.
    await yieldToInput();
    await stage('shell',[
      ['./beta-brand-v2.js?v=56','classic'],
      ['./beta-premium-shell-v1.js?v=56','classic'],
      ['./beta-dashboard-v2.js?v=56','classic'],
      ['./beta-ui-v44.js?v=56','classic'],
      ['./account-guard-v62.js?v=62','module']
    ],35);

    // Classroom/navigation: stagger Supabase clients so auth does not wake them together.
    await stage('classroom',[
      ['./beta-academics.js?v=56','module'],
      ['./beta-academics-edit-v1.js?v=56','module'],
      ['./beta-groups-core-v3.js?v=56','module'],
      ['./beta-groups-premium-v1.js?v=56','module'],
      ['./beta-group-center-v2.js?v=56','module'],
      ['./beta-attendance-pro-v1.js?v=56','module'],
      ['./beta-session-delete-v1.js?v=56','module'],
      ['./beta-pilot-ready-v57.js?v=57','module'],
      ['https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js','classic'],
      ['./live-classroom-v58.js?v=58','module'],
      ['./entitlements-v63.js?v=63','module']
    ],55);

    // Product features: still interactive while these arrive.
    await stage('features',[
      ['https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js','classic'],
      ['./question-studio-v65.js?v=65','module'],
      ['./assignments-v66.js?v=66','module'],
      ['./security-commercial-v67.js?v=67','module'],
      ['./onboarding-v68.js?v=68','module'],
      ['https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js','classic'],
      ['https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js','classic'],
      ['./academic-analytics-v61.js?v=61','module']
    ],65);

    // Heavy/occasional tools last. Student-only runtimes are intentionally absent on /teacher.
    await stage('extended',[
      ['https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js','classic'],
      ['./paper-omr-v1.js?v=56','classic'],
      ['./beta-paper-exams-v2.js?v=56','module'],
      ['./admin-v62.js?v=62','module'],
      ['./beta-scoring-ui.js?v=56','module'],
      ['./beta-learning.js?v=56','module'],
      ['./beta-ux.js?v=56','module'],
      ['./beta-stability.js?v=56','module']
    ],80);

    document.documentElement.dataset.tedvioBoot='ready';
    document.documentElement.dataset.tedvioBootStage='ready';
    performance.mark?.('tedvio-teacher-progressive-ready');
    try{performance.measure?.('tedvio-teacher-progressive','tedvio-teacher-progressive-start','tedvio-teacher-progressive-ready')}catch{}
    window.dispatchEvent(new CustomEvent('tedvio:teacher-ready',{detail:{version:VERSION}}));
  }

  function check(){
    // Start only after the authenticated teacher shell has painted. Login remains minimal.
    if(root?.querySelector('.b-app')&&!location.hash.startsWith('#join')&&!location.hash.startsWith('#student'))boot();
  }

  if(root){
    observer=new MutationObserver(check);
    observer.observe(root,{childList:true,subtree:true});
    check();
  }
  window.addEventListener('hashchange',check);
  window.__TEDVIO_PROGRESSIVE_BOOT68__={version:VERSION,get stage(){return document.documentElement.dataset.tedvioBootStage||'waiting'},get ready(){return document.documentElement.dataset.tedvioBoot==='ready'}};
})();