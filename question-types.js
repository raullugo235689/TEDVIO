import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cfg = window.TEDVIO_CONFIG || {};
const sb = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY);
const STUDENT_KEY = 'tedvio_student_context';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function questionTypeLabel(type) {
  return ({
    multiple_choice: 'Opción múltiple',
    true_false: 'Verdadero / Falso',
    open_text: 'Respuesta abierta',
    poll: 'Encuesta',
    scale: 'Escala 1–5',
    numeric: 'Respuesta numérica',
    multiple_select: 'Selección múltiple'
  })[type] || type;
}

function enhanceCreateForm() {
  const promptInput = document.querySelector('#bp');
  if (!promptInput || document.querySelector('#btype')) return;
  const field = document.createElement('div');
  field.className = 'field';
  field.innerHTML = `
    <label>Tipo de pregunta</label>
    <select id="btype" style="width:100%;padding:12px;border:1px solid #d5dbe5;border-radius:10px;background:white">
      <option value="multiple_choice">Opción múltiple</option>
      <option value="multiple_select">Selección múltiple</option>
      <option value="true_false">Verdadero / Falso</option>
      <option value="open_text">Respuesta abierta</option>
      <option value="numeric">Respuesta numérica</option>
      <option value="poll">Encuesta</option>
      <option value="scale">Escala 1–5</option>
    </select>`;
  promptInput.closest('.field')?.before(field);
  field.querySelector('#btype').addEventListener('change', updateCreateFormByType);
  updateCreateFormByType();
}

function optionFields() {
  return [0,1,2,3].map(i => document.querySelector(`#bo${i}`)?.closest('.field')).filter(Boolean);
}

function clearHints(){
  ['#openTextHint','#numericHint','#pollHint','#multiHint','#scaleHint'].forEach(s=>document.querySelector(s)?.remove());
}

function addHint(id,html){
  if(document.querySelector('#'+id)) return;
  const hint=document.createElement('div'); hint.id=id; hint.className='field'; hint.innerHTML=html;
  document.querySelector('#bp')?.closest('.field')?.after(hint);
}

function updateCreateFormByType() {
  const type = document.querySelector('#btype')?.value || 'multiple_choice';
  const fields = optionFields();
  const inputs=[0,1,2,3].map(i=>document.querySelector(`#bo${i}`));
  const radios=[...document.querySelectorAll('input[name="bc"]')];
  clearHints();
  fields.forEach(f=>f.style.display=''); inputs.forEach(i=>{if(i)i.disabled=false}); radios.forEach(r=>{r.disabled=false;r.type='radio'});

  if(type==='true_false'){
    if(inputs[0])inputs[0].value='Verdadero'; if(inputs[1])inputs[1].value='Falso';
    fields[2]&&(fields[2].style.display='none'); fields[3]&&(fields[3].style.display='none');
    if(inputs[2])inputs[2].disabled=true; if(inputs[3])inputs[3].disabled=true;
    radios.forEach(r=>{if(Number(r.value)>1)r.disabled=true});
  }
  if(type==='open_text'){
    fields.forEach(f=>f.style.display='none'); inputs.forEach(i=>{if(i)i.disabled=true}); radios.forEach(r=>{r.disabled=true;r.checked=false});
    addHint('openTextHint','<small>El estudiante escribirá una respuesta libre. No se calificará automáticamente.</small>');
  }
  if(type==='numeric'){
    fields.forEach(f=>f.style.display='none'); inputs.forEach(i=>{if(i)i.disabled=true}); radios.forEach(r=>{r.disabled=true;r.checked=false});
    addHint('numericHint','<label>Respuesta numérica correcta</label><input id="bnumeric" inputmode="decimal" placeholder="Ej. 42.5" style="width:100%;padding:12px;border:1px solid #d5dbe5;border-radius:10px"><small>Se comparará el valor escrito por el alumno.</small>');
  }
  if(type==='poll'){
    radios.forEach(r=>{r.disabled=true;r.checked=false});
    addHint('pollHint','<small>Encuesta sin respuesta correcta. Las cuatro opciones mostrarán distribución de respuestas.</small>');
  }
  if(type==='scale'){
    fields.forEach(f=>f.style.display='none'); inputs.forEach(i=>{if(i)i.disabled=true}); radios.forEach(r=>{r.disabled=true;r.checked=false});
    addHint('scaleHint','<small>El estudiante elegirá un valor del 1 al 5. No hay respuesta correcta.</small>');
  }
  if(type==='multiple_select'){
    radios.forEach(r=>{r.type='checkbox';r.disabled=false});
    addHint('multiHint','<small>Marca todas las opciones correctas. El alumno podrá elegir más de una respuesta.</small>');
  }
}

