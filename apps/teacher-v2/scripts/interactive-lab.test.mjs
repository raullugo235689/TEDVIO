import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { MessageChannel } from 'node:worker_threads';
import { attachLabHost } from '../../../packages/interactive-lab-sdk/host.mjs';
import { connectActivity } from '../../../packages/interactive-lab-sdk/activity.mjs';
import { contextFromAttempt } from '../../../packages/interactive-lab-sdk/protocol.mjs';
import { PGlite } from '@electric-sql/pglite';

const folder=mkdtempSync(join(tmpdir(),'tedvio-lab-'));
let db=new PGlite(folder);
const teacher=randomUUID(),other=randomUUID(),institution=randomUUID(),university=randomUUID(),program=randomUUID();
const group=randomUUID(),group2=randomUUID(),foreignGroup=randomUUID(),student=randomUUID(),student2=randomUUID(),foreignStudent=randomUUID();
const manifest={protocol:'tedvio.lab/1',title:'Prueba sintética sin contenido clínico',instructions:'Resuelve dos preguntas de prueba.',questions:[
 {id:'q1',type:'choice',prompt:'Selecciona A',options:[{id:'a',label:'A'},{id:'b',label:'B'}]},
 {id:'q2',type:'numeric',prompt:'Escribe el número 4'}
]};
const key={q1:{answer:'a',weight:1},q2:{answer:4,tolerance:0.1,weight:3}};
async function role(sql,args=[],actor=teacher,as='authenticated') {
 await db.exec(`set role ${as}`);
 try{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor||'']);return await db.query(sql,args);}finally{await db.exec('reset role');}
}
async function rpc(name,args=[],actor=teacher,as='authenticated') {
 const holders=args.map((_,i)=>`$${i+1}`).join(',');
 return (await role(`select public.${name}(${holders}) value`,args,actor,as)).rows[0].value;
}
async function version(m=manifest,k=key,evaluator='answer-key-v1',activity=null,revision=null,actor=teacher){
 return rpc('v2_lab_save_version',[activity,revision,m,k,evaluator,'Materia de prueba'],actor);
}
async function setup({mode='practice',selection='best',attempts=2,evalType='answer-key-v1',m=manifest,k=key,duration=null,groups=[group,group2]}={}){
 const v=await version(m,k,evalType);
 await rpc('v2_lab_set_activity_state',[v.activity_id,v.revision,'published']);
 const now=Date.now();
 const a=await rpc('v2_lab_assign',[v.version_id,groups,'Asignación sintética',new Date(now-60_000).toISOString(),new Date(now+3600_000).toISOString(),attempts,mode,selection,duration]);
 await rpc('v2_lab_set_assignment_state',[a.assignment_id,'published',false]);
 const recipients=(await rpc('v2_lab_results',[a.assignment_id])).rows;
 const recipient=recipients.find(x=>x.student_id===student)||recipients[0];
 const access=await rpc('v2_lab_issue_access',[recipient.recipient_id,true]);
 return {...v,...a,recipient,recipients,...access};
}
async function begin(token,id=randomUUID()){return rpc('v2_lab_begin',[token,id],null,'anon');}
async function submit(token,attempt,id=randomUUID(),answers={q1:'a',q2:4}){return rpc('v2_lab_submit',[token,attempt,id,answers],null,'anon');}

before(async()=>{
 await db.exec(`create role anon; create role authenticated; create schema auth; create schema tedvio_private;
 grant usage on schema public,auth to anon,authenticated;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table auth.users(id uuid primary key);
 create table public.tedvio_user_profiles(user_id uuid primary key,role text,status text);
 create table public.tedvio_institutions(id uuid primary key,status text not null);
 create table public.tedvio_institution_memberships(institution_id uuid,user_id uuid,status text,primary key(institution_id,user_id));
 create table public.v2_universities(id uuid primary key,teacher_id uuid,institution_id uuid);
 create table public.v2_programs(id uuid primary key,teacher_id uuid,university_id uuid);
 create table public.v2_groups(id uuid primary key,teacher_id uuid,program_id uuid,is_demo boolean default false);
 create table public.v2_group_students(id uuid primary key,teacher_id uuid,group_id uuid,full_name text,enrollment text,active boolean default true);`);
 await db.query('insert into auth.users values($1),($2)',[teacher,other]);
 await db.query("insert into tedvio_user_profiles values($1,'teacher','active'),($2,'teacher','active')",[teacher,other]);
 await db.query("insert into tedvio_institutions values($1,'active')",[institution]);
 await db.query("insert into tedvio_institution_memberships values($1,$2,'active')",[institution,teacher]);
 await db.query('insert into v2_universities values($1,$2,$3)',[university,teacher,institution]);
 await db.query('insert into v2_programs values($1,$2,$3)',[program,teacher,university]);
 await db.query('insert into v2_groups(id,teacher_id,program_id) values($1,$2,$3),($4,$2,$3),($5,$6,$3)',[group,teacher,program,group2,foreignGroup,other]);
 await db.query("insert into v2_group_students(id,teacher_id,group_id,full_name,enrollment) values($1,$2,$3,'Persona sintética A','TEST-001'),($4,$2,$5,'Persona sintética B','TEST-002'),($6,$7,$8,'Persona ajena sintética','TEST-003')",[student,teacher,group,student2,group2,foreignStudent,other,foreignGroup]);
 await db.exec(readFileSync(new URL('../../../supabase/migrations/20261106162153_interactive_lab_foundation.sql',import.meta.url),'utf8'));
});
after(async()=>{await db.close();rmSync(folder,{recursive:true,force:true});});

