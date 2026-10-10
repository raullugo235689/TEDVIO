import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
const db=new PGlite(), owner=randomUUID(), other=randomUUID(), groups=[randomUUID(),randomUUID(),randomUUID()], outsider=randomUUID();
const students=[randomUUID(),randomUUID(),randomUUID(),randomUUID()];
const dir=new URL('../../../supabase/migrations/',import.meta.url);
const migration=readdirSync(dir).find(n=>n.endsWith('_joint_attendance.sql'));
before(async()=>{
 await db.exec(`create role anon; create role authenticated; create schema auth; create schema tedvio_private;
 grant usage on schema public,auth,tedvio_private to authenticated,anon;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function tedvio_private.rate_limit_v67(text,text,integer,integer) returns void language sql as $$select$$;
 create table auth.users(id uuid primary key);
 create table public.v2_groups(id uuid primary key,teacher_id uuid,name text,group_name text,subject text,university text);
 create table public.v2_group_students(id uuid primary key,group_id uuid references v2_groups(id),teacher_id uuid,enrollment text,full_name text,active boolean default true,unique(group_id,enrollment));
 create table public.v2_attendance_sessions(id uuid primary key default gen_random_uuid(),group_id uuid references v2_groups(id),teacher_id uuid,attendance_date date,notes text,status text default 'open',created_at timestamptz default now(),opened_at timestamptz default now(),paused_at timestamptz,closed_at timestamptz,late_after_minutes integer default 10,auto_mark_absent boolean default true,updated_at timestamptz default now(),unique(group_id,attendance_date));
 create table public.v2_attendance_records(id uuid primary key default gen_random_uuid(),attendance_session_id uuid references v2_attendance_sessions(id) on delete cascade,student_id uuid references v2_group_students(id),teacher_id uuid,status text,observation text,note text,updated_at timestamptz default now(),unique(attendance_session_id,student_id));
 create table public.v2_attendance_qr_tokens(attendance_session_id uuid,active boolean);
 `);
 for(const table of ['v2_groups','v2_group_students','v2_attendance_sessions','v2_attendance_records']) await db.exec(`alter table ${table} enable row level security; create policy owner on ${table} to authenticated using(teacher_id=auth.uid()) with check(teacher_id=auth.uid()); grant select,insert,update,delete on ${table} to authenticated;`);
 await db.query('insert into auth.users values($1),($2)',[owner,other]);
 for(let i=0;i<groups.length;i++) await db.query('insert into v2_groups(id,teacher_id,name,subject,university) values($1,$2,$3,$4,$5)',[groups[i],owner,`Grupo ${i+1}`,'Anatomía','Universidad']);
 await db.query('insert into v2_groups(id,teacher_id,name) values($1,$2,$3)',[outsider,other,'Ajeno']);
 for(let i=0;i<students.length;i++) await db.query('insert into v2_group_students(id,teacher_id,group_id,enrollment,full_name) values($1,$2,$3,$4,$5)',[students[i],owner,groups[i<2?0:1],i%2?'002':'001',`Alumno ${i+1}`]);
 await db.exec(readFileSync(new URL(migration,dir),'utf8'));
 await db.exec(readFileSync(new URL(readdirSync(dir).find(n=>n.endsWith('_rotating_attendance.sql')),dir),'utf8'));
 // Run the actual production limiter; this adapter supplies its SHA-256 extension in PGlite.
 await db.exec(`create schema extensions; create function extensions.digest(text,text) returns bytea language sql as $$select sha256(convert_to($1,'UTF8'))$$;`);
 const limiter=readFileSync(new URL('20260826215254_v67_private_rpc_hardening_core.sql',dir),'utf8').split('alter function public.')[0];
 await db.exec(limiter);
});
after(()=>db.close());
async function asRole(actor,sql,args=[],role='authenticated'){await db.exec(`set role ${role}`);try{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor||'']);return(await db.query(sql,args)).rows;}finally{await db.exec('reset role');}}
// Seed reused sessions with the same UTC date as the request, independent of the database timezone.
const payload=(x={})=>({title:'Clase conjunta',attendance_date:new Date().toISOString().slice(0,10),group_ids:groups.slice(0,2),duration_minutes:15,late_after_minutes:10,auto_mark_absent:true,...x});
async function clear(){await db.exec('delete from v2_attendance_events; delete from v2_attendance_sessions; update v2_group_students set active=true;');}
async function create(x={},uid=owner,id=randomUUID()){await asRole(uid,'select v2_create_attendance_event($1,$2)',[id,payload(x)]);return(await db.query('select * from v2_attendance_events where id=$1',[id])).rows[0];}
async function checkin(e,group=groups[0],mat='001'){return(await asRole(null,'select v2_attendance_event_checkin($1,$2,$3) r',[e.token,group,mat],'anon'))[0].r;}
async function summary(e,uid=owner){return(await asRole(uid,'select v2_attendance_event_summary($1) r',[e.id]))[0].r;}
async function close(e,uid=owner){return asRole(uid,'select v2_close_attendance_event($1)',[e.id]);}
async function records(){return(await db.query('select * from v2_attendance_records order by student_id')).rows;}
test('crea una entrada, listas separadas y cero presentes por defecto',async()=>{await clear();const e=await create();const s=await summary(e);assert.equal(s.groups.length,2);assert.equal(s.groups[0].total,2);assert.equal(s.groups[0].present,0);assert.equal((await records()).length,0);assert.equal((await db.query('select * from v2_attendance_sessions where entry_mode=$1',['qr'])).rows.length,2);});
test('matrícula repetida entre grupos se asigna únicamente al grupo seleccionado',async()=>{await clear();const e=await create();let r=await checkin(e,groups[1]);assert.equal(r.student_name,'Alumno 3');assert.equal((await records())[0].student_id,students[2]);await checkin(e,groups[0]);assert.equal((await records()).length,2);assert.equal((await summary(e)).groups.reduce((s,g)=>s+g.registered,0),2);});
test('reintentos son idempotentes y no cambian puntualidad ni fecha del recibo',async()=>{await clear();const e=await create();const first=await checkin(e);await db.query("update v2_attendance_events set created_at=now()-interval '20 minutes' where id=$1",[e.id]);const second=await checkin(e);assert.deepEqual(first,second);assert.equal((await records()).length,1);assert.equal((await summary(e)).groups.reduce((s,g)=>s+g.registered,0),1);});
test('los retardos se calculan en el servidor desde el inicio conjunto',async()=>{await clear();const e=await create();await db.query("update v2_attendance_events set created_at=now()-interval '11 minutes' where id=$1",[e.id]);assert.equal((await checkin(e)).status,'late');});
test('rechaza token inválido, grupo ajeno, matrícula ajena, inactiva o ambigua',async()=>{await clear();const e=await create();assert.equal((await checkin({...e,token:'bad'})).ok,false);assert.equal((await checkin(e,outsider)).ok,false);assert.equal((await checkin(e,groups[0],'999')).ok,false);await db.query('update v2_group_students set active=false where id=$1',[students[0]]);assert.equal((await checkin(e)).ok,false);await db.query('update v2_group_students set active=true where id=$1',[students[0]]);await db.query('insert into v2_group_students(id,teacher_id,group_id,enrollment,full_name) values($1,$2,$3,$4,$5)',[randomUUID(),owner,groups[0],' 001 ','Duplicado']);assert.match((await checkin(e)).message,/duplicadas/);await db.exec("delete from v2_group_students where full_name='Duplicado'");assert.equal((await records()).length,0);});
test('caducidad, pausa y cierre se validan aunque la página siga abierta',async()=>{await clear();const e=await create();await db.query("update v2_attendance_sessions set status='paused' where group_id=$1",[groups[0]]);assert.equal((await checkin(e)).ok,false);await db.query("update v2_attendance_sessions set status='open' where group_id=$1",[groups[0]]);await db.query("update v2_attendance_events set created_at=now()-interval '20 minutes',expires_at=now()-interval '1 minute' where id=$1",[e.id]);assert.equal((await checkin(e)).ok,false);await close(e);assert.equal((await checkin(e)).ok,false);});
test('cerrar completa faltas sin alterar presentes, retardos ni justificaciones',async()=>{await clear();const e=await create();await checkin(e);const session=(await db.query('select id from v2_attendance_sessions where group_id=$1',[groups[0]])).rows[0].id;await db.query("insert into v2_attendance_records(attendance_session_id,student_id,teacher_id,status,observation) values($1,$2,$3,'justified','Constancia')",[session,students[1],owner]);assert.equal((await checkin(e,groups[0],'002')).status,'justified');await close(e);await close(e);const rr=await records();assert.equal(rr.length,4);assert.equal(rr.filter(r=>r.status==='absent').length,2);assert.equal(rr.find(r=>r.student_id===students[1]).observation,'Constancia');assert.equal((await summary(e)).event.status,'closed');});
test('cerrar sin completar faltas conserva pendientes sin inventar registros',async()=>{await clear();const e=await create({auto_mark_absent:false});await checkin(e);await close(e);assert.equal((await records()).length,1);});
test('reutiliza listas existentes abiertas y conserva registros previos',async()=>{await clear();const session=randomUUID();await db.query("insert into v2_attendance_sessions(id,group_id,teacher_id,attendance_date) values($1,$2,$3,$4::date)",[session,groups[0],owner,payload().attendance_date]);await db.query("insert into v2_attendance_records(attendance_session_id,student_id,teacher_id,status,observation) values($1,$2,$3,'present','Manual')",[session,students[0],owner]);const e=await create();const s=await summary(e);assert.equal(s.groups.find(g=>g.group_id===groups[0]).session_id,session);assert.equal(s.groups.find(g=>g.group_id===groups[0]).registered,0);await checkin(e);assert.equal((await records())[0].observation,'Manual');});
test('solicitud repetida no duplica y dos eventos no compiten por la misma lista',async()=>{await clear();const id=randomUUID();const first=await create({},owner,id),again=await create({},owner,id);assert.equal(first.id,again.id);await assert.rejects(()=>create(),/abierta/);await assert.rejects(()=>create({title:'Cambió'},owner,id),/solicitud cambió/);});
test('errores en cualquier grupo revierten la creación completa',async()=>{await clear();await assert.rejects(()=>create({group_ids:[groups[0],groups[2]]}),/alumnos activos/);assert.equal((await db.query('select * from v2_attendance_events')).rows.length,0);assert.equal((await db.query('select * from v2_attendance_sessions')).rows.length,0);await db.query("insert into v2_attendance_sessions(group_id,teacher_id,attendance_date,status) values($1,$2,$3::date,'closed')",[groups[1],owner,payload().attendance_date]);await assert.rejects(()=>create(),/cerrada o pausada/);assert.equal((await db.query('select * from v2_attendance_events')).rows.length,0);});
test('RLS, funciones y permisos protegen las listas y tokens de otros docentes',async()=>{await clear();const e=await create();assert.equal(await summary(e,other),null);await assert.rejects(()=>close(e,other),/no está disponible/);await assert.rejects(()=>create({group_ids:[outsider]}),/tus grupos/);for(const table of ['v2_attendance_events','v2_attendance_event_groups','v2_attendance_event_checkins']){assert.equal((await asRole(other,`select * from ${table}`)).length,0);await assert.rejects(()=>asRole(null,`select * from ${table}`,[],'anon'),/permission denied/);await assert.rejects(()=>asRole(owner,`delete from ${table}`),/permission denied/);}await assert.rejects(()=>asRole(null,'select v2_create_attendance_event($1,$2)',[randomUUID(),payload()],'anon'),/permission denied/);});
test('metadatos públicos contienen grupos pero nunca matrículas o nombres de alumnos',async()=>{await clear();const e=await create();await checkin(e);const meta=(await asRole(null,'select v2_attendance_event_meta($1) r',[e.token],'anon'))[0].r;assert.equal(meta.ok,true);assert.equal(meta.groups.length,2);assert.equal(JSON.stringify(meta).includes('Alumno'),false);assert.equal(JSON.stringify(meta).includes('enrollment'),false);await close(e);assert.equal((await asRole(null,'select v2_attendance_event_meta($1) r',[e.token],'anon'))[0].r.ok,false);});
test('valida límite de grupos, duración y fechas',async()=>{await clear();for(const changes of [{group_ids:[]},{duration_minutes:1},{duration_minutes:181},{late_after_minutes:-1},{title:''},{attendance_date:'2020-01-01'}]) await assert.rejects(()=>create(changes));assert.equal((await db.query('select * from v2_attendance_events')).rows.length,0);});

