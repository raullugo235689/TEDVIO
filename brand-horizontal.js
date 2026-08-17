function applyHorizontalBrand(){
  document.querySelectorAll('.join-card').forEach(card=>{
    const first=card.firstElementChild;
    if(!first || first.dataset.tedvioHorizontal==='1') return;
    const iso=first.querySelector?.('img[src*="tedvio_isotipo_1024.png"]');
    const text=[...first.querySelectorAll?.('div')||[]].find(el=>el.textContent?.trim()==='TEDVIO');
    if(!iso || !text) return;
    first.dataset.tedvioHorizontal='1';
    first.innerHTML='<img src="./assets/tedvio_logo_horizontal_2000.png" alt="TEDVIO" style="width:min(310px,78vw);height:auto;display:block;margin:0 auto;object-fit:contain">';
    first.style.margin='0 auto 20px';
  });
}

applyHorizontalBrand();
const observer=new MutationObserver(()=>applyHorizontalBrand());
observer.observe(document.querySelector('#app'),{childList:true,subtree:true});
