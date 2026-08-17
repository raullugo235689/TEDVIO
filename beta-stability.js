import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cfg = window.TEDVIO_CONFIG || {};
const sb = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY);
const STUDENT_KEY = 'tedvio_v2_student';
const root = document.querySelector('#betaApp');
const bootAt = Date.now();
let joinBusy = false;
let sessionBusy = false;
let fatalShown = false;
let lastUserId = null;

const esc = (v='') => String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const sleep = ms => new Promise(r => setTimeout(r, ms));

function friendlyError(error){
  const m = String(error?.message || error || 'No se pudo completar la operación.');
  if(m.includes('MATRICULA_REQUIRED')) return 'Esta sesión requiere tu matrícula del grupo.';
  if(m.includes('ROSTER_NOT_FOUND')) return 'La matrícula no aparece en la lista de este grupo.';
  if(m.includes('TEAM_REQUIRED')) return 'Escribe el nombre de tu equipo.';
  if(m.includes('SESSION_NOT_FOUND')) return 'Código no válido o sesión finalizada.';
  if(m.includes('QUESTION_EXPIRED')) return 'El tiempo de esta pregunta terminó.';
  if(m.includes('QUESTION_NOT_LIVE')) return 'Esta pregunta ya no está aceptando respuestas.';
  if(m.includes('duplicate response')) return 'Ya respondiste esta pregunta.';
  return m;
}

async function secureJoin(btn){
  if(joinBusy) return;
  joinBusy = true;
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Entrando…';
  try{
    const code = document.querySelector('#joinCode')?.value.trim() || '';
    const name = document.querySelector('#joinName')?.value.trim() || '';
    const matricula = document.querySelector('#pmJoinMatricula')?.value.trim() || null;
    const team = document.querySelector('#joinTeam')?.value.trim() || null;
    if(code.length !== 6 || !name) throw new Error('Escribe nombre y código de 6 dígitos.');
    const {data,error} = await sb.rpc('v2_join_session_v3',{
      p_code: code,
      p_name: name,
      p_matricula: matricula,
      p_team: team
    });
    if(error) throw error;
    const row = data?.[0];
    if(!row) throw new Error('No se pudo unir a la sesión.');
    localStorage.setItem(STUDENT_KEY,JSON.stringify({
      sessionId: row.session_id,
      participantId: row.participant_id,
      name: row.display_name,
      team: row.team_name || null
    }));
    location.hash = '#student';
  }catch(error){
    alert(friendlyError(error));
  }finally{
    joinBusy = false;
    if(btn.isConnected){ btn.disabled = false; btn.textContent = original; }
  }
}

async function exactSessionSettings(btn,handler,event){
  if(sessionBusy) return;
  sessionBusy = true;
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Creando…';
  try{
    const {data:{user}} = await sb.auth.getUser();
    if(!user) throw new Error('Inicia sesión como profesor.');
    const {data:before} = await sb.from('v2_sessions').select('id').eq('teacher_id',user.id).neq('status','closed');
    const beforeIds = new Set((before||[]).map(x=>x.id));
    const settings = {
      group_id: document.querySelector('#pmSessionGroup')?.value || null,
      scoring_mode: document.querySelector('#pmScoring')?.value || 'speed',
      randomize_questions: !!document.querySelector('#pmRandQ')?.checked,
      randomize_options: !!document.querySelector('#pmRandO')?.checked,
      roster_required: !!document.querySelector('#pmRosterReq')?.checked,
      streak_bonus: document.querySelector('#pmStreak') ? !!document.querySelector('#pmStreak').checked : true,
      speed_bonus: (document.querySelector('#pmScoring')?.value || 'speed') === 'speed',
      base_points: Number(document.querySelector('#pmBasePoints')?.value || 1000),
      speed_bonus_max: Number(document.querySelector('#pmSpeedMax')?.value || 500),
      streak_bonus_step: Number(document.querySelector('#pmStreakStep')?.value || 100)
    };

    await handler?.call(btn,event);

    let created = null;
    for(let i=0;i<12;i++){
      await sleep(180);
      const {data:open} = await sb.from('v2_sessions').select('id,created_at').eq('teacher_id',user.id).neq('status','closed').order('created_at',{ascending:false}).limit(10);
      created = (open||[]).find(x=>!beforeIds.has(x.id)) || null;
      if(created) break;
    }
    if(created){
      const {error} = await sb.from('v2_sessions').update(settings).eq('id',created.id);
      if(error) console.error('TEDVIO exact session settings',error);
    }
  }catch(error){
    console.error('TEDVIO session create guard',error);
    alert(friendlyError(error));
  }finally{
    sessionBusy = false;
    if(btn.isConnected){ btn.disabled = false; btn.textContent = original; }
  }
}

