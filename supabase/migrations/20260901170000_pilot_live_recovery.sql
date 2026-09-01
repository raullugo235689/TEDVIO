-- Pilot recovery 1.x: atomic teacher commands and durable student receipts.

create or replace function public.v2_teacher_classroom_command(
  p_session_id uuid,
  p_action text,
  p_question_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session public.v2_sessions%rowtype;
  v_question public.v2_questions%rowtype;
  v_now timestamptz := clock_timestamp();
  v_applied boolean := false;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into v_session
  from public.v2_sessions
  where id = p_session_id and teacher_id = auth.uid()
  for update;

  if not found then
    raise exception 'SESSION_NOT_FOUND';
  end if;

  if p_action = 'launch' then
    if v_session.status = 'closed' then
      raise exception 'SESSION_CLOSED';
    end if;

    select * into v_question
    from public.v2_questions
    where id = p_question_id and session_id = p_session_id;
    if not found then
      raise exception 'QUESTION_NOT_FOUND';
    end if;

    if not (v_session.status = 'live'
      and v_session.current_question_id = p_question_id
      and v_question.status = 'live') then
      update public.v2_questions
      set status = 'closed', closed_at = v_now
      where session_id = p_session_id
        and id <> p_question_id
        and status in ('live', 'revealed');

      update public.v2_questions
      set status = 'live', launched_at = v_now, closed_at = null
      where id = p_question_id and session_id = p_session_id;

      update public.v2_sessions
      set status = 'live',
          current_question_id = p_question_id,
          started_at = coalesce(started_at, v_now),
          closed_at = null
      where id = p_session_id;
      v_applied := true;
    end if;

  elsif p_action = 'reveal' then
    if v_session.status = 'closed' then
      raise exception 'SESSION_CLOSED';
    end if;

    select * into v_question
    from public.v2_questions
    where id = p_question_id and session_id = p_session_id;
    if not found then
      raise exception 'QUESTION_NOT_FOUND';
    end if;
    if v_question.status not in ('live', 'revealed') then
      raise exception 'QUESTION_NOT_ACTIVE';
    end if;

    if v_question.status <> 'revealed' then
      update public.v2_questions
      set status = 'revealed', closed_at = v_now
      where id = p_question_id and session_id = p_session_id;
      v_applied := true;
    end if;

  elsif p_action = 'close_question' then
    select * into v_question
    from public.v2_questions
    where id = p_question_id and session_id = p_session_id;
    if not found then
      raise exception 'QUESTION_NOT_FOUND';
    end if;

    if v_question.status <> 'closed' then
      update public.v2_questions
      set status = 'closed', closed_at = coalesce(closed_at, v_now)
      where id = p_question_id and session_id = p_session_id;
      v_applied := true;
    end if;

    if v_session.current_question_id = p_question_id then
      update public.v2_sessions set current_question_id = null where id = p_session_id;
      v_applied := true;
    end if;

  elsif p_action = 'close_session' then
    if v_session.status <> 'closed' then
      update public.v2_questions
      set status = 'closed', closed_at = coalesce(closed_at, v_now)
      where session_id = p_session_id and status in ('live', 'revealed');

      update public.v2_sessions
      set status = 'closed', current_question_id = null, closed_at = coalesce(closed_at, v_now)
      where id = p_session_id;
      v_applied := true;
    end if;
  else
    raise exception 'INVALID_ACTION';
  end if;

  select * into v_session from public.v2_sessions where id = p_session_id;
  return jsonb_build_object(
    'action', p_action,
    'session_id', v_session.id,
    'session_status', v_session.status,
    'current_question_id', v_session.current_question_id,
    'applied', v_applied
  );
end;
$$;

revoke all on function public.v2_teacher_classroom_command(uuid, text, uuid) from public, anon;
grant execute on function public.v2_teacher_classroom_command(uuid, text, uuid) to authenticated;

create or replace function tedvio_private.v2_student_answer_result_impl_v67(
  p_question_id uuid,
  p_participant_id uuid
)
returns table(answer jsonb, is_correct boolean, points integer, streak integer, submitted_at timestamptz)
language sql
security definer
set search_path = ''
as $$
  select
    case when q.status = 'revealed' or s.status = 'closed' then r.answer else null end,
    case when q.status = 'revealed' or s.status = 'closed' then r.is_correct else null end,
    case when q.status = 'revealed' or s.status = 'closed' then r.points else 0 end,
    case when q.status = 'revealed' or s.status = 'closed' then r.streak else 0 end,
    r.submitted_at
  from public.v2_responses r
  join public.v2_questions q on q.id = r.question_id
  join public.v2_sessions s on s.id = q.session_id
  join public.v2_participants p on p.id = r.participant_id and p.session_id = s.id
  where r.question_id = p_question_id and r.participant_id = p_participant_id
  limit 1;
$$;

comment on function public.v2_teacher_classroom_command(uuid, text, uuid)
  is 'Serializes live classroom state transitions so reconnects and repeated commands are safe.';
