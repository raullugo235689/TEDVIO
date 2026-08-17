(()=>{
  const HORIZONTAL='./assets/tedvio_official_horizontal.svg?v=21';
  const ISOTIPO='./assets/tedvio_official_isotipo.svg?v=21';

  function installStyles(){
    if(document.getElementById('tedvio-brand-v2-style')) return;
    const style=document.createElement('style');
    style.id='tedvio-brand-v2-style';
    style.textContent=`
      #teacherBrandBar{display:none!important}
      #teacherLoginTitle{display:none!important}

      /* Acceso TEDVIO */
      .b-login.tv-login-v2{
        min-height:100vh!important;
        display:grid!important;
        grid-template-columns:minmax(0,650px) minmax(390px,470px)!important;
        justify-content:center!important;
        align-content:center!important;
        align-items:center!important;
        gap:clamp(38px,6vw,92px)!important;
        padding:max(42px,env(safe-area-inset-top)) clamp(28px,5vw,72px) max(42px,env(safe-area-inset-bottom))!important;
        background:
          radial-gradient(circle at 9% 8%,rgba(72,166,255,.18),transparent 28%),
          radial-gradient(circle at 88% 88%,rgba(30,91,255,.10),transparent 30%),
          linear-gradient(135deg,#f9fcff 0%,#eef5ff 48%,#f7f9fc 100%)!important;
        overflow:auto!important;
      }
      body.teacher-login-visible .b-login.tv-login-v2{padding:max(42px,env(safe-area-inset-top)) clamp(28px,5vw,72px) max(42px,env(safe-area-inset-bottom))!important}
      .b-login.tv-login-v2:before{width:420px!important;height:420px!important;background:#7dd3fc!important;opacity:.16!important;top:-220px!important;right:-170px!important}
      .b-login.tv-login-v2:after{width:330px!important;height:330px!important;background:#1e5bff!important;opacity:.08!important;bottom:-170px!important;left:-130px!important}

      .tv-login-showcase{position:relative;z-index:2;max-width:650px;color:#0a1b3d}
      .tv-login-showcase-logo{display:block;width:min(420px,82%);height:auto;margin:0 0 42px}
      .tv-login-kicker{display:inline-flex;align-items:center;gap:8px;background:#fff;border:1px solid #dbe7f7;border-radius:999px;padding:8px 13px;font-size:12px;font-weight:850;color:#1e5bff;box-shadow:0 8px 26px rgba(10,27,61,.05);margin-bottom:20px}
      .tv-login-kicker:before{content:"";width:8px;height:8px;border-radius:50%;background:linear-gradient(135deg,#1e5bff,#48a6ff);box-shadow:0 0 0 4px rgba(30,91,255,.09)}
      .tv-login-showcase h1{font-size:clamp(42px,5vw,64px);line-height:1.02;letter-spacing:-.045em;margin:0 0 20px;color:#0a1b3d;max-width:620px}
      .tv-login-showcase>p{font-size:18px;line-height:1.62;color:#53627a;max-width:590px;margin:0 0 30px}
      .tv-login-features{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;max-width:620px}
      .tv-login-feature{background:rgba(255,255,255,.78);border:1px solid #dfe8f4;border-radius:18px;padding:16px;box-shadow:0 12px 34px rgba(10,27,61,.05);backdrop-filter:blur(10px)}
      .tv-login-feature-icon{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;background:linear-gradient(135deg,#eef4ff,#f5fbff);color:#1e5bff;font-weight:900;margin-bottom:12px;border:1px solid #dbe8ff}
      .tv-login-feature strong{display:block;color:#0a1b3d;font-size:14px;margin-bottom:4px}
      .tv-login-feature span{display:block;color:#6b7280;font-size:12px;line-height:1.4}

      body.teacher-login-visible .b-login.tv-login-v2 .b-login-card,
      .b-login.tv-login-v2 .b-login-card{
        width:100%!important;
        max-width:470px!important;
        padding:34px!important;
        border-radius:26px!important;
        background:rgba(255,255,255,.98)!important;
        border:1px solid #e0e8f3!important;
        box-shadow:0 28px 80px rgba(10,27,61,.14)!important;
      }
      .b-login.tv-login-v2 .b-login-card>.b-login-logo,
      .b-login.tv-login-v2 .b-login-card>h2,
      .b-login.tv-login-v2 .b-login-card>p.b-sub,
      .b-login.tv-login-v2 #teacherLoginTitle{display:none!important}
      .tv-login-card-head{text-align:center;margin-bottom:24px}
      .tv-login-card-mark{display:grid;place-items:center;width:68px;height:68px;margin:0 auto 14px;border-radius:20px;background:#fff;border:1px solid #e1e9f4;box-shadow:0 12px 30px rgba(10,27,61,.08)}
      .tv-login-card-mark img{width:58px!important;height:58px!important;object-fit:contain!important;display:block!important}
      .tv-login-card-head h2{display:block!important;margin:0 0 7px!important;font-size:28px!important;color:#0a1b3d!important;letter-spacing:-.025em!important}
      .tv-login-card-head p{margin:0;color:#6b7280;font-size:14px;line-height:1.45}
      .b-login.tv-login-v2 .b-field{margin:15px 0!important}
      .b-login.tv-login-v2 .b-field label{font-size:13px!important;color:#42516a!important;margin-bottom:7px!important}
      .b-login.tv-login-v2 .b-field input{min-height:51px!important;border-radius:14px!important;border:1px solid #d8e2ef!important;padding:13px 14px!important;background:#fbfdff!important}
      .b-login.tv-login-v2 .b-field input:focus{background:#fff!important;border-color:#78a7ff!important;box-shadow:0 0 0 4px rgba(30,91,255,.09)!important}
      .b-login.tv-login-v2 .b-login-card>.b-row{display:grid!important;grid-template-columns:1fr!important;gap:10px!important;margin-top:20px!important}
      .b-login.tv-login-v2 .b-login-card>.b-row .b-btn{width:100%!important;min-height:50px!important;border-radius:14px!important;font-size:14px!important}
      .tv-login-security{display:flex;justify-content:center;align-items:center;gap:7px;color:#8490a3;font-size:11px;margin-top:18px}
      .tv-login-security:before{content:"✓";display:grid;place-items:center;width:18px;height:18px;border-radius:50%;background:#ecfdf3;color:#15803d;font-weight:900}

      /* Identidad compacta del panel */
      .b-top .b-brand{width:58px!important;min-width:58px!important;height:58px!important;padding:4px!important;border-radius:17px!important;background:#fff!important;border:1px solid rgba(255,255,255,.22)!important;box-shadow:0 8px 24px rgba(0,0,0,.15)!important;overflow:hidden!important;display:grid!important;place-items:center!important}
      .b-top .b-brand img{display:block!important;width:50px!important;height:50px!important;max-width:none!important;max-height:none!important;object-fit:contain!important;object-position:center!important;filter:none!important;opacity:1!important;visibility:visible!important}

      @media(max-width:980px){
        .b-login.tv-login-v2{grid-template-columns:1fr!important;gap:28px!important;justify-items:center!important;padding:34px 22px!important}
        body.teacher-login-visible .b-login.tv-login-v2{padding:34px 22px!important}
        .tv-login-showcase{text-align:center;max-width:620px}
        .tv-login-showcase-logo{width:min(360px,78vw);margin:0 auto 24px}
        .tv-login-showcase h1{font-size:42px;margin-left:auto;margin-right:auto}
        .tv-login-showcase>p{font-size:16px;margin-left:auto;margin-right:auto}
        .tv-login-features{margin:0 auto}
        .b-login.tv-login-v2 .b-login-card{max-width:520px!important}
      }
      @media(max-width:680px){
        .b-login.tv-login-v2{padding:24px 16px 30px!important;gap:22px!important}
        body.teacher-login-visible .b-login.tv-login-v2{padding:24px 16px 30px!important}
        .tv-login-showcase-logo{width:min(310px,80vw);margin-bottom:18px}
        .tv-login-kicker{margin-bottom:13px}
        .tv-login-showcase h1{font-size:34px;margin-bottom:12px}
        .tv-login-showcase>p{font-size:14px;line-height:1.5;margin-bottom:18px}
        .tv-login-features{grid-template-columns:1fr 1fr 1fr;gap:7px}
        .tv-login-feature{padding:10px 8px;border-radius:14px;text-align:left}
        .tv-login-feature-icon{width:28px;height:28px;border-radius:9px;margin-bottom:7px}
        .tv-login-feature strong{font-size:11px}
        .tv-login-feature span{display:none}
        body.teacher-login-visible .b-login.tv-login-v2 .b-login-card,.b-login.tv-login-v2 .b-login-card{padding:24px 20px!important;border-radius:22px!important}
        .tv-login-card-head{margin-bottom:18px}
        .tv-login-card-mark{width:58px;height:58px;border-radius:17px;margin-bottom:10px}
        .tv-login-card-mark img{width:50px!important;height:50px!important}
        .tv-login-card-head h2{font-size:24px!important}
        .b-top .b-brand{width:50px!important;min-width:50px!important;height:50px!important;border-radius:15px!important}
        .b-top .b-brand img{width:43px!important;height:43px!important}
      }
    `;
    document.head.appendChild(style);
  }

  function decorateLogin(){
    const login=document.querySelector('#betaApp .b-login');
    const card=login?.querySelector('.b-login-card');
    if(!login||!card||!card.querySelector('#authEmail')||!card.querySelector('#authPass')) return;

    login.classList.add('tv-login-v2');

    if(!login.querySelector('.tv-login-showcase')){
      const showcase=document.createElement('section');
      showcase.className='tv-login-showcase';
      showcase.innerHTML=`
        <img class="tv-login-showcase-logo" src="${HORIZONTAL}" alt="TEDVIO">
        <div class="tv-login-kicker">Plataforma educativa</div>
        <h1>Interacción educativa en tiempo real.</h1>
        <p>Crea sesiones, organiza tus grupos, pasa asistencia y analiza el aprendizaje desde un solo espacio docente.</p>
        <div class="tv-login-features">
          <div class="tv-login-feature"><div class="tv-login-feature-icon">▶</div><strong>Sesiones en vivo</strong><span>Participación y evaluación inmediata.</span></div>
          <div class="tv-login-feature"><div class="tv-login-feature-icon">✓</div><strong>Grupos y asistencia</strong><span>Padrón, matrícula e historial por fecha.</span></div>
          <div class="tv-login-feature"><div class="tv-login-feature-icon">↗</div><strong>Analítica de clase</strong><span>Resultados y seguimiento del desempeño.</span></div>
        </div>`;
      login.insertBefore(showcase,card);
    }

    if(!card.querySelector('.tv-login-card-head')){
      const head=document.createElement('div');
      head.className='tv-login-card-head';
      head.innerHTML=`<div class="tv-login-card-mark"><img src="${ISOTIPO}" alt="TEDVIO"></div><h2>Acceso docente</h2><p>Ingresa a tu espacio de trabajo en TEDVIO.</p>`;
      card.prepend(head);
    }

    const email=card.querySelector('#authEmail');
    const pass=card.querySelector('#authPass');
    if(email&&!email.placeholder) email.placeholder='tu@correo.com';
    if(pass&&!pass.placeholder) pass.placeholder='Tu contraseña';

    if(!card.querySelector('.tv-login-security')){
      const secure=document.createElement('div');
      secure.className='tv-login-security';
      secure.textContent='Acceso seguro para docentes';
      card.appendChild(secure);
    }
  }

  function decoratePanelBrand(){
    const brand=document.querySelector('#betaApp .b-top .b-brand');
    const img=brand?.querySelector('img');
    if(!brand||!img) return;
    if(!img.getAttribute('src')?.includes('tedvio_official_isotipo.svg')) img.setAttribute('src',ISOTIPO);
    img.setAttribute('alt','TEDVIO');
    brand.setAttribute('title','TEDVIO');
    brand.setAttribute('aria-label','TEDVIO');
  }

  function sync(){
    installStyles();
    decorateLogin();
    decoratePanelBrand();
  }

  const start=()=>{
    sync();
    const root=document.getElementById('betaApp');
    if(root){
      new MutationObserver(sync).observe(root,{childList:true});
    }
    window.addEventListener('hashchange',()=>requestAnimationFrame(sync));
  };

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();