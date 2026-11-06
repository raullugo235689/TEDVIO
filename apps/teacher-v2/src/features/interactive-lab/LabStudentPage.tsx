import { useEffect, useRef, useState } from 'react';
import { createLabLearnerAccess, type LabAttempt, type LabReceipt, type LabAccessContext } from '../../core/interactive-lab-api';
import { contextFromAttempt, validateAnswers, validateReceipt } from '../../../../../packages/interactive-lab-sdk/protocol.mjs';
import { ActionDialog } from '../../shared/ActionDialog';
import './interactive-lab.css';
type Pending = { requestId: string; answers: Record<string,unknown> };
type Draft = { attemptId: string; values: Record<string,string>; pending: Pending | null };
function readDraft(key: string): Draft | null { try {const raw=sessionStorage.getItem(key);if(!raw || raw.length>100000)return null;const v=JSON.parse(raw);return typeof v?.attemptId==='string' && v.values && typeof v.values==='object' && !Array.isArray(v.values)?v:null;}catch{return null;} }
export function LabStudentPage() {
  const [code,setCode]=useState(''); const access=useRef<ReturnType<typeof createLabLearnerAccess>|null>(null);
  const [context,setContext]=useState<LabAccessContext|null>(null);const [attempt,setAttempt]=useState<LabAttempt|null>(null);const [receipt,setReceipt]=useState<LabReceipt|null>(null);
  const [values,setValues]=useState<Record<string,string>>({}); const pending=useRef<Pending|null>(null); const [pendingView,setPendingView]=useState(false);
  const key=useRef('');const beginId=useRef(crypto.randomUUID()); const busyRef=useRef(false);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [confirm,setConfirm]=useState(false);
  const [now,setNow]=useState(Date.now());const offset=useRef(0);const [online,setOnline]=useState(navigator.onLine);const [storageWarning,setStorageWarning]=useState(false);
  useEffect(()=>{const handler=()=>setOnline(navigator.onLine);window.addEventListener('online',handler);window.addEventListener('offline',handler);return()=>{window.removeEventListener('online',handler);window.removeEventListener('offline',handler);access.current?.close();};},[]);
  useEffect(()=>{if(!attempt || receipt)return;const id=window.setTimeout(()=>setNow(Date.now()),1000);return()=>window.clearTimeout(id);},[now,attempt,receipt]);
  useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(attempt && !receipt){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[attempt,receipt]);
  function persist(nextValues:Record<string,string>, nextPending:Pending|null) { if(!key.current || !attempt)return; try {sessionStorage.setItem(key.current,JSON.stringify({attemptId:attempt.attempt_id,values:nextValues,pending:nextPending}));}catch{setStorageWarning(true);} }
  async function run(task:()=>Promise<void>) {if(busyRef.current)return;busyRef.current=true;setBusy(true);setError('');try{await task();}catch(e){setError(e instanceof Error?e.message:'No se confirmó la operación. Conserva tus respuestas y reintenta.');}finally{busyRef.current=false;setBusy(false);}}
  async function enter() {const token=code.trim();const next=createLabLearnerAccess(token);try{const ctx=await next.context();access.current?.close();access.current=next;const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));key.current=`tedvio.lab.draft.${Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('')}`;offset.current=Date.parse(ctx.server_time)-Date.now();setContext(ctx);setCode('');}catch(e){next.close();throw e;}}
  async function openAttempt(resumeId?:string) {
    if(!access.current)return;
    const t=resumeId?await access.current.resume(resumeId):await access.current.begin(beginId.current);
    if(t.assignment_id!==context?.assignment_id || !Array.isArray(t.manifest?.questions))throw new Error('El servidor no confirmó esta actividad.');
    offset.current=Date.parse(t.server_time)-Date.now();setAttempt(t);setNow(Date.now());
    const draft=readDraft(key.current);const restored=draft?.attemptId===t.attempt_id?draft:null;
    setValues(restored?.values||{});pending.current=restored?.pending||null;setPendingView(!!pending.current);
    if(t.status!=='started'){ if(!t.receipt_id)throw new Error('Falta el recibo de entrega.');validateReceipt(t,contextFromAttempt(t),t.receipt_id);setReceipt(t);try{sessionStorage.removeItem(key.current);}catch{/* receipt remains authoritative */} }
  }
  async function submit() {
    if(!access.current || !attempt)return;
    if(!pending.current){
      const answers:Record<string,unknown>={};
      for(const q of attempt.manifest.questions){const value=values[q.id]||'';if(q.type==='numeric' && value.trim()){const number=Number(value.replace(',','.'));if(!Number.isFinite(number))throw new Error('Revisa tus respuestas numéricas.');answers[q.id]=number;}else answers[q.id]=value.trim()?value:null;}
      pending.current={requestId:crypto.randomUUID(),answers:validateAnswers(answers)};setPendingView(true);persist(values,pending.current);
    }
    const sent=pending.current;const r=await access.current.submit(attempt.attempt_id,sent.requestId,sent.answers);
    validateReceipt(r,contextFromAttempt(attempt),sent.requestId);setReceipt(r);setConfirm(false);pending.current=null;setPendingView(false);
    try{sessionStorage.removeItem(key.current);}catch{/* server receipt is final */}
  }
  async function refreshReceipt(){if(!access.current || !attempt || !receipt?.receipt_id)return;const r=await access.current.receipt(attempt.attempt_id);validateReceipt(r,contextFromAttempt(attempt),receipt.receipt_id);setReceipt(r);}
  const seconds=attempt?Math.max(0,Math.ceil((Date.parse(attempt.deadline_at)-(now+offset.current))/1000)):0;
  const timeLabel=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
  const canStart=context?.status==='published' && Date.now()+offset.current>=Date.parse(context.opens_at) && Date.now()+offset.current<Date.parse(context.closes_at) && context.attempts_used<context.max_attempts;
  return <main className="lab-student" id="lab-learner-main"><header className="lab-student-brand"><img src="/assets/tedvio_official_horizontal.svg" alt="TEDVIO"/><span>Interactive Lab</span></header>
    {!online?<p role="status" className="lab-error">Sin conexión. Conserva esta pestaña; tus respuestas no están entregadas hasta recibir confirmación.</p>:null}
    {storageWarning?<p role="status" className="lab-error">Este navegador no permitió guardar el borrador temporal. Mantén esta pestaña abierta.</p>:null}
    {!context?<section className="lab-student-card"><span className="eyebrow">ACCESO PERSONAL</span><h1>Tu actividad comienza aquí</h1><p>Pega el código que tu docente te entregó individualmente. No es tu matrícula ni el código de una clase en vivo.</p><form onSubmit={e=>{e.preventDefault();void run(enter);}}><label>Código de acceso<input type="password" autoComplete="off" spellCheck={false} maxLength={64} required value={code} onChange={e=>setCode(e.target.value)}/></label><button className="button primary" disabled={busy || !online}>{busy?'Verificando…':'Verificar acceso'}</button></form></section>
    :!attempt?<section className="lab-student-card"><span className="eyebrow">ACCESO CONFIRMADO</span><h1>{context.title}</h1><p className="lab-instructions">{context.instructions}</p><div className="lab-summary"><div><b>{context.question_count}</b><span>Preguntas</span></div><div><b>{context.max_attempts}</b><span>Intentos máximos</span></div></div><p>{context.duration_seconds?`Duración: ${context.duration_seconds/60} minutos desde que inicias.`:'Sin temporizador individual; debes entregar antes del cierre.'} Cierre: {new Date(context.closes_at).toLocaleString('es-MX')}.</p>
      {context.last_attempt?<button className="button primary" disabled={busy || !online} onClick={()=>void run(()=>openAttempt(context.last_attempt!.attempt_id))}>{context.last_attempt.status==='started'?'Reanudar intento':'Consultar entrega confirmada'}</button>:null}
      {canStart && (!context.last_attempt || context.last_attempt.status!=='started' || Date.parse(context.last_attempt.deadline_at)<=Date.now()+offset.current)?<button className="button secondary" disabled={busy || !online} onClick={()=>void run(()=>openAttempt())}>{context.attempts_used?'Iniciar otro intento':'Iniciar actividad'}</button>:null}
      {!canStart && !context.last_attempt?<p className="lab-note">No se puede iniciar ahora. Revisa la fecha de apertura, cierre y disponibilidad con tu docente.</p>:null}
    </section>:receipt?<section className="lab-student-card lab-receipt" role="status"><span className="lab-receipt-check" aria-hidden="true">✓</span><span className="eyebrow">RECIBO DEL SERVIDOR</span><h1>Entrega confirmada</h1><p>Tu docente puede consultar esta entrega. No necesitas enviarla otra vez.</p><dl><dt>Intento</dt><dd>{receipt.attempt_number}</dd><dt>Fecha de recepción</dt><dd>{new Date(receipt.submitted_at!).toLocaleString('es-MX')}</dd><dt>Puntuación</dt><dd>{receipt.status==='provisional'?'Pendiente de revisión':receipt.score_percent==null?'Tu docente aún no ha habilitado su consulta':`${receipt.score_percent} / 100`}</dd><dt>Recibo</dt><dd className="lab-code">{receipt.receipt_id}</dd></dl><p className="lab-note">Es un resultado de actividad; no una calificación oficial publicada.</p><button className="button secondary" disabled={busy || !online} onClick={()=>void run(refreshReceipt)}>Consultar resultado actualizado</button><button className="button ghost" disabled={busy} onClick={()=>void run(async()=>{if(!access.current)return;setContext(await access.current.context());setAttempt(null);setReceipt(null);setValues({});beginId.current=crypto.randomUUID();})}>Volver a instrucciones</button></section>
    :<section className="lab-student-card"><div className="lab-learner-status"><span>Intento {attempt.attempt_number}</span><span>Tiempo restante: {timeLabel}</span></div><h1>{attempt.manifest.title}</h1><p className="lab-instructions">{attempt.manifest.instructions}</p>
      {seconds===0?<p role="status" className="lab-error">El tiempo terminó. El servidor no aceptará una nueva entrega. Si ya enviaste y no recibiste confirmación, reintenta para recuperar el recibo.</p>:null}
      {attempt.manifest.questions.map((q,i)=><fieldset key={q.id} className="lab-learner-question" disabled={busy || pendingView || seconds===0}><legend>{i+1}. {q.prompt}</legend>{q.type==='choice'?q.options?.map(o=><label className="lab-answer-option" key={o.id}><input type="radio" name={q.id} checked={values[q.id]===o.id} onChange={()=>{const next={...values,[q.id]:o.id};setValues(next);persist(next,null);}}/><span>{o.label}</span></label>):<label>Tu respuesta<input type="text" inputMode={q.type==='numeric'?'decimal':'text'} value={values[q.id]||''} maxLength={q.type==='numeric'?64:4000} onChange={e=>{const next={...values,[q.id]:e.target.value};setValues(next);persist(next,null);}}/></label>}</fieldset>)}
      <button className="button ghost" disabled={busy} onClick={()=>void run(async()=>{if(!access.current)return;setContext(await access.current.context());setAttempt(null);beginId.current=crypto.randomUUID();})}>Volver a instrucciones</button>
      {pendingView?<p className="lab-note">El envío conserva las mismas respuestas y el mismo identificador. Reintentar no crea una segunda entrega.</p>:null}
      <button className="button primary lab-submit" disabled={busy || !online || (seconds===0 && !pendingView)} onClick={()=>{if(pendingView)void run(submit);else setConfirm(true);}}>{busy?'Confirmando con el servidor…':pendingView?'Reintentar entrega':'Finalizar y enviar'}</button>
    </section>}
    {error?<p role="alert" className="lab-error">{error}</p>:null}
    {confirm?<ActionDialog eyebrow="INTERACTIVE LAB" title="¿Enviar tus respuestas?" detail="Las respuestas en blanco se registran sin acierto. Después de confirmar no podrás modificar este intento." confirmLabel="Confirmar entrega" onConfirm={()=>void run(submit)} onDismiss={()=>setConfirm(false)} busy={busy} error={error}/>:null}
    <footer className="lab-student-footer">Tu código no se guarda ni se incluye en el enlace. Los borradores temporales no sustituyen el recibo del servidor.</footer>
  </main>;
}
