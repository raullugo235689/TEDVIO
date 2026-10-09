import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { ENARM_AREAS } from '../src/core/enarm2027-areas.ts';
import {
  balancedEnarmSimulation, calculateEnarmPerformance, dueReviewCases,
  needsReinforcement, orderPracticeCases, weeklyPlan,
} from '../src/core/enarm2027-model.ts';

const read=(path)=>readFileSync(new URL(path,import.meta.url),'utf8');
const ddl=read('../../../supabase/migrations/20261009190000_enarm2027_private_study.sql');
const seeds=read('../../../supabase/migrations/20261009190100_enarm2027_pilot_cases.sql');
const q = (id,area=ENARM_AREAS[0].key)=>({
  id,slug:id,area,topic:'Tópico clínico',difficulty:'intermedio',
  vignette:'Caso con signos y síntomas relevantes para práctica.',
  prompt:'¿Cuál es la intervención indicada?',options:['A','B','C','D'],
});
const attempts=[
 {id:'a1',question_id:'a',is_correct:false,mode:'practica',answered_at:'2026-10-01T00:00:00Z'},
 {id:'a2',question_id:'b',is_correct:true,mode:'practica',answered_at:'2026-10-02T00:00:00Z'},
 {id:'a3',question_id:'a',is_correct:true,mode:'repaso',answered_at:'2026-10-03T00:00:00Z'},
];
const reviews=[
 {user_id:'u',question_id:'a',stage:1,tries:2,successes:1,due_at:'2026-10-08T00:00:00Z',last_answered_at:'2026-10-03T00:00:00Z'},
 {user_id:'u',question_id:'b',stage:1,tries:1,successes:1,due_at:'2026-10-12T00:00:00Z',last_answered_at:'2026-10-02T00:00:00Z'},
];
const date=new Date('2026-10-09T00:00:00Z').getTime();

test('siete áreas troncales y complementarias, sin atribuir peso oficial a 2027',()=>{
  assert.equal(ENARM_AREAS.length,7);
  assert.equal(new Set(ENARM_AREAS.map(a=>a.key)).size,7);
  assert.match(read('../src/features/enarm2027/Enarm2027Page.tsx'),/convocatoria ENARM 2027 deberá verificarse/);
});

test('indicadores cuentan aciertos reales, áreas estudiadas y repasos vencidos',()=>{
  const cases=[q('a'),q('b'),q('c',ENARM_AREAS[1].key)];
  const p=calculateEnarmPerformance(cases,attempts,reviews,date);
  assert.equal(p.attempts,3);
  assert.equal(p.correct,2);
  assert.equal(p.accuracy,67);
  assert.equal(p.studied,2);
  assert.equal(p.due,1);
  assert.equal(p.wrongCases,1);
  assert.equal(p.byArea.find(x=>x.area===ENARM_AREAS[0].key)?.accuracy,67);
  assert.equal(p.byArea.find(x=>x.area===ENARM_AREAS[1].key)?.accuracy,null);
  assert.deepEqual(dueReviewCases(cases,reviews,date).map(x=>x.id),['a']);
  assert.deepEqual(needsReinforcement(cases,attempts).map(x=>x.id),[]);
});

test('los casos nuevos tienen prioridad sin excluir los repasos programados',()=>{
  const ordered=orderPracticeCases([q('a'),q('b'),q('c')],attempts,reviews,date);
  assert.equal(ordered[0]?.id,'c');
  assert.equal(ordered[1]?.id,'a');
  assert.equal(ordered[2]?.id,'b');
});

test('mini-simulador equilibrado incluye las siete áreas con muestra de 10',()=>{
  const pool=ENARM_AREAS.flatMap(area=>Array.from({length:4},(_,i)=>q(area.key+'-'+i,area.key)));
  const sim=balancedEnarmSimulation(pool,10,()=>.22);
  assert.equal(sim.length,10);
  assert.equal(new Set(sim.map(x=>x.id)).size,10);
  assert.equal(new Set(sim.map(x=>x.area)).size,7);
  assert.equal(balancedEnarmSimulation([],10).length,0);
});

test('el plan de estudio suma exactamente las horas semanales elegidas',()=>{
  for(const h of [1,3,6,10,25,40]){
    const items=weeklyPlan(h);
    assert.equal(items.reduce((sum,item)=>sum+item.minutes,0),h*60);
    assert.ok(items.every(item=>item.minutes>=0));
  }
});

