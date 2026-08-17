import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';

const root=document.querySelector('#healthApp');
const rows=[];
const cfg=window.TEDVIO_CONFIG||{};
const esc=(v='')=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));

function add(name,status,detail=''){
  rows.push({name,status,detail});
  paint();
}
function paint(){
  const ok=rows.filter(x=>x.status==='ok').length;
  const fail=rows.filter(x=>x.status==='fail').length;
  const pending=rows.filter(x=>x.status==='pending').length;
  root.innerHTML=`<main class="hl-shell"><section class="hl-head"><img src="./assets/tedvio_logo_horizontal_650.png" alt="TEDVIO"><div><span class="hl-pill">Diagnóstico</span><h1>Estado de TEDVIO</h1><p>Comprobación de archivos, conexión y módulos principales.</p></div></section><section class="hl-summary"><div><span>Correcto</span><b>${ok}</b></div><div><span>Pendiente</span><b>${pending}</b></div><div><span>Error</span><b>${fail}</b></div></section><section class="hl-card"><div class="hl-list">${rows.map(x=>`<div class="hl-row"><span class="hl-dot ${x.status}">${x.status==='ok'?'✓':x.status==='fail'?'!':'…'}</span><div><strong>${esc(x.name)}</strong>${x.detail?`<small>${esc(x.detail)}</small>`:''}</div></div>`).join('')}</div></section><div class="hl-actions"><a href="./beta.html#teacher">Volver a profesor</a><a href="./beta.html#join">Abrir alumno</a><button id="hlRefresh">Repetir prueba</button></div><p class="hl-foot">Versión: <span id="hlVersion">consultando…</span></p></main>`;
  document.querySelector('#hlRefresh')?.addEventListener('click',()=>location.replace(`./health.html?v=${Date.now()}`));
}

async function checkFile(path,label){
  try{
    const r=await fetch(`${path}${path.includes('?')?'&':'?'}health=${Date.now()}`,{cache:'no-store'});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    add(label,'ok',`${r.status} · ${r.headers.get('content-type')||'archivo'}`);
    return true;
  }catch(e){add(label,'fail',e.message);return false}
}

async function run(){
  rows.length=0;paint();
  const configOk=!!cfg.SUPABASE_URL&&!!cfg.SUPABASE_PUBLISHABLE_KEY;
  add('Configuración de Supabase',configOk?'ok':'fail',configOk?'URL y clave pública presentes':'Falta configuración');

  let version=null;
  try{
    const r=await fetch(`./version.json?v=${Date.now()}`,{cache:'no-store'});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    version=await r.json();
    add('Marcador de versión','ok',`${version.version} · ${version.audit}`);
  }catch(e){add('Marcador de versión','fail',e.message)}

  await Promise.all([
    checkFile('./beta.js','Núcleo del profesor'),
    checkFile('./beta-stability.js','Capa de estabilidad'),
    checkFile('./beta-academics.js','Módulo académico'),
    checkFile('./beta-learning.js','Módulo de aprendizaje'),
    checkFile('./control.js','Control móvil'),
    checkFile('./proyectar.js','Pantalla de proyección'),
    checkFile('./assets/tedvio_logo_horizontal_650.png','Logo PNG oficial'),
    checkFile('./manifest.webmanifest','Manifest PWA')
  ]);

  add('Librería QR',typeof window.QRCode!=='undefined'?'ok':'fail',typeof window.QRCode!=='undefined'?'Cargada':'No disponible');
  add('Librería Excel/CSV',typeof window.XLSX!=='undefined'?'ok':'fail',typeof window.XLSX!=='undefined'?'Cargada':'No disponible');
  add('Librería PDF',typeof window.jspdf!=='undefined'?'ok':'fail',typeof window.jspdf!=='undefined'?'Cargada':'No disponible');

  if(configOk){
    try{
      const sb=createClient(cfg.SUPABASE_URL,cfg.SUPABASE_PUBLISHABLE_KEY);
      const {error}=await sb.auth.getSession();
      if(error)throw error;
      add('Supabase Auth','ok','Servicio accesible');
      const rpc=await sb.rpc('v2_public_session_meta',{p_code:'000000'});
      if(rpc.error)throw rpc.error;
      add('API TEDVIO','ok','RPC pública accesible');
    }catch(e){add('Conexión con Supabase','fail',e.message)}
  }

  if('serviceWorker' in navigator){
    try{
      const reg=await navigator.serviceWorker.getRegistration();
      add('PWA / Service Worker','ok',reg?'Registrado':'Compatible; se registra al abrir TEDVIO');
    }catch(e){add('PWA / Service Worker','fail',e.message)}
  }else add('PWA / Service Worker','fail','Navegador no compatible');

  const v=document.querySelector('#hlVersion');
  if(v)v.textContent=version?.version||'no disponible';
}

run();