test('un intento completo: actividad → asignación → credencial → respuestas → resultado persistido y consulta docente',async()=>{
 const a=await setup(); const t=await begin(a.token); const receipt=await submit(a.token,t.attempt_id);
 assert.equal(receipt.status,'verified'); assert.equal(receipt.score_percent,null); assert.equal(receipt.official_grade,false);
 const result=await rpc('v2_lab_results',[a.assignment_id]);
 assert.deepEqual(result.summary,{assigned:2,started:1,finished:1});
 const row=result.rows.find(r=>r.student_id===student);
 assert.equal(row.selected_result.score_percent,100); assert.equal(row.selected_result.attempt_id,t.attempt_id);
 assert.equal(row.enrollment,'TEST-001'); assert.equal(row.attempts,1);
 const responses=await role('select * from public.v2_lab_responses where attempt_id=$1',[t.attempt_id]);
 assert.equal(responses.rows.length,2); assert(responses.rows.every(r=>r.correct));
});
test('anon no lee padrones, claves, resultados, recursos ni auditoría y no crea actividades',async()=>{
 for(const table of ['v2_lab_activities','v2_lab_versions','v2_lab_resources','v2_lab_recipients','v2_lab_attempts','v2_lab_responses','v2_lab_audit'])
  await assert.rejects(()=>role(`select * from public.${table}`,[],null,'anon'),/permission denied/);
 await assert.rejects(()=>role('select * from tedvio_private.lab_answer_keys'),/permission denied/);
 await assert.rejects(()=>role('select * from tedvio_private.lab_access'),/permission denied/);
 await assert.rejects(()=>rpc('v2_lab_save_version',[null,null,manifest,key,'answer-key-v1','Materia'],null,'anon'),/permission denied/);
});
test('otro docente no lee ni modifica actividades, asignaciones o resultados',async()=>{
 const a=await setup();
 assert.equal((await role('select * from public.v2_lab_activities where id=$1',[a.activity_id],other)).rows.length,0);
 await assert.rejects(()=>rpc('v2_lab_results',[a.assignment_id],other),/no disponible/);
 await assert.rejects(()=>rpc('v2_lab_set_assignment_state',[a.assignment_id,'withdrawn',true],other),/no disponible/);
 await assert.rejects(()=>rpc('v2_lab_issue_access',[a.recipient.recipient_id,true],other),/no disponible/);
 await assert.rejects(()=>version(manifest,key,'answer-key-v1',a.activity_id,2,other),/no disponible/);
});
test('versiones y resultados no son editables ni borrables desde el cliente docente',async()=>{
 const a=await setup();
 await assert.rejects(()=>role('update public.v2_lab_versions set manifest=$1 where id=$2',[{},a.version_id]),/permission denied/);
 await assert.rejects(()=>role('delete from public.v2_lab_activities where id=$1',[a.activity_id]),/permission denied/);
 await assert.rejects(()=>role('insert into public.v2_lab_audit(teacher_id,actor_type,entity_id,action) values($1,\'teacher\',$2,\'forged\')',[teacher,a.activity_id]),/permission denied/);
});
test('la nueva versión no altera una asignación existente; conflictos de revisión no sobreescriben',async()=>{
 const a=await setup();
 const next=await version({...manifest,title:'Versión dos'}, {...key,q1:{answer:'b',weight:1}},'answer-key-v1',a.activity_id,2);
 assert.equal(next.version,2);
 const t=await begin(a.token);assert.equal(t.version_id,a.version_id);assert.equal(t.manifest.title,manifest.title);
 await assert.rejects(()=>version(manifest,key,'answer-key-v1',a.activity_id,2),/cambió/);
});
test('la clave nunca viaja al alumno y la retroalimentación depende del docente',async()=>{
 const a=await setup();const t=await begin(a.token);
 assert(!JSON.stringify(t).includes('tolerance'));assert(!JSON.stringify(t).includes('answer_key'));
 const result=await submit(a.token,t.attempt_id,randomUUID(),{q1:'b',q2:4});
 assert.equal(result.score_percent,null);
 await rpc('v2_lab_set_assignment_state',[a.assignment_id,'published',true]);
 const receipt=await rpc('v2_lab_receipt',[a.token,t.attempt_id],null,'anon');
 assert.equal(Number(receipt.score_percent),75);assert.equal(receipt.official_grade,false);
});
test('rechaza una calificación arbitraria, opciones ajenas, ids desconocidos y payload sobredimensionado',async()=>{
 const a=await setup(); const t=await begin(a.token);
 for(const answers of [{score:100,q1:'b'},{unknown:'a'},{q1:'z'},{q2:'NaN'},{q1:{id:'a'}},{q1:'x'.repeat(66000)}])
  await assert.rejects(()=>submit(a.token,t.attempt_id,randomUUID(),answers),/inválida|desconocidas|opciones/);
 assert.equal((await role('select * from v2_lab_responses where attempt_id=$1',[t.attempt_id])).rows.length,0);
});
test('validación tardía revierte las respuestas previas y no deja entrega parcial',async()=>{
 const a=await setup();const t=await begin(a.token);
 await assert.rejects(()=>submit(a.token,t.attempt_id,randomUUID(),{q1:'a',q2:'texto inválido'}),/numérica inválida/);
 assert.equal((await role('select * from v2_lab_responses where attempt_id=$1',[t.attempt_id])).rows.length,0);
 assert.equal((await rpc('v2_lab_receipt',[a.token,t.attempt_id],null,'anon')).status,'started');
});
test('reintento idéntico devuelve el mismo recibo y no duplica respuestas; payload diferente falla',async()=>{
 const a=await setup();const id=randomUUID(),t=await begin(a.token);const one=await submit(a.token,t.attempt_id,id);
 const two=await submit(a.token,t.attempt_id,id);
 assert.equal(one.receipt_id,two.receipt_id);assert.equal(one.submitted_at,two.submitted_at);
 await assert.rejects(()=>submit(a.token,t.attempt_id,id,{q1:'b',q2:4}),/sobrescribir/);
 await assert.rejects(()=>submit(a.token,t.attempt_id,randomUUID()),/sobrescribir/);
 assert.equal((await role('select * from v2_lab_responses where attempt_id=$1',[t.attempt_id])).rows.length,2);
});
test('reanudar no gasta intentos, el límite se aplica en servidor y las respuestas vacías puntúan cero',async()=>{
 const a=await setup({attempts:1});const startId=randomUUID();const t=await begin(a.token,startId);
 assert.equal((await begin(a.token,startId)).attempt_id,t.attempt_id);
 assert.equal((await begin(a.token)).attempt_id,t.attempt_id);
 await submit(a.token,t.attempt_id,randomUUID(),{});
 await assert.rejects(()=>begin(a.token),/agotaron/);
 const row=(await rpc('v2_lab_results',[a.assignment_id])).rows.find(x=>x.student_id===student);
 assert.equal(Number(row.selected_result.score_percent),0);
});
test('primer, último y mejor intento usan resultados reales, no el orden del navegador',async()=>{
 for(const selection of ['first','last','best']){
  const a=await setup({selection}); const t1=await begin(a.token);await submit(a.token,t1.attempt_id);
  const t2=await begin(a.token);await submit(a.token,t2.attempt_id,randomUUID(),{q1:'b',q2:0});
  const row=(await rpc('v2_lab_results',[a.assignment_id])).rows.find(x=>x.student_id===student);
  assert.equal(Number(row.selected_result.score_percent),selection==='last'?0:100);
 }
});
test('el modo de corrección no verificable queda provisional, sin nota ni publicación oficial',async()=>{
 const m={...manifest,questions:[{id:'reflection',type:'text',prompt:'Describe tu procedimiento.'}]};
 const a=await setup({m,k:{},evalType:'review-required-v1'}); const t=await begin(a.token);
 await submit(a.token,t.attempt_id,randomUUID(),{reflection:'Respuesta de prueba'});
 const row=(await rpc('v2_lab_results',[a.assignment_id])).rows.find(x=>x.student_id===student);
 assert.equal(row.selected_result.status,'provisional');assert.equal(row.selected_result.score_percent,null);assert.equal(row.selected_result.official_grade,false);
});
test('credencial personal no equivale a matrícula; rota y revoca accesos sin afectar otro alumno',async()=>{
 const a=await setup();await assert.rejects(()=>begin('TEST-001'),/Acceso no válido/);
 await assert.rejects(()=>rpc('v2_lab_issue_access',[a.recipient.recipient_id,false]),/Verifica/);
 const t=await begin(a.token);const replacement=await rpc('v2_lab_issue_access',[a.recipient.recipient_id,true]);
 await assert.rejects(()=>begin(a.token),/Acceso no válido/);
 assert.equal((await begin(replacement.token)).attempt_id,t.attempt_id);
 const otherRecipient=a.recipients.find(x=>x.student_id===student2);const b=await rpc('v2_lab_issue_access',[otherRecipient.recipient_id,true]);
 await assert.rejects(()=>submit(b.token,t.attempt_id),/Intento no disponible/);
 await rpc('v2_lab_revoke_access',[a.recipient.recipient_id]);
 await assert.rejects(()=>begin(replacement.token),/Acceso no válido/);
 assert.equal((await begin(b.token)).status,'started');
});
test('no crea destinatarios fuera del padrón ni de grupos/instituciones autorizados',async()=>{
 const v=await version();await rpc('v2_lab_set_activity_state',[v.activity_id,v.revision,'published']);
 const args=[v.version_id,[foreignGroup],'Ajena',new Date(Date.now()-1000).toISOString(),new Date(Date.now()+3600000).toISOString()];
 await assert.rejects(()=>rpc('v2_lab_assign',args),/Grupo no disponible/);
 const a=await setup();
 await db.query("update tedvio_institution_memberships set status='inactive' where user_id=$1",[teacher]);
 try{await assert.rejects(()=>begin(a.token),/Acceso institucional/);await assert.rejects(()=>rpc('v2_lab_results',[a.assignment_id]),/Acceso institucional/);assert.equal((await role('select * from v2_lab_assignments where id=$1',[a.assignment_id])).rows.length,0);assert.equal((await role('select * from v2_lab_recipients where assignment_id=$1',[a.assignment_id])).rows.length,0);}finally{
  await db.query("update tedvio_institution_memberships set status='active' where user_id=$1",[teacher]);
 }
});
test('retiro, inicio futuro, vencimiento y baja de alumno se comprueban en el servidor',async()=>{
 const a=await setup({duration:30});const t=await begin(a.token);
 await rpc('v2_lab_set_assignment_state',[a.assignment_id,'withdrawn',false]);
 await assert.rejects(()=>submit(a.token,t.attempt_id),/retirada/);
 await rpc('v2_lab_set_assignment_state',[a.assignment_id,'published',false]);
 await db.query("update v2_lab_attempts set deadline_at=clock_timestamp()-interval '1 second' where id=$1",[t.attempt_id]);
 await assert.rejects(()=>submit(a.token,t.attempt_id),/agotado/);
 await db.query('update v2_group_students set active=false where id=$1',[student]);
 try{await assert.rejects(()=>begin(a.token),/Acceso no válido/);}finally{await db.query('update v2_group_students set active=true where id=$1',[student]);}
 await db.query("update v2_lab_assignments set opens_at=clock_timestamp()+interval '1 minute' where id=$1",[a.assignment_id]);
 await assert.rejects(()=>begin(a.token),/Fuera del horario/);
});
test('manifiestos y claves ambiguos/incompletos no se publican',async()=>{
 for(const [m,k,e] of [
  [{...manifest,answer_key:key},key,'answer-key-v1'],
  [{...manifest,questions:[manifest.questions[0],manifest.questions[0]]},key,'answer-key-v1'],
  [manifest,{q1:key.q1},'answer-key-v1'],[manifest,{...key,q1:{answer:'z',weight:1}},'answer-key-v1'],
  [manifest,{...key,q2:{answer:4,tolerance:-1,weight:1}},'answer-key-v1'],
  [manifest,key,'review-required-v1'],[manifest,key,null]
 ]) await assert.rejects(()=>version(m,k,e));
});
test('paginación estable conserva todos los destinatarios, incluidos quienes no iniciaron',async()=>{
 const a=await setup();const first=await rpc('v2_lab_results',[a.assignment_id,0,1]);const last=await rpc('v2_lab_results',[a.assignment_id,1,1]);
 assert.equal(first.has_more,true);assert.equal(last.has_more,false);assert.notEqual(first.rows[0].recipient_id,last.rows[0].recipient_id);
 assert.equal(first.rows[0].selected_result,null);assert.equal(first.summary.assigned,2);
 await assert.rejects(()=>rpc('v2_lab_results',[a.assignment_id,0,501]),/Paginación inválida/);
});
test('persiste después de cerrar y abrir la base aislada, sin localStorage ni resultados simulados',async()=>{
 const a=await setup();const t=await begin(a.token);await submit(a.token,t.attempt_id);
 await db.close();db=new PGlite(folder);
 const result=await rpc('v2_lab_results',[a.assignment_id]);assert.equal(result.summary.finished,1);
 assert.equal(Number(result.rows.find(x=>x.student_id===student).selected_result.score_percent),100);
});

