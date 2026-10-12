import { before,after,test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
const db=new PGlite();
const owner=randomUUID(),other=randomUUID(),group=randomUUID(),group2=randomUUID(),foreignGroup=randomUUID();
const pupil=randomUUID(),pupil2=randomUUID(),foreignPupil=randomUUID();
let session,secondSession,record,record2;
before(async()=>{
 await db.exec(`create role anon; create role authenticated; create schema auth; create schema tedvio_private;
 grant usage on schema public,auth to authenticated,anon;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table auth.users(id uuid primary key);
 create table public.v2_groups(id uuid primary key,teacher_id uuid not null,name text,subject text);
 create table public.v2_group_students(id uuid primary key,group_id uuid references v2_groups(id),teacher_id uuid not null,full_name text,enrollment text,active boolean default true);
 create table public.v2_academic_periods(id uuid primary key default gen_random_uuid(),teacher_id uuid,group_id uuid,status text,starts_on date,ends_on date);
 create table public.v2_attendance_sessions(id uuid primary key default gen_random_uuid(),group_id uuid not null references v2_groups(id),teacher_id uuid not null references auth.users(id),attendance_date date not null,status text not null default 'open',notes text,created_at timestamptz default now(),opened_at timestamptz default now(),paused_at timestamptz,closed_at timestamptz,late_after_minutes int default 10,auto_mark_absent boolean default true,updated_at timestamptz default now(),entry_mode text default 'manual',checkin_event_id uuid,unique(group_id,attendance_date));
 create table public.v2_attendance_records(id uuid primary key default gen_random_uuid(),attendance_session_id uuid references v2_attendance_sessions(id) on delete cascade,student_id uuid references v2_group_students(id),teacher_id uuid,status text check(status in ('present','late','absent','justified')),note text,observation text,updated_at timestamptz default now(),unique(attendance_session_id,student_id));
 create function public.v2_assert_group_date_open(t uuid,g uuid,d date) returns void language plpgsql as $$begin if exists(select 1 from public.v2_academic_periods where teacher_id=t and group_id=g and status='closed' and d between starts_on and ends_on) then raise exception 'Periodo académico cerrado'; end if;end$$;`);
 await db.query('insert into auth.users values($1),($2)',[owner,other]);
 await db.query("insert into v2_groups values($1,$2,'A','Anatomía'),($3,$2,'B','Anatomía'),($4,$5,'Ajeno','Materia')",[group,owner,group2,foreignGroup,other]);
 await db.query("insert into v2_group_students(id,group_id,teacher_id,full_name,enrollment) values($1,$2,$3,'Alumno Sintético','001'),($4,$5,$3,'Alumno Sintético','001'),($6,$7,$8,'Otra persona','002')",[pupil,group,owner,pupil2,group2,foreignPupil,foreignGroup,other]);
 await db.exec(readFileSync(new URL('../../../supabase/migrations/20261012044000_attendance_atomic_justifications.sql',import.meta.url),'utf8'));
 await db.exec(`create table v2_grade_categories(id uuid primary key,teacher_id uuid,group_id uuid);create table v2_grade_items(id uuid primary key,teacher_id uuid,group_id uuid,category_id uuid);alter table v2_grade_categories enable row level security;alter table v2_grade_items enable row level security;grant select,insert,update,delete on v2_grade_categories,v2_grade_items to authenticated;grant select on v2_groups to authenticated;`);
 await db.exec(readFileSync(new URL('../../../supabase/migrations/20261012044100_consolidate_grade_owner_policies.sql',import.meta.url),'utf8'));

});
after(()=>db.close());
async function role(sql,args=[],actor=owner,as='authenticated') {await db.exec(`set role ${as}`);try{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor||'']);return await db.query(sql,args);}finally{await db.exec('reset role');}}
async function reset() {
 await db.exec('delete from v2_attendance_records; delete from v2_attendance_sessions; delete from v2_academic_periods; delete from v2_attendance_change_log; delete from tedvio_private.attendance_write_receipts;');
 session=(await db.query("insert into v2_attendance_sessions(group_id,teacher_id,attendance_date) values($1,$2,'2026-10-05') returning id",[group,owner])).rows[0].id;
 secondSession=(await db.query("insert into v2_attendance_sessions(group_id,teacher_id,attendance_date) values($1,$2,'2026-10-06') returning id",[group2,owner])).rows[0].id;
 record=(await db.query("insert into v2_attendance_records(attendance_session_id,student_id,teacher_id,status,note,observation) values($1,$2,$3,'absent','Nota previa','Nota previa') returning id",[session,pupil,owner])).rows[0].id;
 record2=(await db.query("insert into v2_attendance_records(attendance_session_id,student_id,teacher_id,status) values($1,$2,$3,'absent') returning id",[secondSession,pupil2,owner])).rows[0].id;
}
async function revision(){return Number((await db.query('select revision from v2_attendance_sessions where id=$1',[session])).rows[0].revision);}
const options={lateAfterMinutes:10,autoMarkAbsent:true,notes:'Clase de prueba'};
async function save({id=randomUUID(),rev,action='save',records=[{studentId:pupil,status:'present',note:'Una nota'}],opts=options,actor=owner}={}) {return (await role('select public.v2_commit_attendance($1,$2,$3,$4,$5,$6) result',[id,session,rev??await revision(),action,records,opts],actor)).rows[0].result;}
async function list(status='absent',actor=owner,groups=[]) {return(await role("select public.v2_preview_attendance_justifications($1,'2026-10-01','2026-10-31','',$2) result",[groups,status],actor)).rows[0].result;}
async function change({id=randomUUID(),rows,action='justify',reason='Documento institucional recibido',allowClosed=false,actor=owner}={}) {return(await role('select public.v2_change_attendance_justifications($1,$2,$3,$4,$5) result',[id,action,rows??(await list()).rows.map(({id,revision})=>({id,revision})),reason,allowClosed],actor)).rows[0].result;}
async function count(table){return Number((await db.query(`select count(*) n from ${table}`)).rows[0].n);}
test('guarda registros, opciones y cierre en una transacción con recibo verificable',async()=>{await reset();const x=await save({action:'closed'});assert.equal(x.status,'closed');assert.equal((await db.query('select status from v2_attendance_records where id=$1',[record])).rows[0].status,'present');assert.equal(await count('tedvio_private.attendance_write_receipts'),1);assert.equal(await count('v2_attendance_change_log'),2);});
test('un registro inválido al final revierte los anteriores, auditoría y opciones',async()=>{await reset();const before=await revision();await assert.rejects(()=>save({records:[{studentId:pupil,status:'present',note:'Cambio'}, {studentId:foreignPupil,status:'absent',note:''}]}),/no está activo/);assert.equal((await list()).rows.length,2);assert.equal(await revision(),before);assert.equal(await count('v2_attendance_change_log'),0);});
test('reintento con mismo recibo no vuelve a aplicar; payload distinto se rechaza',async()=>{await reset();const id=randomUUID(),rev=await revision();const x=await save({id,rev}),y=await save({id,rev});assert.deepEqual(x,y);assert.equal(await count('tedvio_private.attendance_write_receipts'),1);await assert.rejects(()=>save({id,rev,opts:{...options,notes:'Otro'}}),/solicitud cambió/);});
test('un segundo dispositivo con revisión antigua no sobrescribe y respeta reapertura',async()=>{await reset();const rev=await revision();await save({action:'closed',rev});await assert.rejects(()=>save({rev}),/lista guardada cambió/);await assert.rejects(()=>save(),/Reabre/);await save({action:'open'});await save({action:'paused'});await save({action:'open',records:[{studentId:pupil,status:'late',note:'Conservado al reanudar'}]});assert.equal((await db.query('select status from v2_attendance_records where id=$1',[record])).rows[0].status,'late');});
test('justifica varios grupos, conserva notas y listas cerradas; requiere confirmación',async()=>{await reset();await db.query("update v2_attendance_sessions set status='closed' where id=$1",[session]);await assert.rejects(()=>change(),/Confirma/);const x=await change({allowClosed:true});assert.equal(x.changed,2);assert.equal((await list('justified')).rows.length,2);assert.equal((await db.query('select observation from v2_attendance_records where id=$1',[record])).rows[0].observation,'Nota previa');assert.equal((await db.query('select status from v2_attendance_sessions where id=$1',[session])).rows[0].status,'closed');});
test('una falta revisada que cambió revierte el lote, incluso después de otra válida',async()=>{await reset();const rows=(await list()).rows.map(({id,revision})=>({id,revision}));await db.query("update v2_attendance_records set status='present' where id=$1",[record2]);await assert.rejects(()=>change({rows}),/falta cambió/);assert.equal((await list()).rows.length,1);assert.equal((await list('justified')).rows.length,0);assert.equal(await count('v2_attendance_change_log'),0);});
test('periodos cerrados y QR activo bloquean justificación sin reabrirse',async()=>{await reset();await db.query("insert into v2_academic_periods(teacher_id,group_id,status,starts_on,ends_on) values($1,$2,'closed','2026-10-01','2026-10-31')",[owner,group]);assert.equal((await list()).rows.filter(x=>x.period_closed).length,1);await assert.rejects(()=>change({allowClosed:true}),/Periodo académico cerrado/);await db.exec('delete from v2_academic_periods');await db.query("update v2_attendance_sessions set entry_mode='qr',checkin_event_id=$1 where id=$2",[randomUUID(),session]);await assert.rejects(()=>change(),/asistencia conjunta/);assert.equal((await list()).rows.length,2);});
test('revocar deja nueva evidencia; reintento exacto no duplica justificación',async()=>{await reset();const rows=(await list()).rows.map(({id,revision})=>({id,revision})),id=randomUUID();const a=await change({id,rows});assert.deepEqual(await change({id,rows}),a);const justified=(await list('justified')).rows;await change({action:'revoke',rows:justified.map(({id,revision})=>({id,revision})),reason:'Corrección del folio'});assert.equal((await list()).rows.length,2);assert.equal(await count('v2_attendance_change_log'),4);});
test('no expone alumnos ni auditoría ajenos, y anon no puede ejecutar funciones',async()=>{await reset();assert.equal((await list('absent',other)).rows.length,0);await assert.rejects(()=>list('absent',owner,[foreignGroup]),/únicamente tus grupos/);await assert.rejects(()=>save({actor:other}),/no está disponible/);await assert.rejects(()=>change({actor:other,rows:[{id:record,revision:0}]}),/no está disponible/);await change();assert.equal((await role('select * from v2_attendance_change_log',[],other)).rows.length,0);await assert.rejects(()=>role('delete from v2_attendance_change_log'),/permission denied/);await assert.rejects(()=>role("select public.v2_preview_attendance_justifications('{}','2026-10-01','2026-10-31')",[],null,'anon'),/permission denied/);});
test('validación: motivos, duplicados, fechas y estados no generan cambios',async()=>{await reset();await assert.rejects(()=>change({reason:''}),/motivo/);await assert.rejects(()=>change({rows:[{id:record,revision:0},{id:record,revision:0}]}),/sin duplicados/);await assert.rejects(()=>role("select public.v2_preview_attendance_justifications('{}','2026-10-31','2026-10-01')"),/fechas/);await assert.rejects(()=>save({opts:{...options,lateAfterMinutes:999}}),/Opciones/);assert.equal(await count('v2_attendance_change_log'),0);});

test('grade policies allow legitimate null categories but reject cross-group and cross-owner writes',async()=>{
 const category=randomUUID(),item=randomUUID();
 await role('insert into v2_grade_categories values($1,$2,$3)',[category,owner,group]);
 await role('insert into v2_grade_items values($1,$2,$3,null)',[item,owner,group2]);
 await assert.rejects(()=>role('update v2_grade_items set category_id=$1 where id=$2',[category,item]),/row-level security/);
 await role('insert into v2_grade_items values($1,$2,$3,$4)',[randomUUID(),owner,group,category]);
 await assert.rejects(()=>role('insert into v2_grade_categories values($1,$2,$3)',[randomUUID(),other,foreignGroup]),/row-level security/);
 assert.equal((await role('select * from v2_grade_items',[],other)).rows.length,0);
});