async function saveTypedQuestion() {
  const prompt=document.querySelector('#bp')?.value.trim();
  const subject=document.querySelector('#bs')?.value.trim()||'';
  const topic=document.querySelector('#bt')?.value.trim()||'';
  const type=document.querySelector('#btype')?.value||'multiple_choice';
  if(!prompt)return alert('Escribe la pregunta.');
  let options=[],correctAnswer=null;

  if(['multiple_choice','multiple_select','poll'].includes(type)){
    options=[0,1,2,3].map(i=>document.querySelector(`#bo${i}`)?.value.trim()||'');
    if(options.some(x=>!x))return alert('Completa las cuatro opciones.');
  }
  if(type==='multiple_choice'){
    correctAnswer=document.querySelector('input[name="bc"]:checked')?.value??null;
    if(correctAnswer===null)return alert('Marca la respuesta correcta.');
  }
  if(type==='multiple_select'){
    const correct=[...document.querySelectorAll('input[name="bc"]:checked')].map(x=>x.value).sort();
    if(!correct.length)return alert('Marca al menos una opción correcta.');
    correctAnswer=correct.join(',');
  }
  if(type==='true_false'){
    options=['Verdadero','Falso'];
    correctAnswer=document.querySelector('input[name="bc"]:checked')?.value??null;
    if(!['0','1'].includes(String(correctAnswer)))return alert('Marca Verdadero o Falso.');
  }
  if(type==='open_text'){options=[];correctAnswer=null;}
  if(type==='numeric'){
    options=[]; correctAnswer=document.querySelector('#bnumeric')?.value.trim()||'';
    if(!correctAnswer || Number.isNaN(Number(correctAnswer)))return alert('Escribe una respuesta numérica válida.');
  }
  if(type==='poll'){correctAnswer=null;}
  if(type==='scale'){options=['1','2','3','4','5'];correctAnswer=null;}

  const {error}=await sb.from('question_bank').insert({title:prompt.slice(0,80),subject,topic,question_type:type,prompt,options,correct_answer:correctAnswer});
  if(error)return alert(error.message);
  await window.showBank?.();
}

function installSaveOverride(){window.saveBank=saveTypedQuestion;window.__tedvioTypedSaveInstalled=true;}

function decorateBank(){
  const items=[...document.querySelectorAll('.card > div[style*="border-top"]')];
  for(const item of items){
    if(item.dataset.typeDecorated==='1')continue;
    const launch=item.querySelector('button[onclick*="launchBank"]');
    const match=launch?.getAttribute('onclick')?.match(/launchBank\('([^']+)'\)/); if(!match)continue;
    item.dataset.typeDecorated='1';
    sb.from('question_bank').select('question_type').eq('id',match[1]).maybeSingle().then(({data})=>{
      if(!data||!item.isConnected)return; const b=document.createElement('span');b.className='badge';b.style.marginLeft='8px';b.textContent=questionTypeLabel(data.question_type);item.querySelector('small')?.appendChild(b);
    });
  }
}

function installJoinWrapper(){
  if(window.__tedvioJoinWrapped||typeof window.joinSession!=='function')return;
  window.__tedvioJoinWrapped=true; const original=window.joinSession;
  window.joinSession=async function(){const code=document.querySelector('#code')?.value.trim(),name=document.querySelector('#name')?.value.trim();await original();if(!code||!name)return;await sleep(150);const {data:s}=await sb.from('sessions').select('id').eq('code',code).maybeSingle();if(!s)return;const {data:p}=await sb.from('participants').select('id').eq('session_id',s.id).eq('display_name',name).order('joined_at',{ascending:false}).limit(1).maybeSingle();if(p)localStorage.setItem(STUDENT_KEY,JSON.stringify({sessionId:s.id,participantId:p.id}));};
}

function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
async function studentContext(){try{return JSON.parse(localStorage.getItem(STUDENT_KEY)||'null')}catch{return null}}
async function currentTypedQuestion(){const ctx=await studentContext();if(!ctx?.sessionId)return {};const {data:s}=await sb.from('sessions').select('current_question_id').eq('id',ctx.sessionId).maybeSingle();if(!s?.current_question_id)return {ctx};const {data:q}=await sb.from('questions').select('*').eq('id',s.current_question_id).maybeSingle();return {ctx,q};}
async function submitCustom(q,ctx,answer,target){const {error}=await sb.from('responses').insert({question_id:q.id,participant_id:ctx.participantId,answer:String(answer)});if(error)return alert(error.message);target.innerHTML='<div style="text-align:center;padding-top:50px"><div style="font-size:64px">✓</div><h1>¡Respuesta enviada!</h1><p>Espera al profesor.</p></div>';}

