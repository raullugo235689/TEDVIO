import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cfg=window.TEDVIO_CONFIG||{};
const sb=createClient(cfg.SUPABASE_URL,cfg.SUPABASE_PUBLISHABLE_KEY);
const esc=(v='')=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const STUDENT_KEY='tedvio_v2_student';
let wrapped=false,hot={x:null,y:null,radius:8},studentBridgeHandle=null,bridgeQuestionId=null,bridgeBusy=false;

async function me(){return (await sb.auth.getUser()).data?.user||null}
function overlay(html){document.querySelector('#proMaxOverlay')?.remove();document.body.insertAdjacentHTML('beforeend',`<div id="proMaxOverlay" class="pm-overlay"><div class="pm-modal">${html}</div></div>`);const closeBtn=document.querySelector('#pmClose');if(closeBtn)closeBtn.onclick=()=>document.querySelector('#proMaxOverlay')?.remove()}
function topButton(){const top=document.querySelector('.b-top-actions');if(!top||document.querySelector('#pmGenerator'))return;const b=document.createElement('button');b.id='pmGenerator';b.className='b-btn dark';b.textContent='🧠 Generador';b.onclick=openGenerator;top.prepend(b)}

function wrapQuestionForm(){
  if(wrapped||typeof window.betaQuestionForm!=='function')return;
  wrapped=true;
  const original=window.betaQuestionForm;
  window.betaQuestionForm=function(...args){original(...args);setTimeout(()=>enhanceQuestionModal(args[0]),50)};
}

function enhanceQuestionModal(id){
  const type=document.querySelector('#qType'),save=document.querySelector('#qSave'),prompt=document.querySelector('#qPrompt');
  if(!type||!save||document.querySelector('#pmExplanation'))return;
  if(!id)hot={x:null,y:null,radius:8};
  if(![...type.options].some(o=>o.value==='hotspot')){const o=document.createElement('option');o.value='hotspot';o.textContent='Zona de imagen (Hotspot)';type.appendChild(o)}
  const left=prompt.closest('.b-grid.two')?.firstElementChild||prompt.parentElement;
  left.insertAdjacentHTML('beforeend',`<div class="b-field"><label>Explicación para el alumno</label><textarea id="pmExplanation" rows="4" placeholder="Explica por qué es correcta la respuesta"></textarea></div><div class="b-field"><label>Dificultad</label><select id="pmDifficulty"><option value="">Sin clasificar</option><option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option></select></div>`);
  if(id)loadExistingMeta(id);
  const refresh=()=>{
    document.querySelector('#pmHotspotEditor')?.remove();
    if(type.value!=='hotspot')return;
    const dyn=document.querySelector('#qDynamic');if(!dyn)return;
    dyn.innerHTML=`<div id="pmHotspotEditor" class="pm-hotspot-edit"><h3>Zona correcta</h3><p class="pm-hot-hint">Usa una imagen y toca el punto correcto. El radio define la tolerancia.</p><div class="b-field"><label>Radio de tolerancia (%)</label><input id="pmHotRadius" type="number" min="2" max="30" value="${hot.radius}"></div><div id="pmHotPreview"></div></div>`;
    const url=document.querySelector('#qMediaUrl'),file=document.querySelector('#qMediaFile');
    const draw=()=>drawHotPreview(url?.value.trim());
    url?.addEventListener('input',draw);
    file?.addEventListener('change',()=>{const f=file.files[0];if(f&&f.type.startsWith('image/'))drawHotPreview(URL.createObjectURL(f))});
    draw();
  };
  type.addEventListener('change',()=>setTimeout(refresh,0));
  if(type.value==='hotspot')setTimeout(refresh,0);
  const old=save.onclick;
  save.onclick=async e=>{
    const meta={explanation:document.querySelector('#pmExplanation')?.value.trim()||null,difficulty:document.querySelector('#pmDifficulty')?.value||null,isHot:type.value==='hotspot',prompt:prompt.value.trim()};
    if(meta.isHot){hot.radius=Number(document.querySelector('#pmHotRadius')?.value)||8;if(hot.x==null||hot.y==null)return alert('Toca en la imagen la zona correcta antes de guardar.')}
    await old?.call(save,e);
    const u=await me();if(!u)return;
    let targetId=id||null;
    if(!targetId){for(let i=0;i<8;i++){await new Promise(r=>setTimeout(r,220));const {data:q}=await sb.from('v2_question_bank').select('id').eq('teacher_id',u.id).eq('prompt',meta.prompt).order('created_at',{ascending:false}).limit(1).maybeSingle();if(q){targetId=q.id;break}}}
    if(!targetId)return;
    const patch={explanation:meta.explanation,difficulty:meta.difficulty};
    if(meta.isHot)patch.correct_answer={x:hot.x,y:hot.y,radius:hot.radius};
    await sb.from('v2_question_bank').update(patch).eq('id',targetId);
  };
}

