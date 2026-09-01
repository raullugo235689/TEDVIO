-- Pilot Health 1.x: privacy-minimal session telemetry and an isolated load lab.

create table if not exists public.v2_session_health_events (
  id bigint generated always as identity primary key,
  teacher_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.v2_sessions(id) on delete cascade,
  participant_id uuid references public.v2_participants(id) on delete set null,
  actor_role text not null check (actor_role in ('teacher', 'student')),
  event_type text not null check (event_type in (
    'client_connected', 'client_reconnecting', 'client_offline',
    'response_confirmed', 'response_queued', 'response_recovered', 'response_failed'
  )),
  latency_ms integer check (latency_ms is null or latency_ms between 0 and 60000),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(details) = 'object')
);

create index if not exists v2_session_health_events_teacher_session_created_idx
  on public.v2_session_health_events(teacher_id, session_id, created_at desc);
create index if not exists v2_session_health_events_participant_created_idx
  on public.v2_session_health_events(participant_id, created_at desc)
  where participant_id is not null;

alter table public.v2_session_health_events enable row level security;

create policy v2_session_health_events_teacher_select
  on public.v2_session_health_events for select to authenticated
  using (teacher_id = (select auth.uid()));

revoke all on table public.v2_session_health_events from public, anon, authenticated;
grant select on table public.v2_session_health_events to authenticated;

