import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';

const cfg=window.TEDVIO_CONFIG||{};
const sb=createClient(cfg.SUPABASE_URL,cfg.SUPABASE_PUBLISHABLE_KEY);
const root=document.querySelector('#controlApp');
const esc=(v='')=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const graded=new Set(['multiple_choice','multiple_select','true_false','numeric','ordering','hotspot']);
let code=new URLSearchParams(location.search).get('code')||'';
let session=null,question=null,participants=[],questions=[],responses=[],timer=null,user=null,pollBusy=false,actionBusy=false;
const logo=()=>'<img class="ct-logo" src="./assets/tedvio_logo_horizontal_650.png" alt="TEDVIO">';

async function auth(){
  const {data:{session:s}}=await sb.auth.getSession();
  user=s?.user||null;
  if(!user)return login();
  if(code.length!==6)return codeEntry();
  await open();
}

function login(){
  root.innerHTML=`<div class="ct-login"><div class="ct-login-card"><img src="./assets/tedvio_logo_horizontal_650.png"><h2>Control del profesor</h2><p class="ct-sub">Inicia sesión con tu cuenta TEDVIO.</p><div class="ct-field"><label>Correo</label><input id="ctEmail" type="email" autocomplete="email"></div><div class="ct-field"><label>Contraseña</label><input id="ctPass" type="password" autocomplete="current-password"></div><button id="ctLogin" class="ct-btn primary" style="width:100%">Entrar</button></div></div>`;
  document.querySelector('#ctLogin').onclick=async()=>{
    const b=document.querySelector('#ctLogin');b.disabled=true;b.textContent='Entrando…';
    const {error}=await sb.auth.signInWithPassword({email:document.querySelector('#ctEmail').value.trim(),password:document.querySelector('#ctPass').value});
    if(error){b.disabled=false;b.textContent='Entrar';return alert(error.message)}
    auth();
  };
}

function codeEntry(){
  root.innerHTML=`<div class="ct-login"><div class="ct-login-card"><img src="./assets/tedvio_logo_horizontal_650.png"><h2>Control móvil</h2><div class="ct-field"><label>Código de la sesión</label><input id="ctCode" inputmode="numeric" maxlength="6"></div><button id="ctOpen" class="ct-btn primary" style="width:100%">Abrir control</button></div></div>`;
  document.querySelector('#ctOpen').onclick=()=>{
    code=document.querySelector('#ctCode').value.trim();
    if(code.length!==6)return alert('Escribe el código de 6 dígitos.');
    history.replaceState(null,'',`?code=${code}`);open();
  };
}

async function open(){
  const {data,error}=await sb.from('v2_sessions').select('*').eq('code',code).eq('teacher_id',user.id).maybeSingle();
  if(error||!data){root.innerHTML='<div class="ct-login"><div class="ct-login-card"><h2>Sesión no encontrada</h2><p>Verifica el código o la cuenta del profesor.</p><button class="ct-btn primary" onclick="location.href=\'./control.html\'">Cambiar código</button></div></div>';return}
  session=data;
  clearInterval(timer);
  await tick();
  timer=setInterval(tick,900);
}

async function refresh(){
  if(!session)return;
  const [s,p,q]=await Promise.all([
    sb.from('v2_sessions').select('*').eq('id',session.id).single(),
    sb.from('v2_participants').select('*').eq('session_id',session.id).order('joined_at'),
    sb.from('v2_questions').select('*').eq('session_id',session.id).order('position')
  ]);
  if(s.error)throw s.error;
  session=s.data||session;participants=p.data||[];questions=q.data||[];
  question=questions.find(x=>x.id===session.current_question_id)||null;
  const ids=questions.map(x=>x.id);
  responses=ids.length?((await sb.from('v2_responses').select('*').in('question_id',ids)).data||[]):[];
}

function remain(){
  if(!question?.launched_at||question.status!=='live')return 0;
  return Math.max(0,Math.ceil(Number(question.timer_seconds||30)-(Date.now()-new Date(question.launched_at).getTime())/1000));
}

async function tick(){
  if(pollBusy||actionBusy)return;
  pollBusy=true;
  try{
    await refresh();
    if(session?.status==='closed'){clearInterval(timer);paintClosed();return}
    if(question?.status==='live'&&remain()<=0){
      await sb.from('v2_questions').update({status:'closed',closed_at:new Date().toISOString()}).eq('id',question.id).eq('status','live');
      await refresh();
    }
    paint();
  }catch(e){console.error('TEDVIO control poll',e)}finally{pollBusy=false}
}

function ranking(){
  const rows=participants.map(p=>({id:p.id,name:p.display_name,team:p.team_name,pts:0,correct:0})),map=new Map(rows.map(x=>[x.id,x]));
  responses.forEach(r=>{const x=map.get(r.participant_id);if(!x)return;x.pts+=Number(r.points||0);if(r.is_correct)x.correct++});
  let out=rows.sort((a,b)=>b.pts-a.pts||b.correct-a.correct);
  if(session.team_mode){
    const tm=new Map();out.forEach(r=>{const k=r.team||'Sin equipo',x=tm.get(k)||{name:k,pts:0,correct:0};x.pts+=r.pts;x.correct+=r.correct;tm.set(k,x)});
    out=[...tm.values()].sort((a,b)=>b.pts-a.pts);
  }
  return out;
}

