import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const cfg=window.TEDVIO_CONFIG||{};
const sb=createClient(cfg.SUPABASE_URL,cfg.SUPABASE_PUBLISHABLE_KEY);
const redirectTo=`${location.origin}/beta.html#teacher`;

document.addEventListener('click',async e=>{
  const btn=e.target.closest?.('#authSignup');
  if(!btn)return;
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  const email=document.querySelector('#authEmail')?.value.trim();
  const password=document.querySelector('#authPass')?.value||'';
  if(!email||password.length<6){alert('Usa un correo válido y una contraseña de al menos 6 caracteres.');return}
  btn.disabled=true;
  const original=btn.textContent;
  btn.textContent='Creando…';
  try{
    const {data,error}=await sb.auth.signUp({email,password,options:{emailRedirectTo:redirectTo}});
    if(!error&&data?.session){location.href=redirectTo;location.reload();return}
    if(!error){alert('Cuenta creada. Revisa el correo de confirmación. Al abrir el enlace debes regresar a TEDVIO.');return}
    const login=await sb.auth.signInWithPassword({email,password});
    if(!login.error&&login.data?.session){location.href=redirectTo;location.reload();return}
    if(/already|registered|exists|duplicate|unexpected_failure|database error/i.test(error.message||'')){
      alert('Esa cuenta ya fue creada. Usa el botón Entrar con el mismo correo y contraseña.');
      return;
    }
    alert(error.message||'No se pudo crear la cuenta.');
  }finally{
    btn.disabled=false;
    btn.textContent=original;
  }
},true);
