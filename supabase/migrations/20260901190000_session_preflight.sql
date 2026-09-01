-- Session Preflight 1.x: isolated end-to-end rehearsal with deterministic cleanup.

create table if not exists public.v2_session_check_runs (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  source_session_id uuid not null references public.v2_sessions(id) on delete cascade,
  synthetic_session_id uuid references public.v2_sessions(id) on delete set null,
  status text not null default 'running'
    check (status in ('running', 'passed', 'degraded', 'failed', 'expired')),
  total_checks integer not null default 0 check (total_checks between 0 and 30),
  passed_checks integer not null default 0 check (passed_checks between 0 and 30),
  failed_checks text[] not null default array[]::text[],
  participant_count integer not null default 0 check (participant_count between 0 and 10),
  response_count integer not null default 0 check (response_count between 0 and 10),
  average_latency_ms integer check (average_latency_ms is null or average_latency_ms between 0 and 60000),
  realtime_ok boolean,
  duration_ms integer check (duration_ms is null or duration_ms between 0 and 120000),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  completed_at timestamptz
);

create index if not exists v2_session_check_runs_teacher_started_idx
  on public.v2_session_check_runs(teacher_id, started_at desc);
create index if not exists v2_session_check_runs_source_started_idx
  on public.v2_session_check_runs(source_session_id, started_at desc);
create index if not exists v2_session_check_runs_synthetic_idx
  on public.v2_session_check_runs(synthetic_session_id)
  where synthetic_session_id is not null;

alter table public.v2_session_check_runs enable row level security;

create policy v2_session_check_runs_teacher_select
  on public.v2_session_check_runs for select to authenticated
  using (teacher_id = (select auth.uid()));

revoke all on table public.v2_session_check_runs from public, anon, authenticated;
grant select on table public.v2_session_check_runs to authenticated;

create or replace function tedvio_private.v2_cleanup_session_checks_impl_v1()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run record;
  v_cleaned integer := 0;
begin
  for v_run in
    select id, synthetic_session_id
    from public.v2_session_check_runs
    where status = 'running' and expires_at <= clock_timestamp()
    for update skip locked
  loop
    if v_run.synthetic_session_id is not null then
      update public.v2_sessions
      set current_question_id = null
      where id = v_run.synthetic_session_id and is_demo = true;

      delete from public.v2_sessions
      where id = v_run.synthetic_session_id and is_demo = true;
    end if;

    update public.v2_session_check_runs
    set status = 'expired',
        synthetic_session_id = null,
        failed_checks = array['cleanup_timeout'],
        completed_at = clock_timestamp()
    where id = v_run.id;
    v_cleaned := v_cleaned + 1;
  end loop;

  return v_cleaned;
end;
$$;

