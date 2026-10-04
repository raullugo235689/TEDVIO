import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
const db=new PGlite();
const owner=randomUUID(), other=randomUUID(), group=randomUUID(), otherGroup=randomUUID();
const migration=new URL('../../../supabase/migrations/20261004032905_agenda_class_editor.sql',import.meta.url);
before(async()=>{
  await db.exec(`create role anon; create role authenticated; create schema auth;
    grant usage on schema public,auth to authenticated,anon;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table auth.users(id uuid primary key);
    create table public.v2_groups(id uuid primary key,teacher_id uuid,name text);
    alter table public.v2_groups enable row level security;
    create policy owner on public.v2_groups to authenticated using(teacher_id=auth.uid()) with check(teacher_id=auth.uid());
    grant select on public.v2_groups to authenticated;`);
  await db.query('insert into auth.users values($1),($2)',[owner,other]);
  await db.query('insert into v2_groups values($1,$2,$3),($4,$5,$6)',[group,owner,'Grupo propio',otherGroup,other,'Grupo ajeno']);
  await db.exec(readFileSync(new URL('../../../supabase/migrations/20260829010053_v75_group_schedule_slots.sql',import.meta.url),'utf8'));
  await db.exec(readFileSync(migration,'utf8'));
});
after(()=>db.close());
const payload=(changes={})=>({action:'save',scope:'one',group_id:group,class_date:'2026-10-05',end_date:'2026-10-26',start_time:'08:00',end_time:'09:00',recurrence:'weekly',room:'Aula 1',modality:'Presencial',note:'',allow_conflicts:true,...changes});
async function asRole(actor,sql,params=[],role='authenticated') {
 await db.exec(`set role ${role}`);
 try {await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor||'']);return await db.query(sql,params);}finally{await db.exec('reset role');}
}
async function save(body,actor=owner,id=randomUUID()) {return (await asRole(actor,'select public.v2_save_schedule($1,$2) result',[id,body])).rows[0].result;}
async function row(id){return (await db.query('select to_jsonb(s) value from v2_group_schedule_slots s where id=$1',[id])).rows[0].value;}
async function create(changes={}) { const result=await save(payload(changes)); return await row(result.slot_id); }
async function occurrences(from='2026-10-01',to='2026-11-01'){return(await asRole(owner,'select to_jsonb(s) value from v2_schedule_occurrences($1,$2) s',[from,to])).rows.map(row=>row.value);}
async function clear(){await db.exec('delete from v2_group_schedule_slots; delete from tedvio_private.schedule_write_receipts;');}
const edit=(s,changes={})=>payload({slot_id:s.id,revision:s.revision,original_date:'2026-10-05',...changes});
test('migración conserva horarios heredados, crea series y clases únicas',async()=>{
 await clear();const s=await create();assert.equal(s.revision,1);assert.equal((await occurrences()).length,4);
 await create({recurrence:'once',class_date:'2026-10-06'});assert.equal((await occurrences()).length,5);
});
test('una fecha se mueve, se suspende y se restaura sin modificar las siguientes',async()=>{
 await clear();let s=await create(); await save(edit(s,{class_date:'2026-10-13',start_time:'12:00',end_time:'13:00'}));
 let all=await occurrences();assert.equal(all.length,4);assert.equal(all.filter(x=>x.class_date==='2026-10-05').length,0);assert.equal(all.find(x=>x.original_date==='2026-10-05').class_date,'2026-10-13');
 s=await row(s.id);await save(edit(s,{action:'suspend'}));assert.equal((await occurrences()).length,3);
 s=await row(s.id);await save(edit(s,{action:'restore'}));assert.equal((await occurrences()).length,4);
});
test('editar las siguientes conserva el pasado y reemplaza excepciones futuras',async()=>{
 await clear();let s=await create();await save(edit(s,{action:'suspend',original_date:'2026-10-19'}));s=await row(s.id);
 const result=await save(edit(s,{scope:'future',original_date:'2026-10-12',class_date:'2026-10-14',end_date:'2026-10-28',start_time:'10:00',end_time:'11:00'}));
 assert.notEqual(result.slot_id,s.id);assert.equal((await row(s.id)).ends_on,'2026-10-11');
 const all=await occurrences();assert.deepEqual(all.map(x=>x.class_date).sort(),['2026-10-05','2026-10-14','2026-10-21','2026-10-28']);
});
test('suspender desde primera fecha no viola fechas y desde mitad conserva anteriores',async()=>{
 await clear();let s=await create();await save(edit(s,{action:'suspend',scope:'future'}));assert.equal((await row(s.id)).active,false);assert.equal((await occurrences()).length,0);
 s=await create();await save(edit(s,{action:'suspend',scope:'future',original_date:'2026-10-19'}));assert.equal((await occurrences()).length,2);
});
test('un fallo por empalme revierte toda la operación y requiere aceptación explícita',async()=>{
 await clear();await create();await assert.rejects(()=>create({allow_conflicts:false,start_time:'08:30',end_time:'09:30'}),/empalman/);assert.equal((await occurrences()).length,4);
 await create({allow_conflicts:false,start_time:'09:00',end_time:'10:00'});assert.equal((await occurrences()).length,8);
});
test('empalme al partir una serie revierte el corte y las excepciones',async()=>{
 await clear();let s=await create();await create({class_date:'2026-10-06',start_time:'10:00',end_time:'11:00'});
 await assert.rejects(()=>save(edit(s,{scope:'future',original_date:'2026-10-12',class_date:'2026-10-13',start_time:'10:30',end_time:'11:30',allow_conflicts:false})),/empalman/);
 assert.equal((await row(s.id)).ends_on,'2026-10-26');assert.equal((await row(s.id)).revision,1);
});
test('reintentar la misma solicitud no duplica una clase ni una serie',async()=>{
 await clear();const id=randomUUID(),body=payload();const first=await save(body,owner,id);const second=await save(body,owner,id);assert.deepEqual(first,second);assert.equal((await occurrences()).length,4);
 await assert.rejects(()=>save(payload({room:'Otra aula'}),owner,id),/solicitud cambió/);
});
test('revisión antigua bloquea pérdida de cambios simultáneos',async()=>{
 await clear();const s=await create();await save(edit(s,{room:'Cambio reciente'}));await assert.rejects(()=>save(edit(s,{room:'Desactualizado'})),/otro dispositivo/);
});
test('roles y RLS bloquean horarios, grupos, excepciones y recibos de otros docentes',async()=>{
 await clear();const s=await create();await save(edit(s,{action:'suspend'}));
 assert.equal((await asRole(other,'select * from v2_group_schedule_slots')).rows.length,0);
 assert.equal((await asRole(other,'select * from v2_schedule_exceptions')).rows.length,0);
 assert.equal((await asRole(other,'select * from tedvio_private.schedule_write_receipts')).rows.length,0);
 await assert.rejects(()=>save(edit(s),other),/no está disponible/);
 await assert.rejects(()=>create({group_id:otherGroup}),/tus grupos/);
 await assert.rejects(()=>asRole(null,'select public.v2_save_schedule($1,$2)',[randomUUID(),payload()],'anon'),/permission denied/);
 await assert.rejects(()=>asRole(other,'insert into v2_schedule_exceptions(slot_id,teacher_id,original_date,status) values($1,$2,$3,$4)',[s.id,other,'2026-10-12','cancelled']),/row-level security/);
});
test('fechas ajenas y horarios inválidos no guardan datos parciales',async()=>{
 await clear();const s=await create();await assert.rejects(()=>save(edit(s,{original_date:'2026-10-06'})),/no pertenece/);
 await assert.rejects(()=>create({end_time:'07:00'}),/horas/);
 await assert.rejects(()=>create({end_date:'2030-01-01'}),/fecha final/);
 assert.equal((await occurrences()).length,4);
});
