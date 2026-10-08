-- Non-breaking Classroom 3.1 rollout step 1/2.
-- Install public, state-gated reveal and server clock before the new frontend.
-- Existing Student 3.0 and Projection 2.x remain operational.
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
