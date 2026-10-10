import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite(),owner=randomUUID(),other=randomUUID(),card=randomUUID();
before(async()=>{
 await db.exec(`create role anon;create role authenticated;create schema auth;grant usage on schema auth,public to authenticated,anon;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
 await db.query('insert into auth.users values($1),($2)',[owner,other]);
 await db.exec(readFileSync(new URL('../../../supabase/migrations/20261010045343_enarm2027_private_flashcards.sql',import.meta.url),'utf8'));
 await db.query(`insert into tedvio_enarm2027_flashcards(id,user_id,source_key,source_file,source_page,source_sha256,area,topic,subtopic,question,answer) values($1,$2,'test-card','test.pdf',1,$3,'cirugia','Angiología','Aorta','Pregunta privada de prueba','Respuesta privada')`,[card,owner,'a'.repeat(64)]);
});
after(()=>db.close());
async function as(actor,sql,args=[],role='authenticated'){
 await db.exec(`set role ${role}`);try{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor||'']);return await db.query(sql,args);}finally{await db.exec('reset role');}
}
const rate=(actor=owner,rating='good',id=randomUUID())=>as(actor,'select tedvio_enarm2027_rate_flashcard($1,$2,$3) result',[card,rating,id]);
test('private cards cannot be read by another account or anonymous client',async()=>{
 assert.equal((await as(owner,'select * from tedvio_enarm2027_flashcards')).rows.length,1);
 assert.equal((await as(other,'select * from tedvio_enarm2027_flashcards')).rows.length,0);
 await assert.rejects(()=>as(null,'select * from tedvio_enarm2027_flashcards',[],'anon'),/permission denied/);
 await assert.rejects(()=>rate(other),/Tarjeta no disponible/);
});
test('rating persists review and retry is idempotent; changing payload fails',async()=>{
 const id=randomUUID();const first=await rate(owner,'good',id);const second=await rate(owner,'good',id);
 assert.deepEqual(first.rows,second.rows);
 assert.equal((await as(owner,'select tries from tedvio_enarm2027_flashcard_reviews')).rows[0].tries,1);
 await assert.rejects(()=>rate(owner,'hard',id),/solicitud cambió/);
 assert.equal((await as(other,'select * from tedvio_enarm2027_flashcard_events')).rows.length,0);
 assert.equal((await as(other,'select * from tedvio_enarm2027_flashcard_reviews')).rows.length,0);
});
test('a user cannot attach own review to another users card or forge owner',async()=>{
 await assert.rejects(()=>as(other,'insert into tedvio_enarm2027_flashcard_reviews(user_id,card_id) values($1,$2)',[owner,card]),/row-level security/);
 await assert.rejects(()=>as(other,'insert into tedvio_enarm2027_flashcard_reviews(user_id,card_id) values($1,$2)',[other,card]),/foreign key/);
 await assert.rejects(()=>as(owner,"update tedvio_enarm2027_flashcards set answer='changed'"),/permission denied/);
});
test('forgotten and difficult cards reset schedule; invalid ratings leave no event',async()=>{
 const again=(await rate(owner,'again')).rows[0].result;assert.equal(again.stage,0);
 const hard=(await rate(owner,'hard')).rows[0].result;assert.equal(hard.stage,0);
 const delta=Date.parse(hard.due_at)-Date.parse(again.due_at);assert.ok(delta>=86400000&&delta<86410000);
 const before=(await as(owner,'select count(*)::int n from tedvio_enarm2027_flashcard_events')).rows[0].n;
 await assert.rejects(()=>rate(owner,'invalid'),/Valoración inválida/);
 assert.equal((await as(owner,'select count(*)::int n from tedvio_enarm2027_flashcard_events')).rows[0].n,before);
});