// Real SDK and real SQL RPCs, with a synthetic Window transport (not a UI test).
test('SDK → RPC SQL → persistencia → consulta docente conserva el mismo intento',async()=>{
 const assignment=await setup();const started=await begin(assignment.token);const ctx=contextFromAttempt(started);
 const listeners=new Set(),parent={},loads=new Set();
 const targetWindow={parent,addEventListener:(_type,fn)=>listeners.add(fn),removeEventListener:(_type,fn)=>listeners.delete(fn)};
 const iframe={getAttribute:()=> 'allow-scripts',addEventListener:(_type,fn)=>loads.add(fn),removeEventListener:(_type,fn)=>loads.delete(fn),
  contentWindow:{postMessage(data,_target,ports){for(const fn of [...listeners]) fn({source:parent,origin:'https://tedvio.example',data,ports});}}};
 const connecting=connectActivity({hostOrigin:'https://tedvio.example',targetWindow,timeoutMs:1500});
 let writes=0;const host=attachLabHost({iframe,context:ctx,MessageChannelClass:MessageChannel,submit:async message=>{
  writes++;return submit(assignment.token,message.context.attemptId,message.requestId,message.answers);
 }});
 const activity=await connecting;
 try {
  activity.answer('q1','a');activity.answer('q2',4);const ack=await activity.complete();await activity.complete();
  assert.equal(ack.attempt_id,started.attempt_id);assert.equal(ack.status,'verified');assert.equal(writes,1);
  const teacherResults=await rpc('v2_lab_results',[assignment.assignment_id]);
  assert.equal(teacherResults.rows.find(x=>x.student_id===student).selected_result.score_percent,100);
  assert.equal(teacherResults.rows.find(x=>x.student_id===student).selected_result.attempt_id,ack.attempt_id);
 } finally {activity.close();host.close();}
});

