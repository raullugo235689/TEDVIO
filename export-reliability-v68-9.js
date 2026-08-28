const VERSION='2026.08.27.68.9';
const boot=window.__TEDVIO_PROGRESSIVE_BOOT68__;
let preparing=null;

function exportsAllowed(){return window.TEDVIO_ENTITLEMENTS?.features?.exports!==false}
function readyExcel(){return !!window.XLSX?.utils}
function readyPdf(){return !!window.jspdf?.jsPDF}
function readyAll(){return readyExcel()&&readyPdf()}

async function prepare(){
  if(readyAll())return true;
  if(!boot?.ensure)return false;
  if(!preparing){
    preparing=Promise.resolve(boot.ensure('exports')).then(()=>readyAll()).catch(error=>{console.warn('TEDVIO v68.9 export preload',error);return false}).finally(()=>{if(!readyAll())preparing=null});
  }
  return preparing;
}

function warm(){
  if(!exportsAllowed()||readyAll())return;
  const run=()=>{prepare()};
  if('requestIdleCallback'in window)requestIdleCallback(run,{timeout:1800});
  else setTimeout(run,280);
}

function planGate(){
  if(exportsAllowed())return false;
  window.tv63OpenPlan?.();
  return true;
}

function retryMessage(kind,ok){
  if(ok)alert(`Exportador ${kind} listo. Pulsa ${kind} nuevamente para descargar.`);
  else alert(`No se pudo cargar el exportador ${kind}. Revisa tu conexión e inténtalo de nuevo.`);
}

const attendanceOpen=window.tvAttendanceProOpen;
if(typeof attendanceOpen==='function'&&!attendanceOpen.__tv689){
  const wrapped=async function(...args){const result=await attendanceOpen.apply(this,args);warm();return result};
  wrapped.__tv689=true;
  window.tvAttendanceProOpen=wrapped;
}

const excel=window.tvAttExportExcel;
if(typeof excel==='function'&&!excel.__tv689){
  const wrapped=function(...args){
    if(planGate())return;
    if(readyExcel())return excel.apply(this,args);
    prepare().then(ok=>retryMessage('Excel',ok&&readyExcel()));
  };
  wrapped.__tv689=true;
  window.tvAttExportExcel=wrapped;
}

const pdf=window.tvAttExportPdf;
if(typeof pdf==='function'&&!pdf.__tv689){
  const wrapped=function(...args){
    if(planGate())return;
    if(readyPdf())return pdf.apply(this,args);
    prepare().then(ok=>retryMessage('PDF',ok&&readyPdf()));
  };
  wrapped.__tv689=true;
  window.tvAttExportPdf=wrapped;
}

window.__TEDVIO_EXPORT689__={version:VERSION,prepare,get ready(){return readyAll()}};
