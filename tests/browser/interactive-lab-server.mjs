/** Isolated SDK browser fixture. No credentials, real students or application API. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const port=4189,origin=`http://127.0.0.1:${port}`;
const host=`<!doctype html><meta charset="utf-8"><title>SDK: ensayo aislado</title><h1>Ensayo técnico, no interfaz de producción</h1><iframe title="Actividad sintética" sandbox="allow-scripts"></iframe><script type="module" src="/host-fixture.mjs"></script>`;
const activity=`<!doctype html><meta charset="utf-8"><h1>Actividad sintética</h1><p id="state">Conectando</p><script type="module" src="/activity-fixture.mjs"></script>`;
const hostScript=`import {attachLabHost} from '/sdk/host.mjs';
 const context={activityId:crypto.randomUUID(),versionId:crypto.randomUUID(),assignmentId:crypto.randomUUID(),attemptId:crypto.randomUUID(),version:1};
 const frame=document.querySelector('iframe');window.fixture={calls:0,complete:false};
 frame.addEventListener('load',()=>{window.labHost=attachLabHost({iframe:frame,context,submit:async message=>{
  window.fixture.calls++;window.fixture.message=message;
  const receipt={attempt_id:context.attemptId,assignment_id:context.assignmentId,version_id:context.versionId,receipt_id:message.requestId,status:'verified',score_percent:null,submitted_at:new Date().toISOString(),official_grade:false};
  window.fixture.complete=true;return receipt;}});},{once:true});frame.src='/activity';`;
const activityScript=`import {connectActivity} from '/sdk/activity.mjs';
 async function run(){const connecting=connectActivity({hostOrigin:'${origin}',timeoutMs:3000});
 window.probes={};try{parent.document.body;window.probes.parent='accessible';}catch{window.probes.parent='blocked';}
 try{localStorage.getItem('test');window.probes.storage='accessible';}catch{window.probes.storage='blocked';}
 try{await fetch('${origin}/forbidden-network');window.probes.network='accessible';}catch{window.probes.network='blocked';}
 const sdk=await connecting;window.labSDK=sdk;
 sdk.answer('q1','a');sdk.answer('q2',4);window.probes.receipt=await sdk.complete();window.probes.again=await sdk.complete();
 document.querySelector('#state').textContent='Recibo validado';}run();`;
const csp=`default-src 'none'; script-src ${origin}; style-src 'none'; connect-src 'none'; img-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
let forbiddenRequests=0;
http.createServer((req,res)=>{
 const url=new URL(req.url,origin);res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 if(url.pathname==='/') {res.setHeader('Content-Type','text/html');return res.end(host);}
 if(url.pathname==='/activity'){res.setHeader('Content-Type','text/html');res.setHeader('Content-Security-Policy',csp);return res.end(activity);}
 if(url.pathname==='/host-fixture.mjs'||url.pathname==='/activity-fixture.mjs') {res.setHeader('Content-Type','text/javascript');res.setHeader('Access-Control-Allow-Origin','*');return res.end(url.pathname.startsWith('/host')?hostScript:activityScript);}
 if(['/sdk/activity.mjs','/sdk/host.mjs','/sdk/protocol.mjs'].includes(url.pathname)) {
  res.setHeader('Content-Type','text/javascript');res.setHeader('Access-Control-Allow-Origin','*');return res.end(fs.readFileSync(path.join(root,'packages/interactive-lab-sdk',path.basename(url.pathname))));
 }
 if(url.pathname==='/forbidden-network'){forbiddenRequests++;return res.end('unreachable');}
 if(url.pathname==='/test-count'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({forbiddenRequests}));}
 res.statusCode=404;res.end();
}).listen(port,'127.0.0.1',()=>console.log(`Isolated SDK fixture ${origin}`));
