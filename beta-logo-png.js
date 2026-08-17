const TEDVIO_LOGO = 'https://raw.githubusercontent.com/raullugo235689/TEDVIO/main/assets/tedvio_logo_horizontal_650.png?v=20260817-5';
const TEDVIO_LOGO_FALLBACK = 'https://raw.githubusercontent.com/raullugo235689/TEDVIO/main/assets/tedvio_logo_horizontal_650.webp?v=20260817-5';

function useTedvioLogo(){
  document.querySelectorAll('img[src*="tedvio_logo_horizontal_650"]').forEach(img=>{
    if(img.dataset.tedvioLogoPatched==='1') return;
    img.dataset.tedvioLogoPatched='1';
    img.onerror=()=>{
      img.onerror=null;
      img.src=TEDVIO_LOGO_FALLBACK;
    };
    img.src=TEDVIO_LOGO;
  });
}

useTedvioLogo();
new MutationObserver(useTedvioLogo).observe(document.querySelector('#betaApp')||document.body,{childList:true,subtree:true});
