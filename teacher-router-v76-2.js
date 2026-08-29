(()=>{
  const VERSION='2026.08.28.76.2';
  const ROUTES=new Set(['dashboard','bank','quizzes','history']);
  const R={
    installed:false,
    base:null,
    token:0,
    pending:'',
    current:'dashboard',
    bankDelegating:false,
    historyMode:'',
    scroll:new Map(),
    stage:null,
    bar:null,
    announcer:null,
    lastReady:0
  };

  const core=()=>window.__TEDVIO_TEACHER686__||null;
  const app=()=>document.querySelector('#betaApp');
  const shell=()=>app()?.querySelector('.tv686-app')||null;
  const main=()=>shell()?.querySelector('.tv686-main')||null;
  const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
  const routeLabel={dashboard:'Inicio',bank:'Banco',quizzes:'Preparadas',history:'Historial'};

  function routeFromButton(button){
    const code=button?.getAttribute?.('onclick')||'';
    return code.match(/betaView\(['\"]([^'\"]+)['\"]\)/)?.[1]||'';
  }

  function routeFromLocation(){
    const raw=String(location.hash||'').replace(/^#/,'');
    const route=raw.startsWith('route=')?raw.slice(6):raw;
    return ROUTES.has(route)?route:'dashboard';
  }

  function routeUrl(view){
    const url=new URL(location.href);
    url.hash=view==='dashboard'?'':`route=${view}`;
    return `${url.pathname}${url.search}${url.hash}`;
  }

  function ensureAnnouncer(){
    if(R.announcer?.isConnected)return R.announcer;
    let node=document.querySelector('#tv762RouteAnnouncer');
    if(!node){
      node=document.createElement('div');
      node.id='tv762RouteAnnouncer';
      node.className='tv762-sr-only';
      node.setAttribute('aria-live','polite');
      node.setAttribute('aria-atomic','true');
      document.body.appendChild(node);
    }
    R.announcer=node;
    return node;
  }

  function announce(message){
    const node=ensureAnnouncer();
    node.textContent='';
    requestAnimationFrame(()=>{node.textContent=message});
  }

  function navButtons(){
    return [...document.querySelectorAll('#betaApp .tv686-top .b-top-actions button')]
      .map(button=>({button,route:routeFromButton(button)}))
      .filter(item=>ROUTES.has(item.route));
  }

  function mark(view=core()?.state?.view||R.current||'dashboard'){
    const active=ROUTES.has(view)?view:'dashboard';
    document.documentElement.dataset.tedvioRoute=active;
    navButtons().forEach(({button,route})=>{
      button.dataset.tv762Route=route;
      if(route===active)button.setAttribute('aria-current','page');
      else button.removeAttribute('aria-current');
      if(R.pending&&route===R.pending)button.setAttribute('aria-busy','true');
      else button.removeAttribute('aria-busy');
    });
  }

  function ready(view){
    const root=app();
    const content=main();
    if(!root||!content)return false;
    if(view==='dashboard')return !!content.querySelector('#tv686Dashboard .tv70-dashboard')&&!core()?.state?.busy;
    if(view==='bank')return !!content.querySelector('#qs65Root');
    const text=content.textContent||'';
    if(view==='quizzes')return /PREPARADAS/i.test(text)&&/Sesiones preparadas/i.test(text);
    if(view==='history')return /HISTORIAL/i.test(text)&&/Sesiones/i.test(text);
    return true;
  }

  function ensureBar(){
    if(R.bar?.isConnected)return R.bar;
    let bar=document.querySelector('#tv762RouteBar');
    if(!bar){
      bar=document.createElement('div');
      bar.id='tv762RouteBar';
      bar.setAttribute('aria-hidden','true');
      bar.innerHTML='<i></i>';
      document.body.appendChild(bar);
    }
    R.bar=bar;
    return bar;
  }

  function begin(view){
    const token=++R.token;
    R.pending=view;
    document.documentElement.dataset.tedvioRouteBusy='true';
    const content=main();
    content?.setAttribute('aria-busy','true');
    ensureBar().classList.add('show');
    mark(view);
    announce(`Abriendo ${routeLabel[view]||view}.`);
    return token;
  }

  function finish(view,token){
    if(token!==R.token)return;
    R.pending='';
    R.current=view;
    delete document.documentElement.dataset.tedvioRouteBusy;
    main()?.removeAttribute('aria-busy');
    mark(view);
    const bar=ensureBar();
    bar.classList.add('done');
    setTimeout(()=>{
      if(token!==R.token)return;
      bar.classList.remove('show','done');
    },120);
    announce(`${routeLabel[view]||view} listo.`);
    window.dispatchEvent(new CustomEvent('tedvio:route-ready',{detail:{view,version:VERSION}}));
  }

  function fail(token){
    if(token!==R.token)return;
    R.pending='';
    R.historyMode='';
    delete document.documentElement.dataset.tedvioRouteBusy;
    main()?.removeAttribute('aria-busy');
    ensureBar().classList.remove('show','done');
    mark(core()?.state?.view||R.current);
  }

  function saveScroll(view){
    if(!ROUTES.has(view))return;
    R.scroll.set(view,{x:window.scrollX||0,y:window.scrollY||0});
  }

  async function restoreScroll(view){
    const point=R.scroll.get(view)||{x:0,y:0};
    await frame();
    await frame();
    window.scrollTo(point.x,point.y);
  }

  function commitHistory(view){
    const mode=R.historyMode||'push';
    R.historyMode='';
    const state={...(history.state||{}),tedvioRoute:view};
    const url=routeUrl(view);
    if(mode==='none')return;
    if(mode==='replace')history.replaceState(state,'',url);
    else if(routeFromLocation()!==view)history.pushState(state,'',url);
    else history.replaceState(state,'',url);
  }

  function waitUntil(predicate,token,timeout=2600){
    return new Promise(resolve=>{
      const started=performance.now();
      let stable=0;
      const tick=()=>{
        if(token!==R.token)return resolve(false);
        let ok=false;
        try{ok=!!predicate()}catch{ok=false}
        stable=ok?stable+1:0;
        if(stable>=2)return resolve(true);
        if(performance.now()-started>=timeout)return resolve(ok);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  function dashboardTemplate(){
    return `<section class="b-hero tv-dash-hero tv686-hero tv70-legacy-hidden"><div><span class="tv686-kicker">CENTRO DOCENTE</span><h1>Panel docente</h1><p>Tu operación académica en una vista rápida.</p></div><button class="b-btn primary" onclick="betaNewSession()">Crear sesión en vivo</button></section><div class="tv-quick-actions tv686-quick tv70-legacy-hidden"><button class="tv-quick primary" onclick="betaNewSession()"><span>＋</span><div><b>Nueva sesión</b><small>Inicia una actividad en vivo</small></div></button><button class="tv-quick" onclick="tvPilotOpenGroups()"><span>✓</span><div><b>Grupos</b><small>Alumnos y asistencia</small></div></button><button class="tv-quick" onclick="betaView('bank')"><span>▤</span><div><b>Banco</b><small>Crea y organiza reactivos</small></div></button><button class="tv-quick" onclick="tvPilotOpenExamForGroup()"><span>◎</span><div><b>Exámenes</b><small>OMR y resultados</small></div></button></div><section id="tv686Dashboard"><div class="tv686-loading"><span></span><b>Preparando tu resumen…</b></div></section>`;
  }

  function removeStage(){
    R.stage?.remove();
    R.stage=null;
  }

  async function stageDashboard(token){
    const c=core();
    let live=main();
    if(!c)return false;
    c.state.sessionCore?.leave?.();
    c.state.view='dashboard';

    if(!live){
      c.renderShell?.();
      await frame();
      live=main();
      if(!live)return false;
      Promise.resolve(c.refresh?.()).catch(error=>console.error('TEDVIO v76.2 dashboard refresh',error));
      return waitUntil(()=>ready('dashboard'),token,3000);
    }

    removeStage();
    const stage=document.createElement('main');
    stage.id='tv762DashboardStage';
    stage.className='b-main tv686-main tv762-dashboard-stage';
    stage.setAttribute('aria-hidden','true');
    stage.innerHTML=dashboardTemplate();
    document.body.appendChild(stage);
    R.stage=stage;

    window.dispatchEvent(new CustomEvent('tedvio:teacher-shell',{detail:{version:VERSION,persistent:true,stage:true}}));
    if(c.state.dashboard)window.dispatchEvent(new CustomEvent('tedvio:profile',{detail:c.state.profile||{}}));
    const refresh=Promise.resolve(c.refresh?.()).catch(error=>console.error('TEDVIO v76.2 dashboard refresh',error));

    await waitUntil(()=>stage.querySelector('#tv686Dashboard .tv70-dashboard')&&!c.state.busy,token,3200);
    if(token!==R.token){removeStage();return false}

    const children=[...stage.childNodes];
    live.replaceChildren(...children);
    removeStage();
    await refresh;
    return ready('dashboard');
  }

  async function openBank(token,throughWrapper){
    const c=core();
    if(c)c.state.view='bank';
    const loader=window.__TEDVIO_PROGRESSIVE_BOOT68__;
    if(!loader?.ensure)throw new Error('El cargador de funciones todavía no está disponible.');
    const ok=await loader.ensure('bank');
    if(ok===false)return false;
    if(token!==R.token)return false;

    if(!throughWrapper&&window.betaView!==navigate){
      R.bankDelegating=true;
      try{window.betaView('bank')}finally{R.bankDelegating=false}
    }else if(!throughWrapper&&window.betaView===navigate){
      const api=window.__TEDVIO_QUESTION_STUDIO65__;
      if(api?.open)api.open();
      else if(api?.refresh)api.refresh();
    }

    return waitUntil(()=>ready('bank'),token,4200);
  }

  async function openCoreRoute(view,args,token){
    const result=R.base.call(window,view,...args);
    await Promise.resolve(result);
    return waitUntil(()=>ready(view),token,3200);
  }

  async function navigate(view='dashboard',...args){
    if(!ROUTES.has(view))return R.base?.call(this,view,...args);
    if(R.bankDelegating&&view==='bank'){
      if(core())core().state.view='bank';
      return;
    }
    if(R.pending)return;

    const throughWrapper=window.betaView!==navigate;
    const previous=core()?.state?.view||R.current||'dashboard';
    if(view===previous&&ready(view)){
      R.historyMode='';
      mark(view);
      return;
    }

    saveScroll(previous);
    const token=begin(view);
    try{
      let ok=false;
      if(view==='dashboard')ok=await stageDashboard(token);
      else if(view==='bank')ok=await openBank(token,throughWrapper);
      else ok=await openCoreRoute(view,args,token);
      if(token!==R.token)return;
      if(!ok&&!ready(view))throw new Error(`La vista ${routeLabel[view]||view} no terminó de cargar.`);
      commitHistory(view);
      await restoreScroll(view);
      finish(view,token);
    }catch(error){
      console.error('TEDVIO v76.2 persistent router',view,error);
      fail(token);
      announce(`No se pudo abrir ${routeLabel[view]||view}.`);
      throw error;
    }
  }

  function routeClick(event){
    const button=event.target.closest?.('#betaApp .tv686-top .b-top-actions button');
    const route=routeFromButton(button);
    if(!ROUTES.has(route))return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if(R.pending)return;
    if(route===(core()?.state?.view||R.current)&&ready(route)){
      mark(route);
      return;
    }
    Promise.resolve(window.betaView(route)).catch(error=>console.error('TEDVIO v76.2 top navigation',error));
  }

  function install(){
    if(R.installed)return true;
    const c=core();
    const base=window.betaView;
    if(!c||typeof base!=='function')return false;
    if(base.__tv762){R.installed=true;return true}
    R.base=base.__tv761Original||base;
    navigate.__tv762=true;
    navigate.__tv762Original=R.base;
    window.betaView=navigate;
    R.installed=true;
    R.current=ROUTES.has(c.state?.view)?c.state.view:'dashboard';
    history.scrollRestoration='manual';
    document.addEventListener('click',routeClick,true);
    window.addEventListener('tedvio:teacher-shell',()=>requestAnimationFrame(()=>mark(core()?.state?.view||R.current)));
    window.addEventListener('tedvio:feature-ready',()=>requestAnimationFrame(()=>mark(core()?.state?.view||R.current)));
    window.addEventListener('popstate',()=>{
      R.historyMode='none';
      const target=routeFromLocation();
      Promise.resolve(window.betaView(target)).catch(error=>console.error('TEDVIO v76.2 history route',error));
    });
    mark(R.current);
    const requested=routeFromLocation();
    history.replaceState({...(history.state||{}),tedvioRoute:requested},'',routeUrl(requested));
    if(requested!==R.current){
      R.historyMode='replace';
      setTimeout(()=>Promise.resolve(window.betaView(requested)).catch(error=>console.error('TEDVIO v76.2 initial route',error)),0);
    }
    return true;
  }

  function boot(attempt=0){
    if(install())return;
    if(attempt<100)setTimeout(()=>boot(attempt+1),50);
  }

  window.__TEDVIO_ROUTER762__={
    version:VERSION,
    open:view=>{
      R.historyMode='push';
      return Promise.resolve(window.betaView(view));
    },
    ready,
    mark,
    get current(){return R.current},
    get pending(){return R.pending},
    get shell(){return shell()}
  };
  boot();
})();