function hotspotValidation(e,btn){
  const type = document.querySelector('#qType')?.value;
  if(type !== 'hotspot') return false;
  const file = document.querySelector('#qMediaFile')?.files?.[0];
  const url = document.querySelector('#qMediaUrl')?.value.trim() || '';
  const isNew = /Nueva/i.test(document.querySelector('.b-modal h2')?.textContent || '');
  const editor = document.querySelector('#pmHotspotEditor');
  if(!file && !url){
    e.preventDefault();e.stopImmediatePropagation();alert('La pregunta de zona de imagen necesita una imagen.');return true;
  }
  if(file && !file.type.startsWith('image/')){
    e.preventDefault();e.stopImmediatePropagation();alert('Para una pregunta Hotspot selecciona un archivo de imagen.');return true;
  }
  if(isNew && editor?.dataset.touched !== '1'){
    e.preventDefault();e.stopImmediatePropagation();alert('Toca en la imagen la zona correcta antes de guardar.');return true;
  }
  return false;
}

document.addEventListener('click',async e=>{
  const join = e.target.closest?.('#joinBtn');
  if(join){
    e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
    await secureJoin(join);
    return;
  }

  const create = e.target.closest?.('#sessionCreate');
  if(create){
    e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
    if(sessionBusy) return;
    const handler = create.onclick;
    await exactSessionSettings(create,handler,e);
    return;
  }

  const hotImg = e.target.closest?.('#pmHotImg');
  if(hotImg){
    const editor = document.querySelector('#pmHotspotEditor');
    if(editor) editor.dataset.touched = '1';
  }

  const save = e.target.closest?.('#qSave');
  if(save) hotspotValidation(e,save);
},true);

function patchJoinContext(){
  if(!location.hash.startsWith('#join')) return;
  const code = document.querySelector('#joinCode')?.value.trim();
  const field = document.querySelector('#pmJoinMatricula')?.closest('.b-field');
  if(!field || code?.length !== 6 || field.dataset.stabilityMeta === '1') return;
  field.dataset.stabilityMeta = '1';
  sb.rpc('v2_public_session_meta',{p_code:code}).then(({data})=>{
    const s = data?.[0];
    const label = field.querySelector('label');
    if(label && s) label.textContent = s.roster_required ? 'Matrícula (obligatoria)' : 'Matrícula (opcional)';
  }).catch(()=>{});
}

function patchHotspotUi(){
  const typeFilter = document.querySelector('#bankType');
  if(typeFilter && ![...typeFilter.options].some(o=>o.value==='hotspot')){
    const o=document.createElement('option');o.value='hotspot';o.textContent='Zona de imagen (Hotspot)';typeFilter.appendChild(o);
  }
  document.querySelectorAll('.b-chip').forEach(chip=>{
    if(chip.textContent.trim()==='hotspot') chip.textContent='Zona de imagen';
  });
  const main = document.querySelector('#sessionMain');
  if(!main) return;
  const chips = [...main.querySelectorAll('.b-chip')].map(x=>x.textContent.trim().toLowerCase());
  const isHot = chips.includes('hotspot') || chips.includes('zona de imagen');
  if(!isHot) return;
  const status = [...main.querySelectorAll('.b-chip.green')].find(x=>['live','closed','revealed'].includes(x.textContent.trim()))?.textContent.trim();
  const toolbar = main.querySelector('.b-toolbar');
  if(toolbar && status !== 'revealed' && !toolbar.querySelector('[data-stability-reveal-hotspot]')){
    const b=document.createElement('button');
    b.className='b-btn success';
    b.dataset.stabilityRevealHotspot='1';
    b.textContent='Mostrar respuesta';
    b.onclick=()=>window.betaRevealQuestion?.();
    const bankBtn=[...toolbar.querySelectorAll('button')].find(x=>x.textContent.includes('Banco'));
    toolbar.insertBefore(b,bankBtn||toolbar.firstChild);
  }
  if(status==='revealed') drawHotspotAnswer();
}

