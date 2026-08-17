import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cfg = window.TEDVIO_CONFIG || {};
const sb = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY);
const root = document.querySelector('#betaApp');
const STUDENT_KEY = 'tedvio_v2_student';

const S = {
  user: null,
  view: 'dashboard',
  bank: [],
  sessions: [],
  quizzes: [],
  currentSession: null,
  currentQuestion: null,
  participants: [],
  questions: [],
  responses: [],
  modal: null,
  rankPrev: new Map(),
  liveTimer: null,
  student: null,
  studentAnsweredQuestion: null,
  orderingChoice: [],
};

const esc = (v='') => String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const typeLabels = {
  multiple_choice:'Opción múltiple', multiple_select:'Selección múltiple', true_false:'Verdadero / Falso',
  open_text:'Respuesta abierta', numeric:'Respuesta numérica', poll:'Encuesta', scale_5:'Escala 1–5', ordering:'Ordenar pasos'
};
const gradedTypes = new Set(['multiple_choice','multiple_select','true_false','numeric','ordering']);
const nowIso = () => new Date().toISOString();
const fmtDate = d => d ? new Date(d).toLocaleString('es-MX',{dateStyle:'medium',timeStyle:'short'}) : '—';
const randomCode = () => String(Math.floor(100000 + Math.random()*900000));
const shuffle = arr => [...arr].sort(()=>Math.random()-.5);

function brand(){return `<div class="b-brand"><img src="./assets/tedvio_logo_horizontal_650.webp" alt="TEDVIO"></div>`}
function mediaHtml(q){
  if(!q?.media_url) return '';
  if(q.media_type==='image') return `<img class="b-media" src="${esc(q.media_url)}" alt="Recurso de la pregunta">`;
  if(q.media_type==='audio') return `<audio class="b-audio" controls src="${esc(q.media_url)}"></audio>`;
  if(q.media_type==='video') return `<video class="b-video" controls src="${esc(q.media_url)}"></video>`;
  return '';
}
function typeChip(t){return `<span class="b-chip">${esc(typeLabels[t]||t)}</span>`}
function toast(msg){alert(msg)}

function topbar(extra=''){
  return `<header class="b-top">${brand()}<div class="b-top-actions">${extra}</div></header>`;
}

async function init(){
  const hash = location.hash || '#teacher';
  if(hash.startsWith('#join')) return renderJoin();
  if(hash.startsWith('#student')) return restoreStudent();
  const {data:{session}} = await sb.auth.getSession();
  S.user = session?.user || null;
  if(!S.user) return renderAuth();
  await loadTeacherData();
  renderTeacher();
}

sb.auth.onAuthStateChange(async(_event,session)=>{
  S.user = session?.user || null;
  if(location.hash.startsWith('#join') || location.hash.startsWith('#student')) return;
  if(S.user){await loadTeacherData();renderTeacher()} else renderAuth();
});
window.addEventListener('hashchange',()=>{stopLivePoll();init()});

function renderAuth(){
  root.innerHTML = `<div class="b-login"><div class="b-login-card"><img class="b-login-logo" src="./assets/tedvio_logo_horizontal_650.webp" alt="TEDVIO"><h2>TEDVIO Pro Beta</h2><p class="b-sub">Banco privado, historial, reportes, multimedia, equipos y flujo de juego.</p><div class="b-field"><label>Correo</label><input id="authEmail" type="email" autocomplete="email"></div><div class="b-field"><label>Contraseña</label><input id="authPass" type="password" autocomplete="current-password"></div><div class="b-row"><button class="b-btn primary" id="authLogin">Entrar</button><button class="b-btn secondary" id="authSignup">Crear cuenta</button></div><p class="b-sub" style="margin-top:16px">Esta beta usa un espacio privado por profesor y no modifica tus bancos actuales.</p></div></div>`;
  document.querySelector('#authLogin').onclick = signIn;
  document.querySelector('#authSignup').onclick = signUp;
}
async function signIn(){
  const email=document.querySelector('#authEmail').value.trim(),password=document.querySelector('#authPass').value;
  if(!email||!password)return toast('Escribe correo y contraseña.');
  const {error}=await sb.auth.signInWithPassword({email,password}); if(error)toast(error.message);
}
async function signUp(){
  const email=document.querySelector('#authEmail').value.trim(),password=document.querySelector('#authPass').value;
  if(!email||password.length<6)return toast('Usa un correo y una contraseña de al menos 6 caracteres.');
  const {data,error}=await sb.auth.signUp({email,password}); if(error)return toast(error.message);
  if(!data.session) toast('Cuenta creada. Revisa tu correo para confirmar y después inicia sesión.');
}
async function logout(){await sb.auth.signOut();}
window.betaLogout=logout;

async function loadTeacherData(){
  const uid=S.user.id;
  const [b,s,q]=await Promise.all([
    sb.from('v2_question_bank').select('*').eq('teacher_id',uid).order('created_at',{ascending:false}),
    sb.from('v2_sessions').select('*').eq('teacher_id',uid).order('created_at',{ascending:false}).limit(50),
    sb.from('v2_prepared_quizzes').select('*').eq('teacher_id',uid).order('created_at',{ascending:false})
  ]);
  S.bank=b.data||[];S.sessions=s.data||[];S.quizzes=q.data||[];
}

function navButtons(){return `<button class="b-btn dark" onclick="betaView('dashboard')">Inicio</button><button class="b-btn dark" onclick="betaView('bank')">Banco</button><button class="b-btn dark" onclick="betaView('quizzes')">Preparadas</button><button class="b-btn dark" onclick="betaView('history')">Historial</button><button class="b-btn primary" onclick="betaNewSession()">+ Sesión</button><button class="b-btn secondary" onclick="betaLogout()">Salir</button>`}
function renderTeacher(){
  stopLivePoll();
  let content='';
  if(S.view==='bank') content=renderBank();
  else if(S.view==='quizzes') content=renderQuizzes();
  else if(S.view==='history') content=renderHistory();
  else if(S.view==='report') content=renderReportShell();
  else content=renderDashboard();
  root.innerHTML=`<div class="b-app">${topbar(navButtons())}<main class="b-main">${content}</main>${renderModal()}</div>`;
  bindModal();
  if(S.view==='report'&&S.currentSession) loadReport(S.currentSession.id);
}
window.betaView=v=>{S.view=v;S.modal=null;renderTeacher()};

function renderDashboard(){
  const open=S.sessions.filter(x=>x.status!=='closed').length;
  return `<section class="b-hero"><div><h1>Panel del profesor</h1><p>Prepara, presenta, compite y analiza en un solo lugar.</p></div><button class="b-btn primary" onclick="betaNewSession()">Crear sesión en vivo</button></section><div class="b-grid three"><div class="b-card"><div class="b-sub">Preguntas privadas</div><div class="b-kpi">${S.bank.length}</div></div><div class="b-card"><div class="b-sub">Sesiones guardadas</div><div class="b-kpi">${S.sessions.length}</div></div><div class="b-card"><div class="b-sub">Sesiones abiertas</div><div class="b-kpi">${open}</div></div></div><div class="b-grid two" style="margin-top:16px"><div class="b-card"><h2>Sesiones recientes</h2>${S.sessions.length?S.sessions.slice(0,7).map(sessionRow).join(''):'<p class="b-muted">Aún no hay sesiones.</p>'}</div><div class="b-card"><h2>Acciones rápidas</h2><div class="b-list"><button class="b-btn secondary" onclick="betaView('bank')">Crear o importar preguntas</button><button class="b-btn secondary" onclick="betaView('quizzes')">Armar sesión preparada</button><button class="b-btn secondary" onclick="betaView('history')">Ver reportes y exportar</button></div></div></div>`;
}
function sessionRow(s){return `<div class="b-item"><div class="b-row" style="justify-content:space-between"><div><strong>${esc(s.title)}</strong><div class="b-sub">${fmtDate(s.created_at)} · Código ${esc(s.code)}</div></div><div class="b-row"><span class="b-chip ${s.status==='closed'?'gray':'green'}">${esc(s.status)}</span>${s.status!=='closed'?`<button class="b-btn secondary" onclick="betaOpenSession('${s.id}')">Abrir</button>`:`<button class="b-btn secondary" onclick="betaOpenReport('${s.id}')">Reporte</button>`}</div></div></div>`}

