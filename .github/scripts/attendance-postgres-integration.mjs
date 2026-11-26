import { before,after,test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { execFileSync } from 'node:child_process';
if(process.env.PGHOST!=='127.0.0.1'||process.env.PGPORT!=='55432'||process.env.PGDATABASE!=='postgres') throw new Error('Only the isolated CI PostgreSQL service is allowed.');
const root=new URL('../../',import.meta.url),owner=randomUUID(),group=randomUUID(),pupil=randomUUID();
const admin=new pg.Client();let session;
const migration=fs.readFileSync(new URL('supabase/migrations/20261012044000_attendance_atomic_justifications.sql',root),'utf8');
before(async()=>{
 await admin.connect();await admin.query(fs.readFileSync(new URL('supabase/tests/attendance_fixture.sql',root),'utf8'));
 await admin.query('insert into auth.users values($1)',[owner]);
 await admin.query("insert into v2_groups values($1,$2,'Synthetic group','Test')",[group,owner]);
 await admin.query("insert into v2_group_students(id,group_id,teacher_id,full_name,enrollment) values($1,$2,$3,'Synthetic pupil','SYN-001')",[pupil,group,owner]);
 await admin.query(migration);
 session=(await admin.query("insert into v2_attendance_sessions(group_id,teacher_id,attendance_date) values($1,$2,'2026-10-05') returning id",[group,owner])).rows[0].id;
});
after(()=>admin.end());
async function actor(){const c=new pg.Client();await c.connect();await c.query('set role authenticated');await c.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);return c;}
async function revision(){return Number((await admin.query('select revision from v2_attendance_sessions where id=$1',[session])).rows[0].revision);}
const sql='select public.v2_commit_attendance($1,$2,$3,$4,$5,$6) value';
const args=(rev,id=randomUUID())=>[id,session,rev,'save',JSON.stringify([{studentId:pupil,status:'absent',note:'Synthetic backup evidence'}]),JSON.stringify({lateAfterMinutes:10,autoMarkAbsent:true,notes:'Synthetic class'})];
test('two real connections cannot overwrite the same reviewed revision',async()=>{
 const a=await actor(),b=await actor();try{
  const rev=await revision();await a.query('begin');await a.query(sql,args(rev));
  const pending=b.query(sql,args(rev));const rejected=assert.rejects(pending,error=>error.code==='PT409');
  await new Promise(r=>setTimeout(r,70));await a.query('commit');await rejected;
 } finally {await a.query('rollback');await a.end();await b.end();}
});
test('two real retries with the same receipt apply once',async()=>{
 const a=await actor(),b=await actor();try{
  const input=args(await revision());const [x,y]=await Promise.all([a.query(sql,input),b.query(sql,input)]);assert.deepEqual(x.rows,y.rows);
  assert.equal(Number((await admin.query('select count(*) n from tedvio_private.attendance_write_receipts where request_id=$1',[input[0]])).rows[0].n),1);
 }finally{await a.end();await b.end();}
});
test('pg_dump and pg_restore recover synthetic schema, records, RLS and audit history',async()=>{
 const before=await admin.query('select id,status,observation,revision from v2_attendance_records order by id');
 const logs=await admin.query('select count(*) n from v2_attendance_change_log');
 // Use the exact PostgreSQL server version's clients inside the CI container.
 const container=execFileSync('docker',['ps','--filter','ancestor=postgres:17','--format','{{.ID}}'],{encoding:'utf8'}).trim();
 if(!/^[a-f0-9]+$/.test(container))throw new Error('The isolated PostgreSQL container was not found.');
 const run=command=>execFileSync('docker',['exec',container,'sh','-c',command],{encoding:'utf8'});
 run('pg_dump -U postgres -Fc postgres -f /tmp/synthetic-recovery.dump');
 run('createdb -U postgres tedvio_synthetic_restored');
 run('pg_restore -U postgres -d tedvio_synthetic_restored --exit-on-error /tmp/synthetic-recovery.dump');
 const restored=new pg.Client({database:'tedvio_synthetic_restored'});await restored.connect();
 try{
  assert.deepEqual((await restored.query('select id,status,observation,revision from v2_attendance_records order by id')).rows,before.rows);
  assert.deepEqual((await restored.query('select count(*) n from v2_attendance_change_log')).rows,logs.rows);
  const rls=(await restored.query("select relrowsecurity from pg_class where oid='v2_attendance_change_log'::regclass")).rows[0].relrowsecurity;assert.equal(rls,true);
 }finally{await restored.end();}
 console.log('Synthetic PostgreSQL restore verified. Production was never referenced.');
});