async function challenge(e,actor=owner){return(await asRole(actor,'select v2_attendance_event_challenge($1) r',[e.id]))[0].r;}
async function secure(e,proof,group=groups[0],mat='001'){return(await asRole(null,'select v2_attendance_event_checkin_secure($1,$2,$3,$4) r',[e.token,group,mat,proof],'anon'))[0].r;}
async function expireChallenge(e){await db.query("update tedvio_private.attendance_event_challenges set expires_at=clock_timestamp()-interval '1 second' where event_id=$1",[e.id]);}
test('solo el docente propietario obtiene el desafío y sus pestañas reutilizan el vigente',async()=>{
 await clear();const e=await create({verification_mode:'rotating'}),c=await challenge(e),again=await challenge(e);
 assert.equal(c.available,true);assert.match(c.qr_proof,/^[a-f0-9]{32}$/);assert.match(c.code,/^[0-9]{6}$/);assert.equal(again.qr_proof,c.qr_proof);assert.equal(again.code,c.code);assert.equal(again.expires_at,c.expires_at);assert.ok(Date.parse(c.expires_at)-Date.parse(c.server_now)<=60000);
 await assert.rejects(()=>challenge(e,other),/no está disponible/);await assert.rejects(()=>asRole(null,'select v2_attendance_event_challenge($1)',[e.id],'anon'),/permission denied/);
 for(const role of ['anon','authenticated']) await assert.rejects(()=>asRole(owner,'select * from tedvio_private.attendance_event_challenges',[],role),/permission denied/);
});
test('QR dinámico no se puede saltar con el enlace fijo ni con endpoints anteriores',async()=>{
 await clear();const e=await create({verification_mode:'rotating'});await challenge(e);
 assert.equal((await checkin(e)).error_code,'code_expired');assert.equal((await secure(e,'')).ok,false);
 assert.equal((await asRole(null,'select tedvio_private.attendance_event_checkin($1,$2,$3) r',[e.token,groups[0],'001'],'anon'))[0].r.ok,false);
 assert.equal((await records()).length,0);
});
test('prueba QR y código numérico registran por grupo; conserva ceros y reintentos',async()=>{
 await clear();const e=await create({verification_mode:'rotating'}),c=await challenge(e);
 const first=await secure(e,c.qr_proof,groups[1]);assert.equal(first.student_name,'Alumno 3');assert.deepEqual(await secure(e,c.qr_proof,groups[1]),first);
 await db.query("update tedvio_private.attendance_event_challenges set code='000123' where event_id=$1",[e.id]);
 assert.equal((await secure(e,'123')).ok,false);assert.equal((await secure(e,'000123')).student_name,'Alumno 1');assert.equal((await records()).length,2);
});
test('al vencer el minuto rechaza capturas, códigos y formularios abiertos; renueva ambos secretos',async()=>{
 await clear();const e=await create({verification_mode:'rotating'}),c=await challenge(e);await expireChallenge(e);
 assert.equal((await secure(e,c.qr_proof)).error_code,'code_expired');assert.equal((await secure(e,c.code)).ok,false);assert.equal((await records()).length,0);
 const next=await challenge(e);assert.notEqual(next.code,c.code);assert.notEqual(next.qr_proof,c.qr_proof);
 assert.equal((await secure(e,c.qr_proof)).ok,false);assert.equal((await secure(e,next.code)).ok,true);
});
test('código de otra clase y grupo externo no autorizan registros',async()=>{
 await clear();const a=await create({verification_mode:'rotating',group_ids:[groups[0]]}),b=await create({verification_mode:'rotating',group_ids:[groups[1]]}),c=await challenge(a);
 await challenge(b);assert.equal((await secure(b,c.qr_proof,groups[1])).ok,false);assert.equal((await secure(a,c.code,groups[1])).ok,false);assert.equal((await records()).length,0);
});
test('cerrar o vencer la sesión invalida el código aunque aún no termine su minuto',async()=>{
 await clear();const e=await create({verification_mode:'rotating',auto_mark_absent:false}),c=await challenge(e);await close(e);
 assert.equal((await challenge(e)).available,false);assert.equal((await secure(e,c.code)).ok,false);assert.equal((await records()).length,0);
 await clear();const otherEvent=await create({verification_mode:'rotating'});await db.query("update v2_attendance_events set expires_at=clock_timestamp()+interval '20 seconds' where id=$1",[otherEvent.id]);
 const short=await challenge(otherEvent);assert.ok(Date.parse(short.expires_at)-Date.parse(short.server_now)<=20000);
 await db.query("update v2_attendance_events set created_at=now()-interval '2 minutes',expires_at=now()-interval '1 minute' where id=$1",[otherEvent.id]);assert.equal((await secure(otherEvent,short.qr_proof)).ok,false);
});
test('activar rotación en clase existente conserva token, listas y asistencias guardadas',async()=>{
 await clear();const e=await create();await checkin(e);const before=await records();
 await assert.rejects(()=>asRole(other,'select v2_enable_attendance_rotation($1)',[e.id]),/no está disponible/);
 await asRole(owner,'select v2_enable_attendance_rotation($1)',[e.id]);assert.deepEqual(await records(),before);assert.equal((await summary(e)).event.token,e.token);assert.equal((await summary(e)).event.verification_mode,'rotating');
 assert.equal((await checkin(e,groups[1])).ok,false);const c=await challenge(e);assert.equal((await secure(e,c.code,groups[1])).ok,true);
 await close(e);await assert.rejects(()=>asRole(owner,'select v2_enable_attendance_rotation($1)',[e.id]),/terminó/);
});
test('metadatos públicos y resúmenes no filtran el código temporal ni la prueba QR',async()=>{
 await clear();const e=await create({verification_mode:'rotating'}),c=await challenge(e);
 const meta=(await asRole(null,'select v2_attendance_event_meta($1) r',[e.token],'anon'))[0].r;
 assert.equal(meta.verification_mode,'rotating');const output=JSON.stringify([meta,await summary(e)]);assert.ok(!output.includes(c.qr_proof));assert.ok(!output.includes('"code":'));assert.ok(!output.includes('"qr_proof":'));
});
test('presupuesto de intentos impide adivinar códigos cambiando matrícula; no bloquea códigos válidos',async()=>{
 await clear();const e=await create({verification_mode:'rotating'}),c=await challenge(e);
 for(let n=0;n<12;n++) assert.equal((await secure(e,'incorrect',groups[0],`guess${n}`)).ok,false);
 await assert.rejects(()=>secure(e,'incorrect',groups[1],'another'),/Demasiadas solicitudes/);
 assert.equal((await secure(e,c.code)).ok,true);
});
test('clientes anteriores conservan modo fijo; rechaza modos desconocidos sin crear listas',async()=>{
 await clear();const e=await create();assert.equal(e.verification_mode,'static');assert.equal((await challenge(e)).available,false);assert.equal((await secure(e,'')).ok,true);
 await clear();await assert.rejects(()=>create({verification_mode:'unsafe'}),/Modo de registro/);assert.equal((await records()).length,0);
});