create or replace function tedvio_private.v2_teacher_start_session_check_impl_v1(
  p_source_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_teacher_id uuid := auth.uid();
  v_source public.v2_sessions%rowtype;
  v_prior record;
  v_session_id uuid;
  v_question_id uuid;
  v_run_id uuid;
  v_code text;
  v_question_count integer;
  v_ready_count integer;
  v_realtime_ready boolean;
  v_attempt integer;
begin
  if v_teacher_id is null then raise exception 'AUTH_REQUIRED'; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_teacher_id::text, 0)
  );
  perform tedvio_private.v2_cleanup_session_checks_impl_v1();

  select * into v_source
  from public.v2_sessions
  where id = p_source_session_id and teacher_id = v_teacher_id;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;

  -- One rehearsal per teacher. A new attempt safely expires an abandoned one.
  for v_prior in
    select id, synthetic_session_id
    from public.v2_session_check_runs
    where teacher_id = v_teacher_id and status = 'running'
    for update
  loop
    if v_prior.synthetic_session_id is not null then
      update public.v2_sessions set current_question_id = null
      where id = v_prior.synthetic_session_id and teacher_id = v_teacher_id and is_demo = true;
      delete from public.v2_sessions
      where id = v_prior.synthetic_session_id and teacher_id = v_teacher_id and is_demo = true;
    end if;
    update public.v2_session_check_runs
    set status = 'expired', synthetic_session_id = null,
        failed_checks = array['superseded'], completed_at = clock_timestamp()
    where id = v_prior.id;
  end loop;

  for v_attempt in 1..20 loop
    v_code := lpad((100000 + floor(random() * 900000))::integer::text, 6, '0');
    exit when not exists (select 1 from public.v2_sessions where code = v_code);
  end loop;
  if exists (select 1 from public.v2_sessions where code = v_code) then
    raise exception 'CHECK_CODE_UNAVAILABLE';
  end if;

  insert into public.v2_sessions(
    teacher_id, code, title, status, competitive, team_mode,
    university, educational_program, group_name, scoring_mode,
    speed_bonus, streak_bonus, randomize_questions, randomize_options,
    roster_required, is_demo
  ) values (
    v_teacher_id, v_code, 'Comprobación técnica TEDVIO', 'draft', true, false,
    'TEDVIO', 'Diagnóstico técnico', 'Sesión temporal', 'accuracy',
    false, false, false, false, false, true
  ) returning id into v_session_id;

  insert into public.v2_questions(
    session_id, position, prompt, question_type, options, correct_answer,
    timer_seconds, status, launched_at
  ) values (
    v_session_id, 1, 'Comprobación técnica de respuesta', 'multiple_choice',
    '["TEDVIO_OK", "RETRY"]'::jsonb, null, 300, 'queued', null
  ) returning id into v_question_id;

  insert into public.v2_question_secrets(question_id, correct_answer, explanation)
  values (v_question_id, '"TEDVIO_OK"'::jsonb, 'Respuesta sintética de comprobación.');

  insert into public.v2_session_check_runs(
    teacher_id, source_session_id, synthetic_session_id
  ) values (
    v_teacher_id, p_source_session_id, v_session_id
  ) returning id into v_run_id;

  select count(*)::integer,
         count(*) filter (where status in ('queued', 'live'))::integer
  into v_question_count, v_ready_count
  from public.v2_questions where session_id = p_source_session_id;

  select count(*) = 4 into v_realtime_ready
  from pg_catalog.pg_publication_tables
  where pubname = 'supabase_realtime'
    and schemaname = 'public'
    and tablename in ('v2_sessions', 'v2_questions', 'v2_participants', 'v2_responses');

  return jsonb_build_object(
    'run_id', v_run_id,
    'session_id', v_session_id,
    'question_id', v_question_id,
    'code', v_code,
    'expected_answer', 'TEDVIO_OK',
    'expires_at', clock_timestamp() + interval '5 minutes',
    'source_status', v_source.status,
    'source_question_count', v_question_count,
    'source_ready_question_count', v_ready_count,
    'realtime_publication_ready', v_realtime_ready,
    'source_code', v_source.code
  );
end;
$$;

