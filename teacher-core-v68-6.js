import{createClient}from'https://esm.sh/@supabase/supabase-js@2';

const cfg=window.TEDVIO_CONFIG||{};
const db=createClient(cfg.SUPABASE_URL,cfg.SUPABASE_PUBLISHABLE_KEY);
const root=document.querySelector('#betaApp');
const VERSION='2026.08.27.68.6';
const S={user:null,profile:null,entitlements:null,dashboard:null,busy:false,view:'dashboard',sessionCore:null};
window.__TEDVIO_DB__=db;

const esc=(v='')=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const n=v=>Number(v||0).toLocaleString('es-MX');
const fmtDate=v=>v?new Date(v).toLocaleString('es-MX',{dateStyle:'medium',timeStyle:'short'}):'—';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function brand(){return`<div class="b-brand tv686-brand"><img src="./assets/tedvio_official_isotipo.svg" alt="TEDVIO"></div>`}
function toast(msg,tone='info'){let h=document.querySelector('#tv686ToastHost');if(!h){h=document.createElement('div');h.id='tv686ToastHost';document.body.appendChild(h)}const d=document.createElement('div');d.className=`tv686-toast ${tone}`;d.textContent=msg;h.appendChild(d);requestAnimationFrame(()=>d.classList.add('show'));setTimeout(()=>{d.classList.remove('show');setTimeout(()=>d.remove(),180)},2400)}
function loading(label='Cargando…'){return`<div class="tv686-loading"><span></span><b>${esc(label)}</b></div>`}

function renderAuth(){
  document.documentElement.dataset.tedvioTeacher='auth';
  root.innerHTML=`<div class="tv686-login"><section class="tv686-login-copy"><img src="./assets/tedvio_official_horizontal.svg" alt="TEDVIO"><span>PLATAFORMA EDUCATIVA</span><h1>Tu clase, sin fricción.</h1><p>Sesiones, grupos, asistencia, evaluación y seguimiento desde un espacio docente rápido y claro.</p><div class="tv686-login-points"><div><b>▶</b><span>Interacción en vivo</span></div><div><b>✓</b><span>Asistencia y grupos</span></div><div><b>↗</b><span>Analítica académica</span></div></div></section><section class="tv686-login-card"><div class="tv686-login-mark"><img src="./assets/tedvio_official_isotipo.svg" alt="TEDVIO"></div><h2>Acceso docente</h2><p>Ingresa a tu espacio de trabajo.</p><label>Correo<input id="authEmail" type="email" autocomplete="email" inputmode="email" placeholder="tu@correo.com"></label><label>Contraseña<input id="authPass" type="password" autocomplete="current-password" placeholder="Tu contraseña"></label><button class="b-btn primary" id="authLogin">Entrar</button><button class="b-btn secondary" id="authSignup">Crear cuenta</button><small>Acceso seguro · TEDVIO ${VERSION}</small></section></div>`;
  document.querySelector('#authLogin').onclick=signIn;
  document.querySelector('#authSignup').onclick=signUp;
  document.querySelector('#authPass').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();signIn()}});
}

async function signIn(){
  const email=document.querySelector('#authEmail')?.value.trim(),password=document.querySelector('#authPass')?.value||'',btn=document.querySelector('#authLogin');
  if(!email||!password)return toast('Escribe correo y contraseña.','warn');
  btn.disabled=true;btn.textContent='Entrando…';
  try{const{error}=await db.auth.signInWithPassword({email,password});if(error)throw error}
  catch(e){toast(e.message||'No se pudo iniciar sesión.','bad');btn.disabled=false;btn.textContent='Entrar'}
}
async function signUp(){
  const email=document.querySelector('#authEmail')?.value.trim(),password=document.querySelector('#authPass')?.value||'',btn=document.querySelector('#authSignup');
  if(!email||password.length<6)return toast('Usa un correo válido y una contraseña de al menos 6 caracteres.','warn');
  btn.disabled=true;btn.textContent='Creando…';
  try{const{data,error}=await db.auth.signUp({email,password,options:{emailRedirectTo:`${location.origin}/teacher`}});if(error)throw error;if(!data.session)toast('Cuenta creada. Revisa tu correo para confirmar.','ok')}
  catch(e){toast(e.message||'No se pudo crear la cuenta.','bad')}
  finally{btn.disabled=false;btn.textContent='Crear cuenta'}
}
async function logout(){await db.auth.signOut({scope:'local'});S.user=null;S.profile=null;S.dashboard=null;renderAuth()}
window.betaLogout=logout;

