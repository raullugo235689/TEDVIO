const TEDVIO_PNG = './assets/tedvio_logo_horizontal_650.png';

function usePngLogo(){
  document.querySelectorAll('img[src*="tedvio_logo_horizontal_650.webp"]').forEach(img=>{
    if(img.getAttribute('src')!==TEDVIO_PNG) img.setAttribute('src',TEDVIO_PNG);
  });
}

usePngLogo();
new MutationObserver(usePngLogo).observe(document.querySelector('#betaApp')||document.body,{childList:true,subtree:true});
