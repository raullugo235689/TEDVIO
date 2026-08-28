(()=>{
  const VERSION='2026.08.28.68.9';
  const pending=new Map();
  const wrapped=new Map();
  const XLSX_URLS=['https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'];
  const PDF_URLS=['https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js','https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js'];
  const AUTOTABLE_URLS=['https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js','https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js'];
  function load(src){if(pending.has(src))return pending.get(src);const p=new Promise(resolve=>{const existing=[...document.scripts].find(s=>s.src===src);if(existing){if(existing.dataset.tvLoaded==='1'||existing.readyState==='complete')return resolve(true);existing.addEventListener('load',()=>resolve(true),{once:true});existing.addEventListener('error',()=>resolve(false),{once:true});return}const s=document.createElement('script');s.src=src;s.async=true;s.dataset.tedvioExport='689';s.onload=()=>{s.dataset.tvLoaded='1';resolve(true)};s.onerror=()=>resolve(false);document.head.appendChild(s)});pending.set(src,p);return p}
  async function first(urls,check){if(check())return true;for(const url of urls){await load(url);if(check())return true}return false}
  async function ensureExcel(){return first(XLSX_URLS,()=>!!window.XLSX?.utils)}
  async function ensurePdf(){const pdf=await first(PDF_URLS,()=>!!window.jspdf?.jsPDF);if(!pdf)return false;return first(AUTOTABLE_URLS,()=>!!window.jspdf?.jsPDF?.API?.autoTable)}
  async function ensure(kind='all'){if(kind==='excel')return ensureExcel();if(kind==='pdf')return ensurePdf();const[e,p]=await Promise.all([ensureExcel(),ensurePdf()]);return e&&p}
  function gated(){return window.TEDVIO_ENTITLEMENTS?.features?.exports===false}
  function wrap(name,kind){const current=window[name];if(typeof current!=='function'||current.__tedvioExport689)return;const original=current;const fn=async function(...args){if(gated()){if(typeof window.tv63OpenPlan==='function')window.tv63OpenPlan();return}let ok=false;try{ok=await ensure(kind)}catch(e){console.error('TEDVIO export runtime',e)}if(!ok){alert(kind==='excel'?'No pude cargar el exportador de Excel. Revisa tu conexión e intenta otra vez.':'No pude cargar el exportador PDF. Revisa tu conexión e intenta otra vez.');return}return original.apply(this,args)};fn.__tedvioExport689=true;fn.__tedvioExportOriginal=original;window[name]=fn;wrapped.set(name,kind)}
  function wrapKnown(){wrap('tvAttExportExcel','excel');wrap('tvAttExportPdf','pdf');wrap('ga61Excel','excel');wrap('ga61Pdf','pdf');wrap('tv66Export','excel');wrap('qs65ExportSelected','excel');wrap('qs65Template','excel');wrap('peExportResults','all')}
  window.addEventListener('tedvio:feature-ready',()=>queueMicrotask(wrapKnown));
  wrapKnown();
  window.tvEnsureExports=ensure;
  window.__TEDVIO_EXPORTS689__={version:VERSION,ensure,wrapKnown,get wrapped(){return[...wrapped.entries()]}};
})();
