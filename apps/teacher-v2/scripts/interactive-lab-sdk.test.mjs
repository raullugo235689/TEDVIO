import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MessageChannel } from 'node:worker_threads';
import { PROTOCOL, validateContext, validateAnswers, submission, parseSubmission, validateReceipt, safeCsvCell } from '../../../packages/interactive-lab-sdk/protocol.mjs';
import { attachLabHost } from '../../../packages/interactive-lab-sdk/host.mjs';
import { connectActivity } from '../../../packages/interactive-lab-sdk/activity.mjs';
const context = () => ({ activityId: randomUUID(), versionId: randomUUID(), assignmentId: randomUUID(), attemptId: randomUUID(), version: 1 });
const receipt = (message, overrides = {}) => ({ attempt_id: message.context.attemptId, assignment_id: message.context.assignmentId,
 version_id: message.context.versionId, receipt_id: message.requestId, submitted_at: new Date().toISOString(),
 status: 'verified', score_percent: 75, official_grade: false, ...overrides });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function fakeFrame(origin='https://tedvio.example') {
 const listeners = new Set(), loads = new Set(), parent = {};
 const targetWindow = { parent, addEventListener: (_kind, fn) => listeners.add(fn), removeEventListener: (_kind, fn) => listeners.delete(fn) };
 const fire = event => { for (const listener of [...listeners]) listener(event); };
 const iframe = { getAttribute: () => 'allow-scripts', addEventListener: (_kind, fn) => loads.add(fn), removeEventListener: (_kind, fn) => loads.delete(fn),
  contentWindow: { postMessage(data, target, ports) { assert.equal(target, '*'); fire({ data, ports, origin, source: parent }); } } };
 return { iframe, targetWindow, fire, navigate: () => { for (const fn of [...loads]) fn(); }, parent };
}
async function connected(submit, timeoutMs=200) {
 const frame=fakeFrame(), ctx=context();
 const activityPromise=connectActivity({hostOrigin:'https://tedvio.example',targetWindow:frame.targetWindow,timeoutMs});
 const host=attachLabHost({iframe:frame.iframe,context:ctx,submit,MessageChannelClass:MessageChannel});
 const activity=await activityPromise;
 return { ...frame, ctx, host, activity, close() { activity.close();host.close(); } };
}
test('contrato estricto: identifica versión e intento y no permite nota ni credenciales en el mensaje',()=>{
 const ctx=context(), message=submission(ctx,randomUUID(),{q1:'a',q2:4});
 assert.deepEqual(parseSubmission(message,ctx),message);
 for(const key of ['score','token','teacherSession']) assert.throws(()=>parseSubmission({...message,[key]:'forged'},ctx));
 assert.throws(()=>parseSubmission(message,{...ctx,attemptId:randomUUID()}));
 assert.throws(()=>validateContext({...ctx,version:0}));
 assert.throws(()=>validateContext({...ctx,token:'secret'}));
});
test('respuestas copiadas, límites de tamaño y profundidad y protección de prototipos',()=>{
 const input={q1:{label:'A'}}; const copy=validateAnswers(input);input.q1.label='B';assert.equal(copy.q1.label,'A');
 for(const input of [null,[],{q1:Infinity},{q1:()=>1},JSON.parse('{"__proto__":{"polluted":true}}'),{q1:'x'.repeat(4001)},Object.fromEntries(Array.from({length:101},(_,i)=>['q'+i,0]))]) assert.throws(()=>validateAnswers(input));
 assert.throws(()=>validateAnswers(Object.fromEntries(Array.from({length:30},(_,i)=>['q'+i,'x'.repeat(3000)]))));
});
test('recibo exige identidad de intento, confirmación y separación de nota oficial',()=>{
 const ctx=context(),m=submission(ctx,randomUUID(),{}),r=receipt(m);
 assert.equal(validateReceipt(r,ctx,m.requestId).score_percent,75);
 for(const alteration of [{official_grade:true},{attempt_id:randomUUID()},{receipt_id:randomUUID()},{status:'started'},{score_percent:1000},{score_percent:NaN},{submitted_at:null}])
  assert.throws(()=>validateReceipt({...r,...alteration},ctx,m.requestId));
 assert.equal(validateReceipt(receipt(m,{status:'provisional',score_percent:null}),ctx,m.requestId).status,'provisional');
});
test('el host rechaza un iframe sin aislamiento o con permisos extra',()=>{
 const frame=fakeFrame();
 for(const sandbox of ['', 'allow-scripts allow-same-origin','allow-scripts allow-forms','allow-scripts allow-popups','allow-scripts allow-top-navigation']) {
  frame.iframe.getAttribute=()=>sandbox;
  assert.throws(()=>attachLabHost({iframe:frame.iframe,context:context(),submit:()=>{},MessageChannelClass:MessageChannel}));
 }
});
test('el SDK rechaza bootstrap de otra ventana, otro origen y contexto inválido',async()=>{
 const frame=fakeFrame(),ctx=context(),channel=new MessageChannel();
 const promise=connectActivity({hostOrigin:'https://tedvio.example',targetWindow:frame.targetWindow,timeoutMs:35});
 const data={protocol:PROTOCOL,type:'connect',nonce:randomUUID(),context:ctx};
 frame.fire({source:{},origin:'https://tedvio.example',data,ports:[channel.port1]});
 frame.fire({source:frame.parent,origin:'https://evil.example',data,ports:[channel.port1]});
 frame.fire({source:frame.parent,origin:'https://tedvio.example',data:{...data,context:{...ctx,attemptId:'fake'}},ports:[channel.port1]});
 await assert.rejects(promise,/contexto/);channel.port1.close();channel.port2.close();
 for(const hostOrigin of ['*','https://tedvio.example/path','http://evil.example','null']) assert.throws(()=>connectActivity({hostOrigin,targetWindow:frame.targetWindow}));
});
test('canal dedicado entrega respuestas, espera servidor y no duplica al pulsar dos veces',async()=>{
 let calls=0; const f=await connected(async message=>{calls++;await pause(15);return receipt(message);});
 try { f.activity.answer('q1','a');const first=f.activity.complete(),second=f.activity.complete();assert.strictEqual(first,second);
  const result=await first;assert.equal(result.status,'verified');assert.equal(calls,1);
  assert.deepEqual(await f.activity.complete(),result);assert.equal(calls,1);
  assert.throws(()=>f.activity.answer('q1','b'),/No cambies/);
 } finally { f.close(); }
});
test('fallo de red conserva el mismo identificador y respuestas para reintentar',async()=>{
 const requests=[];const f=await connected(async message=>{requests.push(message);if(requests.length===1)throw Error('network');return receipt(message);});
 try { f.activity.answer('q1','b');await assert.rejects(f.activity.complete(),/confirmó/);
  await f.activity.complete();assert.equal(requests.length,2);assert.deepEqual(requests[0],requests[1]);
 } finally { f.close(); }
});
test('un resultado falsificado del callback no produce una confirmación válida',async()=>{
 const f=await connected(async message=>receipt(message,{official_grade:true}));
 try { await assert.rejects(f.activity.complete(),/confirmó/); } finally { f.close(); }
});
test('cerrar o navegar el iframe revoca el canal y no muestra éxito sin recibo',async()=>{
 const f=await connected(async message=>receipt(message),35);
 try { f.navigate();await assert.rejects(f.activity.complete(),/sin confirmarse/); } finally { f.close(); }
});
test('CSV neutraliza fórmulas y conserva comillas, comas y saltos',()=>{
 assert.equal(safeCsvCell('=SUM(A1:A9)'), '"\'=SUM(A1:A9)"');
 assert.equal(safeCsvCell('\t@cmd'), '"\'\t@cmd"');
 assert.equal(safeCsvCell('A,"B"\nC'),'"A,""B""\nC"');assert.equal(safeCsvCell(null),'""');
});