create or replace function tedvio_private.v2_record_session_health_impl_v1(
  p_session_id uuid,
  p_participant_id uuid,
  p_event_type text,
  p_latency_ms integer default null,
  p_details jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_teacher_id uuid;
  v_actor_role text;
  v_safe_details jsonb;
begin
  if p_event_type not in (
    'client_connected', 'client_reconnecting', 'client_offline',
    'response_confirmed', 'response_queued', 'response_recovered', 'response_failed'
  ) then
    raise exception 'INVALID_HEALTH_EVENT';
  end if;

  select teacher_id into v_teacher_id
  from public.v2_sessions where id = p_session_id;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;

  if auth.uid() = v_teacher_id then
    v_actor_role := 'teacher';
    p_participant_id := null;
  elsif p_participant_id is not null and exists (
    select 1 from public.v2_participants
    where id = p_participant_id and session_id = p_session_id
  ) then
    v_actor_role := 'student';
  else
    raise exception 'HEALTH_ACTOR_NOT_ALLOWED';
  end if;

  v_safe_details := jsonb_strip_nulls(jsonb_build_object(
    'surface', left(coalesce(p_details ->> 'surface', ''), 30),
    'question_id', case
      when coalesce(p_details ->> 'question_id', '') ~ '^[0-9a-f-]{36}$'
      then p_details ->> 'question_id' else null end,
    'reason', left(coalesce(p_details ->> 'reason', ''), 80)
  ));

  if exists (
    select 1 from public.v2_session_health_events
    where session_id = p_session_id
      and participant_id is not distinct from p_participant_id
      and actor_role = v_actor_role
      and event_type = p_event_type
      and created_at > clock_timestamp() - interval '1 second'
  ) then
    return false;
  end if;

  insert into public.v2_session_health_events(
    teacher_id, session_id, participant_id, actor_role, event_type, latency_ms, details
  ) values (
    v_teacher_id, p_session_id, p_participant_id, v_actor_role, p_event_type,
    case when p_latency_ms is null then null else greatest(0, least(60000, p_latency_ms)) end,
    v_safe_details
  );
  return true;
end;
$$;

create or replace function public.v2_record_session_health(
  p_session_id uuid,
  p_participant_id uuid,
  p_event_type text,
  p_latency_ms integer default null,
  p_details jsonb default '{}'::jsonb
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select tedvio_private.v2_record_session_health_impl_v1(
    p_session_id, p_participant_id, p_event_type, p_latency_ms, p_details
  );
$$;

revoke all on function tedvio_private.v2_record_session_health_impl_v1(uuid, uuid, text, integer, jsonb) from public;
grant execute on function tedvio_private.v2_record_session_health_impl_v1(uuid, uuid, text, integer, jsonb) to anon, authenticated;
revoke all on function public.v2_record_session_health(uuid, uuid, text, integer, jsonb) from public;
grant execute on function public.v2_record_session_health(uuid, uuid, text, integer, jsonb) to anon, authenticated;

create table if not exists public.v2_pilot_load_runs (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  requested_clients integer not null check (requested_clients between 1 and 100),
  disconnect_percent integer not null check (disconnect_percent between 0 and 50),
  status text not null default 'running' check (status in ('running', 'healthy', 'degraded', 'critical')),
  accepted_clients integer not null default 0,
  duplicates_blocked integer not null default 0,
  recovered_clients integer not null default 0,
  failed_requests integer not null default 0,
  average_latency_ms integer,
  p95_latency_ms integer,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists v2_pilot_load_runs_teacher_started_idx
  on public.v2_pilot_load_runs(teacher_id, started_at desc);

create table if not exists public.v2_pilot_load_probes (
  run_id uuid not null references public.v2_pilot_load_runs(id) on delete cascade,
  client_no integer not null check (client_no between 1 and 100),
  attempts integer not null default 1 check (attempts between 1 and 20),
  recovered boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (run_id, client_no)
);

alter table public.v2_pilot_load_runs enable row level security;
alter table public.v2_pilot_load_probes enable row level security;

create policy v2_pilot_load_runs_owner_all
  on public.v2_pilot_load_runs for all to authenticated
  using (teacher_id = (select auth.uid()))
  with check (teacher_id = (select auth.uid()));

create policy v2_pilot_load_probes_owner_all
  on public.v2_pilot_load_probes for all to authenticated
  using (exists (
    select 1 from public.v2_pilot_load_runs r
    where r.id = v2_pilot_load_probes.run_id and r.teacher_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.v2_pilot_load_runs r
    where r.id = v2_pilot_load_probes.run_id and r.teacher_id = (select auth.uid())
  ));

revoke all on table public.v2_pilot_load_runs, public.v2_pilot_load_probes from public, anon;
grant select, insert, update on table public.v2_pilot_load_runs to authenticated;
grant select, insert, update, delete on table public.v2_pilot_load_probes to authenticated;

create or replace function public.v2_teacher_start_load_test(
  p_virtual_clients integer,
  p_disconnect_percent integer default 10
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare v_run_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_virtual_clients not between 1 and 100 then raise exception 'INVALID_CLIENT_COUNT'; end if;
  if p_disconnect_percent not between 0 and 50 then raise exception 'INVALID_DISCONNECT_PERCENT'; end if;
  insert into public.v2_pilot_load_runs(teacher_id, requested_clients, disconnect_percent)
  values (auth.uid(), p_virtual_clients, p_disconnect_percent)
  returning id into v_run_id;
  return v_run_id;
end;
$$;

create or replace function public.v2_teacher_load_probe(
  p_run_id uuid,
  p_client_no integer,
  p_recovered boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_requested integer;
  v_inserted integer;
  v_attempts integer;
begin
  select requested_clients into v_requested
  from public.v2_pilot_load_runs
  where id = p_run_id and teacher_id = auth.uid() and status = 'running';
  if not found then raise exception 'LOAD_RUN_NOT_AVAILABLE'; end if;
  if p_client_no not between 1 and v_requested then raise exception 'INVALID_CLIENT_NUMBER'; end if;

  insert into public.v2_pilot_load_probes(run_id, client_no, recovered)
  values (p_run_id, p_client_no, coalesce(p_recovered, false))
  on conflict (run_id, client_no) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    update public.v2_pilot_load_probes
    set attempts = least(20, attempts + 1), recovered = recovered or coalesce(p_recovered, false)
    where run_id = p_run_id and client_no = p_client_no
    returning attempts into v_attempts;
  else
    v_attempts := 1;
  end if;

  return jsonb_build_object('accepted', v_inserted = 1, 'attempts', v_attempts);
end;
$$;

create or replace function public.v2_teacher_finish_load_test(
  p_run_id uuid,
  p_latency_samples integer[],
  p_failed_requests integer default 0
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_run public.v2_pilot_load_runs%rowtype;
  v_accepted integer;
  v_duplicates integer;
  v_recovered integer;
  v_average integer;
  v_p95 integer;
  v_status text;
begin
  select * into v_run from public.v2_pilot_load_runs
  where id = p_run_id and teacher_id = auth.uid() and status = 'running'
  for update;
  if not found then raise exception 'LOAD_RUN_NOT_AVAILABLE'; end if;
  if coalesce(cardinality(p_latency_samples), 0) > 300 then raise exception 'TOO_MANY_LATENCY_SAMPLES'; end if;
  if exists (select 1 from unnest(coalesce(p_latency_samples, array[]::integer[])) x where x not between 0 and 60000) then
    raise exception 'INVALID_LATENCY_SAMPLE';
  end if;

  select count(*)::integer, coalesce(sum(attempts - 1), 0)::integer,
    count(*) filter (where recovered)::integer
  into v_accepted, v_duplicates, v_recovered
  from public.v2_pilot_load_probes where run_id = p_run_id;

  select coalesce(round(avg(x)), 0)::integer,
    coalesce(round((percentile_cont(0.95) within group (order by x))::numeric), 0)::integer
  into v_average, v_p95
  from unnest(coalesce(p_latency_samples, array[]::integer[])) x;

  v_status := case
    when v_accepted < v_run.requested_clients or greatest(0, p_failed_requests) > 0 then 'critical'
    when v_p95 > 1500 then 'degraded'
    else 'healthy'
  end;

  update public.v2_pilot_load_runs set
    status = v_status,
    accepted_clients = v_accepted,
    duplicates_blocked = v_duplicates,
    recovered_clients = v_recovered,
    failed_requests = greatest(0, least(1000, p_failed_requests)),
    average_latency_ms = v_average,
    p95_latency_ms = v_p95,
    completed_at = clock_timestamp()
  where id = p_run_id;

  delete from public.v2_pilot_load_probes where run_id = p_run_id;

  return jsonb_build_object(
    'run_id', p_run_id, 'status', v_status, 'requested_clients', v_run.requested_clients,
    'accepted_clients', v_accepted, 'duplicates_blocked', v_duplicates,
    'recovered_clients', v_recovered, 'failed_requests', greatest(0, p_failed_requests),
    'average_latency_ms', v_average, 'p95_latency_ms', v_p95
  );
end;
$$;

revoke all on function public.v2_teacher_start_load_test(integer, integer) from public, anon;
revoke all on function public.v2_teacher_load_probe(uuid, integer, boolean) from public, anon;
revoke all on function public.v2_teacher_finish_load_test(uuid, integer[], integer) from public, anon;
grant execute on function public.v2_teacher_start_load_test(integer, integer) to authenticated;
grant execute on function public.v2_teacher_load_probe(uuid, integer, boolean) to authenticated;
grant execute on function public.v2_teacher_finish_load_test(uuid, integer[], integer) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.v2_session_health_events;
exception when duplicate_object then null;
end;
$$;
