import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cfg = window.TEDVIO_CONFIG || {};
const sb = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY);

let currentUser = null;
let profile = null;
let sessionMap = new Map();
let wrappedNewSession = false;

const esc = (v='') => String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));

async function refreshAcademicData(){
  const {data:{session}} = await sb.auth.getSession();
  currentUser = session?.user || null;
  if(!currentUser){ profile = null; sessionMap = new Map(); return; }

  const [{data:p},{data:sessions}] = await Promise.all([
    sb.from('profiles').select('id,display_name,institution,educational_program,default_group').eq('id',currentUser.id).maybeSingle(),
    sb.from('v2_sessions').select('id,code,university,educational_program,group_name').eq('teacher_id',currentUser.id).order('created_at',{ascending:false}).limit(100)
  ]);
  profile = p || {id:currentUser.id};
  sessionMap = new Map((sessions||[]).map(s=>[s.code,s]));
}

function academicFieldsHtml(values={}){
  return `
    <div class="b-field">
      <label>Universidad / institución</label>
      <input id="sessionUniversity" autocomplete="organization" placeholder="Ej. Universidad o institución" value="${esc(values.university||'')}">
    </div>
    <div class="b-field">
      <label>Programa Educativo</label>
      <input id="sessionProgram" placeholder="Ej. Licenciatura en Medicina General" value="${esc(values.program||'')}">
    </div>
    <div class="b-field">
      <label>Grupo</label>
      <input id="sessionGroup" placeholder="Ej. 1° A" value="${esc(values.group||'')}">
    </div>`;
}

async function saveProfileAcademic(university, program, group){
  if(!currentUser) await refreshAcademicData();
  if(!currentUser) throw new Error('Inicia sesión como profesor.');
  const payload = {
    institution: university?.trim() || null,
    educational_program: program?.trim() || null,
    default_group: group?.trim() || null
  };
  const {error} = await sb.from('profiles').update(payload).eq('id',currentUser.id);
  if(error) throw error;
  profile = {...(profile||{}), ...payload};
}

