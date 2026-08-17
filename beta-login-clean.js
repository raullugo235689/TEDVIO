const LOGIN_LOGO='https://raw.githubusercontent.com/raullugo235689/TEDVIO/main/assets/tedvio_logo_horizontal_650.png?v=20260817-5';
const LOGIN_LOGO_FALLBACK='https://raw.githubusercontent.com/raullugo235689/TEDVIO/main/assets/tedvio_logo_horizontal_650.webp?v=20260817-5';

function cleanTeacherLogin(){
  if(location.hash.startsWith('#join')||location.hash.startsWith('#student')) return;
  const card=document.querySelector('.b-login-card');
  const email=card?.querySelector('#authEmail');
  const pass=card?.querySelector('#authPass');
  if(!card||!email||!pass) return;

  const logo=card.querySelector('.b-login-logo');
  if(logo){
    logo.onerror=()=>{logo.onerror=null;logo.src=LOGIN_LOGO_FALLBACK;};
    if(logo.src!==LOGIN_LOGO) logo.src=LOGIN_LOGO;
    logo.alt='TEDVIO';
    logo.style.display='block';
    logo.style.width='min(360px,82vw)';
    logo.style.maxWidth='100%';
    logo.style.height='auto';
    logo.style.margin='0 auto 30px';
    logo.style.objectFit='contain';
  }

  card.querySelectorAll('h2').forEach(el=>el.remove());
  card.querySelectorAll('p.b-sub').forEach(el=>el.remove());
}

cleanTeacherLogin();
new MutationObserver(cleanTeacherLogin).observe(document.querySelector('#betaApp')||document.body,{childList:true,subtree:true});