function planName(){return S.entitlements?.display_name||S.entitlements?.plan||S.profile?.plan||'Free'}
function planHtml(){const e=S.entitlements||{},l=e.limits||{},u=e.usage||{},features=e.features||{};return`<div class="tv686-plan"><header><div><span>PLAN ACTIVO</span><h2>TEDVIO ${esc(planName())}</h2></div><button class="b-btn secondary" data-close>×</button></header><div class="tv686-plan-grid"><div><span>Grupos</span><b>${n(u.groups)} / ${l.max_groups??'∞'}</b></div><div><span>Sesiones este mes</span><b>${n(u.sessions_month)} / ${l.max_live_sessions_month??'∞'}</b></div><div><span>Alumnos / grupo</span><b>${l.max_students_per_group??'∞'}</b></div><div><span>Almacenamiento</span><b>${l.max_storage_mb??'∞'} MB</b></div></div><div class="tv686-feature-list"><span class="${features.live_sessions?'on':''}">✓ Live</span><span class="${features.qr_attendance?'on':''}">✓ QR</span><span class="${features.omr?'on':'off'}">${features.omr?'✓':'🔒'} OMR</span><span class="${features.analytics_pro?'on':'off'}">${features.analytics_pro?'✓':'🔒'} Analítica Pro</span></div></div>`}
function openPlan(){let o=document.querySelector('#tv686Overlay');o?.remove();o=document.createElement('div');o.id='tv686Overlay';o.className='tv686-overlay';o.innerHTML=planHtml();document.body.appendChild(o);o.querySelector('[data-close]').onclick=()=>o.remove();o.addEventListener('mousedown',e=>{if(e.target===o)o.remove()})}
window.tv63OpenPlan=openPlan;

function topActions(){return`<button class="b-btn secondary tv686-plan-btn" onclick="tv63OpenPlan()">${esc(planName()).toUpperCase()}</button><button class="b-btn dark" onclick="betaView('dashboard')">Inicio</button><button class="b-btn dark" onclick="betaView('bank')">Banco</button><button class="b-btn dark" onclick="betaView('quizzes')">Preparadas</button><button class="b-btn dark" onclick="betaView('history')">Historial</button><button class="b-btn primary" onclick="betaNewSession()">＋ Sesión</button><button class="b-btn secondary" onclick="betaLogout()">Salir</button>`}

function baseDashboard(){return`<section class="b-hero tv-dash-hero tv686-hero"><div><span class="tv686-kicker">CENTRO DOCENTE</span><h1>Panel docente</h1><p>Tu operación académica en una vista rápida.</p></div><button class="b-btn primary" onclick="betaNewSession()">Crear sesión en vivo</button></section><div class="tv-quick-actions tv686-quick"><button class="tv-quick primary" onclick="betaNewSession()"><span>＋</span><div><b>Nueva sesión</b><small>Inicia una actividad en vivo</small></div></button><button class="tv-quick" onclick="tvPilotOpenGroups()"><span>✓</span><div><b>Grupos</b><small>Alumnos y asistencia</small></div></button><button class="tv-quick" onclick="betaView('bank')"><span>▤</span><div><b>Banco</b><small>Crea y organiza reactivos</small></div></button><button class="tv-quick" onclick="tvPilotOpenExamForGroup()"><span>◎</span><div><b>Exámenes</b><small>OMR y resultados</small></div></button></div><section id="tv686Dashboard">${loading('Preparando tu resumen…')}</section>`}

function renderShell(){
  S.view='dashboard';document.documentElement.dataset.tedvioTeacher='ready';
  root.innerHTML=`<div class="b-app tv686-app"><header class="b-top tv686-top">${brand()}<div class="b-top-actions">${topActions()}</div></header><main class="b-main tv686-main">${baseDashboard()}</main></div>`;
  window.dispatchEvent(new CustomEvent('tedvio:teacher-shell',{detail:{version:VERSION}}));
  if(S.dashboard)renderDashboard();
}