function openAcademicProfile(){
  const old = document.querySelector('#academicOverlay');
  old?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'academicOverlay';
  overlay.className = 'b-overlay';
  overlay.innerHTML = `<div class="b-modal">
    <div class="b-row" style="justify-content:space-between;align-items:center">
      <div><h2 style="margin:0">Perfil académico</h2><div class="b-sub">Estos datos se usarán para identificar tus sesiones y reportes.</div></div>
      <button class="b-btn secondary" id="academicClose">×</button>
    </div>
    ${academicFieldsHtml({university:profile?.institution,program:profile?.educational_program,group:profile?.default_group})}
    <div class="b-row" style="justify-content:flex-end;margin-top:16px"><button class="b-btn primary" id="academicSave">Guardar</button></div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#academicClose').onclick = ()=>overlay.remove();
  overlay.querySelector('#academicSave').onclick = async()=>{
    const u=overlay.querySelector('#sessionUniversity').value.trim();
    const p=overlay.querySelector('#sessionProgram').value.trim();
    const g=overlay.querySelector('#sessionGroup').value.trim();
    if(!u||!p||!g) return alert('Completa Universidad, Programa Educativo y Grupo.');
    try{ await saveProfileAcademic(u,p,g); overlay.remove(); await refreshAcademicData(); decorate(); }
    catch(e){ alert(e.message); }
  };
}
window.betaAcademicProfile = openAcademicProfile;

function ensureProfileButton(){
  if(!currentUser || location.hash.startsWith('#join') || location.hash.startsWith('#student')) return;
  const actions = document.querySelector('.b-top-actions');
  if(!actions || document.querySelector('#academicProfileBtn')) return;
  const btn = document.createElement('button');
  btn.id = 'academicProfileBtn';
  btn.className = 'b-btn dark';
  btn.innerHTML = '🏫 Contexto académico';
  btn.onclick = openAcademicProfile;
  actions.insertBefore(btn, actions.firstChild);
}

function ensureDashboardSummary(){
  if(!currentUser || !profile || !document.querySelector('.b-main')) return;
  if(!document.querySelector('.b-hero h1')?.textContent?.includes('Panel del profesor')) return;
  let box = document.querySelector('#academicSummary');
  if(!box){
    box = document.createElement('div');
    box.id = 'academicSummary';
    box.className = 'b-card';
    box.style.marginBottom = '16px';
    document.querySelector('.b-hero')?.after(box);
  }
  const complete = profile.institution && profile.educational_program && profile.default_group;
  box.innerHTML = `<div class="b-row" style="justify-content:space-between;align-items:flex-start">
    <div>
      <div class="b-sub">Contexto académico del docente</div>
      <strong>${esc(profile.institution || 'Universidad pendiente')}</strong>
      <div style="margin-top:4px">${esc(profile.educational_program || 'Programa Educativo pendiente')}</div>
      <div class="b-sub" style="margin-top:4px">Grupo predeterminado: ${esc(profile.default_group || 'pendiente')}</div>
    </div>
    <button class="b-btn ${complete?'secondary':'primary'}" onclick="betaAcademicProfile()">${complete?'Editar':'Completar perfil'}</button>
  </div>`;
}

async function enhanceSessionModal(){
  const title = document.querySelector('#sessionTitle');
  if(!title || document.querySelector('#sessionUniversity')) return;
  if(!profile) await refreshAcademicData();
  const field = title.closest('.b-field');
  if(!field) return;
  const wrap = document.createElement('div');
  wrap.id = 'sessionAcademicFields';
  wrap.innerHTML = `<div class="b-card" style="margin:12px 0;background:#f8fbff">
    <div class="b-sub" style="margin-bottom:8px">Contexto académico de esta sesión</div>
    ${academicFieldsHtml({university:profile?.institution,program:profile?.educational_program,group:profile?.default_group})}
  </div>`;
  field.after(wrap);

  const createBtn = document.querySelector('#sessionCreate');
  if(createBtn && !createBtn.dataset.academicWrapped){
    createBtn.dataset.academicWrapped = '1';
    const original = createBtn.onclick;
    createBtn.onclick = async function(ev){
      const u=document.querySelector('#sessionUniversity')?.value.trim();
      const p=document.querySelector('#sessionProgram')?.value.trim();
      const g=document.querySelector('#sessionGroup')?.value.trim();
      if(!u||!p||!g) return alert('Completa Universidad, Programa Educativo y Grupo antes de crear la sesión.');
      try{
        await saveProfileAcademic(u,p,g);
        if(typeof original === 'function') await original.call(this,ev);
        setTimeout(async()=>{ await refreshAcademicData(); decorate(); },700);
      }catch(e){ alert(e.message); }
    };
  }
}

function wrapNewSession(){
  if(wrappedNewSession || typeof window.betaNewSession !== 'function') return;
  wrappedNewSession = true;
  const original = window.betaNewSession;
  window.betaNewSession = function(...args){
    const out = original.apply(this,args);
    setTimeout(enhanceSessionModal,0);
    setTimeout(enhanceSessionModal,80);
    return out;
  };
}

function decorateSessionRows(){
  document.querySelectorAll('.b-item').forEach(item=>{
    if(item.querySelector('.academic-session-line')) return;
    const sub=[...item.querySelectorAll('.b-sub')].find(x=>x.textContent.includes('Código '));
    if(!sub) return;
    const match=sub.textContent.match(/Código\s+(\d{6})/);
    const ctx=match?sessionMap.get(match[1]):null;
    if(!ctx || (!ctx.university&&!ctx.educational_program&&!ctx.group_name)) return;
    const line=document.createElement('div');
    line.className='b-sub academic-session-line';
    line.style.marginTop='4px';
    line.textContent=[ctx.university,ctx.educational_program,ctx.group_name?`Grupo ${ctx.group_name}`:null].filter(Boolean).join(' · ');
    sub.after(line);
  });
}

function decorateLiveSession(){
  if(!currentUser) return;
  let code = document.querySelector('.b-code')?.textContent?.trim();
  if(!code){
    const p=[...document.querySelectorAll('.b-hero p')].find(x=>x.textContent.includes('Código '));
    code=p?.textContent.match(/Código\s+(\d{6})/)?.[1];
  }
  if(!code) return;
  const ctx=sessionMap.get(code);
  if(!ctx) return;
  const anchor=document.querySelector('.b-code') || document.querySelector('.b-hero p');
  if(!anchor || document.querySelector('#liveAcademicContext')) return;
  const line=document.createElement('div');
  line.id='liveAcademicContext';
  line.className='b-row';
  line.style.margin='10px 0';
  line.innerHTML=`${ctx.university?`<span class="b-chip gray">🏫 ${esc(ctx.university)}</span>`:''}${ctx.educational_program?`<span class="b-chip gray">🎓 ${esc(ctx.educational_program)}</span>`:''}${ctx.group_name?`<span class="b-chip gold">👥 Grupo ${esc(ctx.group_name)}</span>`:''}`;
  anchor.after(line);
}

function decorate(){
  ensureProfileButton();
  ensureDashboardSummary();
  decorateSessionRows();
  decorateLiveSession();
  enhanceSessionModal();
}

async function boot(){
  await refreshAcademicData();
  wrapNewSession();
  decorate();
  setInterval(()=>{ wrapNewSession(); decorate(); },800);
  setInterval(async()=>{ if(currentUser){ await refreshAcademicData(); decorate(); } },7000);
}

sb.auth.onAuthStateChange(async(_event,session)=>{
  currentUser=session?.user||null;
  await refreshAcademicData();
  setTimeout(()=>{wrapNewSession();decorate();},150);
});

boot();
