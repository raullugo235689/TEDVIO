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