function groupCard(g){const name=g.name||g.group_name||'Grupo',students=Number(g.students||0),att=g.attendance_rate==null?'—':`${Math.round(Number(g.attendance_rate))}%`,grade=g.grade_avg==null?'—':Number(g.grade_avg).toFixed(1);return`<article class="tv686-group"><div><span>${esc(g.subject||g.program||'Grupo')}</span><h3>${esc(name)}</h3><small>${esc(g.university||'')}${g.term?' · '+esc(g.term):''}</small></div><div class="tv686-group-metrics"><span><b>${students}</b> alumnos</span><span><b>${att}</b> asistencia</span><span><b>${grade}</b> promedio</span></div><div class="tv686-group-actions"><button class="b-btn primary" onclick="tvPilotAttendance('${g.id}')">✓ Asistencia</button><button class="b-btn secondary" onclick="tvPilotOpenGroup('${g.id}')">Abrir</button></div></article>`}
function renderDashboard(){const host=document.querySelector('#tv686Dashboard');if(!host||!S.dashboard)return;const d=S.dashboard,groups=d.groups||[];host.innerHTML=`<div class="tv686-metrics"><div><span>Grupos</span><b>${n(d.groups_count||groups.length)}</b></div><div><span>Asistencias pendientes</span><b>${n(d.pending_attendance)}</b></div><div><span>En riesgo</span><b>${n(d.risk_students)}</b></div><div><span>Atención</span><b>${n(d.watch_students)}</b></div></div><div class="tv686-section-head"><div><h2>Tus grupos</h2><p>Accesos directos a lo que usas hoy.</p></div><button class="b-btn secondary" onclick="tvPilotRefresh()">↻ Actualizar</button></div><div class="tv686-groups">${groups.length?groups.slice(0,8).map(groupCard).join(''):'<div class="tv686-empty"><b>Aún no tienes grupos.</b><span>Abre Grupos para crear el primero.</span><button class="b-btn primary" onclick="tvPilotOpenGroups()">Crear grupo</button></div>'}</div>`}

async function loadWorkspace(force=false){
  if(S.busy||!S.user)return;S.busy=true;
  try{
    const profileP=db.from('tedvio_user_profiles').select('status,plan,role').eq('user_id',S.user.id).maybeSingle();
    const entP=db.rpc('tedvio_current_entitlements');
    const dashP=db.rpc('v2_teacher_today_dashboard');
    const[p,e,d]=await Promise.all([profileP,entP,dashP]);
    if(p.data?.status==='suspended'){await db.auth.signOut({scope:'local'});root.innerHTML='<div class="tv686-blocked"><h2>Acceso suspendido</h2><p>Contacta al administrador de tu institución.</p></div>';return}
    S.profile=p.data||{role:'teacher',plan:'free'};S.entitlements=e.data||null;S.dashboard=d.data||{};
    window.TEDVIO_ENTITLEMENTS=S.entitlements;document.documentElement.dataset.tedvioRole=S.profile.role||'teacher';document.documentElement.dataset.tedvioPlan=S.entitlements?.plan||S.profile.plan||'free';
    window.dispatchEvent(new CustomEvent('tedvio:profile',{detail:S.profile}));window.dispatchEvent(new CustomEvent('tedvio:entitlements',{detail:S.entitlements}));
    if(document.querySelector('.tv686-app')){const plan=document.querySelector('.tv686-plan-btn');if(plan)plan.textContent=planName().toUpperCase();renderDashboard()}
  }catch(e){console.error('TEDVIO Teacher Core workspace',e);const h=document.querySelector('#tv686Dashboard');if(h)h.innerHTML=`<div class="tv686-empty"><b>No pude sincronizar el resumen.</b><span>${esc(e.message||'Intenta nuevamente.')}</span><button class="b-btn secondary" onclick="tvPilotRefresh()">Reintentar</button></div>`}
  finally{S.busy=false}
}
window.tvPilotRefresh=()=>loadWorkspace(true);

async function ensureFeature(name){
  for(let i=0;i<30;i++){const api=window.__TEDVIO_PROGRESSIVE_BOOT68__;if(api?.ensure)return api.ensure(name);await sleep(40)}
  throw new Error('El módulo de funciones todavía no está disponible.');
}
window.tvPilotOpenGroups=async()=>{await ensureFeature('groups');(document.querySelector('#tedvioGroupsBtn'))?.click()};
window.tvPilotOpenGroup=async id=>{if(id)sessionStorage.setItem('tedvio.currentGroupId',id);await ensureFeature('groups');if(typeof window.gaOpenGroup==='function')return window.gaOpenGroup(id);document.querySelector('#tedvioGroupsBtn')?.click()};
window.tvPilotAttendance=async id=>{if(id)sessionStorage.setItem('tedvio.currentGroupId',id);await ensureFeature('groups');if(typeof window.tvAttendanceProOpen==='function')return window.tvAttendanceProOpen(id);if(typeof window.gaOpenGroup==='function'){await window.gaOpenGroup(id);setTimeout(()=>window.gaAttendance?.(),80)}};
window.tvPilotAddStudents=async id=>{if(id)sessionStorage.setItem('tedvio.currentGroupId',id);await ensureFeature('groups');if(typeof window.gaOpenGroup==='function')await window.gaOpenGroup(id);setTimeout(()=>window.gaStudentForm?.(),80)};
window.tvPilotOpenRoster=id=>window.tvPilotOpenGroup(id);
window.tvPilotOpenGrades=async id=>{await window.tvPilotOpenGroup(id);setTimeout(()=>window.ga360Tab?.('grades'),60)};
window.tvPilotOpenExamForGroup=async id=>{if(id)sessionStorage.setItem('tedvio.currentGroupId',id);if(S.entitlements?.features?.omr===false)return openPlan();await ensureFeature('omr');window.peOpenHome?.()};

