const TARGET='./assets/tedvio_logo_horizontal_650.png';

function cleanTeacherLogin(){
  if(location.hash.startsWith('#join')||location.hash.startsWith('#student')) return;
  const card=document.querySelector('.b-login-card');
  const email=card?.querySelector('#authEmail');
  const pass=card?.querySelector('#authPass');
  if(!card||!email||!pass) return;

  const logo=card.querySelector('.b-login-logo');
  if(logo){
    logo.src=TARGET;
    logo.alt='TEDVIO';
    logo.style.width='min(330px,78vw)';
    logo.style.height='auto';
    logo.style.margin='0 auto 28px';
  }

  card.querySelectorAll('h2').forEach(el=>el.remove());
  card.querySelectorAll('p.b-sub').forEach(el=>el.remove());
}

cleanTeacherLogin();
new MutationObserver(cleanTeacherLogin).observe(document.querySelector('#betaApp')||document.body,{childList:true,subtree:true});
