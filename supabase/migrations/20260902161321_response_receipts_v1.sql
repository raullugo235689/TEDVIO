-- TEDVIO Response Receipts 1.x
-- Additive and backwards-compatible: legacy clients keep their existing RPC.

alter table public.v2_responses
  add column if not exists request_id uuid;

comment on column public.v2_responses.request_id is
  'Client-generated idempotency key. NULL is retained for legacy clients.';

create unique index if not exists v2_responses_participant_request_uidx
  on public.v2_responses (participant_id, request_id)
  where request_id is not null;

create table if not exists tedvio_private.v2_response_receipts_v1 (
  participant_id uuid not null references public.v2_participants(id) on delete cascade,
  request_id uuid not null,
  response_id uuid not null references public.v2_responses(id) on delete cascade,
  question_id uuid not null references public.v2_questions(id) on delete cascade,
  answer jsonb not null,
  outcome text not null check (outcome in ('recorded', 'already_recorded')),
  created_at timestamptz not null default clock_timestamp(),
  primary key (participant_id, request_id)
);

create index if not exists v2_response_receipts_v1_response_idx
  on tedvio_private.v2_response_receipts_v1 (response_id);

revoke all on table tedvio_private.v2_response_receipts_v1
  from public, anon, authenticated, service_role;

comment on table tedvio_private.v2_response_receipts_v1 is
  'Private idempotency aliases. Binds every client request to one durable response without exposing answer content.';