async function loadExistingMeta(id){
  const {data}=await sb.from('v2_question_bank').select('explanation,difficulty,question_type,correct_answer,media_url').eq('id',id).maybeSingle();
  if(!data)return;
  const e=document.querySelector('#pmExplanation'),d=document.querySelector('#pmDifficulty');if(e)e.value=data.explanation||'';if(d)d.value=data.difficulty||'';
  if(data.question_type==='hotspot'&&data.correct_answer){hot={x:Number(data.correct_answer.x),y:Number(data.correct_answer.y),radius:Number(data.correct_answer.radius)||8};setTimeout(()=>{const t=document.querySelector('#qType');if(!t)return;t.value='hotspot';t.dispatchEvent(new Event('change'));setTimeout(()=>drawHotPreview(data.media_url),50)},50)}
}

function drawHotPreview(src){
  const box=document.querySelector('#pmHotPreview');if(!box||!src)return;if(!/^https?:|^blob:|^data:/.test(src))return;
  box.innerHTML=`<div class="pm-hot-img-wrap"><img id="pmHotImg" src="${esc(src)}" alt="Imagen hotspot"><span id="pmHotMark" class="pm-hot-mark" style="${hot.x==null?'display:none':`left:${hot.x}%;top:${hot.y}%`}"></span></div>`;
  const img=document.querySelector('#pmHotImg'),mark=document.querySelector('#pmHotMark');
  img.onclick=e=>{const r=img.getBoundingClientRect();hot.x=Math.round((e.clientX-r.left)/r.width*10000)/100;hot.y=Math.round((e.clientY-r.top)/r.height*10000)/100;mark.style.left=hot.x+'%';mark.style.top=hot.y+'%';mark.style.display='block';const editor=document.querySelector('#pmHotspotEditor');if(editor)editor.dataset.touched='1'};
}

function readStudent(){try{return JSON.parse(localStorage.getItem(STUDENT_KEY)||'null')}catch{return null}}

function ensureStudentBridge(currentQuestionId){
  if(studentBridgeHandle||!window.__TEDVIO_STUDENT_RENDER__||!window.__TEDVIO_STUDENT_INTERVAL__)return;
  window.__TEDVIO_NATIVE_CLEAR_INTERVAL__?.(window.__TEDVIO_STUDENT_INTERVAL__);
  bridgeQuestionId=currentQuestionId||null;
  const native=window.__TEDVIO_NATIVE_SET_INTERVAL__||window.setInterval.bind(window);
  studentBridgeHandle=native(studentBridgeTick,900);
}

async function studentBridgeTick(){
  if(bridgeBusy||!location.hash.startsWith('#student'))return;
  bridgeBusy=true;
  try{
    const st=readStudent();if(!st?.sessionId)return;
    const {data:s}=await sb.from('v2_sessions').select('current_question_id,status').eq('id',st.sessionId).maybeSingle();
    if(!s||s.status==='closed'){window.__TEDVIO_STUDENT_RENDER__?.();return}
    if(s.current_question_id!==bridgeQuestionId){bridgeQuestionId=s.current_question_id||null;window.__TEDVIO_STUDENT_RENDER__?.();return}
    if(document.querySelector('#pmStudentHot')){
      if(!bridgeQuestionId)return;
      const {data:q}=await sb.from('v2_questions').select('status').eq('id',bridgeQuestionId).maybeSingle();
      if(q&&q.status!=='live')window.__TEDVIO_STUDENT_RENDER__?.();
      return;
    }
    if(!document.querySelector('.b-feedback'))window.__TEDVIO_STUDENT_RENDER__?.();
  }catch(e){console.error('TEDVIO student bridge',e)}finally{bridgeBusy=false}
}

