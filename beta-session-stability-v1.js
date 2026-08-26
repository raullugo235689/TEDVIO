(()=>{
  const d=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML');
  if(!d?.get||!d?.set)return;
  const nativeGet=d.get,nativeSet=d.set;

  function installStableQR(){
    const NativeQR=window.QRCode;
    if(typeof NativeQR!=='function')return;
    function StableQR(el,opts){
      const node=typeof el==='string'?document.getElementById(el):el;
      if(node?.id==='sessionQR'){
        const text=String(opts?.text||'');
        if(node.dataset.tvQrText===text&&node.dataset.tvQrReady==='1'&&node.childNodes.length)return node.__tvQrInstance||{};
        node.dataset.tvQrReady='0';
        nativeSet.call(node,'');
        const inst=new NativeQR(node,opts);
        node.dataset.tvQrText=text;
        node.dataset.tvQrReady='1';
        node.__tvQrInstance=inst;
        return inst;
      }
      return new NativeQR(el,opts);
    }
    StableQR.prototype=NativeQR.prototype;
    Object.keys(NativeQR).forEach(k=>{try{StableQR[k]=NativeQR[k]}catch{}});
    if(NativeQR.CorrectLevel)StableQR.CorrectLevel=NativeQR.CorrectLevel;
    window.QRCode=StableQR;
  }

  // v64 no longer needs to patch Element.prototype.innerHTML globally. The live
  // classroom is driven by Realtime and the legacy poll is only a slow fallback.
  if(window.__TEDVIO_RUNTIME64__?.enabled){
    installStableQR();
    document.documentElement.dataset.tvInnerHtmlPatch='retired-v64';
    return;
  }

  function html(el){try{return nativeGet.call(el)}catch{return''}}
  function setIfChanged(el,value){if(el&&html(el)!==value)nativeSet.call(el,value)}
  function patchWaiting(main,value){
    const cur=main.firstElementChild;
    if(!cur?.classList?.contains('b-wait')||!String(value).includes('b-wait'))return false;
    const t=document.createElement('template');nativeSet.call(t,String(value));
    const next=t.content.firstElementChild;
    if(!next?.classList?.contains('b-wait'))return false;
    const curCode=cur.querySelector('.b-code')?.textContent?.trim()||'',nextCode=next.querySelector('.b-code')?.textContent?.trim()||'';
    if(!curCode||curCode!==nextCode)return false;
    const curLeft=cur.children?.[0],nextLeft=next.children?.[0];
    if(curLeft&&nextLeft){const a=curLeft.querySelector('.b-row'),b=nextLeft.querySelector('.b-row');if(a&&b)setIfChanged(a,html(b))}
    const curCard=cur.querySelector('.b-card'),nextCard=next.querySelector('.b-card');
    if(curCard&&nextCard)setIfChanged(curCard,html(nextCard));
    return true;
  }
  Object.defineProperty(Element.prototype,'innerHTML',{
    configurable:d.configurable,enumerable:d.enumerable,get:d.get,
    set:function(value){
      if(this.id==='sessionQR'&&value===''&&this.dataset.tvQrReady==='1'&&this.childNodes.length)return;
      if(this.id==='sessionMain'&&patchWaiting(this,value))return;
      return nativeSet.call(this,value);
    }
  });
  installStableQR();
})();
