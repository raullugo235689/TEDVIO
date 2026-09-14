import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

// Real PostgreSQL (WASM), synthetic records only. This fixture mirrors relevant
// production FKs, RLS and roles; it does not substitute for a full migration reset.
const db = new PGlite();
const owner = randomUUID(), other = randomUUID();
before(async () => {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema tedvio_private;
    grant usage on schema public, auth, tedvio_private to authenticated, anon;
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
    create table public.v2_universities(id uuid primary key, teacher_id uuid, name text);
    create table public.v2_programs(id uuid primary key, teacher_id uuid, name text, university_id uuid references public.v2_universities on delete cascade);
    create table public.v2_groups(id uuid primary key, teacher_id uuid, name text, program_id uuid references public.v2_programs on delete cascade);
    create table public.v2_question_bank(id uuid primary key, teacher_id uuid, title text, prompt text);
    create table public.v2_sessions(id uuid primary key, teacher_id uuid, title text, status text default 'draft', group_id uuid references public.v2_groups on delete set null, current_question_id uuid);
    create table public.v2_questions(id uuid primary key, session_id uuid references public.v2_sessions on delete cascade, bank_id uuid references public.v2_question_bank on delete set null, prompt text);
    alter table public.v2_sessions add foreign key(current_question_id) references public.v2_questions on delete set null;
    create table public.v2_question_secrets(question_id uuid primary key references public.v2_questions on delete cascade deferrable initially deferred, correct_answer jsonb);
    create table public.v2_participants(id uuid primary key, session_id uuid references public.v2_sessions on delete cascade);
    create table public.v2_responses(id uuid primary key, question_id uuid references public.v2_questions on delete cascade, participant_id uuid references public.v2_participants on delete cascade);
    create table tedvio_private.v2_response_receipts_v1(id uuid primary key, question_id uuid references public.v2_questions on delete cascade);
    create table public.v2_prepared_items(id uuid primary key, bank_id uuid references public.v2_question_bank on delete cascade);
    create table public.v2_assignment_items(id uuid primary key, bank_id uuid references public.v2_question_bank on delete set null);
    create table public.v2_paper_exam_questions(id uuid primary key, bank_question_id uuid references public.v2_question_bank on delete set null);
    create table public.v2_group_students(id uuid primary key, group_id uuid references public.v2_groups on delete cascade);
    create table public.v2_grade_items(id uuid primary key, group_id uuid references public.v2_groups on delete restrict);
    create table public.v2_attendance_sessions(id uuid primary key, group_id uuid references public.v2_groups on delete cascade);
    create table public.v2_paper_exams(id uuid primary key, group_id uuid references public.v2_groups on delete set null);
  `);
  for (const table of ['v2_universities', 'v2_programs', 'v2_groups', 'v2_question_bank', 'v2_sessions']) {
    await db.exec(`alter table public.${table} enable row level security;
      create policy owner on public.${table} to authenticated using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
      grant select, insert, update, delete on public.${table} to authenticated;`);
  }
  // No policies: authenticated cannot see dependencies, but the guard must.
  await db.exec('alter table public.v2_group_students enable row level security; grant select on public.v2_group_students to authenticated;');
  await db.exec(readFileSync(new URL('../../../supabase/migrations/20260914004911_safe_academic_deletion.sql', import.meta.url), 'utf8'));
});
after(() => db.close());

const tables = { question: 'v2_question_bank', session: 'v2_sessions', group: 'v2_groups', program: 'v2_programs', university: 'v2_universities' };
async function seed(kind, teacher = owner) {
  const id = randomUUID(), column = ['question', 'session'].includes(kind) ? 'title' : 'name';
  await db.query(`insert into public.${tables[kind]}(id,teacher_id,${column}) values($1,$2,$3)`, [id, teacher, `Prueba ${kind}`]);
  return id;
}
async function asRole(role, actor, query, params = []) {
  await db.exec(`set role ${role}`);
  try {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [actor || '']);
    return await db.query(query, params);
  } finally { await db.exec('reset role'); }
}
async function rpc(kind, id, version = null, actor = owner) {
  const result = await asRole('authenticated', actor, 'select public.v2_academic_delete($1,$2,$3) result', [kind, id, version]);
  return result.rows[0].result;
}
async function exists(table, id) { return (await db.query(`select count(*)::int n from ${table} where id=$1`, [id])).rows[0].n; }
async function addQuestion(session, bank = null) {
  const id = randomUUID();
  await db.query('insert into v2_questions(id,session_id,bank_id,prompt) values($1,$2,$3,$4)', [id, session, bank, 'Pregunta sintética']);
  return id;
}

test('los cinco tipos solo se eliminan después de confirmar una vista previa válida', async () => {
  for (const kind of Object.keys(tables)) {
    const id = await seed(kind), preview = await rpc(kind, id);
    assert.equal(preview.can_delete, true); assert.equal(preview.deleted, false);
    assert.equal(await exists(tables[kind], id), 1);
    const result = await rpc(kind, id, preview.version);
    assert.equal(result.deleted, true); assert.equal(await exists(tables[kind], id), 0);
    await assert.rejects(rpc(kind, id, preview.version), /ya no existe o no te pertenece/);
  }
});

test('propietario, anónimo, llamada privada y tipo inválido fallan cerrados', async () => {
  const id = await seed('group');
  await assert.rejects(rpc('group', id, null, other), /no te pertenece/);
  await assert.rejects(rpc('group', id, null, null), /Inicia sesión/);
  await assert.rejects(asRole('anon', null, 'select public.v2_academic_delete($1,$2,null)', ['group', id]), /permission denied/);
  await assert.rejects(asRole('authenticated', owner, "select tedvio_private.academic_delete_dependencies('public.v2_groups',$1,null)", [id]), /permission denied/);
  await assert.rejects(rpc('v2_groups; drop table v2_groups', id), /no válido/);
  assert.equal(await exists('v2_groups', id), 1);
});

test('preguntas usadas bloquean CASCADE y SET NULL: sesiones, exámenes, tareas y cuestionarios', async () => {
  for (const [table, column] of [['v2_prepared_items', 'bank_id'], ['v2_assignment_items', 'bank_id'], ['v2_paper_exam_questions', 'bank_question_id']]) {
    const bank = await seed('question');
    await db.query(`insert into ${table}(id,${column}) values($1,$2)`, [randomUUID(), bank]);
    const preview = await rpc('question', bank);
    assert.equal(preview.can_delete, false); assert.equal(preview.blockers[0].resource, table);
    await assert.rejects(rpc('question', bank, preview.version), /registros vinculados/);
    assert.equal(await exists('v2_question_bank', bank), 1);
  }
  const bank = await seed('question'); await addQuestion(await seed('session'), bank);
  assert.equal((await rpc('question', bank)).can_delete, false);
});

test('una sesión sin participación elimina sus preguntas y claves, nunca el banco', async () => {
  const bank = await seed('question'), session = await seed('session'), question = await addQuestion(session, bank);
  await db.query("insert into v2_question_secrets values($1,'\"A\"')", [question]);
  await db.query('update v2_sessions set current_question_id=$1 where id=$2', [question, session]);
  const preview = await rpc('session', session);
  assert.equal(preview.question_count, 1); assert.equal(preview.can_delete, true);
  await rpc('session', session, preview.version);
  assert.equal(await exists('v2_questions', question), 0);
  assert.equal((await db.query('select count(*)::int n from v2_question_secrets where question_id=$1', [question])).rows[0].n, 0);
  assert.equal(await exists('v2_question_bank', bank), 1);
});

test('sesiones en vivo, participantes, respuestas y recibos privados quedan protegidos', async () => {
  const live = await seed('session');
  await db.query("update v2_sessions set status='live' where id=$1", [live]);
  assert.equal((await rpc('session', live)).blockers[0].resource, 'live_session');
  for (const table of ['v2_participants', 'v2_responses', 'tedvio_private.v2_response_receipts_v1']) {
    const session = await seed('session'), question = await addQuestion(session), id = randomUUID();
    await db.query(`insert into ${table}(id,${table === 'v2_participants' ? 'session_id' : 'question_id'}) values($1,$2)`, [id, table === 'v2_participants' ? session : question]);
    const preview = await rpc('session', session);
    assert.equal(preview.can_delete, false);
    await assert.rejects(rpc('session', session, preview.version), /registros vinculados/);
    assert.equal(await exists(table, id), 1);
    await assert.rejects(asRole('authenticated', owner, 'select tedvio_private.v2_delete_teacher_session_impl_v67($1)', [session]), /registros vinculados/);
  }
});

test('dependencias ocultas por RLS, historial de grupos y jerarquía impiden cascadas', async () => {
  for (const table of ['v2_group_students', 'v2_grade_items', 'v2_attendance_sessions', 'v2_paper_exams']) {
    const group = await seed('group');
    await db.query(`insert into ${table}(id,group_id) values($1,$2)`, [randomUUID(), group]);
    if (table === 'v2_group_students') assert.equal((await asRole('authenticated', owner, 'select * from v2_group_students')).rows.length, 0);
    const preview = await rpc('group', group);
    assert.equal(preview.blockers[0].resource, table);
    await assert.rejects(rpc('group', group, preview.version), /registros vinculados/);
  }
  const uni = await seed('university'), program = await seed('program'), group = await seed('group');
  await db.query('update v2_programs set university_id=$1 where id=$2', [uni, program]);
  await db.query('update v2_groups set program_id=$1 where id=$2', [program, group]);
  assert.equal((await rpc('university', uni)).can_delete, false);
  assert.equal((await rpc('program', program)).can_delete, false);
});

test('cambios y nuevas dependencias después del diálogo obligan a revisar otra vez', async () => {
  const id = await seed('group'), preview = await rpc('group', id);
  await db.query("update v2_groups set name='Nombre cambiado' where id=$1", [id]);
  await assert.rejects(rpc('group', id, preview.version), /registro cambió/);
  const updated = await rpc('group', id);
  await db.query('insert into v2_group_students values($1,$2)', [randomUUID(), id]);
  await assert.rejects(rpc('group', id, updated.version), /registros vinculados/);
  const session = await seed('session'), before = await rpc('session', session);
  await addQuestion(session);
  await assert.rejects(rpc('session', session, before.version), /registro cambió/);
});

test('el catálogo protege nuevas tablas con FK sin modificar una lista manual', async () => {
  await db.exec('create table public.future_history(id uuid primary key, group_id uuid references public.v2_groups on delete cascade)');
  const group = await seed('group');
  await db.query('insert into future_history values($1,$2)', [randomUUID(), group]);
  const preview = await rpc('group', group);
  assert.equal(preview.blockers[0].resource, 'future_history');
  await assert.rejects(rpc('group', group, preview.version), /registros vinculados/);
});

test('otra sesión que apunta a la pregunta no se desvincula silenciosamente', async () => {
  const session = await seed('session'), question = await addQuestion(session), foreign = await seed('session', other);
  await db.query('update v2_sessions set current_question_id=$1 where id=$2', [question, foreign]);
  assert.equal((await rpc('session', session)).can_delete, false);
});