async function enhanceStudentHotspot(){
  if(!location.hash.startsWith('#student'))return;
  const target=document.querySelector('#studentAnswer');
  if(!target||target.querySelector('#pmStudentHot')||target.children.length||target.textContent.trim())return;
  const st=readStudent();if(!st?.sessionId||!st?.participantId)return;
  const {data:s}=await sb.from('v2_sessions').select('current_question_id,competitive').eq('id',st.sessionId).maybeSingle();
  if(!s?.current_question_id)return;
  const {data:q}=await sb.from('v2_questions').select('*').eq('id',s.current_question_id).maybeSingle();
  if(!q||q.question_type!=='hotspot'||q.status!=='live'||document.querySelector('#pmStudentHot'))return;
  ensureStudentBridge(q.id);
  let point=null;
  target.innerHTML=`<div id="pmStudentHot" class="pm-student-hot"><p class="pm-hot-hint">Toca en la imagen la zona que consideras correcta.</p><div class="pm-hot-img-wrap"><img id="pmStudentHotImg" src="${esc(q.media_url||'')}" alt="Pregunta visual"><span id="pmStudentHotMark" class="pm-hot-mark" style="display:none"></span></div><button id="pmStudentHotSend" class="b-btn primary" style="width:100%;margin-top:12px" disabled>Enviar ubicación</button></div>`;
  const img=document.querySelector('#pmStudentHotImg'),mark=document.querySelector('#pmStudentHotMark'),send=document.querySelector('#pmStudentHotSend');
  img.onclick=e=>{const r=img.getBoundingClientRect();point={x:Math.round((e.clientX-r.left)/r.width*10000)/100,y:Math.round((e.clientY-r.top)/r.height*10000)/100};mark.style.left=point.x+'%';mark.style.top=point.y+'%';mark.style.display='block';send.disabled=false};
  send.onclick=async()=>{
    send.disabled=true;send.textContent='Enviando…';
    const {data,error}=await sb.rpc('v2_submit_response',{p_question_id:q.id,p_participant_id:st.participantId,p_answer:point});
    if(error){send.disabled=false;send.textContent='Enviar ubicación';return alert(error.message.includes('QUESTION_EXPIRED')?'El tiempo de esta pregunta terminó.':error.message)}
    const row=data?.[0]||{},fb=(await sb.rpc('v2_student_feedback',{p_session_id:st.sessionId,p_participant_id:st.participantId})).data?.[0]||{};
    target.closest('.b-card').innerHTML=`<div class="b-feedback" data-pm-explanation-checked="1"><div class="big">${row.is_correct?'✅':'❌'}</div><h1>${row.is_correct?'¡Correcto!':'Respuesta registrada'}</h1>${s.competitive?`<div class="b-kpi">+${row.points||0} pts</div><p><strong>Posición #${fb.rank||'—'}</strong></p>`:''}${row.explanation?`<div id="pmFeedbackExplanation" class="pm-explain"><strong>💡 Explicación</strong><p>${esc(row.explanation)}</p></div>`:''}<p class="b-sub">Espera la siguiente pregunta.</p></div>`;
  };
}

async function injectStudentExplanation(){
  if(!location.hash.startsWith('#student')||document.querySelector('#pmFeedbackExplanation'))return;
  const feedback=document.querySelector('.b-feedback');if(!feedback||feedback.dataset.pmExplanationChecked==='1')return;
  feedback.dataset.pmExplanationChecked='1';
  const st=readStudent();if(!st?.sessionId||!st?.participantId)return;
  const {data:s}=await sb.from('v2_sessions').select('current_question_id').eq('id',st.sessionId).maybeSingle();if(!s?.current_question_id)return;
  const {data,error}=await sb.rpc('v2_student_answer_feedback',{p_question_id:s.current_question_id,p_participant_id:st.participantId});
  if(error){console.error('TEDVIO explanation',error);return}
  const explanation=data?.[0]?.explanation;
  if(explanation)feedback.insertAdjacentHTML('beforeend',`<div id="pmFeedbackExplanation" class="pm-explain"><strong>💡 Explicación</strong><p>${esc(explanation)}</p></div>`);
}

async function injectTeacherExplanation(){
  const h=document.querySelector('#sessionMain .b-hero .b-chip.green');
  const hero=document.querySelector('#sessionMain .b-hero');
  if(!h||h.textContent.trim()!=='revealed'||document.querySelector('#pmTeacherExplanation')||hero?.dataset.pmExplanationChecked==='1')return;
  if(hero)hero.dataset.pmExplanationChecked='1';
  const code=document.querySelector('#sessionMain')?.textContent.match(/Código\s+(\d{6})/)?.[1];if(!code)return;
  const {data:s}=await sb.from('v2_sessions').select('current_question_id').eq('code',code).maybeSingle();if(!s?.current_question_id)return;
  const {data:q}=await sb.from('v2_questions').select('explanation').eq('id',s.current_question_id).maybeSingle();
  if(q?.explanation){const left=document.querySelector('#sessionMain .b-grid.two > div:first-child');left?.insertAdjacentHTML('beforeend',`<div id="pmTeacherExplanation" class="b-card pm-explain"><strong>💡 Explicación</strong><p>${esc(q.explanation)}</p></div>`)}
}