test('servidor nunca envía clave en el catálogo y el envío se califica con clave interna',()=>{
  assert.match(ddl,/REVOKE ALL ON public\.tedvio_enarm2027_questions FROM PUBLIC, anon, authenticated/);
  assert.match(ddl,/SELECT q\.id, q\.slug, q\.area, q\.topic, q\.difficulty, q\.vignette, q\.prompt, q\.options/);
  assert.doesNotMatch(ddl,/SELECT q\.\*/);
  assert.match(ddl,/v_correct := \(p_answer_index = v_q\.correct_index\)/);
  assert.match(ddl,/user_id = \(SELECT auth\.uid\(\)\)/);
  assert.match(ddl,/RETURNS jsonb/);
  assert.doesNotMatch(ddl,/\bTRUNCATE\s+TABLE\b|\bDELETE\s+FROM\b|\bDROP\s+TABLE\b/i);
});

test('base privada y banco original: 28 casos, claves no visibles, aislamiento por usuario',async()=>{
  const db=new PGlite();
  const user='11111111-1111-4111-8111-111111111111',foreign='22222222-2222-4222-8222-222222222222';
  try{
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth to anon, authenticated;
      grant execute on function auth.uid() to anon,authenticated;
    `);
    await db.query('insert into auth.users(id) values ($1),($2)',[user,foreign]);
    await db.exec(ddl);
    await db.exec(seeds);
    const cases=(await db.query('select area,correct_index,count(*)::int n from public.tedvio_enarm2027_questions group by area,correct_index')).rows;
    assert.equal(cases.reduce((sum,r)=>sum+r.n,0),28);
    for(const area of ENARM_AREAS) assert.equal(cases.filter(r=>r.area===area.key).reduce((sum,r)=>sum+r.n,0),4);
    for(let answer=0;answer<4;answer++) assert.equal(cases.filter(r=>r.correct_index===answer).reduce((sum,r)=>sum+r.n,0),7);
    await db.exec('set role anon');
    await assert.rejects(db.query('select * from public.tedvio_enarm2027_questions'),/permission denied/);
    await assert.rejects(db.query('select * from public.tedvio_enarm2027_catalog(null,200)'),/permission denied/);
    await db.exec('reset role');

    // Auth context is simulated only within the isolated PGlite test database.
    await db.exec(`select set_config('request.jwt.claim.sub','${user}',false)`);
    await db.exec('set role authenticated');
    await assert.rejects(db.query('select correct_index from public.tedvio_enarm2027_questions'),/permission denied/);
    const catalog=(await db.query('select * from public.tedvio_enarm2027_catalog(null,200)')).rows;
    assert.equal(catalog.length,28);
    assert.equal(Object.hasOwn(catalog[0],'correct_index'),false);
    assert.equal(Object.hasOwn(catalog[0],'rationale'),false);
    const first=(await db.query('select id,correct_index from public.tedvio_enarm2027_questions')).rows[0];
    void first;
    await db.exec('reset role');
    const target=(await db.query("select id,correct_index from public.tedvio_enarm2027_questions where slug='mi-hiperk'")).rows[0];
    await db.exec('set role authenticated');
    const submitted=(await db.query('select public.tedvio_enarm2027_submit($1,$2,$3,$4) as result',
      [target.id,target.correct_index,'practica',29])).rows[0].result;
    assert.equal(submitted.correct,true);
    assert.equal(submitted.correct_index,target.correct_index);
    assert.equal(submitted.stage,1);
    assert.equal(typeof submitted.rationale,'string');
    const records=(await db.query('select count(*)::int n from public.tedvio_enarm2027_attempts')).rows[0].n;
    assert.equal(records,1);
    await assert.rejects(db.query("insert into public.tedvio_enarm2027_attempts(user_id,question_id,answer_index,is_correct,mode) values ('"+user+"','"+target.id+"',1,true,'practica')"),/permission denied/);
    await db.exec('reset role');
    await db.exec(`select set_config('request.jwt.claim.sub','${foreign}',false)`);
    await db.exec('set role authenticated');
    const privateRows=(await db.query('select * from public.tedvio_enarm2027_attempts')).rows;
    assert.equal(privateRows.length,0);
    await db.exec('reset role');
  }finally{await db.close();}
});
