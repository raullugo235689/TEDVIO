const VERSION='2026.08.27.68.7';
const KEY='tedvio.teacher.theme';
const root=document.querySelector('#betaApp');
const metaTheme=document.querySelector('meta[name="theme-color"]');
let report6811Requested=false,settings6811Promise=null,reports6812Requested=false,account69Promise=null;

function normalize(value){return value==='dark'?'dark':'light'}
function readTheme(){try{return normalize(localStorage.getItem(KEY))}catch{return'light'}}
function syncButtons(theme){
  document.querySelectorAll('[data-tv687-theme]').forEach(button=>{
    const active=button.dataset.tv687Theme===theme;
    button.classList.toggle('active',active);
    button.setAttribute('aria-pressed',active?'true':'false');
  });
}
function applyTheme(value,{persist=true}={}){
  const theme=normalize(value);
  document.documentElement.dataset.tedvioTheme=theme;
  document.documentElement.style.colorScheme=theme==='dark'?'dark':'light';
  if(metaTheme)metaTheme.setAttribute('content',theme==='dark'?'#03112b':'#071a3b');
  if(persist){try{localStorage.setItem(KEY,theme)}catch{}}
  syncButtons(theme);
  window.dispatchEvent(new CustomEvent('tedvio:theme',{detail:{theme,version:VERSION}}));
  return theme;
}
function control(){
  const wrap=document.createElement('div');
  wrap.id='tv687ThemeControl';
  wrap.className='tv687-theme-control';
  wrap.setAttribute('role','group');
  wrap.setAttribute('aria-label','Aspecto de TEDVIO');
  wrap.innerHTML='<button type="button" class="tv687-theme-btn" data-tv687-theme="dark" aria-label="Usar aspecto oscuro">☾ <span>Oscuro</span></button><button type="button" class="tv687-theme-btn" data-tv687-theme="light" aria-label="Usar aspecto blanco">☀ <span>Blanco</span></button>';
  wrap.addEventListener('click',event=>{
    const button=event.target.closest('[data-tv687-theme]');
    if(!button)return;
    applyTheme(button.dataset.tv687Theme);
  });
  return wrap;
}
function accountButton(){const b=document.createElement('button');b.id='tv69AccountBtn';b.type='button';b.className='b-btn secondary';b.textContent='Cuenta';b.setAttribute('aria-label','Abrir Centro de Cuenta y Privacidad');b.onclick=openAccountCenter;return b}
function install(){
  const bars=document.querySelectorAll('.tv686-top .b-top-actions,.tv686-session-shell .b-top-actions');
  bars.forEach(bar=>{
    const primary=bar.querySelector('.b-btn.primary');
    if(!bar.querySelector('#tv687ThemeControl')){const node=control();primary?bar.insertBefore(node,primary):bar.appendChild(node)}
    if(!bar.querySelector('#tv69AccountBtn')){const node=accountButton();primary?bar.insertBefore(node,primary):bar.appendChild(node)}
  });
  syncButtons(document.documentElement.dataset.tedvioTheme||readTheme());
}
async function loadAttendanceReport(event){
  if(event?.detail?.name!=='groups'||report6811Requested)return;
  report6811Requested=true;
  try{await import('./attendance-institutional-report-v68-11.js?v=6811')}catch(error){report6811Requested=false;console.error('TEDVIO v68.11 attendance report',error)}
}
async function loadReportCenterLauncher(event){
  if(event?.detail?.name!=='groups'||reports6812Requested)return;
  reports6812Requested=true;
  try{await import('./report-center-launcher-v68-12.js?v=6812')}catch(error){reports6812Requested=false;console.error('TEDVIO v68.12 Report Center launcher',error)}
}
async function openInstitutionSettings(){
  try{
    const api=window.__TEDVIO_PROGRESSIVE_BOOT68__;
    if(api?.loadStyle)await api.loadStyle('./institution-settings-v68-11.css?v=6811');
    if(!settings6811Promise)settings6811Promise=import('./institution-settings-v68-11.js?v=6811');
    await settings6811Promise;window.tv6811OpenSettings?.();
  }catch(error){settings6811Promise=null;console.error('TEDVIO v68.11 institution settings',error);alert('No pude abrir la configuración institucional.')}
}
async function openAccountCenter(){
  try{
    const api=window.__TEDVIO_PROGRESSIVE_BOOT68__;
    if(api?.loadStyle)await api.loadStyle('./account-center-v69.css?v=69');
    if(!account69Promise)account69Promise=import('./account-center-v69.js?v=69');
    await account69Promise;window.tv69OpenAccount?.('overview');
  }catch(error){account69Promise=null;console.error('TEDVIO v69 Account Center',error);alert('No pude abrir el Centro de Cuenta.')}
}

applyTheme(readTheme(),{persist:false});
window.addEventListener('tedvio:teacher-shell',()=>requestAnimationFrame(install));
window.addEventListener('tedvio:teacher-ready',()=>requestAnimationFrame(install));
window.addEventListener('tedvio:feature-ready',loadAttendanceReport);
window.addEventListener('tedvio:feature-ready',loadReportCenterLauncher);
document.addEventListener('click',event=>{const button=event.target.closest?.('#tvLazySetup');if(!button)return;event.preventDefault();event.stopImmediatePropagation();openInstitutionSettings()},true);
if(root){new MutationObserver(()=>requestAnimationFrame(install)).observe(root,{childList:true,subtree:false})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
if(typeof window.tvAttendanceProOpen==='function'){loadAttendanceReport({detail:{name:'groups'}});loadReportCenterLauncher({detail:{name:'groups'}})}
window.tv687Theme=applyTheme;
window.tv6811OpenInstitutionSettings=openInstitutionSettings;
window.tv69OpenAccountCenter=openAccountCenter;
window.__TEDVIO_THEME687__={version:VERSION,get theme(){return document.documentElement.dataset.tedvioTheme||'light'},set:applyTheme};