function paintClosed(){
  root.innerHTML=`<div class="ct-login"><div class="ct-login-card">${logo()}<h2>Sesión finalizada</h2><p class="ct-sub">${esc(session?.title||'TEDVIO')} · Código ${esc(code)}</p><button class="ct-btn primary" id="ctBack">Volver a TEDVIO</button></div></div>`;
  document.querySelector('#ctBack').onclick=()=>location.href='./beta.html#teacher';
}

function paint(){
  if(!session)return;
  if(session.status==='closed')return paintClosed();
  const currentResponses=question?responses.filter(r=>r.question_id===question.id).length:0;
  const next=questions.filter(q=>q.status==='queued').sort((a,b)=>a.position-b.position)[0];
  const rank=ranking();
  const canReveal=question&&graded.has(question.question_type)&&question.status!=='revealed';
  root.innerHTML=`<div class="ct"><div class="ct-top">${logo()}<span class="ct-chip">Código ${esc(code)}</span></div><div class="ct-card"><div class="ct-sub">${esc(session.university||'')}${session.educational_program?' · '+esc(session.educational_program):''}${session.group_name?' · '+esc(session.group_name):''}</div><h2>${esc(session.title)}</h2><div class="ct-stats"><div class="ct-stat"><span>Conectados</span><b>${participants.length}</b></div><div class="ct-stat"><span>Respondieron</span><b>${currentResponses}</b></div><div class="ct-stat"><span>Tiempo</span><b>${question?.status==='live'?remain()+'s':'—'}</b></div></div></div><div class="ct-card">${question?`<span class="ct-chip">${esc(question.status)} · P${question.position}</span><div class="ct-question">${esc(question.prompt)}</div>`:'<h3>Sala de espera</h3><p class="ct-sub">La proyección puede permanecer abierta mientras ingresan los alumnos.</p>'}<div class="ct-actions"><button id="ctClose" class="ct-btn secondary" ${!question||question.status!=='live'?'disabled':''}>Cerrar respuestas</button><button id="ctReveal" class="ct-btn success" ${!canReveal?'disabled':''}>Mostrar respuesta</button><button id="ctNext" class="ct-btn primary" ${!next?'disabled':''}>Siguiente ▶</button><button id="ctRoom" class="ct-btn secondary">Sala</button><button id="ctProject" class="ct-btn dark">📽 Proyección</button><button id="ctEnd" class="ct-btn danger">Finalizar</button></div></div>${session.competitive?`<div class="ct-card"><h3>🏆 ${session.team_mode?'Equipos':'Ranking'}</h3><div class="ct-ranking">${rank.slice(0,8).map((r,i)=>`<div class="ct-rank"><div class="ct-pos">${i+1}</div><div><b>${esc(r.name)}</b><div class="ct-sub">${r.correct} correctas</div></div><strong>${r.pts}</strong></div>`).join('')||'<p class="ct-sub">Aún no hay puntos.</p>'}</div></div>`:''}</div>`;
  bind(next);
}

async function act(fn){
  if(actionBusy)return;
  actionBusy=true;
  try{await fn();await refresh();paint()}catch(e){console.error(e);alert(e.message||'No se pudo completar la acción.')}finally{actionBusy=false}
}

function bind(next){
  document.querySelector('#ctClose').onclick=()=>act(async()=>{if(question)await sb.from('v2_questions').update({status:'closed',closed_at:new Date().toISOString()}).eq('id',question.id).eq('status','live')});
  document.querySelector('#ctReveal').onclick=()=>act(async()=>{if(question)await sb.from('v2_questions').update({status:'revealed',closed_at:question.closed_at||new Date().toISOString()}).eq('id',question.id)});
  document.querySelector('#ctNext').onclick=()=>act(async()=>{if(!next)return;await sb.from('v2_questions').update({status:'live',launched_at:new Date().toISOString(),closed_at:null}).eq('id',next.id);await sb.from('v2_sessions').update({current_question_id:next.id,status:'live',started_at:session.started_at||new Date().toISOString()}).eq('id',session.id)});
  document.querySelector('#ctRoom').onclick=()=>act(async()=>{await sb.from('v2_sessions').update({current_question_id:null}).eq('id',session.id)});
  document.querySelector('#ctProject').onclick=()=>window.open(`./proyectar.html?code=${code}`,'_blank');
  document.querySelector('#ctEnd').onclick=async()=>{
    if(actionBusy||!confirm('¿Finalizar la sesión?'))return;
    actionBusy=true;
    try{await sb.from('v2_sessions').update({status:'closed',closed_at:new Date().toISOString()}).eq('id',session.id);session.status='closed';clearInterval(timer);paintClosed()}catch(e){alert(e.message)}finally{actionBusy=false}
  };
}

auth();
