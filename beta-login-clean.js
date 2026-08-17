function cleanTeacherLogin(){
 const card=document.querySelector('.b-login-card');
 if(!card||!card.querySelector('#authEmail')||location.hash.startsWith('#join')||location.hash.startsWith('#student'))return;
 card.querySelectorAll('h2,p.b-sub,.b-login-logo,.tedvio-login-brand').forEach(x=>x.remove());
 const b=document.createElement('div');b.className='tedvio-login-brand';
 b.innerHTML='<div class="tvmark"><i></i><b>T</b></div><div class="tvname"><strong>TEDVIO</strong><small>INTERACCIÓN EDUCATIVA EN TIEMPO REAL</small></div>';
 card.prepend(b);
}
const st=document.createElement('style');st.textContent='.tedvio-login-brand{display:flex;align-items:center;justify-content:center;gap:12px;margin:0 auto 30px;width:100%;color:#071a3b}.tvmark{width:72px;height:72px;flex:0 0 72px;position:relative;display:grid;place-items:center}.tvmark i{position:absolute;inset:2px;border:7px solid #1f5eff;border-right-color:#57b7ff;border-bottom-color:#071a3b;border-radius:50%;transform:rotate(-15deg)}.tvmark b{font:900 48px Arial;z-index:1}.tvname{position:relative;padding-bottom:18px;white-space:nowrap}.tvname strong{font:900 clamp(38px,10vw,58px)/1 Arial;letter-spacing:1px}.tvname small{position:absolute;left:1px;bottom:0;color:#1f5eff;font:800 clamp(6px,1.5vw,9px) Arial;letter-spacing:1.7px}@media(max-width:480px){.tedvio-login-brand{gap:8px}.tvmark{width:58px;height:58px;flex-basis:58px}.tvmark i{border-width:5px}.tvmark b{font-size:39px}.tvname strong{font-size:clamp(31px,10vw,44px)}.tvname small{font-size:6px;letter-spacing:1px}}';document.head.appendChild(st);
cleanTeacherLogin();new MutationObserver(cleanTeacherLogin).observe(document.querySelector('#betaApp')||document.body,{childList:true,subtree:true});
