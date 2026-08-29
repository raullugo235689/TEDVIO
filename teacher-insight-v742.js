const VERSION='2026.08.28.742';
const STATE={open:false,groupId:'',busy:false,messages:[],lastResult:null};
const core=()=>window.__TEDVIO_TEACHER686__||null;
const esc=(v='')=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const nl=v=>esc(v).replace(/\n/g,'<br>');
const groups=()=>Array.isArray(core()?.state?.dashboard?.groups)?core().state.dashboard.groups:[];
const groupById=id=>groups().find(g=>String(g.id)===String(id))||null;
const groupName=g=>g?.name||g?.group_name||'Grupo';
const groupSubject=g=>g?.subject||g?.program||'Sin asignatura';
const currentGroup=()=>STATE.groupId||sessionStorage.getItem('tedvio.currentGroupId')||'';
function setGroup(id=''){STATE.groupId=id&&groupById(id)?String(id):'';if(STATE.groupId)sessionStorage.setItem('tedvio.currentGroupId',STATE.groupId)}
function host(){return document.querySelector('#tv742InsightOverlay')}
function conversation(){return host()?.querySelector('#tv742Conversation')}
function input(){return host()?.querySelector('#tv742Input')}
function close(){host()?.remove();STATE.open=false;delete document.documentElement.dataset.tedvioInsight}
function groupOptions(){return`<option value="">Todos mis grupos</option>${groups().map(g=>`<option value="${esc(g.id)}" ${String(g.id)===String(currentGroup())?'selected':''}>${esc(groupName(g))} · ${esc(groupSubject(g))}</option>`).join('')}`}
function promptButtons(){
  const scoped=groupById(currentGroup());
  return`<div class="tv742-prompts">
    <button data-tv742-prompt="¿Qué necesita mi atención ahora?"><i>01</i><span>Prioridad actual</span><small>Qué conviene hacer primero</small></button>
    <button data-tv742-prompt="¿Cómo va este grupo y qué debería hacer después?"><i>02</i><span>${scoped?'Estado del grupo':'Estado de mis grupos'}</span><small>Asistencia, rendimiento y siguiente paso</small></button>
    <button data-tv742-prompt="¿Tengo evidencia suficiente para interpretar este grupo?"><i>03</i><span>Suficiencia de evidencia</span><small>Qué datos existen y cuáles faltan</small></button>
    <button data-tv742-prompt="Busca un reforzamiento en mi Banco para el contenido con menor dominio." data-intent="reinforcement"><i>04</i><span>Buscar reforzamiento</span><small>Usa mis reactivos, no genera nuevos</small></button>
  </div>`;
}
function introHtml(){const scoped=groupById(currentGroup());return`<div class="tv742-welcome"><div class="tv742-mark">◎</div><span>TEDVIO INSIGHT</span><h2>${scoped?`Decisiones para ${esc(groupName(scoped))}`:'Tu operación académica, interpretada'}</h2><p>Analiza reglas académicas y evidencia registrada en TEDVIO. No usa IA generativa ni consume créditos por tokens.</p>${promptButtons()}</div>`}
function messageHtml(m){return`<article class="tv742-msg user"><div>${nl(m.content)}</div></article>`}
function renderConversation(){const c=conversation();if(!c)return;c.innerHTML=STATE.messages.length?STATE.messages.map(messageHtml).join(''):introHtml();requestAnimationFrame(()=>{c.scrollTop=c.scrollHeight})}
function shell(){
  close();STATE.open=true;
  const wrap=document.createElement('div');wrap.id='tv742InsightOverlay';wrap.className='tv742-overlay';
  wrap.innerHTML=`<aside class="tv742-shell" role="dialog" aria-modal="true" aria-label="TEDVIO Insight">
    <header class="tv742-head"><div><span>◎ TEDVIO INSIGHT</span><h1>Centro de decisiones</h1><p>Inteligencia académica basada en reglas y evidencia.</p></div><button class="tv742-close" data-tv742-close aria-label="Cerrar">×</button></header>
    <div class="tv742-mode"><div><b>Sin IA generativa</b><span>Costo de inferencia: $0</span></div><label>Contexto<select id="tv742Group">${groupOptions()}</select></label></div>
    <main id="tv742Conversation" class="tv742-conversation"></main>
    <footer class="tv742-compose"><div id="tv742Status" class="tv742-status" hidden></div><form id="tv742Form"><textarea id="tv742Input" maxlength="1200" rows="2" placeholder="Pregunta por asistencia, rendimiento, riesgo, evidencia o reforzamiento…"></textarea><button type="submit" class="tv742-send" aria-label="Analizar">→</button></form><small>TEDVIO Insight usa reglas determinísticas; verifica la evidencia antes de tomar decisiones.</small></footer>
  </aside>`;
  document.body.appendChild(wrap);document.documentElement.dataset.tedvioInsight='742';
  wrap.addEventListener('mousedown',e=>{if(e.target===wrap)close()});renderConversation();requestAnimationFrame(()=>input()?.focus({preventScroll:true}));
}
function open(groupId=''){setGroup(groupId||currentGroup());shell()}
function status(text='',tone=''){const el=host()?.querySelector('#tv742Status');if(!el)return;el.hidden=!text;el.className=`tv742-status ${tone}`;el.textContent=text}
function loading(on){STATE.busy=on;const send=host()?.querySelector('.tv742-send'),ta=input();if(send){send.disabled=on;send.textContent=on?'…':'→'}if(ta)ta.disabled=on;status(on?'Actualizando indicadores y reglas académicas…':'',on?'loading':'')}
function groupLabel(id){const g=groupById(id);return g?groupName(g):'grupo'}
function coverageHtml(c){
  if(!c)return'';
  const labels={attendance:'Asistencia',performance:'Rendimiento',risk:'Riesgo combinado',evaluation:'OMR'};
  return`<section class="tv742-coverage"><span>SUFICIENCIA DE EVIDENCIA</span><div>${Object.entries(c).map(([k,v])=>`<article class="${esc(v.status)}"><header><b>${labels[k]||esc(k)}</b><em>${esc(v.label)}</em></header><p>${esc(v.detail)}</p></article>`).join('')}</div></section>`;
}
function bankHtml(items){
  if(!items?.length)return'';
  return`<section class="tv742-bank"><div class="tv742-section-head"><div><span>REACTIVOS DISPONIBLES EN TU BANCO</span><h3>${items.length} opciones para reforzamiento</h3></div><button data-tv742-bank>Abrir Banco</button></div><div>${items.map((q,i)=>`<article><i>${i+1}</i><div><b>${esc(q.prompt)}</b><small>${[q.topic,q.difficulty,q.bloom].filter(Boolean).map(esc).join(' · ')}</small></div></article>`).join('')}</div><p>Estos reactivos ya existían en Question Studio; TEDVIO no generó contenido nuevo.</p></section>`;
}
function actionHtml(a,index){const icons={open_group:'◎',open_grades:'≋',open_omr:'⌁',take_attendance:'✓',open_bank:'▦'};return`<button class="tv742-action" data-tv742-action="${esc(a.kind)}" data-index="${index}"><i>${icons[a.kind]||'→'}</i><span><b>${esc(a.label)}</b>${a.group_id?`<small>${esc(groupLabel(a.group_id))}</small>`:''}</span></button>`}
function resultHtml(r){return`<article class="tv742-result"><header><div class="tv742-result-icon">◎</div><div><b>TEDVIO Insight</b><span>Reglas académicas · sin IA generativa</span></div><em>$0</em></header><div class="tv742-answer">${nl(r.answer)}</div>${r.evidence?.length?`<section class="tv742-evidence"><span>EVIDENCIA UTILIZADA</span>${r.evidence.map(x=>`<div><i>•</i><p>${esc(x)}</p></div>`).join('')}</section>`:''}${coverageHtml(r.coverage)}${bankHtml(r.bank_items)}${r.actions?.length?`<section class="tv742-actions"><span>SIGUIENTES ACCIONES</span>${r.actions.map(actionHtml).join('')}</section>`:''}${r.caution?`<p class="tv742-caution">${esc(r.caution)}</p>`:''}</article>`}
function appendResult(r){STATE.lastResult=r;const c=conversation();if(!c)return;c.insertAdjacentHTML('beforeend',resultHtml(r));requestAnimationFrame(()=>{c.scrollTop=c.scrollHeight})}
async function ask(text,intent='ask'){
  if(STATE.busy)return;const message=String(text||'').trim();if(!message)return;
  STATE.messages.push({role:'user',content:message});renderConversation();loading(true);
  try{
    const c=core();if(!c?.db)throw new Error('No hay una sesión docente activa.');
    const{data:{session}}=await c.db.auth.getSession();if(!session?.access_token)throw new Error('Tu sesión expiró. Inicia sesión nuevamente.');
    const r=await fetch('/api/tedvio-ai',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${session.access_token}`},body:JSON.stringify({message,groupId:currentGroup()||null,intent})});
    const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data?.error||'TEDVIO Insight no pudo completar el análisis.');
    loading(false);renderConversation();appendResult(data);
  }catch(error){
    loading(false);status(error.message||'No pude completar el análisis.','error');const c=conversation();
    c?.insertAdjacentHTML('beforeend',`<div class="tv742-error"><b>No pude actualizar este análisis.</b><span>${esc(error.message||'Intenta nuevamente.')}</span><button data-tv742-retry>Reintentar</button></div>`);
    requestAnimationFrame(()=>{if(c)c.scrollTop=c.scrollHeight});
  }
}
async function openBank(){close();const loader=window.__TEDVIO_PROGRESSIVE_BOOT68__;await loader?.ensure?.('bank');await window.betaView?.('bank')}
async function runAction(index){
  const a=STATE.lastResult?.actions?.[index];if(!a)return;const gid=a.group_id||currentGroup();
  if(a.kind==='open_bank')return openBank();
  close();
  if(a.kind==='open_group'&&gid)return window.tvPilotOpenGroup?.(gid);
  if(a.kind==='open_grades'&&gid)return window.tvPilotOpenGrades?.(gid);
  if(a.kind==='open_omr')return window.tvPilotOpenExamForGroup?.(gid||undefined);
  if(a.kind==='take_attendance'&&gid)return window.tvPilotAttendance?.(gid);
}
document.addEventListener('click',e=>{
  if(e.target.closest?.('[data-tv742-close]')){e.preventDefault();close();return}
  const p=e.target.closest?.('[data-tv742-prompt]');if(p){e.preventDefault();ask(p.dataset.tv742Prompt,p.dataset.intent||'ask');return}
  const a=e.target.closest?.('[data-tv742-action]');if(a){e.preventDefault();runAction(Number(a.dataset.index)).catch(err=>status(err.message,'error'));return}
  if(e.target.closest?.('[data-tv742-bank]')){e.preventDefault();openBank().catch(err=>status(err.message,'error'));return}
  if(e.target.closest?.('[data-tv742-retry]')){e.preventDefault();const last=[...STATE.messages].reverse().find(x=>x.role==='user');if(last)ask(last.content);return}
});
document.addEventListener('submit',e=>{if(e.target?.id!=='tv742Form')return;e.preventDefault();const ta=input(),text=ta?.value||'';if(ta)ta.value='';ask(text)});
document.addEventListener('change',e=>{if(e.target?.id!=='tv742Group')return;setGroup(e.target.value);STATE.messages=[];STATE.lastResult=null;renderConversation()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&STATE.open)close();if((e.ctrlKey||e.metaKey)&&e.key==='Enter'&&STATE.open){e.preventDefault();const ta=input(),text=ta?.value||'';if(ta)ta.value='';ask(text)}});
window.tv742OpenInsight=open;
window.tv742CloseInsight=close;
window.tv74OpenAI=open;
window.__TEDVIO_INSIGHT742__={version:VERSION,open,close,ask,get groupId(){return currentGroup()}};