function renderBank(){
  return `<section class="b-hero"><div><h1>Banco de preguntas</h1><p>Busca, edita, duplica, importa y agrega multimedia.</p></div><div class="b-row"><label class="b-btn secondary" style="cursor:pointer">Importar Excel/CSV<input id="bankImport" type="file" accept=".xlsx,.xls,.csv" hidden></label><button class="b-btn primary" onclick="betaQuestionForm()">+ Pregunta</button></div></section><div class="b-card"><div class="b-search"><input id="bankSearch" placeholder="Buscar pregunta o tema"><select id="bankSubject"><option value="">Todas las materias</option>${[...new Set(S.bank.map(x=>x.subject).filter(Boolean))].map(x=>`<option>${esc(x)}</option>`).join('')}</select><select id="bankType"><option value="">Todos los tipos</option>${Object.entries(typeLabels).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select><select id="bankTopic"><option value="">Todos los temas</option>${[...new Set(S.bank.map(x=>x.topic).filter(Boolean))].map(x=>`<option>${esc(x)}</option>`).join('')}</select></div><div id="bankList">${bankListHtml(S.bank)}</div></div>`;
}
function bankListHtml(list){return list.length?list.map(q=>`<div class="b-item"><div class="b-row">${typeChip(q.question_type)}${q.subject?`<span class="b-chip gray">${esc(q.subject)}</span>`:''}${q.topic?`<span class="b-chip gray">${esc(q.topic)}</span>`:''}${q.media_type?`<span class="b-chip gold">${esc(q.media_type)}</span>`:''}</div><h3>${esc(q.prompt)}</h3>${q.media_url?`<div class="b-sub">Incluye ${esc(q.media_type)}</div>`:''}<div class="b-row"><button class="b-btn primary" onclick="betaQuestionForm('${q.id}')">Editar</button><button class="b-btn secondary" onclick="betaDuplicateQuestion('${q.id}')">Duplicar</button><button class="b-btn secondary" onclick="betaQuickLaunchPicker('${q.id}')">Usar en sesión</button><button class="b-btn danger" onclick="betaDeleteQuestion('${q.id}')">Eliminar</button></div></div>`).join(''):'<p class="b-muted">No hay preguntas que coincidan.</p>'}
function bindBankFilters(){
  const search=document.querySelector('#bankSearch'),sub=document.querySelector('#bankSubject'),type=document.querySelector('#bankType'),topic=document.querySelector('#bankTopic');
  if(!search)return;
  const run=()=>{const s=search.value.toLowerCase(),sv=sub.value,tv=type.value,pv=topic.value;const f=S.bank.filter(q=>(!s||`${q.prompt} ${q.subject||''} ${q.topic||''}`.toLowerCase().includes(s))&&(!sv||q.subject===sv)&&(!tv||q.question_type===tv)&&(!pv||q.topic===pv));document.querySelector('#bankList').innerHTML=bankListHtml(f)};
  [search,sub,type,topic].forEach(el=>el.addEventListener('input',run));
  document.querySelector('#bankImport')?.addEventListener('change',importBankFile);
}

function renderQuizzes(){
  return `<section class="b-hero"><div><h1>Sesiones preparadas</h1><p>Ordena tus preguntas antes de clase y lánzalas con un toque.</p></div><button class="b-btn primary" onclick="betaQuizForm()">+ Preparada</button></section><div class="b-card"><div class="b-list">${S.quizzes.length?S.quizzes.map(q=>`<div class="b-item"><div class="b-row" style="justify-content:space-between"><div><h3>${esc(q.name)}</h3><div class="b-sub">${q.competitive?'Con ranking':'Sin competencia'} · ${q.team_mode?'Equipos':'Individual'}</div></div><div class="b-row"><button class="b-btn primary" onclick="betaNewSession('${q.id}')">Iniciar</button><button class="b-btn danger" onclick="betaDeleteQuiz('${q.id}')">Eliminar</button></div></div></div>`).join(''):'<p class="b-muted">Aún no tienes sesiones preparadas.</p>'}</div></div>`;
}

function renderHistory(){
  return `<section class="b-hero"><div><h1>Historial de sesiones</h1><p>Cada sesión queda guardada con participantes, respuestas y resultados.</p></div></section><div class="b-card">${S.sessions.length?S.sessions.map(sessionRow).join(''):'<p class="b-muted">Aún no hay historial.</p>'}</div>`;
}
function renderReportShell(){return `<section class="b-hero"><div><h1>Reporte de sesión</h1><p>${esc(S.currentSession?.title||'')}</p></div><button class="b-btn secondary" onclick="betaView('history')">← Historial</button></section><div id="reportContent" class="b-card">Calculando reporte…</div>`}

function renderModal(){if(!S.modal)return '';return `<div class="b-overlay" id="modalOverlay"><div class="b-modal ${S.modal.large?'large':''}">${S.modal.html}</div></div>`}
function bindModal(){
  document.querySelector('#modalClose')?.addEventListener('click',()=>{S.modal=null;if(S.view==='session'){document.querySelector('#modalOverlay')?.remove();renderSession();}else renderTeacher()});
  if(S.view==='bank')bindBankFilters();
  if(S.modal?.bind)S.modal.bind();
}

