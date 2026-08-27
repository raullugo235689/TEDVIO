import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';

const cfg=window.TEDVIO_CONFIG||{};
const VERSION='2026.08.27.68.3';

function installAuthHandoff(){
  if(!cfg.SUPABASE_URL||!cfg.SUPABASE_PUBLISHABLE_KEY)return;
  const probe=createClient(cfg.SUPABASE_URL,cfg.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const proto=Object.getPrototypeOf(probe.auth);
  if(!proto||proto.__TEDVIO_AUTH_HANDOFF_683__)return;
  const original=proto.onAuthStateChange;
  if(typeof original!=='function')return;

  proto.onAuthStateChange=function(callback){
    if(typeof callback!=='function')return original.call(this,callback);
    const deferred=(event,session)=>{
      setTimeout(()=>{
        try{
          const result=callback(event,session);
          if(result&&typeof result.catch==='function')result.catch(error=>console.error('TEDVIO auth callback',error));
        }catch(error){console.error('TEDVIO auth callback',error)}
      },0);
      return undefined;
    };
    return original.call(this,deferred);
  };
  Object.defineProperty(proto,'__TEDVIO_AUTH_HANDOFF_683__',{value:true,configurable:false,enumerable:false,writable:false});
  window.__TEDVIO_AUTH_HANDOFF683__={enabled:true,version:VERSION};
}

installAuthHandoff();

document.addEventListener('click',event=>{
  const button=event.target.closest?.('#authLogin');
  if(!button)return;
  const email=document.querySelector('#authEmail')?.value.trim();
  const password=document.querySelector('#authPass')?.value||'';
  if(!email||!password)return;
  const original=button.textContent||'Entrar';
  requestAnimationFrame(()=>{
    if(!button.isConnected)return;
    button.dataset.tvAuthOriginal=original;
    button.textContent='Entrando…';
    button.setAttribute('aria-busy','true');
  });
  setTimeout(()=>{
    if(!button.isConnected)return;
    button.textContent=button.dataset.tvAuthOriginal||'Entrar';
    button.removeAttribute('aria-busy');
  },12000);
},true);

document.addEventListener('keydown',event=>{
  if(event.key!=='Enter'||event.target?.id!=='authPass')return;
  event.preventDefault();
  document.querySelector('#authLogin')?.click();
});