test('form cursor transitions serialize across real connections and legacy start cannot race a settings change',async()=>{
 const database='tedvio_forms_navigation';
 await admin.query('create database '+database);
 const formDb=new pg.Client({database});await formDb.connect();
 const clients=[];
 async function formActor(role){
  const client=new pg.Client({database});await client.connect();clients.push(client);
  await client.query('set role '+role);
  if(role==='authenticated')await client.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
  return client;
 }
 async function waitForRowLock(pid){
  for(let n=0;n<80;n++){
   const row=(await admin.query('select wait_event_type from pg_stat_activity where pid=$1',[pid])).rows[0];
   if(row?.wait_event_type==='Lock')return;
   await new Promise(resolve=>setTimeout(resolve,25));
  }
  throw new Error('The competing form request did not wait for its row lock.');
 }
 const value=result=>result.rows[0].value;
 const advanceSql='select public.v2_online_form_advance($1,$2) value';
 const answerSql='select public.v2_online_form_answer($1,$2,$3) value';
 try{
  // Roles are cluster-global and were created by the attendance fixture above.
  const fixture=fs.readFileSync(new URL('supabase/tests/online_forms_fixture.sql',root),'utf8')
   .replace(/^create role (anon|authenticated);\s*$/gm,'');
  await formDb.query(fixture);await formDb.query('insert into auth.users values($1)',[owner]);
  for(const file of [
   '20261124213410_online_forms_question_bank_attempts.sql',
   '20261126164641_online_forms_declared_groups.sql',
   '20261126183910_online_forms_editable_settings_forward_navigation.sql'
  ])await formDb.query(fs.readFileSync(new URL('supabase/migrations/'+file,root),'utf8'));
  const bank=[];
  for(let n=0;n<3;n++){
   const id=randomUUID();bank.push(id);
   await formDb.query('insert into public.v2_question_bank(id,teacher_id,title,question_type,prompt,options,correct_answer) values($1,$2,$3,$4,$5,$6,$7)',
    [id,owner,'Synthetic '+n,'multiple_choice','Synthetic prompt '+n,JSON.stringify(['Correct','Other']),JSON.stringify('Correct')]);
  }
  const teacher=await formActor('authenticated'),a=await formActor('anon'),b=await formActor('anon');
  const pid=(await b.query('select pg_backend_pid() pid')).rows[0].pid;
  async function form(navigation){
   const draft=value(await teacher.query('select public.v2_online_form_save($1) value',[JSON.stringify({
    title:'Synthetic navigation test',navigation_mode:navigation,feedback_mode:'score_only',shuffle_questions:false,shuffle_options:false,
    sections:[{title:'Synthetic block',draw_count:3,items:bank.map(bank_id=>({bank_id,points:1}))}]
   })]));
   return value(await teacher.query('select public.v2_online_form_set_status($1,$2) value',[draft.id,'published']));
  }
  const published=await form('forward_only'),token=randomUUID();
  const first=value(await a.query('select public.v2_online_form_start_configured($1,$2,$3,$4) value',[published.code,'Synthetic','CONCURRENT',token]));
  await a.query('begin');
  const second=value(await a.query(advanceSql,[token,first.items[0].id]));
  const duplicate=b.query(advanceSql,[token,first.items[0].id]).then(result=>({result}),error=>({error}));
  await waitForRowLock(pid);await a.query('commit');
  const duplicateOutcome=await duplicate;assert.equal(duplicateOutcome.error,undefined);
  assert.equal(value(duplicateOutcome.result).attempt.current_position,2);
  assert.deepEqual(value(duplicateOutcome.result).items,second.items);
  await a.query(answerSql,[token,second.items[0].id,'Correct']);
  await a.query('begin');await a.query(advanceSql,[token,second.items[0].id]);
  const late=b.query(answerSql,[token,second.items[0].id,'Other']).then(result=>({result}),error=>({error}));
  await waitForRowLock(pid);await a.query('commit');
  const lateOutcome=await late;assert.match(lateOutcome.error?.message||'',/ya no admite cambios/);
  const saved=(await formDb.query('select answer from public.v2_online_form_responses where attempt_id=$1 and item_id=$2',[first.attempt.id,second.items[0].id])).rows[0].answer;
  assert.equal(saved,'Correct');
  assert.equal((await formDb.query('select current_position from public.v2_online_form_attempts where id=$1',[first.attempt.id])).rows[0].current_position,3);

  const free=await form('free');await teacher.query('begin');
  await teacher.query('select public.v2_online_form_update_settings($1,$2,$3)',[free.id,JSON.stringify({navigation_mode:'forward_only'}),free.revision]);
  const oldStart=b.query('select public.v2_online_form_start($1,$2,$3,$4) value',[free.code,'Synthetic','LEGACY-RACE',randomUUID()])
   .then(result=>({result}),error=>({error}));
  await waitForRowLock(pid);await teacher.query('commit');
  const oldOutcome=await oldStart;assert.match(oldOutcome.error?.message||'',/Actualiza la página.*avance único/);
  assert.equal(Number((await formDb.query('select count(*) n from public.v2_online_form_attempts where form_id=$1',[free.id])).rows[0].n),0);
 }finally{
  for(const client of clients){await client.query('rollback').catch(()=>{});await client.end();}
  await formDb.end();
 }
});