test('una cuenta suspendida pierde lectura y escritura y no acepta entregas nuevas',async()=>{
 const a=await setup();const t=await begin(a.token);
 await db.query("update tedvio_user_profiles set status='suspended' where user_id=$1",[teacher]);
 try {
  await assert.rejects(()=>version(),/activa/);
  await assert.rejects(()=>submit(a.token,t.attempt_id),/Cuenta docente/);
  await assert.rejects(()=>rpc('v2_lab_results',[a.assignment_id]),/Cuenta docente/);
  assert.equal((await role('select * from v2_lab_activities')).rows.length,0);
  assert.equal((await role('select * from v2_lab_attempts')).rows.length,0);
 } finally {await db.query("update tedvio_user_profiles set status='active' where user_id=$1",[teacher]);}
});
test('un recibo confirmado sigue consultable después del cierre sin permitir entregas tardías',async()=>{
 const a=await setup();const t=await begin(a.token);const id=randomUUID();const done=await submit(a.token,t.attempt_id,id);
 await db.query("update v2_lab_assignments set closes_at=clock_timestamp()-interval '1 second' where id=$1",[a.assignment_id]);
 const recovered=await rpc('v2_lab_receipt',[a.token,t.attempt_id],null,'anon');
 assert.equal(recovered.receipt_id,done.receipt_id);assert.equal((await submit(a.token,t.attempt_id,id)).receipt_id,id);
 await assert.rejects(()=>begin(a.token),/horario/);
});
