(()=>{
  const VERSION='2026.08.26.64';
  const nativeSetInterval=window.setInterval.bind(window);
  const nativeClearInterval=window.clearInterval.bind(window);
  const nativeSetTimeout=window.setTimeout.bind(window);
  const stats={startedAt:Date.now(),intervals:{},broadcasts:0,wakeups:0,errors:0,longTasks:0,sessionId:null,realtime:'idle',fallbackMode:'12-15s'};
  const scaledDelay=delay=>{const d=Number(delay)||0;if(d===850||d===1100)return 12000;if(d===1200)return 15000;return d};
  const managedSetInterval=(fn,delay,...args)=>{const requested=Number(delay)||0,actual=scaledDelay(requested),key=`${requested}->${actual}`;stats.intervals[key]=(stats.intervals[key]||0)+1;return nativeSetInterval(fn,actual,...args)};
  window.setInterval=managedSetInterval;
  window.__TEDVIO_V64_NATIVE_SET_INTERVAL__=nativeSetInterval;
  window.__TEDVIO_V64_NATIVE_CLEAR_INTERVAL__=nativeClearInterval;
  window.__TEDVIO_RUNTIME64__={enabled:true,version:VERSION,stats,snapshot:()=>JSON.parse(JSON.stringify(stats)),scaledDelay};
  document.documentElement.dataset.tedvioRuntime='64';

  let db=null,channel=null,channelId=null,discoverBusy=false,discoverTimer=null,wakeTimer=null,lastError=new Map();
  const page=()=>location.pathname+location.hash;
  const cleanCode=v=>/^\d{6}$/.test(String(v||'').trim())?String(v).trim():'';
  const readStudent=()=>{try{return JSON.parse(localStorage.getItem('tedvio_v2_student')||'null')}catch{return null}};
  function readTeacherCode(){const main=document.querySelector('#sessionMain');const direct=cleanCode(main?.querySelector('.b-code')?.textContent);if(direct)return direct;const m=main?.textContent?.match(/(?:Código|Codigo)\s*(\d{6})/i);return cleanCode(m?.[1])}
  function setRealtime(status){stats.realtime=status;document.documentElement.dataset.tedvioRealtime=status;window.dispatchEvent(new CustomEvent('tedvio:v64:realtime',{detail:{status,sessionId:stats.sessionId}}))}
  function scheduleWake(payload){stats.broadcasts++;clearTimeout(wakeTimer);wakeTimer=nativeSetTimeout(()=>wake(payload),70)}
  function wake(payload){stats.wakeups++;window.dispatchEvent(new CustomEvent('tedvio:v64:state',{detail:{sessionId:stats.sessionId,payload:payload||null,at:Date.now()}}));let handled=false;try{if(location.hash.startsWith('#student')&&window.__TEDVIO_STUDENT60__?.refresh){window.__TEDVIO_STUDENT60__.refresh();handled=true}else if(document.querySelector('#tvLive58Root')&&window.__TEDVIO_LIVE58__?.refresh){window.__TEDVIO_LIVE58__.refresh();handled=true}}catch(e){report('wake_handler_error',e)}if(!handled&&(location.pathname.endsWith('/control.html')||location.pathname.endsWith('/proyectar.html')||document.querySelector('#sessionMain'))){try{window.dispatchEvent(new Event('online'))}catch(e){report('wake_online_error',e)}}}
  async function subscribe(id){if(!db||!id||id===channelId)return;if(channel){try{await db.removeChannel(channel)}catch{}}channel=null;channelId=id;stats.sessionId=id;setRealtime('connecting');channel=db.channel(`tedvio:session:${id}`,{config:{broadcast:{self:false}}}).on('broadcast',{event:'state_changed'},msg=>scheduleWake(msg?.payload||msg)).subscribe((status,err)=>{if(status==='SUBSCRIBED')setRealtime('connected');else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED'){setRealtime(status==='CLOSED'?'closed':'degraded');if(err)report('realtime_channel_error',err)}})}
  async function resolveSession(){if(!db)return null;const student=readStudent();if(location.hash.startsWith('#student')&&student?.sessionId)return student.sessionId;const urlCode=cleanCode(new URLSearchParams(location.search).get('code'));if((location.pathname.endsWith('/control.html')||location.pathname.endsWith('/proyectar.html'))&&urlCode){const{data,error}=await db.rpc('v2_public_session_meta',{p_code:urlCode});if(error)throw error;return data?.[0]?.session_id||null}const code=readTeacherCode();if(code){const{data:{session}}=await db.auth.getSession();if(!session?.user)return null;const{data,error}=await db.from('v2_sessions').select('id').eq('teacher_id',session.user.id).eq('code',code).maybeSingle();if(error)throw error;return data?.id||null}return null}
  async function discover(){if(discoverBusy||!db)return;discoverBusy=true;try{const id=await resolveSession();if(id)await subscribe(id);else if(channelId&&!location.hash.startsWith('#student')&&!document.querySelector('#sessionMain')&&!location.pathname.endsWith('/control.html')&&!location.pathname.endsWith('/proyectar.html')){if(channel){try{await db.removeChannel(channel)}catch{}}channel=null;channelId=null;stats.sessionId=null;setRealtime('idle')}}catch(e){report('session_discovery_error',e);setRealtime('degraded')}finally{discoverBusy=false}}
  function scheduleDiscover(delay=180){clearTimeout(discoverTimer);discoverTimer=nativeSetTimeout(discover,delay)}
  async function report(kind,error){stats.errors++;const message=String(error?.message||error||kind).slice(0,800),stack=String(error?.stack||'').slice(0,2500),key=`${kind}:${message}`,now=Date.now();if(now-(lastError.get(key)||0)<60000)return;lastError.set(key,now);console.warn('TEDVIO v64',kind,message);if(!db)return;try{const{data:{session}}=await db.auth.getSession();if(!session?.user)return;await db.from('tedvio_client_events').insert({user_id:session.user.id,event_type:`v64_${kind}`,severity:'error',page:page(),app_version:VERSION,user_agent:navigator.userAgent.slice(0,500),context:{message,stack,realtime:stats.realtime,session_id:stats.sessionId}})}catch{}}
  window.addEventListener('error',e=>report('window_error',e.error||e.message));
  window.addEventListener('unhandledrejection',e=>report('unhandled_rejection',e.reason));
  window.addEventListener('hashchange',()=>scheduleDiscover(60));
  window.addEventListener('popstate',()=>scheduleDiscover(60));
  window.addEventListener('online',()=>scheduleDiscover(50));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)scheduleDiscover(50)});
  window.addEventListener('beforeunload',()=>{if(channel&&db)try{db.removeChannel(channel)}catch{}});
  try{if('PerformanceObserver'in window){const po=new PerformanceObserver(list=>{for(const e of list.getEntries())if(e.duration>=200)stats.longTasks++});po.observe({entryTypes:['longtask']})}}catch{}
  const mo=new MutationObserver(()=>scheduleDiscover(180));
  if(document.documentElement)mo.observe(document.documentElement,{childList:true,subtree:true});

  import('https://esm.sh/@supabase/supabase-js@2').then(({createClient})=>{const cfg=window.TEDVIO_CONFIG||{};if(!cfg.SUPABASE_URL||!cfg.SUPABASE_PUBLISHABLE_KEY)throw new Error('TEDVIO_CONFIG incompleto');db=createClient(cfg.SUPABASE_URL,cfg.SUPABASE_PUBLISHABLE_KEY);window.__TEDVIO_RUNTIME64__.client=db;scheduleDiscover(0);nativeSetInterval(()=>scheduleDiscover(0),30000)}).catch(e=>report('core_boot_error',e));
})();
