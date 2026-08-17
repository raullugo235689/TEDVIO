const LOGIN_LOGO='https://raw.githubusercontent.com/raullugo235689/TEDVIO/main/assets/tedvio_logo_horizontal_650.png?v=20260817-6';

function cleanTeacherLogin(){
  if(location.hash.startsWith('#join')||location.hash.startsWith('#student')) return;
  const card=document.querySelector('.b-login-card');
  const email=card?.querySelector('#authEmail');
  const pass=card?.querySelector('#authPass');
  if(!card||!email||!pass) return;
  let logo=card.querySelector('.b-login-logo');
  if(!logo){logo=document.createElement('img');logo.className='b-login-logo';card.prepend(logo);}
  logo.src=LOGIN_LOGO;
  logo.alt='TEDVIO';
  Object.assign(logo.style,{display:'block',width:'min(540px,88vw)',maxWidth:'100%',height:'auto',objectFit:'contain',margin:'0 auto 32px'});
  card.querySelectorAll('h2,p.b-sub').forEach(el=>el.remove());
}
cleanTeacherLogin();
new MutationObserver(cleanTeacherLogin).observe(document.querySelector('#betaApp')||document.body,{childList:true,subtree:true});
