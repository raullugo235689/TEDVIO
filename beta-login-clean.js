function installTedvioBrand(){
  if(location.hash.startsWith('#join')||location.hash.startsWith('#student')) return false;
  const card=document.querySelector('.b-login-card');
  if(!card||!card.querySelector('#authEmail')) return false;

  card.querySelectorAll('h2,p.b-sub,.b-login-logo').forEach(el=>el.remove());
  if(card.querySelector('.tedvio-login-brand')) return true;

  const brand=document.createElement('div');
  brand.className='tedvio-login-brand';
  brand.setAttribute('aria-label','TEDVIO — Interacción educativa en tiempo real');
  brand.innerHTML=`
    <div class="tvmark" aria-hidden="true"><span class="tvring"></span><span class="tvletter">T</span></div>
    <div class="tvword"><strong><span>TED</span>VIO</strong><small>INTERACCIÓN EDUCATIVA EN TIEMPO REAL</small></div>`;
  card.prepend(brand);
  return true;
}

const style=document.createElement('style');
style.textContent=`
.tedvio-login-brand{display:flex!important;visibility:visible!important;opacity:1!important;align-items:center;justify-content:center;gap:13px;width:100%;min-height:86px;margin:0 auto 28px;color:#071a3b}
.tvmark{width:76px;height:76px;min-width:76px;position:relative;display:grid;place-items:center}
.tvring{position:absolute;inset:3px;border:7px solid #1769ff;border-right-color:#59b7ff;border-bottom-color:#071a3b;border-radius:50%;transform:rotate(-18deg)}
.tvletter{position:relative;z-index:2;font:900 50px/1 Arial,Helvetica,sans-serif;color:#071a3b}
.tvword{position:relative;padding-bottom:20px;white-space:nowrap}
.tvword strong{display:block;font:900 55px/.9 Arial,Helvetica,sans-serif;letter-spacing:-1.5px;color:#071a3b}
.tvword strong span{color:#1769ff}
.tvword small{position:absolute;left:1px;bottom:0;font:800 8px/1 Arial,Helvetica,sans-serif;letter-spacing:1.6px;color:#1769ff}
@media(max-width:520px){.tedvio-login-brand{gap:8px;min-height:68px}.tvmark{width:58px;height:58px;min-width:58px}.tvring{border-width:5px}.tvletter{font-size:39px}.tvword{padding-bottom:17px}.tvword strong{font-size:42px}.tvword small{font-size:6px;letter-spacing:1px}}
`;
document.head.appendChild(style);

let tries=0;
const timer=setInterval(()=>{
  tries++;
  if(installTedvioBrand()||tries>=40) clearInterval(timer);
},100);
installTedvioBrand();