async function renderCustomStudent(){
  if(!location.hash.startsWith('#student'))return;
  const {ctx,q}=await currentTypedQuestion(); if(!ctx?.participantId||!q||q.status!=='live')return;
  const custom=['open_text','numeric','multiple_select','poll','scale']; if(!custom.includes(q.question_type))return;
  const target=document.querySelector('.mobile-body')||document.querySelector('.join-card');if(!target||target.dataset.qid===q.id)return;target.dataset.qid=q.id;
  const title=`<h1>${escapeHtml(q.prompt)}</h1>`;
  if(q.question_type==='open_text'){
    target.innerHTML=title+`<div class="field"><label>Tu respuesta</label><textarea id="tedAnswer" rows="6" style="width:100%;padding:14px;border-radius:12px"></textarea></div><button class="btn primary" id="tedSend" style="width:100%">Enviar</button>`;
    document.querySelector('#tedSend').onclick=()=>{const a=document.querySelector('#tedAnswer').value.trim();if(!a)return alert('Escribe una respuesta.');submitCustom(q,ctx,a,target)};
  }
  if(q.question_type==='numeric'){
    target.innerHTML=title+`<div class="field"><label>Respuesta numérica</label><input id="tedNumber" inputmode="decimal" style="width:100%;padding:14px;border-radius:12px"></div><button class="btn primary" id="tedSend" style="width:100%">Enviar</button>`;
    document.querySelector('#tedSend').onclick=()=>{const a=document.querySelector('#tedNumber').value.trim();if(!a||Number.isNaN(Number(a)))return alert('Escribe un número válido.');submitCustom(q,ctx,a,target)};
  }
  if(q.question_type==='multiple_select'){
    target.innerHTML=title+(q.options||[]).map((o,i)=>`<label class="mobile-option" style="display:block"><input type="checkbox" name="tedMulti" value="${i}"> <b>${String.fromCharCode(65+i)}</b> ${escapeHtml(o)}</label>`).join('')+`<button class="btn primary" id="tedSend" style="width:100%;margin-top:12px">Enviar selección</button>`;
    document.querySelector('#tedSend').onclick=()=>{const a=[...document.querySelectorAll('input[name="tedMulti"]:checked')].map(x=>x.value).sort();if(!a.length)return alert('Selecciona al menos una opción.');submitCustom(q,ctx,a.join(','),target)};
  }
  if(['poll','scale'].includes(q.question_type)){
    target.innerHTML=title+(q.options||[]).map((o,i)=>`<button class="mobile-option" data-choice="${i}"><b>${escapeHtml(o)}</b></button>`).join('');
    [...target.querySelectorAll('[data-choice]')].forEach(b=>b.onclick=()=>submitCustom(q,ctx,b.dataset.choice,target));
  }
}

async function renderCustomTeacher(){
  const panel=document.querySelector('.session-panel');if(!panel){document.querySelector('#tedTypedResponses')?.remove();return}
  const code=panel.querySelector('.code')?.textContent.trim();if(!code)return;
  const {data:s}=await sb.from('sessions').select('current_question_id').eq('code',code).maybeSingle();if(!s?.current_question_id)return;
  const {data:q}=await sb.from('questions').select('*').eq('id',s.current_question_id).maybeSingle();if(!q||!['open_text','numeric','multiple_select'].includes(q.question_type)){document.querySelector('#tedTypedResponses')?.remove();return}
  const {data:r}=await sb.from('responses').select('answer,submitted_at').eq('question_id',q.id).order('submitted_at',{ascending:false});
  const left=document.querySelector('.grid.split > div:first-child');if(!left)return;let box=document.querySelector('#tedTypedResponses');if(!box){box=document.createElement('div');box.id='tedTypedResponses';box.className='card';box.style.marginTop='18px';left.appendChild(box)}
  box.innerHTML=`<h3>${questionTypeLabel(q.question_type)} <span class="badge">${r?.length||0}</span></h3>${r?.length?r.map(x=>`<div style="padding:10px 0;border-top:1px solid #e5e7eb">${escapeHtml(x.answer)}</div>`).join(''):'<p>Aún no hay respuestas.</p>'}`;
}

installSaveOverride();installJoinWrapper();
setInterval(()=>{try{installSaveOverride();installJoinWrapper();enhanceCreateForm();decorateBank();renderCustomStudent();renderCustomTeacher()}catch(e){console.error('TEDVIO question types:',e)}},700);
