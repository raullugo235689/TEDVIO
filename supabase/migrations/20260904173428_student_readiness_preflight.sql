-- Stability 2.6: durable, privacy-minimal readiness signals for live clients.

alter table public.v2_session_health_events
  drop constraint if exists v2_session_health_events_event_type_check;

alter table public.v2_session_health_events
  add constraint v2_session_health_events_event_type_check
  check (event_type in (
    'client_connected', 'client_reconnecting', 'client_offline',
    'client_render_failed',
    'client_ready', 'client_degraded', 'client_update_required',
    'response_confirmed', 'response_queued', 'response_recovered', 'response_failed'
  ));

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
    'client_render_failed',
    'client_ready', 'client_degraded', 'client_update_required',
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
    'reason', left(coalesce(p_details ->> 'reason', ''), 80),
    'reference', case
      when coalesce(p_details ->> 'reference', '') ~ '^LIVE-[A-Z0-9]+-[A-Z0-9]+$'
      then left(p_details ->> 'reference', 64) else null end,
    'build', case
      when coalesce(p_details ->> 'build', '') ~ '^[a-zA-Z0-9._-]{1,80}$'
      then p_details ->> 'build' else null end,
    'stage', case
      when p_details ->> 'stage' in ('boot', 'join', 'lobby', 'question', 'result', 'finished')
      then p_details ->> 'stage' else null end
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

revoke all on function tedvio_private.v2_record_session_health_impl_v1(uuid, uuid, text, integer, jsonb) from public;
grant execute on function tedvio_private.v2_record_session_health_impl_v1(uuid, uuid, text, integer, jsonb) to anon, authenticated;
