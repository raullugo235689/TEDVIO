const VERSION='2026.08.28.70';
const root=document.querySelector('#betaApp');
const STATE={
  dashboard:null,
  classGroupId:null,
  roster:new Map(),
  lastPicked:new Map(),
  timer:{seconds:300,remaining:300,running:false,endAt:0,handle:null}
};

const esc=(v='')=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const num=v=>Number(v||0).toLocaleString('es-MX');
const pct=v=>v==null?'—':`${Math.round(Number(v))}%`;
const grade=v=>v==null?'—':Number(v).toFixed(1);
const core=()=>window.__TEDVIO_TEACHER686__||null;
const dash=()=>core()?.state?.dashboard||null;
const groups=()=>Array.isArray(dash()?.groups)?dash().groups:[];
const groupById=id=>groups().find(g=>String(g.id)===String(id))||null;
const groupName=g=>g?.name||g?.group_name||'Grupo';
const groupSubject=g=>g?.subject||g?.program||'Grupo';
const activeToday=g=>['open','paused','closed'].includes(String(g?.today_attendance_status||''));
const historicalLists=g=>Math.max(0,Number(g?.attendance_sessions_count||0)-(activeToday(g)?1:0));
const plural=(n,singular,pluralWord)=>`${num(n)} ${Number(n)===1?singular:pluralWord}`;

