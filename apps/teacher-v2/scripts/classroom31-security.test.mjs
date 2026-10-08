import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { classroomSecondsRemaining, estimateServerClockOffset } from '../src/core/classroom-clock.ts';

const migration = readFileSync(
  new URL('../../../supabase/migrations/20261008232000_classroom31_public_answer_security_and_clock.sql', import.meta.url),
  'utf8',
);
const session = '11111111-1111-4111-8111-111111111111';
const question = '22222222-2222-4222-8222-222222222222';
const nextQuestion = '33333333-3333-4333-8333-333333333333';
let db;

before(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create table public.v2_sessions(id uuid primary key,code text not null,status text not null);
    create table public.v2_questions(
      id uuid primary key,session_id uuid references public.v2_sessions(id),
      position integer,prompt text,question_type text,options jsonb,
      correct_answer jsonb,media_url text,media_type text,timer_seconds integer,
      status text,launched_at timestamptz,closed_at timestamptz,
      bank_id uuid,explanation text,difficulty text
    );
    create table public.v2_question_secrets(
      question_id uuid primary key references public.v2_questions(id),
      correct_answer jsonb,explanation text,updated_at timestamptz default now()
    );
    grant all on public.v2_questions to anon,authenticated;
    grant select on public.v2_sessions to anon,authenticated;
    grant all on public.v2_question_secrets to authenticated;
    alter table public.v2_questions enable row level security;
    create policy v2_questions_public_read on public.v2_questions for select to anon using (true);
    create policy v2_questions_teacher_write on public.v2_questions for all to authenticated using(true) with check(true);
    create publication supabase_realtime for table public.v2_questions;
  `);
  await db.query('insert into public.v2_sessions(id,code,status) values($1,$2,$3)', [session,'ABC123','live']);
  await db.query(`insert into public.v2_questions(id,session_id,position,prompt,question_type,options,correct_answer,status,timer_seconds)
    values($1,$3,1,'Reactivo activo','multiple_choice','["A","B"]'::jsonb,'"A"'::jsonb,'live',30),
          ($2,$3,2,'Reactivo oculto','multiple_choice','["C","D"]'::jsonb,'"C"'::jsonb,'queued',30)`,
    [question,nextQuestion,session]);
  await db.query(`insert into public.v2_question_secrets(question_id,correct_answer,explanation)
    values($1,'"A"'::jsonb,'Explicación A'),($2,'"C"'::jsonb,'Explicación C')`,[question,nextQuestion]);
  await db.exec(migration);
});
after(async () => { await db?.close(); });

async function asAnon(query,params=[]) {
  await db.exec('set role anon');
  try { return (await db.query(query,params)).rows; }
  finally { await db.exec('reset role'); }
}

test('el rol anónimo sólo puede leer columnas seguras y nunca las respuestas o explicaciones', async () => {
  const roles = (await db.query(`
    select
      has_column_privilege('anon','public.v2_questions','prompt','select') as prompt_allowed,
      has_column_privilege('anon','public.v2_questions','correct_answer','select') as answer_allowed,
      has_column_privilege('anon','public.v2_questions','explanation','select') as explanation_allowed,
      has_column_privilege('anon','public.v2_question_secrets','correct_answer','select') as secrets_allowed
  `)).rows[0];
  assert.equal(roles.prompt_allowed,true);
  assert.equal(roles.answer_allowed,false);
  assert.equal(roles.explanation_allowed,false);
  assert.equal(roles.secrets_allowed,false);
  assert.equal((await asAnon('select prompt from public.v2_questions')).length,1);
  await assert.rejects(asAnon('select correct_answer from public.v2_questions'), /permission denied/);
  await assert.rejects(asAnon('select * from public.v2_questions'), /permission denied/);
});

test('ningún reactivo futuro es visible aunque un alumno conozca su identificador', async () => {
  const rows=await asAnon('select prompt from public.v2_questions where id=$1',[nextQuestion]);
  assert.equal(rows.length,0);
});

test('la publicación de Realtime no contiene respuestas ni explicaciones',async()=>{
  const rows=(await db.query(`select attnames from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='v2_questions'`)).rows;
  assert.equal(rows.length,1);
  const columns=String(rows[0].attnames);
  assert.ok(!columns.includes('correct_answer'));
  assert.ok(!columns.includes('explanation'));
  assert.ok(columns.includes('prompt'));
});

test('el RPC no revela respuestas futuras ni con un código incorrecto',async()=>{
  const early=await asAnon('select public.v2_public_revealed_question($1,$2) answer',['ABC123',question]);
  assert.equal(early[0].answer,null);
  await db.query(`update public.v2_questions set status='revealed' where id=$1`,[question]);
  const invalid=await asAnon('select public.v2_public_revealed_question($1,$2) answer',['WRONG',question]);
  assert.equal(invalid[0].answer,null);
  const visible=await asAnon('select public.v2_public_revealed_question($1,$2) answer',['ABC123',question]);
  assert.equal(visible[0].answer.correct_answer,'A');
  assert.equal(visible[0].answer.explanation,'Explicación A');
  const hidden=await asAnon('select public.v2_public_revealed_question($1,$2) answer',['ABC123',nextQuestion]);
  assert.equal(hidden[0].answer,null);
});

test('al finalizar la sesión se invalida el RPC de revelación',async()=>{
  await db.exec(`update public.v2_sessions set status='closed'`);
  const result=await asAnon('select public.v2_public_revealed_question($1,$2) answer',['ABC123',question]);
  assert.equal(result[0].answer,null);
});

test('el reloj del servidor se puede consultar como público y estimar sin ventaja por latencia',async()=>{
  const rows=await asAnon('select public.v2_public_server_clock() at time zone \'UTC\' as time');
  assert.equal(rows.length,1);
  const offset=estimateServerClockOffset('2026-10-08T12:00:03.000Z',
    Date.parse('2026-10-08T12:00:01.000Z'),Date.parse('2026-10-08T12:00:01.200Z'));
  assert.equal(offset,1900);
  assert.equal(classroomSecondsRemaining('2026-10-08T12:00:00.000Z',30,offset,Date.parse('2026-10-08T12:00:10.100Z')),18);
  assert.equal(estimateServerClockOffset('invalid',1,2),null);
  assert.equal(estimateServerClockOffset('2026-10-08T12:00:00Z',0,20000),null);
});
