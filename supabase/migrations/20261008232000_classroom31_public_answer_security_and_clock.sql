-- Classroom 3.1 · confidential answers, safe Realtime, shared server clock.
-- All changes are structural: existing questions, secrets and responses are untouched.
-- The REST/public client receives only columns required to render an active question.

revoke all privileges on table public.v2_questions from anon;
revoke all privileges on table public.v2_questions from public;
grant select (
  id, session_id, position, prompt, question_type, options,
  media_url, media_type, timer_seconds, status, launched_at, closed_at
) on public.v2_questions to anon;

drop policy if exists v2_questions_public_read on public.v2_questions;
create policy v2_questions_public_read
on public.v2_questions for select to anon
using (
  status in ('live', 'closed', 'revealed')
  and exists (
    select 1 from public.v2_sessions s
    where s.id = v2_questions.session_id
      and s.status <> 'closed'
  )
);

-- Realtime emits only safe columns; teacher continues to fetch full details
-- through its own authenticated REST query.
alter publication supabase_realtime drop table public.v2_questions;
alter publication supabase_realtime add table public.v2_questions (
  id, session_id, position, prompt, question_type, options,
  media_url, media_type, timer_seconds, status, launched_at, closed_at
);

-- Intentionally public only AFTER the teacher has revealed the answer.
-- Never accept session or question ids alone: check the real session code
-- plus current public state in the database on every invocation.
create or replace function public.v2_public_revealed_question(
  p_code text,
  p_question_id uuid
) returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'correct_answer', sec.correct_answer,
    'explanation', sec.explanation
  )
  from public.v2_questions q
  join public.v2_sessions s on s.id = q.session_id
  join public.v2_question_secrets sec on sec.question_id = q.id
  where q.id = p_question_id
    and s.code = p_code
    and s.status <> 'closed'
    and q.status = 'revealed'
  limit 1
$function$;
revoke all on function public.v2_public_revealed_question(text,uuid) from public;
grant execute on function public.v2_public_revealed_question(text,uuid) to anon, authenticated;

-- Clock is read-only. Clients estimate RTT and refresh periodically; neither
-- a local clock change nor a reconnect alters the authoritative question timer.
create or replace function public.v2_public_server_clock()
returns timestamptz
language sql
stable
security invoker
set search_path = ''
as $function$
  select clock_timestamp()
$function$;
revoke all on function public.v2_public_server_clock() from public;
grant execute on function public.v2_public_server_clock() to anon, authenticated;