async function sessionCore(){if(S.sessionCore)return S.sessionCore;await import('./teacher-session-core-v68-6.js?v=686');S.sessionCore=window.__TEDVIO_SESSION686__;if(!S.sessionCore)throw new Error('No pude iniciar el motor de sesión.');return S.sessionCore}
window.betaNewSession=async(...a)=>(await sessionCore()).newSession(...a);
window.betaOpenSession=async(...a)=>(await sessionCore()).openSession(...a);
window.betaOpenReport=async(...a)=>(await sessionCore()).openReport(...a);
window.betaPickBankQuestion=async(...a)=>(await sessionCore()).pickBankQuestion(...a);
window.betaQuickLaunchPicker=async(...a)=>(await sessionCore()).quickLaunchPicker(...a);
window.betaLaunchBankToSession=async(...a)=>(await sessionCore()).launchBankToSession(...a);
window.betaLaunchBankLive=async(...a)=>(await sessionCore()).launchBankLive(...a);
window.betaReturnWaiting=async(...a)=>(await sessionCore()).returnWaiting(...a);
window.betaShowQuestion=async(...a)=>(await sessionCore()).showQuestion(...a);
window.betaLaunchQuestion=async(...a)=>(await sessionCore()).launchQuestion(...a);
window.betaCloseQuestion=async(...a)=>(await sessionCore()).closeQuestion(...a);
window.betaRevealQuestion=async(...a)=>(await sessionCore()).revealQuestion(...a);
window.betaEndSession=async(...a)=>(await sessionCore()).endSession(...a);
window.betaBackDashboard=()=>{S.sessionCore?.leave?.();renderShell();loadWorkspace(false)};
window.betaQuestionForm=async id=>{await ensureFeature('bank');if(typeof window.qs65Edit==='function')return window.qs65Edit(id);if(window.betaQuestionForm&&!window.betaQuestionForm.__tv686Stub)return window.betaQuestionForm(id)};
window.betaQuestionForm.__tv686Stub=true;

async function betaView(v='dashboard'){
  if(v==='dashboard'){S.sessionCore?.leave?.();renderShell();loadWorkspace(false);return}
  if(v==='bank'){S.view='bank';const main=document.querySelector('.b-main');if(main)main.innerHTML=loading('Abriendo Question Studio…');await ensureFeature('bank');if(typeof window.qs65Refresh==='function')window.qs65Refresh();const fn=window.betaView;if(fn!==betaView)return fn('bank');return}
  if(v==='quizzes'){S.view='quizzes';return(await sessionCore()).openPrepared()}
  if(v==='history'){S.view='history';return(await sessionCore()).openHistory()}
  if(v==='report')return;
}
window.betaView=betaView;

async function boot(){
  if(location.hash.startsWith('#join')||location.hash.startsWith('#student')){location.replace(`./beta.html${location.hash}`);return}
  const{data:{session}}=await db.auth.getSession();S.user=session?.user||null;
  if(!S.user){renderAuth();return}
  renderShell();setTimeout(()=>loadWorkspace(true),0);
}

db.auth.onAuthStateChange((_event,session)=>{S.user=session?.user||null;setTimeout(()=>{if(S.user){renderShell();loadWorkspace(true)}else renderAuth()},0)});
window.addEventListener('online',()=>{if(S.user&&S.view==='dashboard')loadWorkspace(true)});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&S.user&&S.view==='dashboard'&&Date.now()-(window.__TEDVIO_TEACHER686__?.lastRefresh||0)>60000)loadWorkspace(true)});
window.__TEDVIO_TEACHER686__={version:VERSION,db,state:S,renderShell,refresh:loadWorkspace,get lastRefresh(){return Date.now()}};
boot();
