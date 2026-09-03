-- Recovered from the production migration ledger for deterministic rebuilds.
create or replace function tedvio_private.broadcast_session_state_v64()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  sid uuid;
  qid uuid;
begin
  if tg_table_name='v2_sessions' then
    sid := coalesce(new.id, old.id);
  elsif tg_table_name in ('v2_questions','v2_participants') then
    sid := coalesce(new.session_id, old.session_id);
  elsif tg_table_name='v2_responses' then
    qid := coalesce(new.question_id, old.question_id);
    select q.session_id into sid from public.v2_questions q where q.id=qid;
  end if;

  if sid is not null then
    perform realtime.send(
      jsonb_build_object(
        'kind', tg_table_name,
        'op', tg_op,
        'at', clock_timestamp()
      ),
      'state_changed',
      'tedvio:session:' || sid::text,
      false
    );
  end if;
  return null;
end;
$$;

revoke all on function tedvio_private.broadcast_session_state_v64() from public, anon, authenticated;

drop trigger if exists tedvio_v64_session_broadcast on public.v2_sessions;
create trigger tedvio_v64_session_broadcast
after insert or update or delete on public.v2_sessions
for each row execute function tedvio_private.broadcast_session_state_v64();

drop trigger if exists tedvio_v64_question_broadcast on public.v2_questions;
create trigger tedvio_v64_question_broadcast
after insert or update or delete on public.v2_questions
for each row execute function tedvio_private.broadcast_session_state_v64();

drop trigger if exists tedvio_v64_participant_broadcast on public.v2_participants;
create trigger tedvio_v64_participant_broadcast
after insert or update or delete on public.v2_participants
for each row execute function tedvio_private.broadcast_session_state_v64();

drop trigger if exists tedvio_v64_response_broadcast on public.v2_responses;
create trigger tedvio_v64_response_broadcast
after insert or update or delete on public.v2_responses
for each row execute function tedvio_private.broadcast_session_state_v64();

