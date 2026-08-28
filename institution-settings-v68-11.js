const VERSION='2026.08.28.68.11';
const BUCKET='tedvio-media-v2';
const db=window.__TEDVIO_DB__;
const S={user:null,institutions:[],busy:false};

const esc=(v='')=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const clean=(v='')=>String(v??'').trim();
function publicUrl(path){if(!path||!db)return'';return db.storage.from(BUCKET).getPublicUrl(path).data?.publicUrl||''}
function toast(msg,tone='info'){let h=document.querySelector('#tv6811ToastHost');if(!h){h=document.createElement('div');h.id='tv6811ToastHost';document.body.appendChild(h)}const d=document.createElement('div');d.className=`tv6811-toast ${tone}`;d.textContent=msg;h.appendChild(d);requestAnimationFrame(()=>d.classList.add('show'));setTimeout(()=>{d.classList.remove('show');setTimeout(()=>d.remove(),180)},2600)}

async function load(){
  if(!db)throw new Error('El motor de datos de TEDVIO no está disponible.');
  const{data:{session}}=await db.auth.getSession();
  S.user=session?.user||null;if(!S.user)throw new Error('Inicia sesión como profesor.');
  const{data:memberships,error:me}=await db.from('tedvio_institution_memberships').select('institution_id,member_role,status').eq('user_id',S.user.id).eq('status','active');
  if(me)throw me;
  const ids=(memberships||[]).filter(m=>m.member_role==='institution_admin').map(m=>m.institution_id);
  if(!ids.length){S.institutions=[];return}
  const{data,error}=await db.from('tedvio_institutions').select('id,name,status,plan,report_logo_path,report_title,report_approver_name,report_approver_title,report_approval_label,report_document_code').in('id',ids).order('name');
  if(error)throw error;S.institutions=data||[];
}
function logoBlock(i){const url=publicUrl(i.report_logo_path);return`<div class="tv6811-logo-wrap"><div class="tv6811-logo-preview" data-logo-preview="${i.id}">${url?`<img src="${esc(url)}" alt="Logotipo institucional">`:'<span>LOGO</span>'}</div><div><label class="tv6811-upload">Cambiar logotipo<input type="file" accept="image/png,image/jpeg" data-logo-file="${i.id}"></label><small>PNG o JPG · máximo 2 MB</small></div></div>`}
function field(id,label,value,placeholder='',wide=false){return`<label class="tv6811-field ${wide?'wide':''}"><span>${esc(label)}</span><input id="${id}" value="${esc(value||'')}" placeholder="${esc(placeholder)}"></label>`}
function institutionCard(i){return`<article class="tv6811-inst" data-inst="${i.id}" data-old-logo="${esc(i.report_logo_path||'')}"><header><div><span>INSTITUCIÓN</span><h3>${esc(i.name)}</h3><small>${esc((i.plan||'').toUpperCase())}</small></div></header>${logoBlock(i)}<div class="tv6811-grid">${field(`tv6811Name-${i.id}`,'Nombre institucional',i.name,'Nombre oficial',true)}${field(`tv6811Title-${i.id}`,'Título del reporte',i.report_title||'REGISTRO DE ASISTENCIA Y EVALUACIÓN','REGISTRO DE ASISTENCIA Y EVALUACIÓN',true)}${field(`tv6811Approver-${i.id}`,'Responsable de Vo. Bo.',i.report_approver_name,'Nombre del coordinador o director')}${field(`tv6811ApproverTitle-${i.id}`,'Cargo',i.report_approver_title,'Coordinación académica')}${field(`tv6811ApprovalLabel-${i.id}`,'Etiqueta de aprobación',i.report_approval_label||'Vo. Bo.','Vo. Bo.')}${field(`tv6811Code-${i.id}`,'Código documental',i.report_document_code,'Ej. RSC-05')}</div><div class="tv6811-actions"><button class="b-btn secondary" type="button" data-preview-report="${i.id}">Vista previa de datos</button><button class="b-btn primary" type="button" data-save-inst="${i.id}">Guardar cambios</button></div></article>`}
function render(){
  document.querySelector('#tv6811Settings')?.remove();
  const o=document.createElement('div');o.id='tv6811Settings';o.className='tv6811-overlay';
  o.innerHTML=`<section class="tv6811-shell"><header class="tv6811-head"><div><span>CONFIGURAR TEDVIO</span><h2>Institución y reportes</h2><p>Define la identidad que aparecerá en documentos oficiales.</p></div><button class="b-btn secondary" type="button" data-close>×</button></header><div class="tv6811-toolbar"><button class="tv6811-tab active" type="button">Institución</button><button class="tv6811-tab" type="button" data-onboarding>Inicio guiado</button></div><main>${S.institutions.length?S.institutions.map(institutionCard).join(''):'<div class="tv6811-empty"><b>No hay instituciones administrables.</b><span>Esta sección solo aparece para administradores institucionales activos.</span></div>'}</main></section>`;
  document.body.appendChild(o);wire(o);
}
async function openOnboarding(){const api=window.__TEDVIO_PROGRESSIVE_BOOT68__;if(api?.ensure)await api.ensure('onboarding');document.querySelector('#tv6811Settings')?.remove();window.tv68Open?.('overview')}
function wire(o){
  o.querySelector('[data-close]').onclick=()=>o.remove();
  o.addEventListener('mousedown',e=>{if(e.target===o)o.remove()});
  o.querySelector('[data-onboarding]').onclick=openOnboarding;
  o.querySelectorAll('[data-logo-file]').forEach(input=>input.onchange=()=>previewFile(input));
  o.querySelectorAll('[data-save-inst]').forEach(b=>b.onclick=()=>saveInstitution(b.dataset.saveInst,b));
  o.querySelectorAll('[data-preview-report]').forEach(b=>b.onclick=()=>previewData(b.dataset.previewReport));
}
function previewFile(input){const f=input.files?.[0];if(!f)return;if(!['image/png','image/jpeg'].includes(f.type)){input.value='';return toast('Usa un archivo PNG o JPG.','warn')}if(f.size>2*1024*1024){input.value='';return toast('El logotipo debe pesar máximo 2 MB.','warn')}const host=document.querySelector(`[data-logo-preview="${input.dataset.logoFile}"]`);if(host){const u=URL.createObjectURL(f);host.innerHTML=`<img src="${u}" alt="Vista previa del logotipo">`;setTimeout(()=>URL.revokeObjectURL(u),20000)}}
function previewData(id){const i=S.institutions.find(x=>x.id===id);if(!i)return;const name=clean(document.querySelector(`#tv6811Name-${id}`)?.value)||i.name,title=clean(document.querySelector(`#tv6811Title-${id}`)?.value)||'REGISTRO DE ASISTENCIA Y EVALUACIÓN',approver=clean(document.querySelector(`#tv6811Approver-${id}`)?.value)||'Sin responsable configurado',cargo=clean(document.querySelector(`#tv6811ApproverTitle-${id}`)?.value)||'Sin cargo configurado';toast(`${name} · ${title} · ${approver} · ${cargo}`,'info')}
async function uploadLogo(id,file){
  if(!file)return null;
  if(!['image/png','image/jpeg'].includes(file.type))throw new Error('Usa un logotipo PNG o JPG.');
  if(file.size>2*1024*1024)throw new Error('El logotipo debe pesar máximo 2 MB.');
  const ext=file.type==='image/png'?'png':'jpg',path=`${S.user.id}/institution-branding/${id}/logo-${Date.now()}.${ext}`;
  const{error}=await db.storage.from(BUCKET).upload(path,file,{cacheControl:'3600',contentType:file.type,upsert:false});if(error)throw error;return path;
}
async function saveInstitution(id,button){
  if(S.busy)return;const i=S.institutions.find(x=>x.id===id);if(!i)return;
  S.busy=true;button.disabled=true;const oldText=button.textContent;button.textContent='Guardando…';let newPath=null;
  try{
    const file=document.querySelector(`[data-logo-file="${id}"]`)?.files?.[0]||null;
    newPath=await uploadLogo(id,file);
    const payload={
      p_institution_id:id,
      p_name:clean(document.querySelector(`#tv6811Name-${id}`)?.value),
      p_report_logo_path:newPath||i.report_logo_path||null,
      p_report_title:clean(document.querySelector(`#tv6811Title-${id}`)?.value)||'REGISTRO DE ASISTENCIA Y EVALUACIÓN',
      p_report_approver_name:clean(document.querySelector(`#tv6811Approver-${id}`)?.value)||null,
      p_report_approver_title:clean(document.querySelector(`#tv6811ApproverTitle-${id}`)?.value)||null,
      p_report_approval_label:clean(document.querySelector(`#tv6811ApprovalLabel-${id}`)?.value)||'Vo. Bo.',
      p_report_document_code:clean(document.querySelector(`#tv6811Code-${id}`)?.value)||null
    };
    if(!payload.p_name)throw new Error('Escribe el nombre de la institución.');
    const{error}=await db.rpc('tedvio_update_institution_branding_v6811',payload);if(error)throw error;
    const oldPath=i.report_logo_path;if(newPath&&oldPath&&oldPath!==newPath)db.storage.from(BUCKET).remove([oldPath]).catch(()=>{});
    await load();render();toast('Configuración institucional guardada.','ok');window.dispatchEvent(new CustomEvent('tedvio:institution-branding',{detail:{institutionId:id,version:VERSION}}));
  }catch(error){if(newPath)db.storage.from(BUCKET).remove([newPath]).catch(()=>{});console.error('TEDVIO institution branding',error);toast(error?.message||'No se pudo guardar la institución.','bad');button.disabled=false;button.textContent=oldText}
  finally{S.busy=false}
}
async function open(){try{await load();render()}catch(error){console.error('TEDVIO settings',error);toast(error?.message||'No pude abrir la configuración.','bad')}}
window.tv6811OpenSettings=open;
window.__TEDVIO_INSTITUTION_SETTINGS6811__={version:VERSION,open,refresh:load,openOnboarding};