create or replace function tedvio_private.v2_submit_response_impl_v68(
  p_question_id uuid,
  p_participant_id uuid,
  p_answer jsonb,
  p_request_id uuid
)
returns table(
  is_correct boolean,
  points integer,
  streak integer,
  explanation text,
  response_id uuid,
  stored_request_id uuid,
  submitted_at timestamptz,
  outcome text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  q public.v2_questions%rowtype;
  s public.v2_sessions%rowtype;
  p public.v2_participants%rowtype;
  v_response public.v2_responses%rowtype;
  v_session_id uuid;
  v_key jsonb;
  v_answer_sorted jsonb;
  v_key_sorted jsonb;
  v_correct boolean;
  v_points integer := 0;
  v_streak integer := 0;
  v_prev_streak integer := 0;
  v_prev_correct boolean := false;
  v_elapsed numeric := 0;
  v_bonus integer := 0;
  v_now timestamptz;
  dx numeric;
  dy numeric;
  radius numeric;
begin
  if p_answer is null then
    raise exception 'ANSWER_REQUIRED';
  end if;

  -- Confirmed retries stay recoverable even after reveal, close or expiry.
  if p_request_id is not null then
    select vr.* into v_response
    from public.v2_responses vr
    where vr.participant_id = p_participant_id
      and vr.request_id = p_request_id
    limit 1;

    if found then
      if v_response.question_id <> p_question_id
        or v_response.answer is distinct from p_answer then
        raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = '22023';
      end if;

      return query select
        v_response.is_correct,
        v_response.points,
        v_response.streak,
        null::text,
        v_response.id,
        v_response.request_id,
        v_response.submitted_at,
        'replayed'::text;
      return;
    end if;
  end if;

  -- Preserve the first answer submitted from another tab or legacy client.
  select vr.* into v_response
  from public.v2_responses vr
  where vr.question_id = p_question_id
    and vr.participant_id = p_participant_id
  limit 1;

  if found then
    if p_request_id is null then
      raise exception 'duplicate response';
    end if;

    return query select
      v_response.is_correct,
      v_response.points,
      v_response.streak,
      null::text,
      v_response.id,
      v_response.request_id,
      v_response.submitted_at,
      'already_recorded'::text;
    return;
  end if;

  select vq.session_id into v_session_id
  from public.v2_questions vq
  where vq.id = p_question_id;

  if not found then raise exception 'QUESTION_NOT_LIVE'; end if;

  -- Match the teacher command lock order: session, question, participant.
  select vs.* into s
  from public.v2_sessions vs
  where vs.id = v_session_id
  for share;

  if not found then raise exception 'QUESTION_NOT_LIVE'; end if;

  select vq.* into q
  from public.v2_questions vq
  where vq.id = p_question_id
    and vq.session_id = s.id
  for share;

  if not found then raise exception 'QUESTION_NOT_LIVE'; end if;

  select vp.* into p
  from public.v2_participants vp
  where vp.id = p_participant_id
    and vp.session_id = s.id
  for update;

  if not found then raise exception 'PARTICIPANT_NOT_IN_SESSION'; end if;

  -- Validate the live boundary only after all locks are held. clock_timestamp()
  -- prevents lock waits from extending the student's answer window.
  v_now := clock_timestamp();
  if s.status is distinct from 'live'
    or s.current_question_id is distinct from q.id
    or q.status is distinct from 'live'
    or q.launched_at is null then
    raise exception 'QUESTION_NOT_LIVE';
  end if;

  if v_now > q.launched_at
    + (greatest(coalesce(q.timer_seconds, 30), 1) * interval '1 second') then
    raise exception 'QUESTION_EXPIRED';
  end if;

  -- Recheck under the participant lock to serialize concurrent tabs.
  if p_request_id is not null then
    select vr.* into v_response
    from public.v2_responses vr
    where vr.participant_id = p.id
      and vr.request_id = p_request_id
    limit 1;

    if found then
      if v_response.question_id <> q.id
        or v_response.answer is distinct from p_answer then
        raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = '22023';
      end if;

      return query select
        v_response.is_correct,
        v_response.points,
        v_response.streak,
        null::text,
        v_response.id,
        v_response.request_id,
        v_response.submitted_at,
        'replayed'::text;
      return;
    end if;
  end if;

  select vr.* into v_response
  from public.v2_responses vr
  where vr.question_id = q.id
    and vr.participant_id = p.id
  limit 1;

  if found then
    if p_request_id is null then raise exception 'duplicate response'; end if;

    return query select
      v_response.is_correct,
      v_response.points,
      v_response.streak,
      null::text,
      v_response.id,
      v_response.request_id,
      v_response.submitted_at,
      'already_recorded'::text;
    return;
  end if;

  select sec.correct_answer into v_key
  from public.v2_question_secrets sec
  where sec.question_id = q.id;

  v_key := coalesce(v_key, q.correct_answer);

  if q.question_type = 'multiple_select' then
    if pg_catalog.jsonb_typeof(p_answer) = 'array'
      and pg_catalog.jsonb_typeof(v_key) = 'array' then
      select coalesce(pg_catalog.jsonb_agg(item.value order by item.value::text), '[]'::jsonb)
        into v_answer_sorted
      from pg_catalog.jsonb_array_elements(p_answer) as item(value);
      select coalesce(pg_catalog.jsonb_agg(item.value order by item.value::text), '[]'::jsonb)
        into v_key_sorted
      from pg_catalog.jsonb_array_elements(v_key) as item(value);
      v_correct := v_answer_sorted = v_key_sorted;
    else
      v_correct := false;
    end if;
  elsif q.question_type in ('multiple_choice', 'true_false', 'numeric', 'ordering') then
    v_correct := p_answer = v_key;
  elsif q.question_type = 'hotspot' then
    if v_key ? 'x' and v_key ? 'y' and v_key ? 'radius'
      and p_answer ? 'x' and p_answer ? 'y' then
      dx := (p_answer ->> 'x')::numeric - (v_key ->> 'x')::numeric;
      dy := (p_answer ->> 'y')::numeric - (v_key ->> 'y')::numeric;
      radius := (v_key ->> 'radius')::numeric;
      v_correct := sqrt(dx * dx + dy * dy) <= radius;
    else
      v_correct := false;
    end if;
  else
    v_correct := null;
  end if;

  if v_correct is true then
    select coalesce(vr.streak, 0), coalesce(vr.is_correct, false)
      into v_prev_streak, v_prev_correct
    from public.v2_responses vr
    join public.v2_questions pq on pq.id = vr.question_id
    where vr.participant_id = p.id
      and pq.session_id = s.id
      and vr.is_correct is not null
    order by vr.submitted_at desc
    limit 1;

    v_prev_streak := coalesce(v_prev_streak, 0);
    v_prev_correct := coalesce(v_prev_correct, false);
    v_streak := case when v_prev_correct then v_prev_streak + 1 else 1 end;

    if s.competitive and s.scoring_mode <> 'none' then
      v_points := s.base_points;
      if s.scoring_mode = 'speed' and s.speed_bonus then
        v_elapsed := greatest(0, extract(epoch from (v_now - q.launched_at)));
        v_bonus := greatest(0, round(
          s.speed_bonus_max * (1 - least(v_elapsed / greatest(coalesce(q.timer_seconds, 30), 1), 1))
        )::integer);
        v_points := v_points + v_bonus;
      end if;
      if s.streak_bonus and v_streak >= 3 then
        v_points := v_points + least(s.base_points, (v_streak - 2) * s.streak_bonus_step);
      end if;
    end if;
  elsif v_correct is false then
    v_streak := 0;
  end if;

  begin
    insert into public.v2_responses(
      question_id, participant_id, answer, is_correct, points, streak, request_id, submitted_at
    ) values (
      q.id, p.id, p_answer, v_correct, v_points, v_streak, p_request_id, v_now
    ) returning * into v_response;
  exception when unique_violation then
    if p_request_id is null then raise exception 'duplicate response'; end if;

    select vr.* into v_response
    from public.v2_responses vr
    where vr.participant_id = p.id
      and vr.request_id = p_request_id
    limit 1;

    if found then
      if v_response.question_id <> q.id
        or v_response.answer is distinct from p_answer then
        raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = '22023';
      end if;
      return query select
        v_response.is_correct, v_response.points, v_response.streak, null::text,
        v_response.id, v_response.request_id, v_response.submitted_at, 'replayed'::text;
      return;
    end if;

    select vr.* into v_response
    from public.v2_responses vr
    where vr.question_id = q.id
      and vr.participant_id = p.id
    limit 1;

    if found then
      return query select
        v_response.is_correct, v_response.points, v_response.streak, null::text,
        v_response.id, v_response.request_id, v_response.submitted_at, 'already_recorded'::text;
      return;
    end if;
    raise;
  end;

  return query select
    v_correct, v_points, v_streak, null::text,
    v_response.id, v_response.request_id, v_response.submitted_at, 'recorded'::text;
end;
$$;

revoke all on function tedvio_private.v2_submit_response_impl_v68(uuid, uuid, jsonb, uuid)
  from public, anon, authenticated, service_role;

-- Compatibility shim: exact legacy signature and duplicate behaviour.
create or replace function tedvio_private.v2_submit_response_impl_v67(
  p_question_id uuid,
  p_participant_id uuid,
  p_answer jsonb
)
returns table(is_correct boolean, points integer, streak integer, explanation text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform tedvio_private.rate_limit_v67('submit_ip', '*', 1500, 60);
  perform tedvio_private.rate_limit_v67(
    'submit_identity',
    coalesce(p_question_id::text, '') || '|' || coalesce(p_participant_id::text, ''),
    8,
    60
  );
  return query
  select null::boolean, null::integer, null::integer, null::text
  from tedvio_private.v2_submit_response_impl_v68(
    p_question_id, p_participant_id, p_answer, null
  ) x
  limit 1;
end;
$$;

revoke all on function tedvio_private.v2_submit_response_impl_v67(uuid, uuid, jsonb)
  from public;
grant execute on function tedvio_private.v2_submit_response_impl_v67(uuid, uuid, jsonb)
  to anon, authenticated, service_role;

create or replace function public.v2_submit_response(
  p_question_id uuid,
  p_participant_id uuid,
  p_answer jsonb
)
returns table(is_correct boolean, points integer, streak integer, explanation text)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return query
  select null::boolean, null::integer, null::integer, null::text
  from tedvio_private.v2_submit_response_impl_v67(
    p_question_id, p_participant_id, p_answer
  )
  limit 1;
end;
$$;

revoke all on function public.v2_submit_response(uuid, uuid, jsonb) from public;
grant execute on function public.v2_submit_response(uuid, uuid, jsonb)
  to anon, authenticated, service_role;

create or replace function tedvio_private.v2_submit_response_receipt_impl_v1(
  p_question_id uuid,
  p_participant_id uuid,
  p_answer jsonb,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.v2_responses%rowtype;
  v_receipt tedvio_private.v2_response_receipts_v1%rowtype;
  v_result record;
  v_receipt_status text;
begin
  perform tedvio_private.rate_limit_v67('submit_ip', '*', 1500, 60);
  if p_request_id is null then raise exception 'REQUEST_ID_REQUIRED'; end if;
  if p_answer is null then raise exception 'ANSWER_REQUIRED'; end if;

  -- Exact concurrent retries share one transaction boundary. Only the first
  -- request consumes the identity limit; followers receive the same receipt.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('tedvio-response|' || p_request_id::text, 0)
  );

  select receipt.* into v_receipt
  from tedvio_private.v2_response_receipts_v1 receipt
  where receipt.participant_id = p_participant_id
    and receipt.request_id = p_request_id;

  if found then
    if v_receipt.question_id <> p_question_id
      or v_receipt.answer is distinct from p_answer then
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = '22023';
    end if;

    select response.* into v_existing
    from public.v2_responses response
    where response.id = v_receipt.response_id;
    if not found then raise exception 'RESPONSE_RECEIPT_ORPHANED'; end if;

    v_receipt_status := case
      when v_receipt.outcome = 'recorded' then 'replayed'
      else 'already_recorded'
    end;
    return jsonb_build_object(
      'receipt_version', 1,
      'status', v_receipt_status,
      'confirmed', true,
      'accepted', v_receipt.outcome = 'recorded',
      'duplicate', true,
      'request_id', p_request_id,
      'response_id', v_existing.id,
      'question_id', v_receipt.question_id,
      'submitted_at', v_existing.submitted_at
    );
  end if;

  select vr.* into v_existing
  from public.v2_responses vr
  where vr.participant_id = p_participant_id
    and vr.request_id = p_request_id
  limit 1;

  if found then
    if v_existing.question_id <> p_question_id
      or v_existing.answer is distinct from p_answer then
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = '22023';
    end if;
    insert into tedvio_private.v2_response_receipts_v1(
      participant_id, request_id, response_id, question_id, answer, outcome
    ) values (
      p_participant_id, p_request_id, v_existing.id,
      v_existing.question_id, p_answer, 'recorded'
    ) on conflict (participant_id, request_id) do nothing;
    return jsonb_build_object(
      'receipt_version', 1, 'status', 'replayed', 'confirmed', true,
      'accepted', true, 'duplicate', true, 'request_id', p_request_id,
      'response_id', v_existing.id, 'question_id', v_existing.question_id,
      'submitted_at', v_existing.submitted_at
    );
  end if;

  perform tedvio_private.rate_limit_v67(
    'submit_identity',
    coalesce(p_question_id::text, '') || '|' || coalesce(p_participant_id::text, ''),
    8,
    60
  );

  select * into v_result
  from tedvio_private.v2_submit_response_impl_v68(
    p_question_id, p_participant_id, p_answer, p_request_id
  )
  limit 1;

  insert into tedvio_private.v2_response_receipts_v1(
    participant_id, request_id, response_id, question_id, answer, outcome
  ) values (
    p_participant_id,
    p_request_id,
    v_result.response_id,
    p_question_id,
    p_answer,
    case when v_result.outcome in ('recorded', 'replayed')
      then 'recorded' else 'already_recorded' end
  );

  return jsonb_build_object(
    'receipt_version', 1,
    'status', v_result.outcome,
    'confirmed', true,
    'accepted', v_result.outcome in ('recorded', 'replayed'),
    'duplicate', v_result.outcome <> 'recorded',
    'request_id', p_request_id,
    'response_id', v_result.response_id,
    'question_id', p_question_id,
    'submitted_at', v_result.submitted_at
  );
end;
$$;