create or replace function public.v2_teacher_start_session_check(
  p_source_session_id uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select tedvio_private.v2_teacher_start_session_check_impl_v1(p_source_session_id);
$$;

create or replace function tedvio_private.v2_teacher_finish_session_check_impl_v1(
  p_run_id uuid,
  p_check_results jsonb,
  p_duration_ms integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_teacher_id uuid := auth.uid();
  v_run public.v2_session_check_runs%rowtype;
  v_results jsonb;
  v_total integer := 0;
  v_passed integer := 0;
  v_participants integer := 0;
  v_responses integer := 0;
  v_average integer;
  v_realtime boolean := false;
  v_failed text[] := array[]::text[];
  v_critical_failed boolean := false;
  v_cleaned boolean := false;
  v_status text;
begin
  if v_teacher_id is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_run
  from public.v2_session_check_runs
  where id = p_run_id and teacher_id = v_teacher_id and status = 'running'
  for update;
  if not found then raise exception 'CHECK_RUN_NOT_AVAILABLE'; end if;

  v_results := case
    when jsonb_typeof(p_check_results) = 'array' then p_check_results
    else '[]'::jsonb
  end;
  if jsonb_array_length(v_results) > 20 then raise exception 'TOO_MANY_CHECK_RESULTS'; end if;

  with allowed(name) as (values
    ('database'), ('source_ready'), ('student_surface'), ('projection_surface'), ('public_meta'),
    ('realtime'), ('student_join'), ('teacher_launch'), ('live_question'), ('answer_secret'),
    ('response_submit'), ('duplicate_guard'), ('recovery_receipt'), ('projection_data')
  ), typed_allowed as (
    select name, name <> 'realtime' as critical from allowed
  ), raw as (
    select a.name, a.critical,
           case when e->>'ok' = 'true' then true else false end as ok,
           case when coalesce(e->>'latency_ms', '') ~ '^[0-9]{1,6}$'
             then greatest(0, least(60000, (e->>'latency_ms')::integer)) end as latency_ms
    from typed_allowed a
    left join jsonb_array_elements(v_results) e on e->>'name' = a.name
  ), sanitized as (
    select name, critical, coalesce(bool_and(ok), false) as ok,
           round(avg(latency_ms))::integer as latency_ms
    from raw group by name, critical
  )
  select count(*)::integer,
         count(*) filter (where ok)::integer,
         coalesce(array_agg(name order by name) filter (where not ok), array[]::text[]),
         coalesce(bool_or(ok) filter (where name = 'realtime'), false),
         coalesce(round(avg(latency_ms) filter (where latency_ms is not null)), 0)::integer,
         coalesce(bool_or(not ok and critical), false)
  into v_total, v_passed, v_failed, v_realtime, v_average, v_critical_failed
  from sanitized;

  select count(*)::integer into v_participants
  from public.v2_participants where session_id = v_run.synthetic_session_id;

  select count(*)::integer into v_responses
  from public.v2_responses r
  join public.v2_questions q on q.id = r.question_id
  where q.session_id = v_run.synthetic_session_id;

  if v_participants <> 1 or v_responses <> 1 then
    v_failed := array_append(v_failed, 'server_integrity');
    v_critical_failed := true;
  end if;
  v_total := v_total + 1;
  if v_participants = 1 and v_responses = 1 then v_passed := v_passed + 1; end if;

  if v_run.synthetic_session_id is not null then
    update public.v2_sessions set current_question_id = null
    where id = v_run.synthetic_session_id and teacher_id = v_teacher_id and is_demo = true;
    delete from public.v2_sessions
    where id = v_run.synthetic_session_id and teacher_id = v_teacher_id and is_demo = true;
    v_cleaned := not exists (
      select 1 from public.v2_sessions where id = v_run.synthetic_session_id
    );
  else
    v_cleaned := true;
  end if;

  if not v_cleaned then
    v_failed := array_append(v_failed, 'cleanup');
    v_critical_failed := true;
  end if;
  v_total := v_total + 1;
  if v_cleaned then v_passed := v_passed + 1; end if;

  v_status := case
    when v_critical_failed or v_total = 0 then 'failed'
    when not v_realtime then 'degraded'
    else 'passed'
  end;

  update public.v2_session_check_runs set
    synthetic_session_id = null,
    status = v_status,
    total_checks = least(30, v_total),
    passed_checks = least(30, v_passed),
    failed_checks = v_failed,
    participant_count = v_participants,
    response_count = v_responses,
    average_latency_ms = v_average,
    realtime_ok = v_realtime,
    duration_ms = case when p_duration_ms is null then null
      else greatest(0, least(120000, p_duration_ms)) end,
    completed_at = clock_timestamp()
  where id = p_run_id;

  return jsonb_build_object(
    'run_id', p_run_id,
    'status', v_status,
    'total_checks', v_total,
    'passed_checks', v_passed,
    'failed_checks', v_failed,
    'participant_count', v_participants,
    'response_count', v_responses,
    'average_latency_ms', v_average,
    'realtime_ok', v_realtime,
    'duration_ms', case when p_duration_ms is null then null
      else greatest(0, least(120000, p_duration_ms)) end,
    'cleanup_ok', v_cleaned
  );
end;
$$;

create or replace function public.v2_teacher_finish_session_check(
  p_run_id uuid,
  p_check_results jsonb,
  p_duration_ms integer default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select tedvio_private.v2_teacher_finish_session_check_impl_v1(
    p_run_id, p_check_results, p_duration_ms
  );
$$;

create or replace function public.v2_teacher_cleanup_session_checks()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  return tedvio_private.v2_cleanup_session_checks_impl_v1();
end;
$$;

revoke all on function tedvio_private.v2_cleanup_session_checks_impl_v1() from public;
revoke all on function tedvio_private.v2_teacher_start_session_check_impl_v1(uuid) from public;
revoke all on function tedvio_private.v2_teacher_finish_session_check_impl_v1(uuid, jsonb, integer) from public;
grant execute on function tedvio_private.v2_cleanup_session_checks_impl_v1() to authenticated;
grant execute on function tedvio_private.v2_teacher_start_session_check_impl_v1(uuid) to authenticated;
grant execute on function tedvio_private.v2_teacher_finish_session_check_impl_v1(uuid, jsonb, integer) to authenticated;

revoke all on function public.v2_teacher_start_session_check(uuid) from public, anon;
revoke all on function public.v2_teacher_finish_session_check(uuid, jsonb, integer) from public, anon;
revoke all on function public.v2_teacher_cleanup_session_checks() from public, anon;
grant execute on function public.v2_teacher_start_session_check(uuid) to authenticated;
grant execute on function public.v2_teacher_finish_session_check(uuid, jsonb, integer) to authenticated;
grant execute on function public.v2_teacher_cleanup_session_checks() to authenticated;

comment on table public.v2_session_check_runs
  is 'Stores only technical summaries for isolated, automatically cleaned classroom rehearsals.';