async function drawHotspotAnswer(){
  if(document.querySelector('#pmHotAnswerMark')) return;
  const main=document.querySelector('#sessionMain');
  const img=main?.querySelector('.b-media');
  const code=main?.textContent.match(/Código\s+(\d{6})/)?.[1];
  if(!img||!code) return;
  const {data:s}=await sb.from('v2_sessions').select('current_question_id').eq('code',code).maybeSingle();
  if(!s?.current_question_id) return;
  const {data:q}=await sb.from('v2_questions').select('question_type,status,correct_answer').eq('id',s.current_question_id).maybeSingle();
  if(q?.question_type!=='hotspot'||q.status!=='revealed'||q.correct_answer?.x==null) return;
  const parent=img.parentElement;
  if(!parent) return;
  parent.style.position='relative';
  const mark=document.createElement('span');
  mark.id='pmHotAnswerMark';
  mark.title='Zona correcta';
  const radius=Number(q.correct_answer.radius||8);
  Object.assign(mark.style,{position:'absolute',left:`calc(${Number(q.correct_answer.x)}% - ${radius}px)`,top:`calc(${Number(q.correct_answer.y)}% - ${radius}px)`,width:`${radius*2}px`,height:`${radius*2}px`,border:'4px solid #16a34a',borderRadius:'50%',boxShadow:'0 0 0 5px rgba(22,163,74,.18)',pointerEvents:'none',zIndex:'8'});
  parent.appendChild(mark);
}

function showNetworkBanner(){
  let b=document.querySelector('#stabilityNetwork');
  if(navigator.onLine){ b?.remove(); return; }
  if(b) return;
  b=document.createElement('div');b.id='stabilityNetwork';
  Object.assign(b.style,{position:'fixed',left:'12px',right:'12px',bottom:'12px',zIndex:'9999',padding:'11px 14px',borderRadius:'12px',background:'#7f1d1d',color:'#fff',fontWeight:'800',textAlign:'center'});
  b.textContent='Sin conexión. TEDVIO reanudará la sincronización cuando vuelva internet.';
  document.body.appendChild(b);
}
window.addEventListener('online',showNetworkBanner);
window.addEventListener('offline',showNetworkBanner);
showNetworkBanner();

function renderRecovery(reason='Error de carga'){
  if(fatalShown || !root) return;
  const empty = !root.children.length || !root.textContent.trim();
  if(!empty) return;
  fatalShown=true;
  root.innerHTML=`<div class="b-login"><div class="b-login-card"><img class="b-login-logo" src="./assets/tedvio_logo_horizontal_650.png" alt="TEDVIO"><h2>TEDVIO necesita recargarse</h2><p class="b-sub">${esc(reason)}. Tus sesiones y resultados están guardados en la nube.</p><div class="b-row"><button id="stabilityReload" class="b-btn primary">Reintentar</button><button id="stabilityJoin" class="b-btn secondary">Entrar como alumno</button></div></div></div>`;
  document.querySelector('#stabilityReload').onclick=()=>location.replace(`${location.pathname}?v=${Date.now()}#teacher`);
  document.querySelector('#stabilityJoin').onclick=()=>{fatalShown=false;location.hash='#join';location.reload()};
}

window.addEventListener('error',e=>{console.error('TEDVIO window error',e.error||e.message);setTimeout(()=>renderRecovery('Se detectó un error de interfaz'),400)});
window.addEventListener('unhandledrejection',e=>{console.error('TEDVIO promise error',e.reason);setTimeout(()=>renderRecovery('Se interrumpió una operación'),400)});

(async()=>{
  const {data:{session}}=await sb.auth.getSession();
  lastUserId=session?.user?.id||null;
  sb.auth.onAuthStateChange((event,next)=>{
    const nextId=next?.user?.id||null;
    if(event==='SIGNED_OUT' && lastUserId){ location.reload(); return; }
    if(lastUserId && nextId && lastUserId!==nextId){ location.reload(); return; }
    lastUserId=nextId;
  });
  navigator.serviceWorker?.getRegistration?.().then(r=>r?.update?.()).catch(()=>{});
})();

setInterval(()=>{
  try{
    patchJoinContext();
    patchHotspotUi();
    if(Date.now()-bootAt>5000) renderRecovery('La pantalla quedó vacía');
  }catch(error){console.error('TEDVIO stability patch',error)}
},900);

window.__TEDVIO_STABILITY__={version:'2026.08.17.1'};