function openGenerator(){
  overlay(`<div class="pm-head"><div><h2>🧠 Generador asistido de reactivos</h2><p>Genera borradores desde el texto que tú proporciones. Siempre revísalos antes de usarlos.</p></div><button id="pmClose" class="b-btn secondary">×</button></div><div class="pm-grid2"><div><div class="b-field"><label>Materia</label><input id="pmGenSubject"></div><div class="b-field"><label>Tema</label><input id="pmGenTopic"></div><div class="b-field"><label>Dificultad</label><select id="pmGenDiff"><option>media</option><option>baja</option><option>alta</option></select></div><div class="b-field"><label>Número de borradores</label><input id="pmGenN" type="number" min="1" max="20" value="5"></div></div><div class="b-field"><label>Texto fuente</label><textarea id="pmGenText" rows="12" placeholder="Pega aquí apuntes, un resumen o contenido de la clase..."></textarea></div></div><button id="pmGenerate" class="b-btn primary">Generar borradores</button><div id="pmGenResults"></div>`);
  document.querySelector('#pmGenerate').onclick=generateDrafts;
}

function generateDrafts(){
  const text=document.querySelector('#pmGenText').value.trim(),n=Math.min(20,Math.max(1,Number(document.querySelector('#pmGenN').value)||5));
  if(text.length<80)return alert('Pega un texto un poco más amplio.');
  const stop=new Set('cuando donde porque para como esta este estas estos desde entre sobre hacia tiene tienen puede pueden una unos unas del las los que por con sin son fue ser sus más muy'.split(' '));
  const sentences=text.split(/(?<=[.!?])\s+/).map(x=>x.trim()).filter(x=>x.length>45&&x.length<320),pool=[...new Set(text.toLowerCase().match(/[a-záéíóúñü]{6,}/gi)||[])].filter(x=>!stop.has(x)).sort((a,b)=>b.length-a.length),drafts=[];
  for(const s of sentences){const words=s.match(/[A-Za-zÁÉÍÓÚÑÜáéíóúñü]{6,}/g)||[],key=words.sort((a,b)=>b.length-a.length).find(w=>!stop.has(w.toLowerCase()));if(!key)continue;const dist=pool.filter(x=>x.toLowerCase()!==key.toLowerCase()).sort(()=>Math.random()-.5).slice(0,3);if(dist.length<3)continue;drafts.push({prompt:`¿Qué término completa correctamente la siguiente afirmación? “${s.replace(new RegExp(key,'i'),'_____')}”`,correct:key,options:[key,...dist].sort(()=>Math.random()-.5),explanation:s});if(drafts.length>=n)break}
  const box=document.querySelector('#pmGenResults');if(!drafts.length)return box.innerHTML='<p>No pude generar borradores útiles con ese texto. Prueba con un contenido más descriptivo.</p>';
  box.innerHTML=`<h3 style="margin-top:18px">Borradores</h3>${drafts.map((d,i)=>`<label class="pm-draft"><input type="checkbox" class="pmDraftPick" data-i="${i}" checked><div><strong>${esc(d.prompt)}</strong><ul>${d.options.map(o=>`<li>${esc(o)}${o===d.correct?' ✓':''}</li>`).join('')}</ul></div></label>`).join('')}<button id="pmSaveDrafts" class="b-btn primary">Guardar seleccionados en el banco</button>`;
  document.querySelector('#pmSaveDrafts').onclick=()=>saveDrafts(drafts);
}

async function saveDrafts(drafts){
  const u=await me(),subject=document.querySelector('#pmGenSubject').value.trim()||null,topic=document.querySelector('#pmGenTopic').value.trim()||null,difficulty=document.querySelector('#pmGenDiff').value,picks=[...document.querySelectorAll('.pmDraftPick:checked')].map(x=>drafts[Number(x.dataset.i)]);
  if(!picks.length)return;
  const rows=picks.map(d=>({teacher_id:u.id,title:d.prompt.slice(0,80),subject,topic,difficulty,question_type:'multiple_choice',prompt:d.prompt,options:d.options,correct_answer:d.correct,explanation:d.explanation})),{error}=await sb.from('v2_question_bank').insert(rows);
  if(error)return alert(error.message);
  alert(`${rows.length} borradores guardados.`);document.querySelector('#proMaxOverlay')?.remove();window.betaView?.('bank');
}

setInterval(()=>{try{topButton();wrapQuestionForm();enhanceStudentHotspot();injectStudentExplanation();injectTeacherExplanation()}catch(e){console.error('TEDVIO learning',e)}},700);