window.betaQuestionForm=id=>{
  const q=S.bank.find(x=>x.id===id)||null;
  const type=q?.question_type||'multiple_choice';
  S.modal={large:true,html:`<div class="b-row" style="justify-content:space-between"><h2>${q?'Editar':'Nueva'} pregunta</h2><button id="modalClose" class="b-btn secondary">×</button></div><div class="b-grid two"><div><div class="b-field"><label>Materia</label><input id="qSubject" value="${esc(q?.subject||'')}"></div><div class="b-field"><label>Tema</label><input id="qTopic" value="${esc(q?.topic||'')}"></div><div class="b-field"><label>Tipo</label><select id="qType">${Object.entries(typeLabels).map(([v,l])=>`<option value="${v}" ${v===type?'selected':''}>${l}</option>`).join('')}</select></div><div class="b-field"><label>Pregunta</label><textarea id="qPrompt" rows="4">${esc(q?.prompt||'')}</textarea></div><div class="b-field"><label>Imagen, audio o video</label><input id="qMediaFile" type="file" accept="image/*,audio/*,video/*"><input id="qMediaUrl" style="margin-top:7px" placeholder="o pega una URL" value="${esc(q?.media_url||'')}"></div></div><div><div id="qDynamic"></div></div></div><div class="b-row" style="justify-content:flex-end;margin-top:14px"><button id="qSave" class="b-btn primary">Guardar</button></div>`,bind:()=>{document.querySelector('#qType').onchange=()=>renderQuestionDynamic(q);renderQuestionDynamic(q);document.querySelector('#qSave').onclick=()=>saveQuestion(id)}};renderTeacher();
};
function renderQuestionDynamic(existing){
  const el=document.querySelector('#qDynamic'); if(!el)return;const type=document.querySelector('#qType').value;const opts=Array.isArray(existing?.options)?existing.options:[];const corr=existing?.correct_answer;
  if(type==='multiple_choice')el.innerHTML=optionsEditor(opts.length?opts:['','','',''],corr,false);
  else if(type==='multiple_select')el.innerHTML=optionsEditor(opts.length?opts:['','','',''],Array.isArray(corr)?corr:[],true);
  else if(type==='true_false')el.innerHTML=`<h3>Respuesta correcta</h3><label class="b-option"><input type="radio" name="tf" value="Verdadero" ${corr==='Verdadero'?'checked':''}> Verdadero</label><label class="b-option"><input type="radio" name="tf" value="Falso" ${corr==='Falso'?'checked':''}> Falso</label>`;
  else if(type==='open_text')el.innerHTML='<div class="b-card"><strong>Respuesta libre</strong><p class="b-sub">No se califica automáticamente.</p></div>';
  else if(type==='numeric')el.innerHTML=`<div class="b-field"><label>Respuesta numérica correcta</label><input id="qNumeric" type="number" step="any" value="${corr??''}"></div>`;
  else if(type==='poll')el.innerHTML=`<div class="b-field"><label>Opciones de encuesta (una por línea)</label><textarea id="qLines" rows="8">${esc(opts.join('\n'))}</textarea></div>`;
  else if(type==='scale_5')el.innerHTML='<div class="b-card"><strong>Escala 1–5</strong><p class="b-sub">No hay respuesta correcta; se muestran distribución y promedio.</p></div>';
  else if(type==='ordering')el.innerHTML=`<div class="b-field"><label>Pasos en el orden correcto (uno por línea)</label><textarea id="qLines" rows="9">${esc((Array.isArray(corr)?corr:opts).join('\n'))}</textarea></div><p class="b-sub">Al alumno se le mostrarán desordenados.</p>`;
}
function optionsEditor(opts,corr,multiple){
  return `<h3>Opciones</h3>${opts.slice(0,6).map((o,i)=>`<div class="b-field"><label><input type="${multiple?'checkbox':'radio'}" name="qCorrect" value="${i}" ${multiple?(Array.isArray(corr)&&corr.includes(o)?'checked':''):(corr===o?'checked':'')}> ${multiple?'Correcta':'Respuesta correcta'}</label><input class="qOpt" data-i="${i}" value="${esc(o)}" placeholder="Opción ${i+1}"></div>`).join('')}`;
}
async function saveQuestion(id){
  const type=document.querySelector('#qType').value,prompt=document.querySelector('#qPrompt').value.trim();if(!prompt)return toast('Escribe la pregunta.');
  let options=[],correct=null;
  if(['multiple_choice','multiple_select'].includes(type)){
    options=[...document.querySelectorAll('.qOpt')].map(x=>x.value.trim()).filter(Boolean);if(options.length<2)return toast('Agrega al menos dos opciones.');
    const checked=[...document.querySelectorAll('input[name="qCorrect"]:checked')].map(x=>Number(x.value));if(!checked.length)return toast('Marca la respuesta correcta.');
    correct=type==='multiple_select'?checked.map(i=>options[i]).filter(Boolean).sort():options[checked[0]];
  } else if(type==='true_false') {options=['Verdadero','Falso'];correct=document.querySelector('input[name="tf"]:checked')?.value||null;if(!correct)return toast('Marca Verdadero o Falso.');}
  else if(type==='numeric'){const raw=document.querySelector('#qNumeric').value;if(raw==='')return toast('Escribe la respuesta numérica.');correct=Number(raw);}
  else if(type==='poll'){options=document.querySelector('#qLines').value.split('\n').map(x=>x.trim()).filter(Boolean);if(options.length<2)return toast('Agrega al menos dos opciones.');}
  else if(type==='scale_5'){options=['1','2','3','4','5'];}
  else if(type==='ordering'){correct=document.querySelector('#qLines').value.split('\n').map(x=>x.trim()).filter(Boolean);if(correct.length<2)return toast('Agrega al menos dos pasos.');options=[...correct];}
  let mediaUrl=document.querySelector('#qMediaUrl').value.trim()||null,mediaType=null;const file=document.querySelector('#qMediaFile').files[0];
  if(file){const up=await uploadMedia(file);if(!up)return;mediaUrl=up.url;mediaType=up.type;} else if(mediaUrl){mediaType=guessMediaType(mediaUrl);}
  const payload={teacher_id:S.user.id,title:prompt.slice(0,80),subject:document.querySelector('#qSubject').value.trim()||null,topic:document.querySelector('#qTopic').value.trim()||null,question_type:type,prompt,options,correct_answer:correct,media_url:mediaUrl,media_type:mediaType,updated_at:nowIso()};
  const res=id?await sb.from('v2_question_bank').update(payload).eq('id',id):await sb.from('v2_question_bank').insert(payload);if(res.error)return toast(res.error.message);
  await loadTeacherData();S.modal=null;S.view='bank';renderTeacher();
}
function guessMediaType(url){const u=url.toLowerCase();if(/\.(mp4|webm|mov)(\?|$)/.test(u))return'video';if(/\.(mp3|wav|ogg|m4a)(\?|$)/.test(u))return'audio';return'image'}
async function uploadMedia(file){
  if(file.size>25*1024*1024){toast('El archivo supera 25 MB.');return null}const ext=(file.name.split('.').pop()||'bin').replace(/[^a-z0-9]/gi,'');const path=`${S.user.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;const {error}=await sb.storage.from('tedvio-media-v2').upload(path,file,{upsert:false});if(error){toast(error.message);return null}const {data}=sb.storage.from('tedvio-media-v2').getPublicUrl(path);return{url:data.publicUrl,type:file.type.startsWith('video')?'video':file.type.startsWith('audio')?'audio':'image'};
}
window.betaDuplicateQuestion=async id=>{const q=S.bank.find(x=>x.id===id);if(!q)return;const {id:_id,created_at,updated_at,...rest}=q;const {error}=await sb.from('v2_question_bank').insert({...rest,title:`${q.title} (copia)`,teacher_id:S.user.id});if(error)return toast(error.message);await loadTeacherData();renderTeacher()};
window.betaDeleteQuestion=async id=>{if(!confirm('¿Eliminar esta pregunta?'))return;const {error}=await sb.from('v2_question_bank').delete().eq('id',id);if(error)return toast(error.message);await loadTeacherData();renderTeacher()};
window.betaQuickLaunchPicker=id=>{const open=S.sessions.filter(s=>s.status!=='closed');if(!open.length)return toast('Primero crea o abre una sesión.');S.modal={html:`<div class="b-row" style="justify-content:space-between"><h2>Usar pregunta</h2><button id="modalClose" class="b-btn secondary">×</button></div>${open.map(s=>`<button class="b-option" onclick="betaLaunchBankToSession('${id}','${s.id}')"><strong>${esc(s.title)}</strong><br><span class="b-sub">${esc(s.code)}</span></button>`).join('')}`};renderTeacher()};
window.betaLaunchBankToSession=async(bankId,sessionId)=>{await launchBankQuestion(sessionId,bankId);S.modal=null;await openSession(sessionId)};

async function importBankFile(ev){
  const file=ev.target.files[0];if(!file)return;try{const buf=await file.arrayBuffer();const wb=XLSX.read(buf);const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''});if(!rows.length)return toast('El archivo está vacío.');const payload=[];for(const row of rows){const p=importRow(row);if(p)payload.push({...p,teacher_id:S.user.id})}if(!payload.length)return toast('No encontré filas válidas.');const {error}=await sb.from('v2_question_bank').insert(payload);if(error)return toast(error.message);await loadTeacherData();renderTeacher();toast(`${payload.length} preguntas importadas.`)}catch(e){toast(`No se pudo importar: ${e.message}`)}
}
function importRow(row){
  const get=(...keys)=>{for(const k of keys){const hit=Object.keys(row).find(x=>x.toLowerCase().trim()===k);if(hit!=null)return String(row[hit]).trim()}return''};
  const prompt=get('pregunta','prompt','question');if(!prompt)return null;let type=normalizeType(get('tipo','type','question_type'));const subject=get('materia','subject'),topic=get('tema','topic');let options=[get('opcion a','option_a','a'),get('opcion b','option_b','b'),get('opcion c','option_c','c'),get('opcion d','option_d','d')].filter(Boolean);let correctRaw=get('correcta','correct','respuesta correcta');let correct=null;
  if(type==='true_false'){options=['Verdadero','Falso'];correct=/^(v|verdadero|true)$/i.test(correctRaw)?'Verdadero':'Falso'}
  else if(type==='multiple_choice'){const ix='ABCD'.indexOf(correctRaw.toUpperCase());correct=ix>=0?options[ix]:correctRaw}
  else if(type==='multiple_select'){correct=correctRaw.split(/[,;]+/).map(x=>x.trim()).map(x=>{const ix='ABCD'.indexOf(x.toUpperCase());return ix>=0?options[ix]:x}).filter(Boolean).sort()}
  else if(type==='numeric'){correct=Number(correctRaw)}
  else if(type==='ordering'){const lines=(get('opciones','options')||correctRaw).split(/\||;|,/).map(x=>x.trim()).filter(Boolean);options=lines;correct=lines}
  else if(type==='poll'){const lines=get('opciones','options').split(/\||;|,/).map(x=>x.trim()).filter(Boolean);if(lines.length)options=lines}
  else if(type==='scale_5'){options=['1','2','3','4','5']}
  return{title:prompt.slice(0,80),subject:subject||null,topic:topic||null,question_type:type,prompt,options,correct_answer:correct,media_url:get('media_url','media','imagen','image')||null,media_type:get('media_type')||null};
}
function normalizeType(v){v=v.toLowerCase();if(v.includes('selección')||v.includes('seleccion')||v.includes('multiple select'))return'multiple_select';if(v.includes('verdadero')||v.includes('true'))return'true_false';if(v.includes('abierta')||v.includes('open'))return'open_text';if(v.includes('num'))return'numeric';if(v.includes('encuesta')||v.includes('poll'))return'poll';if(v.includes('escala')||v.includes('scale'))return'scale_5';if(v.includes('orden')||v.includes('ordering'))return'ordering';return'multiple_choice'}

window.betaQuizForm=()=>{
  if(!S.bank.length)return toast('Primero agrega preguntas al banco.');
  S.modal={large:true,html:`<div class="b-row" style="justify-content:space-between"><h2>Nueva sesión preparada</h2><button id="modalClose" class="b-btn secondary">×</button></div><div class="b-field"><label>Nombre</label><input id="quizName" value="Repaso de clase"></div><div class="b-row"><label><input id="quizComp" type="checkbox" checked> Ranking y puntos</label><label><input id="quizTeam" type="checkbox"> Modo equipos</label></div><h3 style="margin-top:18px">Selecciona preguntas</h3><div class="b-list">${S.bank.map((q,i)=>`<label class="b-item"><input class="quizPick" type="checkbox" value="${q.id}" checked> <strong>${i+1}. ${esc(q.prompt)}</strong> ${typeChip(q.question_type)} <select class="quizTime" data-id="${q.id}" style="float:right"><option>15</option><option selected>30</option><option>45</option><option>60</option><option>90</option></select></label>`).join('')}</div><div class="b-row" style="justify-content:flex-end;margin-top:14px"><button id="quizSave" class="b-btn primary">Guardar preparada</button></div>`,bind:()=>{document.querySelector('#quizSave').onclick=saveQuiz}};renderTeacher();
};
async function saveQuiz(){const name=document.querySelector('#quizName').value.trim();const picks=[...document.querySelectorAll('.quizPick:checked')];if(!name||!picks.length)return toast('Escribe un nombre y selecciona preguntas.');const {data:q,error}=await sb.from('v2_prepared_quizzes').insert({teacher_id:S.user.id,name,competitive:document.querySelector('#quizComp').checked,team_mode:document.querySelector('#quizTeam').checked}).select().single();if(error)return toast(error.message);const rows=picks.map((p,i)=>({quiz_id:q.id,bank_id:p.value,position:i+1,timer_seconds:Number(document.querySelector(`.quizTime[data-id="${p.value}"]`).value)}));const {error:e2}=await sb.from('v2_prepared_items').insert(rows);if(e2)return toast(e2.message);await loadTeacherData();S.modal=null;S.view='quizzes';renderTeacher()}
window.betaDeleteQuiz=async id=>{if(!confirm('¿Eliminar esta sesión preparada?'))return;await sb.from('v2_prepared_quizzes').delete().eq('id',id);await loadTeacherData();renderTeacher()};

window.betaNewSession=quizId=>{
  const preset=S.quizzes.find(x=>x.id===quizId);S.modal={html:`<div class="b-row" style="justify-content:space-between"><h2>Nueva sesión</h2><button id="modalClose" class="b-btn secondary">×</button></div><div class="b-field"><label>Título</label><input id="sessionTitle" value="${esc(preset?.name||'Mi clase TEDVIO')}"></div><div class="b-field"><label>Sesión preparada</label><select id="sessionQuiz"><option value="">Sin preparada</option>${S.quizzes.map(q=>`<option value="${q.id}" ${q.id===quizId?'selected':''}>${esc(q.name)}</option>`).join('')}</select></div><div class="b-row"><label><input id="sessionComp" type="checkbox" ${preset?.competitive===false?'':'checked'}> Ranking y puntos</label><label><input id="sessionTeam" type="checkbox" ${preset?.team_mode?'checked':''}> Equipos</label></div><div class="b-row" style="justify-content:flex-end;margin-top:18px"><button id="sessionCreate" class="b-btn primary">Crear sesión</button></div>`,bind:()=>{document.querySelector('#sessionQuiz').onchange=()=>{const q=S.quizzes.find(x=>x.id===document.querySelector('#sessionQuiz').value);if(q){document.querySelector('#sessionComp').checked=q.competitive;document.querySelector('#sessionTeam').checked=q.team_mode}};document.querySelector('#sessionCreate').onclick=createSession}};renderTeacher();
};
async function createSession(){let data,error;for(let i=0;i<6;i++){({data,error}=await sb.from('v2_sessions').insert({teacher_id:S.user.id,code:randomCode(),title:document.querySelector('#sessionTitle').value.trim()||'Sesión TEDVIO',competitive:document.querySelector('#sessionComp').checked,team_mode:document.querySelector('#sessionTeam').checked}).select().single());if(!error)break}if(error)return toast(error.message);const quizId=document.querySelector('#sessionQuiz').value;if(quizId)await preloadQuiz(data.id,quizId);S.modal=null;await loadTeacherData();await openSession(data.id)}
async function preloadQuiz(sessionId,quizId){const {data:items}=await sb.from('v2_prepared_items').select('*,bank:v2_question_bank(*)').eq('quiz_id',quizId).order('position');if(!items?.length)return;const rows=items.map((it,i)=>questionRowFromBank(sessionId,it.bank,i+1,it.timer_seconds,'queued'));const {error}=await sb.from('v2_questions').insert(rows);if(error)toast(error.message)}
function questionRowFromBank(sessionId,b,pos,timer=30,status='live'){let opts=Array.isArray(b.options)?[...b.options]:[];if(b.question_type==='ordering')opts=shuffle(opts);return{session_id:sessionId,bank_id:b.id,position:pos,prompt:b.prompt,question_type:b.question_type,options:opts,correct_answer:b.correct_answer,media_url:b.media_url,media_type:b.media_type,timer_seconds:timer,status,launched_at:status==='live'?nowIso():null}}

window.betaOpenSession=id=>openSession(id);
async function openSession(id){
  const {data:s,error}=await sb.from('v2_sessions').select('*').eq('id',id).single();if(error)return toast(error.message);S.currentSession=s;S.view='session';await refreshSession();renderSession();startLivePoll();
}
async function refreshSession(){
  if(!S.currentSession)return;const id=S.currentSession.id;
  const [s,p,q]=await Promise.all([sb.from('v2_sessions').select('*').eq('id',id).single(),sb.from('v2_participants').select('*').eq('session_id',id).order('joined_at'),sb.from('v2_questions').select('*').eq('session_id',id).order('position')]);
  if(s.data)S.currentSession=s.data;S.participants=p.data||[];S.questions=q.data||[];S.currentQuestion=S.questions.find(x=>x.id===S.currentSession.current_question_id)||null;
  const ids=S.questions.map(x=>x.id);if(ids.length){const {data:r}=await sb.from('v2_responses').select('*').in('question_id',ids);S.responses=r||[]}else S.responses=[];
}
function startLivePoll(){stopLivePoll();S.liveTimer=setInterval(async()=>{if(S.view!=='session'||!S.currentSession)return;await refreshSession();autoCloseIfExpired();renderSession(false)},1200)}
function stopLivePoll(){if(S.liveTimer){clearInterval(S.liveTimer);S.liveTimer=null}}
async function autoCloseIfExpired(){const q=S.currentQuestion;if(!q||q.status!=='live'||!q.launched_at)return;const elapsed=(Date.now()-new Date(q.launched_at).getTime())/1000;if(elapsed>=q.timer_seconds)await closeLiveQuestion()}
function remainingSeconds(q){if(!q||q.status!=='live'||!q.launched_at)return 0;return Math.max(0,Math.ceil(q.timer_seconds-(Date.now()-new Date(q.launched_at).getTime())/1000))}

function renderSession(full=true){
  const s=S.currentSession;if(!s)return;if(full){root.innerHTML=`<div class="b-app">${topbar(`<button class="b-btn dark" onclick="betaBackDashboard()">← Inicio</button><button class="b-btn secondary" onclick="betaEndSession()">Finalizar</button>`)}<main class="b-main" id="sessionMain"></main></div>`}const main=document.querySelector('#sessionMain');if(!main)return;
  main.innerHTML = S.currentQuestion ? liveSessionHtml() : waitingHtml(); setTimeout(drawSessionQR,20);
}
window.betaBackDashboard=async()=>{stopLivePoll();S.currentSession=null;S.currentQuestion=null;await loadTeacherData();S.view='dashboard';renderTeacher()};
function waitingHtml(){const s=S.currentSession;const queued=S.questions.filter(q=>q.status==='queued');return `<section class="b-wait"><div><span class="b-chip green">Sala de espera</span><h1>${esc(s.title)}</h1><div class="b-code">${esc(s.code)}</div><p>Los alumnos pueden escanear el QR o entrar con el código.</p><div id="sessionQR"></div><div class="b-row" style="margin-top:16px">${queued.length?`<button class="b-btn primary" onclick="betaLaunchQuestion('${queued[0].id}')">▶ Lanzar primera</button>`:''}<button class="b-btn secondary" onclick="betaPickBankQuestion()">+ Pregunta del banco</button></div></div><div class="b-card"><h2>${S.participants.length} conectados</h2><div class="b-joiners">${S.participants.length?S.participants.map(p=>`<span class="b-joiner">${esc(p.display_name)}${p.team_name?` · ${esc(p.team_name)}`:''}</span>`).join(''):'<span class="b-muted">Esperando alumnos…</span>'}</div><hr style="border:0;border-top:1px solid #edf2f7;margin:18px 0"><div class="b-row"><span class="b-chip ${s.competitive?'green':'gray'}">${s.competitive?'Competitivo':'Sin competencia'}</span><span class="b-chip ${s.team_mode?'gold':'gray'}">${s.team_mode?'Equipos':'Individual'}</span><span class="b-chip gray">${queued.length} preguntas en cola</span></div></div></section>`}
function drawSessionQR(){const el=document.querySelector('#sessionQR');if(!el||typeof QRCode==='undefined'||!S.currentSession)return;el.innerHTML='';new QRCode(el,{text:`${location.origin}${location.pathname.replace(/[^/]+$/,'')}beta.html#join?code=${S.currentSession.code}`,width:210,height:210,correctLevel:QRCode.CorrectLevel.M})}

function liveSessionHtml(){const q=S.currentQuestion,s=S.currentSession,rem=remainingSeconds(q);const currentResponses=S.responses.filter(r=>r.question_id===q.id);return `<section class="b-hero"><div><div class="b-row"><span class="b-chip green">${esc(q.status)}</span>${typeChip(q.question_type)}<span class="b-chip gray">Pregunta ${q.position}</span></div><h1>${esc(q.prompt)}</h1><p>${currentResponses.length}/${S.participants.length} respuestas · Código ${esc(s.code)}</p></div><div class="b-kpi">${q.status==='live'?rem+' s':'—'}</div></section><div class="b-grid two"><div><div class="b-card">${mediaHtml(q)}${teacherQuestionResults(q,currentResponses)}</div>${openTextResponses(q,currentResponses)}</div><div>${s.competitive?rankingCard():`<div class="b-card"><h2>Modo formativo</h2><p class="b-muted">Ranking y puntos están desactivados para esta sesión.</p></div>`}<div class="b-card" style="margin-top:16px"><h3>Participación</h3><div class="b-kpi">${currentResponses.length}/${S.participants.length}</div><p class="b-sub">${S.participants.length?Math.round(currentResponses.length/S.participants.length*100):0}% respondió</p></div></div></div>${teacherToolbar(q)}`}
function teacherQuestionResults(q,rs){
  if(q.question_type==='open_text')return `<h3>Respuestas abiertas</h3><p class="b-muted">Se muestran abajo conforme llegan.</p>`;
  if(q.question_type==='numeric')return `<h3>Respuesta numérica</h3>${distributionHtml(q,rs)}`;
  if(q.question_type==='ordering')return `<h3>Orden correcto</h3>${q.status==='revealed'?`<ol>${(q.correct_answer||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ol>`:'<p class="b-muted">Revela la respuesta para mostrar el orden correcto.</p>'}<p><strong>${rs.filter(r=>r.is_correct).length}</strong> correctas</p>`;
  return distributionHtml(q,rs);
}
function distributionHtml(q,rs){const opts=Array.isArray(q.options)?q.options:[];if(!opts.length)return `<p>${rs.length} respuestas</p>`;return opts.map(o=>{const count=rs.filter(r=>{const a=r.answer;if(Array.isArray(a))return a.includes(o);return String(a)===String(o)}).length;const pct=rs.length?Math.round(count/rs.length*100):0;const correct=q.status==='revealed'&&(Array.isArray(q.correct_answer)?q.correct_answer.includes(o):String(q.correct_answer)===String(o));return `<div style="margin:13px 0"><div class="b-row" style="justify-content:space-between"><span>${correct?'✓ ':''}${esc(o)}</span><strong>${count} · ${pct}%</strong></div><div class="bar"><i style="width:${pct}%"></i></div></div>`}).join('')}
function openTextResponses(q,rs){if(q.question_type!=='open_text')return'';return `<div class="b-card" style="margin-top:16px"><h3>Respuestas (${rs.length})</h3>${rs.length?rs.slice().sort((a,b)=>new Date(b.submitted_at)-new Date(a.submitted_at)).map(r=>`<div class="b-item">${esc(typeof r.answer==='string'?r.answer:JSON.stringify(r.answer))}</div>`).join(''):'<p class="b-muted">Aún no hay respuestas.</p>'}</div>`}
function scoreRows(){const rows=S.participants.map(p=>({id:p.id,name:p.display_name,team:p.team_name,pts:0,correct:0,answered:0,streak:0})),map=new Map(rows.map(r=>[r.id,r]));for(const r of S.responses){const x=map.get(r.participant_id);if(!x)continue;x.pts+=r.points||0;x.answered++;if(r.is_correct)x.correct++;if(new Date(r.submitted_at)>(x.last?new Date(x.last):new Date(0))){x.streak=r.streak||0;x.last=r.submitted_at}}return rows.sort((a,b)=>b.pts-a.pts||b.correct-a.correct||a.name.localeCompare(b.name))}
function rankingCard(){const rows=scoreRows();const s=S.currentSession;let ranked=rows;if(s.team_mode){const tm=new Map();for(const r of rows){const k=r.team||'Sin equipo',x=tm.get(k)||{id:k,name:k,pts:0,correct:0,answered:0,streak:0};x.pts+=r.pts;x.correct+=r.correct;x.answered+=r.answered;tm.set(k,x)}ranked=[...tm.values()].sort((a,b)=>b.pts-a.pts)}const prev=S.rankPrev,newPrev=new Map();const html=ranked.map((r,i)=>{const pos=i+1,old=prev.get(r.id),delta=old?old-pos:0;newPrev.set(r.id,pos);return `<div class="b-rank"><div class="b-pos">${pos}</div><div><strong>${esc(r.name)}</strong><div class="b-sub">${r.correct} correctas · ${r.streak?`🔥 ${r.streak} racha`:''}</div></div><div class="b-delta ${delta>0?'up':delta<0?'down':''}">${delta>0?'↑'+delta:delta<0?'↓'+Math.abs(delta):'·'}</div><strong>${r.pts}</strong></div>`}).join('');S.rankPrev=newPrev;return `<div class="b-card"><h2>🏆 ${s.team_mode?'Ranking por equipos':'Ranking en vivo'}</h2>${ranked.length?`<div class="b-podium">${ranked.slice(0,3).map((r,i)=>`<div><div style="font-size:28px">${['🥇','🥈','🥉'][i]}</div><strong>${esc(r.name)}</strong><div>${r.pts} pts</div></div>`).join('')}</div><div class="b-ranking">${html}</div>`:'<p class="b-muted">Aún no hay puntuación.</p>'}</div>`}
function teacherToolbar(q){const queued=S.questions.filter(x=>x.status==='queued');const prev=S.questions.filter(x=>x.position<q.position).sort((a,b)=>b.position-a.position)[0];return `<div class="b-toolbar">${prev?`<button class="b-btn secondary" onclick="betaShowQuestion('${prev.id}')">◀ Anterior</button>`:''}${q.status==='live'?`<button class="b-btn secondary" onclick="betaCloseQuestion()">Cerrar</button>`:''}${q.status!=='revealed'&&gradedTypes.has(q.question_type)?`<button class="b-btn success" onclick="betaRevealQuestion()">Mostrar respuesta</button>`:''}<button class="b-btn secondary" onclick="betaPickBankQuestion()">+ Banco</button>${queued.length?`<button class="b-btn primary" onclick="betaLaunchQuestion('${queued[0].id}')">Siguiente ▶</button>`:''}<button class="b-btn secondary" onclick="betaReturnWaiting()">Sala</button></div>`}
window.betaReturnWaiting=async()=>{await sb.from('v2_sessions').update({current_question_id:null}).eq('id',S.currentSession.id);await refreshSession();renderSession()};
window.betaShowQuestion=async id=>{await sb.from('v2_sessions').update({current_question_id:id}).eq('id',S.currentSession.id);await refreshSession();renderSession()};
window.betaLaunchQuestion=id=>launchQuestion(id);
async function launchQuestion(id){const q=S.questions.find(x=>x.id===id)||((await sb.from('v2_questions').select('*').eq('id',id).single()).data);if(!q)return;const patch={status:'live',launched_at:nowIso(),closed_at:null};if(q.question_type==='ordering')patch.options=shuffle(Array.isArray(q.correct_answer)?q.correct_answer:q.options);await sb.from('v2_questions').update(patch).eq('id',id);await sb.from('v2_sessions').update({current_question_id:id,status:'live',started_at:S.currentSession.started_at||nowIso()}).eq('id',S.currentSession.id);await refreshSession();renderSession()}
window.betaCloseQuestion=closeLiveQuestion;
async function closeLiveQuestion(){if(!S.currentQuestion||S.currentQuestion.status!=='live')return;await sb.from('v2_questions').update({status:'closed',closed_at:nowIso()}).eq('id',S.currentQuestion.id);await refreshSession();renderSession(false)}
window.betaRevealQuestion=async()=>{if(!S.currentQuestion)return;await sb.from('v2_questions').update({status:'revealed',closed_at:S.currentQuestion.closed_at||nowIso()}).eq('id',S.currentQuestion.id);await refreshSession();renderSession(false)};
window.betaPickBankQuestion=()=>{S.modal={large:true,html:`<div class="b-row" style="justify-content:space-between"><h2>Lanzar desde el banco</h2><button id="modalClose" class="b-btn secondary">×</button></div><div class="b-list">${S.bank.map(q=>`<button class="b-option" onclick="betaLaunchBankLive('${q.id}')">${typeChip(q.question_type)} <strong>${esc(q.prompt)}</strong></button>`).join('')}</div>`};renderSession();document.body.insertAdjacentHTML('beforeend',renderModal());bindModal()};
window.betaLaunchBankLive=async id=>{S.modal=null;document.querySelector('#modalOverlay')?.remove();await launchBankQuestion(S.currentSession.id,id);await refreshSession();renderSession()};
async function launchBankQuestion(sessionId,bankId){const b=S.bank.find(x=>x.id===bankId)||((await sb.from('v2_question_bank').select('*').eq('id',bankId).single()).data);if(!b)return;const {data:last}=await sb.from('v2_questions').select('position').eq('session_id',sessionId).order('position',{ascending:false}).limit(1);const pos=(last?.[0]?.position||0)+1;const row=questionRowFromBank(sessionId,b,pos,30,'live');const {data:q,error}=await sb.from('v2_questions').insert(row).select().single();if(error)return toast(error.message);await sb.from('v2_sessions').update({current_question_id:q.id,status:'live',started_at:nowIso()}).eq('id',sessionId)}
window.betaEndSession=async()=>{if(!confirm('¿Finalizar la sesión y generar el reporte?'))return;await sb.from('v2_sessions').update({status:'closed',closed_at:nowIso()}).eq('id',S.currentSession.id);const id=S.currentSession.id;stopLivePoll();await loadTeacherData();await openReport(id)};

window.betaOpenReport=id=>openReport(id);
async function openReport(id){const {data:s}=await sb.from('v2_sessions').select('*').eq('id',id).single();S.currentSession=s;S.view='report';renderTeacher()}
async function loadReport(id){const [p,q]=await Promise.all([sb.from('v2_participants').select('*').eq('session_id',id),sb.from('v2_questions').select('*').eq('session_id',id).order('position')]);const participants=p.data||[],questions=q.data||[],ids=questions.map(x=>x.id);let responses=[];if(ids.length){const {data}=await sb.from('v2_responses').select('*').in('question_id',ids);responses=data||[]}const graded=questions.filter(x=>gradedTypes.has(x.question_type));const qStats=graded.map(x=>{const rs=responses.filter(r=>r.question_id===x.id),corr=rs.filter(r=>r.is_correct).length;return{q:x,answered:rs.length,correct:corr,pct:rs.length?Math.round(corr/rs.length*100):0}});const easy=qStats.slice().sort((a,b)=>b.pct-a.pct)[0],hard=qStats.slice().sort((a,b)=>a.pct-b.pct)[0];const score=participants.map(pp=>{const rs=responses.filter(r=>r.participant_id===pp.id);return{name:pp.display_name,team:pp.team_name,points:rs.reduce((a,r)=>a+(r.points||0),0),correct:rs.filter(r=>r.is_correct).length,answered:rs.length}}).sort((a,b)=>b.points-a.points||b.correct-a.correct);const totalGraded=qStats.reduce((a,x)=>a+x.answered,0),totalCorrect=qStats.reduce((a,x)=>a+x.correct,0),avg=totalGraded?Math.round(totalCorrect/totalGraded*100):0;const el=document.querySelector('#reportContent');if(!el)return;el.innerHTML=`<div class="b-row" style="justify-content:space-between"><div><h2>${esc(S.currentSession.title)}</h2><p class="b-sub">${fmtDate(S.currentSession.created_at)} · ${participants.length} participantes</p></div><div class="b-row"><button class="b-btn secondary" onclick="betaExportReport('${id}','csv')">CSV</button><button class="b-btn primary" onclick="betaExportReport('${id}','xlsx')">Excel</button></div></div><div class="b-grid three"><div class="b-card"><div class="b-sub">Acierto global</div><div class="b-kpi">${avg}%</div></div><div class="b-card"><div class="b-sub">Más fácil</div><div class="b-kpi">${easy?easy.pct+'%':'—'}</div><div class="b-sub">${easy?esc(easy.q.prompt):''}</div></div><div class="b-card"><div class="b-sub">Más difícil</div><div class="b-kpi">${hard?hard.pct+'%':'—'}</div><div class="b-sub">${hard?esc(hard.q.prompt):''}</div></div></div><h3 style="margin-top:20px">Top 5</h3><div class="b-ranking">${score.slice(0,5).map((x,i)=>`<div class="b-rank"><div class="b-pos">${i+1}</div><div><strong>${esc(x.name)}</strong><div class="b-sub">${x.correct} correctas · ${x.answered} respondidas</div></div><div></div><strong>${x.points}</strong></div>`).join('')}</div><h3 style="margin-top:20px">Por pregunta</h3><div class="b-table-wrap"><table class="b-table"><thead><tr><th>#</th><th>Pregunta</th><th>Tipo</th><th>Respondieron</th><th>Acierto</th></tr></thead><tbody>${questions.map(x=>{const st=qStats.find(z=>z.q.id===x.id);return`<tr><td>${x.position}</td><td>${esc(x.prompt)}</td><td>${esc(typeLabels[x.question_type])}</td><td>${responses.filter(r=>r.question_id===x.id).length}</td><td>${st?st.pct+'%':'—'}</td></tr>`}).join('')}</tbody></table></div>`;
}
window.betaExportReport=async(id,format)=>{const [p,q]=await Promise.all([sb.from('v2_participants').select('*').eq('session_id',id),sb.from('v2_questions').select('*').eq('session_id',id).order('position')]);const participants=p.data||[],questions=q.data||[],ids=questions.map(x=>x.id);let responses=[];if(ids.length){responses=(await sb.from('v2_responses').select('*').in('question_id',ids)).data||[]}const rows=participants.map(pp=>{const row={Alumno:pp.display_name,Equipo:pp.team_name||'',Puntos:0,Correctas:0,Respondidas:0};for(const qx of questions){const r=responses.find(rr=>rr.participant_id===pp.id&&rr.question_id===qx.id);row[`P${qx.position}`]=r?formatAnswer(r.answer):'';if(r){row.Puntos+=r.points||0;row.Respondidas++;if(r.is_correct)row.Correctas++}}return row});const ws=XLSX.utils.json_to_sheet(rows);if(format==='csv'){const csv=XLSX.utils.sheet_to_csv(ws);downloadBlob(csv,`tedvio-${id}.csv`,'text/csv;charset=utf-8')}else{const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Resultados');XLSX.writeFile(wb,`tedvio-${id}.xlsx`)}};
function formatAnswer(a){return Array.isArray(a)?a.join(' | '):typeof a==='object'?JSON.stringify(a):String(a??'')}
function downloadBlob(content,name,type){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),500)}

function renderJoin(){const params=new URLSearchParams((location.hash.split('?')[1]||''));const preset=params.get('code')||'';root.innerHTML=`<div class="b-login"><div class="b-login-card"><img class="b-login-logo" src="./assets/tedvio_logo_horizontal_650.webp" alt="TEDVIO"><h2>Únete a TEDVIO</h2><div class="b-field"><label>Código</label><input id="joinCode" inputmode="numeric" maxlength="6" value="${esc(preset)}"></div><div class="b-field"><label>Nombre</label><input id="joinName"></div><div id="teamField"></div><button id="joinBtn" class="b-btn primary" style="width:100%">Entrar</button><p class="b-sub" style="margin-top:14px">Versión Pro Beta</p></div></div>`;document.querySelector('#joinCode').addEventListener('input',checkTeamField);document.querySelector('#joinBtn').onclick=joinBeta;checkTeamField()}
async function checkTeamField(){const code=document.querySelector('#joinCode')?.value.trim();if(code?.length!==6)return;const {data:s}=await sb.from('v2_sessions').select('team_mode,status').eq('code',code).maybeSingle();const box=document.querySelector('#teamField');if(box)box.innerHTML=s?.team_mode?`<div class="b-field"><label>Equipo</label><input id="joinTeam" placeholder="Ej. Equipo Azul"></div>`:''}
async function joinBeta(){const code=document.querySelector('#joinCode').value.trim(),name=document.querySelector('#joinName').value.trim();if(!name||code.length!==6)return toast('Escribe nombre y código.');const {data:s}=await sb.from('v2_sessions').select('*').eq('code',code).neq('status','closed').maybeSingle();if(!s)return toast('Código no válido o sesión finalizada.');const team=document.querySelector('#joinTeam')?.value.trim()||null;if(s.team_mode&&!team)return toast('Escribe el nombre de tu equipo.');const {data:p,error}=await sb.from('v2_participants').insert({session_id:s.id,display_name:name,team_name:team}).select().single();if(error)return toast(error.message);S.student={sessionId:s.id,participantId:p.id,name,team};localStorage.setItem(STUDENT_KEY,JSON.stringify(S.student));location.hash='#student';}
async function restoreStudent(){try{S.student=JSON.parse(localStorage.getItem(STUDENT_KEY)||'null')}catch{S.student=null}if(!S.student)return renderJoin();renderStudent();if(!S.liveTimer)S.liveTimer=setInterval(renderStudent,1000)}
async function renderStudent(){if(!S.student)return;const {data:s}=await sb.from('v2_sessions').select('*').eq('id',S.student.sessionId).maybeSingle();if(!s||s.status==='closed'){root.innerHTML=`<div class="b-login"><div class="b-login-card"><img class="b-login-logo" src="./assets/tedvio_logo_horizontal_650.webp"><h2>Sesión finalizada</h2><button class="b-btn primary" onclick="location.hash='#join'">Entrar a otra</button></div></div>`;return}let q=null;if(s.current_question_id)q=(await sb.from('v2_questions').select('*').eq('id',s.current_question_id).maybeSingle()).data;if(!q){S.studentAnsweredQuestion=null;root.innerHTML=`<div class="b-student"><div class="b-student-inner"><div class="b-row" style="justify-content:space-between">${brand()}<span class="b-chip green">Conectado</span></div><div class="b-card" style="margin-top:50px;text-align:center"><h1>¡Estás dentro!</h1><p>Espera la siguiente pregunta.</p><strong>${esc(S.student.name)}</strong></div></div></div>`;return}if(S.studentAnsweredQuestion===q.id)return;root.innerHTML=`<div class="b-student"><div class="b-student-inner"><div class="b-row" style="justify-content:space-between">${brand()}<span class="b-chip green">${q.status==='live'?remainingSeconds(q)+' s':esc(q.status)}</span></div><div class="b-card" style="margin-top:20px"><h1>${esc(q.prompt)}</h1>${mediaHtml(q)}<div id="studentAnswer">${studentAnswerHtml(q)}</div></div></div></div>`;bindStudentAnswer(q,s)}
function studentAnswerHtml(q){const opts=Array.isArray(q.options)?q.options:[];if(q.status!=='live')return'<p>Las respuestas están cerradas.</p>';if(q.question_type==='multiple_choice'||q.question_type==='true_false'||q.question_type==='poll')return opts.map(o=>`<button class="b-option" data-answer="${esc(o)}">${esc(o)}</button>`).join('');if(q.question_type==='multiple_select')return `${opts.map(o=>`<label class="b-option"><input type="checkbox" class="multiAns" value="${esc(o)}"> ${esc(o)}</label>`).join('')}<button class="b-btn primary" id="studentSubmit">Enviar</button>`;if(q.question_type==='scale_5')return `<div class="b-row">${['1','2','3','4','5'].map(x=>`<button class="b-btn secondary scaleAns" data-answer="${x}" style="flex:1;font-size:22px">${x}</button>`).join('')}</div>`;if(q.question_type==='open_text')return `<div class="b-field"><textarea id="openAns" rows="6" placeholder="Escribe tu respuesta"></textarea></div><button class="b-btn primary" id="studentSubmit">Enviar</button>`;if(q.question_type==='numeric')return `<div class="b-field"><input id="numAns" type="number" step="any" placeholder="Respuesta numérica"></div><button class="b-btn primary" id="studentSubmit">Enviar</button>`;if(q.question_type==='ordering'){S.orderingChoice=[];return `<p class="b-sub">Toca los pasos en el orden correcto:</p><div id="orderChoices">${opts.map(o=>`<button class="b-option orderAns" data-answer="${esc(o)}">${esc(o)}</button>`).join('')}</div><div id="orderSelected" class="b-card" style="margin:12px 0">Aún no has seleccionado pasos.</div><button class="b-btn primary" id="studentSubmit">Enviar orden</button>`}return''}
function bindStudentAnswer(q,s){
  if(['multiple_choice','true_false','poll'].includes(q.question_type))document.querySelectorAll('[data-answer]').forEach(b=>b.onclick=()=>submitStudent(q,b.dataset.answer,s));
  if(q.question_type==='scale_5')document.querySelectorAll('.scaleAns').forEach(b=>b.onclick=()=>submitStudent(q,b.dataset.answer,s));
  if(q.question_type==='multiple_select')document.querySelector('#studentSubmit').onclick=()=>{const a=[...document.querySelectorAll('.multiAns:checked')].map(x=>x.value).sort();if(!a.length)return toast('Selecciona al menos una opción.');submitStudent(q,a,s)};
  if(q.question_type==='open_text')document.querySelector('#studentSubmit').onclick=()=>{const a=document.querySelector('#openAns').value.trim();if(!a)return toast('Escribe una respuesta.');submitStudent(q,a,s)};
  if(q.question_type==='numeric')document.querySelector('#studentSubmit').onclick=()=>{const v=document.querySelector('#numAns').value;if(v==='')return toast('Escribe un número.');submitStudent(q,Number(v),s)};
  if(q.question_type==='ordering'){document.querySelectorAll('.orderAns').forEach(b=>b.onclick=()=>{const v=b.dataset.answer;if(S.orderingChoice.includes(v))return;S.orderingChoice.push(v);b.disabled=true;document.querySelector('#orderSelected').innerHTML=`<ol>${S.orderingChoice.map(x=>`<li>${esc(x)}</li>`).join('')}</ol>`});document.querySelector('#studentSubmit').onclick=()=>{if(S.orderingChoice.length!==q.options.length)return toast('Ordena todos los pasos.');submitStudent(q,S.orderingChoice,s)}}
}
async function submitStudent(q,answer,s){const {data,error}=await sb.rpc('v2_submit_response',{p_question_id:q.id,p_participant_id:S.student.participantId,p_answer:answer});if(error){if(error.message.includes('duplicate'))return toast('Ya respondiste esta pregunta.');return toast(error.message)}S.studentAnsweredQuestion=q.id;const row=data?.[0]||{};const {data:fb}=await sb.rpc('v2_student_feedback',{p_session_id:s.id,p_participant_id:S.student.participantId});const f=fb?.[0]||{};const graded=gradedTypes.has(q.question_type);root.innerHTML=`<div class="b-student"><div class="b-student-inner"><div class="b-card b-feedback" style="margin-top:60px"><div class="big">${graded?(row.is_correct?'✅':'❌'):'✓'}</div><h1>${graded?(row.is_correct?'¡Correcto!':'Respuesta registrada'):'¡Respuesta enviada!'}</h1>${s.competitive?`<div class="b-kpi">+${row.points||0} pts</div><p>${row.streak>1?`🔥 Racha de ${row.streak}`:''}</p><p><strong>Posición #${f.rank||'—'}</strong> de ${f.participant_count||0}${s.team_mode&&f.team_rank?` · Equipo #${f.team_rank}`:''}</p>`:''}<p class="b-sub">Espera la siguiente pregunta.</p></div></div></div>`}

init();