function firstName(){
  const u=core()?.state?.user;
  const raw=u?.user_metadata?.full_name||u?.user_metadata?.name||'';
  return String(raw).trim().split(/\s+/).filter(Boolean)[0]||'';
}
function greeting(){
  const h=new Date().getHours();
  return h<12?'Buenos días':h<19?'Buenas tardes':'Buenas noches';
}
function formatActivity(value){
  if(!value)return'Sin actividad';
  const d=new Date(value);
  if(!Number.isFinite(d.getTime())||d.getUTCFullYear()<2000)return'Sin actividad';
  const now=new Date();
  const same=d.toDateString()===now.toDateString();
  if(same)return`Hoy · ${d.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})}`;
  return d.toLocaleDateString('es-MX',{day:'numeric',month:'short'});
}
function attendanceState(g){
  const s=String(g?.today_attendance_status||'');
  if(s==='open')return{key:'open',label:'ASISTENCIA ABIERTA',short:'Abierta',tone:'live',detail:'La lista de hoy está abierta.',cta:'Continuar asistencia'};
  if(s==='paused')return{key:'paused',label:'ASISTENCIA PAUSADA',short:'Pausada',tone:'warn',detail:'La lista de hoy está pausada.',cta:'Reanudar asistencia'};
  if(s==='closed')return{key:'closed',label:'LISTA HOY',short:'Cerrada',tone:'ok',detail:`Lista de hoy cerrada · ${num(g?.today_attendance_records_count)} registros.`,cta:'Revisar asistencia'};
  return{key:'none',label:'SIN LISTA HOY',short:'Sin lista',tone:'neutral',detail:'Todavía no hay lista de asistencia para hoy.',cta:'Tomar asistencia'};
}
function riskTone(g){
  if(Number(g?.risk_count||0)>0)return'risk';
  if(Number(g?.watch_count||0)>0)return'watch';
  return'ok';
}
function nextAction(d){
  const gs=Array.isArray(d?.groups)?d.groups:[];
  if(!gs.length)return{
    eyebrow:'PRIMER PASO',title:'Crea tu primer grupo',detail:'Agrega un grupo para empezar a registrar asistencia, interacción y evaluación.',action:'groups',groupId:'',cta:'Crear grupo',tone:'blue'
  };
  const active=gs.find(g=>['open','paused'].includes(String(g.today_attendance_status||'')));
  if(active)return{
    eyebrow:'ASISTENCIA EN CURSO',title:`${groupName(active)} · ${attendanceState(active).cta}`,detail:`${groupSubject(active)} · ${attendanceState(active).detail}`,action:'attendance',groupId:active.id,cta:attendanceState(active).cta,tone:'green'
  };
  const missing=gs.find(g=>Number(g.students||0)>0&&!g.today_attendance_status);
  if(missing)return{
    eyebrow:'SIGUIENTE ACCIÓN RECOMENDADA',title:`${groupName(missing)} · Tomar asistencia`,detail:`${groupSubject(missing)} · ${plural(historicalLists(missing),'lista histórica','listas históricas')}.`,action:'attendance',groupId:missing.id,cta:'Tomar asistencia',tone:'blue'
  };
  const priority=(Array.isArray(d?.priority_students)?d.priority_students:[]).find(x=>x.status==='risk')
    ||(Array.isArray(d?.priority_students)?d.priority_students:[])[0];
  if(priority)return{
    eyebrow:priority.status==='risk'?'ALUMNO EN RIESGO':'SEGUIMIENTO',title:`Revisar a ${priority.full_name||'un alumno'}`,detail:[priority.attendance_rate!=null?`Asistencia ${pct(priority.attendance_rate)}`:'',priority.grade!=null?`Promedio ${grade(priority.grade)}`:''].filter(Boolean).join(' · ')||'Hay una señal académica que conviene revisar.',action:'group',groupId:priority.group_id,cta:'Abrir grupo',tone:priority.status==='risk'?'red':'amber'
  };
  if(d?.latest_evaluation?.group_id)return{
    eyebrow:'EVALUACIÓN RECIENTE',title:`Revisar ${d.latest_evaluation.title||'evaluación'}`,detail:`Promedio ${grade(d.latest_evaluation.average)} · Conviene revisar resultados y cerrar el ciclo de retroalimentación.`,action:'exam',groupId:d.latest_evaluation.group_id,cta:'Ver evaluación',tone:'violet'
  };
  const recent=gs[0];
  return{
    eyebrow:'CONTINUAR TRABAJO',title:`Abrir ${groupName(recent)}`,detail:`${groupSubject(recent)} · Última actividad: ${formatActivity(recent.last_activity)}.`,action:'class',groupId:recent.id,cta:'Modo Clase',tone:'blue'
  };
}
function retireLegacy(){
  document.querySelector('.tv686-main > .tv686-hero')?.classList.add('tv70-legacy-hidden');
  document.querySelector('.tv686-main > .tv686-quick')?.classList.add('tv70-legacy-hidden');
}
function renderLoading(){
  retireLegacy();
  const host=document.querySelector('#tv686Dashboard');
  if(!host)return;
  host.innerHTML=`<div class="tv70-skeleton" aria-label="Preparando centro de mando"><i></i><i></i><i></i></div>`;
}
function metricCard(label,value,detail,tone=''){
  return`<article class="tv70-kpi ${tone}"><span>${esc(label)}</span><b>${esc(value)}</b><small>${esc(detail)}</small></article>`;
}
function statusBadge(g){
  const s=attendanceState(g);
  return`<span class="tv70-status ${s.tone}">${esc(s.label)}</span>`;
}
function groupCard(g){
  const histories=historicalLists(g);
  const risks=Number(g.risk_count||0),watch=Number(g.watch_count||0);
  return`<article class="tv70-group-card" data-risk="${riskTone(g)}">
    <header>
      <div>
        <span class="tv70-overline">${esc(groupSubject(g))}</span>
        <h3>${esc(groupName(g))}</h3>
        <p>${esc(g.university||'')}${g.term?' · '+esc(g.term):''}</p>
      </div>
      ${statusBadge(g)}
    </header>
    <div class="tv70-group-metrics">
      <div><span>Alumnos</span><b>${num(g.students)}</b></div>
      <div><span>Asistencia histórica</span><b>${pct(g.attendance_rate)}</b></div>
      <div><span>Promedio</span><b>${grade(g.grade_avg)}</b></div>
    </div>
    <div class="tv70-group-context">
      <span>${plural(histories,'lista histórica','listas históricas')}</span>
      <span>${formatActivity(g.last_activity)}</span>
      ${risks?`<strong class="risk">${risks} en riesgo</strong>`:watch?`<strong class="watch">${watch} en seguimiento</strong>`:'<strong class="ok">Sin alertas críticas</strong>'}
    </div>
    <footer>
      <button class="tv70-btn primary" data-tv70-action="class" data-group="${esc(g.id)}">▶ Modo Clase</button>
      <button class="tv70-btn ghost" data-tv70-action="group" data-group="${esc(g.id)}">Abrir grupo</button>
    </footer>
  </article>`;
}
function priorityRows(items){
  if(!items.length)return`<div class="tv70-empty-mini"><b>Sin alertas académicas prioritarias.</b><span>Cuando TEDVIO detecte una señal de asistencia o rendimiento aparecerá aquí.</span></div>`;
  return`<div class="tv70-priority-list">${items.slice(0,5).map(p=>{
    const bits=[p.attendance_rate!=null?`Asistencia ${pct(p.attendance_rate)}`:'',p.grade!=null?`Promedio ${grade(p.grade)}`:''].filter(Boolean);
    return`<button data-tv70-action="group" data-group="${esc(p.group_id)}">
      <span class="tv70-risk-dot ${p.status==='risk'?'risk':'watch'}"></span>
      <div><b>${esc(p.full_name||'Alumno')}</b><small>${esc(p.enrollment||'')}${bits.length?' · '+esc(bits.join(' · ')):''}</small></div>
      <strong>${p.status==='risk'?'RIESGO':'SEGUIMIENTO'}</strong>
    </button>`;
  }).join('')}</div>`;
}
function latestEvaluation(d){
  const e=d?.latest_evaluation;
  if(!e)return`<div class="tv70-empty-mini"><b>Aún no hay evaluación reciente.</b><span>Los resultados aparecerán aquí cuando registres evaluaciones.</span></div>`;
  return`<div class="tv70-eval">
    <div class="tv70-eval-score"><span>PROMEDIO</span><b>${grade(e.average)}</b></div>
    <div><span class="tv70-overline">ÚLTIMA EVALUACIÓN</span><h4>${esc(e.title||'Evaluación')}</h4><p>Revisa resultados, reactivos y desempeño antes de continuar.</p></div>
    <button class="tv70-btn ghost" data-tv70-action="exam" data-group="${esc(e.group_id||'')}">Ver evaluación</button>
  </div>`;
}
function render(){
  retireLegacy();
  const host=document.querySelector('#tv686Dashboard');
  const d=dash();
  if(!host)return;
  if(!d){renderLoading();return}
  STATE.dashboard=d;
  document.documentElement.dataset.tedvioCommandCenter='70';
  const gs=Array.isArray(d.groups)?d.groups:[];
  const priority=Array.isArray(d.priority_students)?d.priority_students:[];
  const today=gs.filter(activeToday).length;
  const noList=gs.filter(g=>Number(g.students||0)>0&&!g.today_attendance_status).length;
  const open=gs.filter(g=>['open','paused'].includes(String(g.today_attendance_status||''))).length;
  const next=nextAction(d);
  const name=firstName();
  host.innerHTML=`<div class="tv70-dashboard">
    <section class="tv70-command">
      <div class="tv70-command-copy">
        <span class="tv70-overline">TEDVIO · CENTRO DE MANDO DOCENTE</span>
        <h1>${esc(greeting())}${name?', '+esc(name):''}.</h1>
        <p>Asistencia, interacción, evaluación y seguimiento en un solo flujo de clase.</p>
      </div>
      <div class="tv70-command-actions">
        ${gs.length?`<button class="tv70-btn hero" data-tv70-action="class" data-group="${esc(next.groupId||gs[0].id)}">▶ Iniciar Modo Clase</button>`:'<button class="tv70-btn hero" data-tv70-action="groups">＋ Crear primer grupo</button>'}
        <button class="tv70-icon-btn" data-tv70-action="refresh" aria-label="Actualizar centro de mando" title="Actualizar">↻</button>
      </div>
    </section>

    <section class="tv70-next ${esc(next.tone)}">
      <div class="tv70-next-icon">→</div>
      <div>
        <span>${esc(next.eyebrow)}</span>
        <h2>${esc(next.title)}</h2>
        <p>${esc(next.detail)}</p>
      </div>
      <button class="tv70-btn next" data-tv70-action="${esc(next.action)}" ${next.groupId?`data-group="${esc(next.groupId)}"`:''}>${esc(next.cta)}</button>
    </section>

    <div class="tv70-kpis">
      ${metricCard('Grupos',num(d.groups_count??gs.length),gs.length?'Activos en tu espacio':'Crea el primero')}
      ${metricCard('Listas hoy',num(today),noList?`${noList} pendientes hoy`:'Sin pendientes',noList?'attention':'')}
      ${metricCard('En riesgo',num(d.risk_students),Number(d.risk_students)?'Requieren atención':'Sin alertas críticas',Number(d.risk_students)?'risk':'')}
      ${metricCard('Seguimiento',num(d.watch_students),open?`${open} asistencia${open===1?'':'s'} en curso`:'Vigilancia preventiva',Number(d.watch_students)?'watch':'')}
    </div>

    <nav class="tv70-quickbar" aria-label="Accesos rápidos">
      <button data-tv70-action="${gs.length?'class':'groups'}" ${gs.length?`data-group="${esc(next.groupId||gs[0].id)}"`:''}><i>▶</i><span><b>Modo Clase</b><small>Todo el flujo en un lugar</small></span></button>
      <button data-tv70-action="groups"><i>◎</i><span><b>Grupos</b><small>Alumnos y asistencia</small></span></button>
      <button data-tv70-action="bank"><i>▤</i><span><b>Banco</b><small>Reactivos y preguntas</small></span></button>
      <button data-tv70-action="exam" ${gs.length?`data-group="${esc(next.groupId||gs[0].id)}"`:''}><i>⌁</i><span><b>Exámenes</b><small>OMR y resultados</small></span></button>
    </nav>

    <div class="tv70-layout">
      <main class="tv70-groups-column">
        <div class="tv70-section-head">
          <div><span class="tv70-overline">OPERACIÓN ACADÉMICA</span><h2>Tus grupos</h2><p>El estado de hoy se distingue del historial para evitar ambigüedades.</p></div>
          <button class="tv70-btn ghost" data-tv70-action="groups">Ver todos</button>
        </div>
        <div class="tv70-groups">
          ${gs.length?gs.slice(0,8).map(groupCard).join(''):`<div class="tv70-empty">
            <span class="tv70-empty-mark">＋</span><h3>Tu centro de mando empieza con un grupo.</h3>
            <p>Crea el primero y TEDVIO podrá organizar asistencia, interacción, evaluación y seguimiento.</p>
            <button class="tv70-btn primary" data-tv70-action="groups">Crear grupo</button>
          </div>`}
        </div>
      </main>

      <aside class="tv70-side">
        <section class="tv70-panel attention">
          <header><div><span class="tv70-overline">NECESITAN TU ATENCIÓN</span><h3>Seguimiento académico</h3></div><b>${num(Number(d.risk_students||0)+Number(d.watch_students||0))}</b></header>
          ${priorityRows(priority)}
        </section>
        <section class="tv70-panel">
          ${latestEvaluation(d)}
        </section>
        <section class="tv70-panel tv70-today">
          <span class="tv70-overline">ESTADO DE HOY</span>
          <div><b>${today}/${gs.length||0}</b><span>grupos con lista hoy</span></div>
          <div><b>${open}</b><span>listas abiertas o pausadas</span></div>
          <div><b>${noList}</b><span>grupos con alumnos y sin lista hoy</span></div>
        </section>
      </aside>
    </div>
  </div>`;
  tv72EnhanceDashboard();
}
function scheduleRender(){
  requestAnimationFrame(()=>requestAnimationFrame(render));
}
function closeClass(){
  clearTimeout(STATE.timer.handle);
  STATE.timer.handle=null;
  STATE.timer.running=false;
  document.querySelector('#tv70ClassOverlay')?.remove();
  delete document.documentElement.dataset.tv70Modal;
  STATE.classGroupId=null;
}
function classStep(number,title,detail,button,done=false){
  return`<div class="tv70-class-step ${done?'done':''}">
    <i>${done?'✓':number}</i><div><b>${esc(title)}</b><span>${esc(detail)}</span></div>${button||''}
  </div>`;
}
function openClass(groupId){
  const g=groupById(groupId);
  if(!g)return;
  closeClass();
  STATE.classGroupId=g.id;
  STATE.timer={seconds:300,remaining:300,running:false,endAt:0,handle:null};
  sessionStorage.setItem('tedvio.currentGroupId',g.id);
  const a=attendanceState(g);
  const ov=document.createElement('div');
  ov.id='tv70ClassOverlay';
  ov.className='tv70-class-overlay';
  ov.innerHTML=`<section class="tv70-class-shell" role="dialog" aria-modal="true" aria-label="Modo Clase">
    <header class="tv70-class-head">
      <div><span>TEDVIO · MODO CLASE</span><h2>${esc(groupSubject(g))}</h2><p>${esc(groupName(g))}${g.term?' · '+esc(g.term):''}</p></div>
      <button class="tv70-class-close" data-tv70-action="class-close" aria-label="Cerrar Modo Clase">×</button>
    </header>
    <div class="tv70-class-summary">
      <div><span>Alumnos</span><b>${num(g.students)}</b></div>
      <div><span>Asistencia histórica</span><b>${pct(g.attendance_rate)}</b></div>
      <div><span>Promedio</span><b>${grade(g.grade_avg)}</b></div>
      <div><span>Alertas</span><b>${num(Number(g.risk_count||0)+Number(g.watch_count||0))}</b></div>
    </div>
    <main class="tv70-class-body">
      <section class="tv70-class-route">
        <div class="tv70-class-title"><span class="tv70-overline">RUTA DE CLASE</span><h3>De la entrada a la evidencia</h3><p>TEDVIO mantiene las acciones clave del grupo en una sola pantalla.</p></div>
        ${classStep('1','Asistencia',a.detail,`<button class="tv70-btn ${a.key==='open'||a.key==='paused'?'success':'ghost'}" data-tv70-action="attendance" data-group="${esc(g.id)}">${esc(a.cta)}</button>`,a.key==='closed')}
        ${classStep('2','Interacción en vivo','Lanza preguntas, participación y resultados proyectables.',`<button class="tv70-btn primary" data-tv70-action="live" data-group="${esc(g.id)}">▶ Iniciar Live</button>`)}
        ${classStep('3','Evidencia y cierre','Revisa evaluación y actualiza el libro de calificaciones.',`<button class="tv70-btn ghost" data-tv70-action="grades" data-group="${esc(g.id)}">Calificaciones</button>`)}
      </section>
      <section class="tv70-class-tools">
        <div class="tv70-class-title"><span class="tv70-overline">HERRAMIENTAS DE CLASE</span><h3>Acciones rápidas</h3></div>
        <div class="tv70-tool-grid">
          <button data-tv70-action="live" data-group="${esc(g.id)}"><i>▶</i><b>Live</b><span>Inicia interacción</span></button>
          <button data-tv70-action="bank"><i>▤</i><b>Banco</b><span>Busca un reactivo</span></button>
          <button data-tv70-action="exam" data-group="${esc(g.id)}"><i>⌁</i><b>Examen / OMR</b><span>Evalúa y analiza</span></button>
          <button data-tv70-action="grades" data-group="${esc(g.id)}"><i>≋</i><b>Calificaciones</b><span>Abre el libro</span></button>
          <button data-tv70-action="pick" data-group="${esc(g.id)}"><i>?</i><b>Elegir alumno</b><span>Participación aleatoria</span></button>
          <button data-tv70-action="timer-show"><i>◷</i><b>Cronómetro</b><span>5, 10 o 15 min</span></button>
        </div>
        <div id="tv70ClassUtility" class="tv70-class-utility" hidden></div>
      </section>
      <section class="tv70-class-context">
        <div><span class="tv70-overline">ESTADO DEL GRUPO</span><h3>${esc(a.label)}</h3><p>${esc(a.detail)} ${plural(historicalLists(g),'lista histórica','listas históricas')}.</p></div>
        <button class="tv70-btn ghost" data-tv70-action="group" data-group="${esc(g.id)}">Abrir expediente del grupo</button>
      </section>
    </main>
  </section>`;
  document.body.appendChild(ov);
  document.documentElement.dataset.tv70Modal='class';
  ov.addEventListener('mousedown',e=>{if(e.target===ov)closeClass()});
  ov.querySelector('.tv70-class-close')?.focus({preventScroll:true});
}
async function startLive(groupId){
  const g=groupById(groupId);
  if(groupId)sessionStorage.setItem('tedvio.currentGroupId',groupId);
  closeClass();
  if(typeof window.betaNewSession!=='function')return;
  await window.betaNewSession();
  const title=document.querySelector('#tv686SessionTitle');
  if(title&&g&&(!title.value||title.value==='Mi clase TEDVIO'))title.value=`${groupSubject(g)} · ${groupName(g)}`;
}
function utility(){
  return document.querySelector('#tv70ClassUtility');
}
async function pickStudent(groupId){
  const box=utility();
  if(!box)return;
  box.hidden=false;
  box.innerHTML=`<div class="tv70-pick"><span class="tv70-overline">PARTICIPACIÓN ALEATORIA</span><b>Eligiendo alumno…</b></div>`;
  try{
    let roster=STATE.roster.get(groupId);
    if(!roster){
      const c=core();
      if(!c?.db||!c?.state?.user)throw new Error('No hay sesión docente activa.');
      const {data,error}=await c.db.from('v2_group_students').select('id,full_name,enrollment').eq('teacher_id',c.state.user.id).eq('group_id',groupId).eq('active',true).order('full_name');
      if(error)throw error;
      roster=data||[];
      STATE.roster.set(groupId,roster);
    }
    if(!roster.length){
      box.innerHTML=`<div class="tv70-pick"><span class="tv70-overline">PARTICIPACIÓN ALEATORIA</span><b>No hay alumnos activos en este grupo.</b></div>`;
      return;
    }
    let idx;
    if(globalThis.crypto?.getRandomValues){
      const a=new Uint32Array(1);crypto.getRandomValues(a);idx=a[0]%roster.length;
    }else idx=Math.floor(Math.random()*roster.length);
    const last=STATE.lastPicked.get(groupId);
    if(roster.length>1&&roster[idx]?.id===last)idx=(idx+1)%roster.length;
    const picked=roster[idx];
    STATE.lastPicked.set(groupId,picked.id);
    box.innerHTML=`<div class="tv70-pick result">
      <span class="tv70-overline">ALUMNO SELECCIONADO</span>
      <strong>${esc(picked.full_name||'Alumno')}</strong>
      <small>${esc(picked.enrollment||'')}</small>
      <button class="tv70-btn ghost" data-tv70-action="pick" data-group="${esc(groupId)}">Elegir otro</button>
    </div>`;
  }catch(error){
    console.error('TEDVIO v70 random student',error);
    box.innerHTML=`<div class="tv70-pick"><span class="tv70-overline">PARTICIPACIÓN ALEATORIA</span><b>No pude cargar el grupo.</b><small>${esc(error.message||'Intenta nuevamente.')}</small></div>`;
  }
}
function timerMarkup(){
  const t=STATE.timer;
  const m=Math.floor(t.remaining/60),s=t.remaining%60;
  return`<div class="tv70-timer">
    <div><span class="tv70-overline">CRONÓMETRO DE CLASE</span><strong id="tv70TimerValue">${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}</strong></div>
    <div class="tv70-timer-presets">
      <button data-tv70-action="timer-set" data-seconds="300">5 min</button>
      <button data-tv70-action="timer-set" data-seconds="600">10 min</button>
      <button data-tv70-action="timer-set" data-seconds="900">15 min</button>
    </div>
    <div class="tv70-timer-actions">
      <button class="tv70-btn primary" data-tv70-action="${t.running?'timer-pause':'timer-start'}">${t.running?'Pausar':'Iniciar'}</button>
      <button class="tv70-btn ghost" data-tv70-action="timer-reset">Reiniciar</button>
    </div>
  </div>`;
}
function showTimer(){
  const box=utility();
  if(!box)return;
  box.hidden=false;
  box.innerHTML=timerMarkup();
}
function paintTimer(){
  const value=document.querySelector('#tv70TimerValue');
  if(!value)return;
  const m=Math.floor(STATE.timer.remaining/60),s=STATE.timer.remaining%60;
  value.textContent=`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
function timerTick(){
  clearTimeout(STATE.timer.handle);
  if(!STATE.timer.running)return;
  STATE.timer.remaining=Math.max(0,Math.ceil((STATE.timer.endAt-Date.now())/1000));
  paintTimer();
  if(STATE.timer.remaining<=0){
    STATE.timer.running=false;
    STATE.timer.handle=null;
    const box=utility();
    if(box)box.innerHTML=`${timerMarkup()}<div class="tv70-timer-done">Tiempo terminado.</div>`;
    return;
  }
  STATE.timer.handle=setTimeout(timerTick,250);
}
function setTimer(seconds){
  const sec=Math.max(1,Number(seconds)||300);
  clearTimeout(STATE.timer.handle);
  STATE.timer={seconds:sec,remaining:sec,running:false,endAt:0,handle:null};
  showTimer();
}
function startTimer(){
  if(STATE.timer.remaining<=0)STATE.timer.remaining=STATE.timer.seconds;
  STATE.timer.running=true;
  STATE.timer.endAt=Date.now()+STATE.timer.remaining*1000;
  showTimer();
  timerTick();
}
function pauseTimer(){
  if(STATE.timer.running)STATE.timer.remaining=Math.max(0,Math.ceil((STATE.timer.endAt-Date.now())/1000));
  STATE.timer.running=false;
  clearTimeout(STATE.timer.handle);STATE.timer.handle=null;
  showTimer();
}
function resetTimer(){
  clearTimeout(STATE.timer.handle);
  STATE.timer.remaining=STATE.timer.seconds;
  STATE.timer.running=false;STATE.timer.endAt=0;STATE.timer.handle=null;
  showTimer();
}
async function act(action,groupId,el){
  if(!action)return;
  if(action==='class'){openClass(groupId);return}
  if(action==='class-close'){closeClass();return}
  if(action==='refresh'){renderLoading();await core()?.refresh?.();scheduleRender();return}
  if(action==='groups'){closeClass();await window.tvPilotOpenGroups?.();return}
  if(action==='group'){closeClass();if(groupId)await window.tvPilotOpenGroup?.(groupId);return}
  if(action==='attendance'){closeClass();if(groupId)await window.tvPilotAttendance?.(groupId);return}
  if(action==='grades'){closeClass();if(groupId)await window.tvPilotOpenGrades?.(groupId);return}
  if(action==='exam'){closeClass();await window.tvPilotOpenExamForGroup?.(groupId||undefined);return}
  if(action==='bank'){closeClass();await window.betaView?.('bank');return}
  if(action==='live'){await startLive(groupId);return}
  if(action==='pick'){await pickStudent(groupId||STATE.classGroupId);return}
  if(action==='timer-show'){showTimer();return}
  if(action==='timer-set'){setTimer(el?.dataset?.seconds);return}
  if(action==='timer-start'){startTimer();return}
  if(action==='timer-pause'){pauseTimer();return}
  if(action==='timer-reset'){resetTimer();return}
}
document.addEventListener('click',event=>{
  const el=event.target.closest?.('[data-tv70-action]');
  if(!el)return;
  const action=el.dataset.tv70Action;
  if(!action)return;
  event.preventDefault();
  act(action,el.dataset.group||'',el).catch(error=>console.error('TEDVIO v70 action',action,error));
});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&document.querySelector('#tv70ClassOverlay'))closeClass()});

window.addEventListener('tedvio:teacher-shell',()=>{retireLegacy();scheduleRender()});
window.addEventListener('tedvio:profile',scheduleRender);
window.addEventListener('tedvio:entitlements',scheduleRender);
window.addEventListener('online',scheduleRender);
if(root)new MutationObserver(()=>{if(document.querySelector('.tv686-app')){retireLegacy();scheduleRender()}}).observe(root,{childList:true});

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{retireLegacy();scheduleRender()},{once:true});else{retireLegacy();scheduleRender()}

window.tv70OpenClass=openClass;
window.tv70StartLive=startLive;
window.tv70PickStudent=pickStudent;
window.tv70Timer={show:showTimer,set:setTimer,start:startTimer,pause:pauseTimer,reset:resetTimer};
window.__TEDVIO_COMMAND_CENTER70__={version:VERSION,render,openClass,get dashboard(){return dash()}};
/* TEDVIO v72 · Academic Workflow Home */
const TV72_VERSION='2026.08.28.72';
function tv72CompactAction(action,groupId,label,cls='ghost'){
  return`<button class="tv70-btn ${cls}" data-tv70-action="${esc(action)}"${groupId?` data-group="${esc(groupId)}"`:''}>${esc(label)}</button>`;
}
function tv72RouteStep(number,label,value,detail,action,groupId,cta,tone=''){
  return`<article class="tv72-route-step ${esc(tone)}">
    <i>${esc(number)}</i>
    <div><span>${esc(label)}</span><b>${esc(value)}</b><small>${esc(detail)}</small></div>
    ${tv72CompactAction(action,groupId,cta,'mini ghost')}
  </article>`;
}
function tv72DailyTasks(d,gs){
  const rows=[];
  const active=gs.find(g=>['open','paused'].includes(String(g.today_attendance_status||'')));
  const pending=gs.find(g=>Number(g.students||0)>0&&!g.today_attendance_status);
  const priority=(Array.isArray(d?.priority_students)?d.priority_students:[]).find(x=>x.status==='risk')||(Array.isArray(d?.priority_students)?d.priority_students:[])[0];
  if(active)rows.push({tone:'live',title:`${groupName(active)} · ${attendanceState(active).cta}`,detail:attendanceState(active).detail,action:'attendance',groupId:active.id,cta:'Continuar'});
  if(pending)rows.push({tone:'pending',title:`${groupName(pending)} · Sin lista hoy`,detail:`${groupSubject(pending)} · ${num(pending.students||0)} alumnos.`,action:'attendance',groupId:pending.id,cta:'Tomar lista'});
  if(priority)rows.push({tone:priority.status==='risk'?'risk':'watch',title:`${priority.full_name||'Alumno'} · ${priority.status==='risk'?'Riesgo':'Seguimiento'}`,detail:[priority.attendance_rate!=null?`Asistencia ${pct(priority.attendance_rate)}`:'',priority.grade!=null?`Promedio ${grade(priority.grade)}`:''].filter(Boolean).join(' · ')||'Requiere revisión académica.',action:'group',groupId:priority.group_id,cta:'Revisar'});
  if(!rows.length&&d?.latest_evaluation?.group_id)rows.push({tone:'eval',title:d.latest_evaluation.title||'Evaluación reciente',detail:`Promedio ${grade(d.latest_evaluation.average)} · Cierra el ciclo de retroalimentación.`,action:'exam',groupId:d.latest_evaluation.group_id,cta:'Resultados'});
  if(!rows.length)return`<div class="tv72-task-empty"><b>Tu jornada está al día.</b><span>No hay listas abiertas ni alertas prioritarias en este momento.</span></div>`;
  return`<div class="tv72-task-list">${rows.slice(0,3).map(x=>`<div class="tv72-task ${esc(x.tone)}"><i></i><div><b>${esc(x.title)}</b><span>${esc(x.detail)}</span></div>${tv72CompactAction(x.action,x.groupId,x.cta,'mini ghost')}</div>`).join('')}</div>`;
}
function tv72EnhanceDashboard(){
  const host=document.querySelector('#tv686Dashboard'),d=dash();
  if(!host||!d||!host.querySelector('.tv70-dashboard'))return;
  const gs=Array.isArray(d.groups)?d.groups:[];
  const pending=gs.filter(g=>Number(g.students||0)>0&&!g.today_attendance_status);
  const active=gs.filter(g=>['open','paused'].includes(String(g.today_attendance_status||'')));
  const closed=gs.filter(g=>String(g.today_attendance_status||'')==='closed');
  const priorityCount=Number(d.risk_students||0)+Number(d.watch_students||0);
  const lastId=sessionStorage.getItem('tedvio.currentGroupId')||'';
  const last=groupById(lastId);
  const signature=[gs.map(g=>`${g.id}:${g.today_attendance_status||'-'}:${g.risk_count||0}:${g.watch_count||0}`).join('|'),lastId,d.risk_students,d.watch_students,d.latest_evaluation?.group_id||''].join('::');
  const existing=host.querySelector('.tv72-home-workflow');
  if(existing?.dataset.signature===signature)return;
  existing?.remove();
  const contextual=active.length
    ?`${active.length} asistencia${active.length===1?'':'s'} en curso. Continúa el registro antes de abrir una nueva lista.`
    :pending.length
      ?`${pending.length} grupo${pending.length===1?'':'s'} con alumnos espera${pending.length===1?'':'n'} lista de hoy.`
      :priorityCount
        ?`${priorityCount} alumno${priorityCount===1?'':'s'} necesita${priorityCount===1?'':'n'} seguimiento académico.`
        :'Tu operación académica está al día. TEDVIO conserva el siguiente paso de cada grupo.';
  const intro=host.querySelector('.tv70-command-copy p');
  if(intro)intro.textContent=contextual;
  const prepareGroup=pending[0]||gs[0]||null;
  const liveGroup=active[0]||last||gs[0]||null;
  const closeGroup=(Array.isArray(d.priority_students)?d.priority_students:[])[0]?.group_id||d.latest_evaluation?.group_id||last?.id||gs[0]?.id||'';
  const lastAction=last&&['open','paused'].includes(String(last.today_attendance_status||''))?'attendance':'class';
  const lastCta=lastAction==='attendance'?attendanceState(last).cta:'Continuar grupo';
  const section=document.createElement('section');
  section.className='tv72-home-workflow';
  section.dataset.signature=signature;
  section.innerHTML=`<header class="tv72-home-head">
      <div><span class="tv70-overline">TEDVIO · ACADEMIC WORKFLOW</span><h2>Tu ruta académica de hoy</h2><p>Prepara, conduce y cierra cada clase sin perder el hilo del grupo.</p></div>
      <span class="tv72-release">v72</span>
    </header>
    <div class="tv72-home-grid">
      <div class="tv72-route" aria-label="Ruta académica de hoy">
        ${tv72RouteStep('1','PREPARAR',pending.length?`${pending.length} pendiente${pending.length===1?'':'s'}`:'Al día',pending.length?'Grupos con alumnos y sin lista hoy.':'No hay listas pendientes.',pending.length?'attendance':'groups',prepareGroup?.id||'',pending.length?'Tomar lista':'Ver grupos',pending.length?'attention':'ok')}
        ${tv72RouteStep('2','DAR CLASE',active.length?`${active.length} en curso`:(liveGroup?'Lista para iniciar':'Sin grupos'),active.length?'Continúa la asistencia activa.':'Abre Modo Clase con el grupo que sigue.',active.length?'attendance':(liveGroup?'class':'groups'),liveGroup?.id||'',active.length?'Continuar':'Modo Clase',active.length?'live':'blue')}
        ${tv72RouteStep('3','CERRAR CICLO',priorityCount?`${priorityCount} seguimiento${priorityCount===1?'':'s'}`:(d.latest_evaluation?'1 evaluación':'Sin pendientes'),priorityCount?'Revisa alertas antes de la próxima evaluación.':d.latest_evaluation?'Revisa resultados y retroalimentación.':'No hay cierres urgentes.',priorityCount?'group':(d.latest_evaluation?'exam':'groups'),closeGroup,priorityCount?'Revisar':(d.latest_evaluation?'Resultados':'Ver grupos'),priorityCount?'risk':(d.latest_evaluation?'violet':'ok'))}
      </div>
      <aside class="tv72-home-side">
        <div class="tv72-continue ${last?'ready':'empty'}">
          <span class="tv70-overline">CONTINUAR DONDE LO DEJASTE</span>
          ${last?`<h3>${esc(groupName(last))}</h3><p>${esc(groupSubject(last))} · ${esc(formatActivity(last.last_activity))}</p><div class="tv72-continue-meta"><span>${esc(attendanceState(last).label)}</span><span>${num(last.students||0)} alumnos</span></div>${tv72CompactAction(lastAction,last.id,lastCta,'primary')}`:`<h3>Aún no hay un grupo reciente.</h3><p>Cuando abras Modo Clase, TEDVIO conservará aquí tu punto de regreso.</p>${tv72CompactAction(gs.length?'class':'groups',gs[0]?.id||'',gs.length?'Abrir primer grupo':'Crear grupo','primary')}`}
        </div>
        <div class="tv72-pending"><div class="tv72-pending-head"><span class="tv70-overline">PENDIENTES DE HOY</span><b>${num(active.length+pending.length+priorityCount)}</b></div>${tv72DailyTasks(d,gs)}</div>
      </aside>
    </div>`;
  const next=host.querySelector('.tv70-next'),kpis=host.querySelector('.tv70-kpis');
  if(next)next.insertAdjacentElement('afterend',section);else if(kpis)host.querySelector('.tv70-dashboard')?.insertBefore(section,kpis);else host.querySelector('.tv70-dashboard')?.appendChild(section);
  document.documentElement.dataset.tedvioAcademicWorkflow='72';
}
window.__TEDVIO_ACADEMIC_HOME72__={version:TV72_VERSION,enhanceDashboard:tv72EnhanceDashboard};
