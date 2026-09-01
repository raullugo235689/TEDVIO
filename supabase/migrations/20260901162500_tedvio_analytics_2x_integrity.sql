create index if not exists v2_group_students_group_enrollment_normalized_idx
  on public.v2_group_students (group_id, lower(btrim(enrollment)))
  where active;

drop index if exists public.v2_responses_participant_question_analytics_idx;

drop function if exists public.v2_teacher_classroom_analytics(uuid, uuid, date, date, numeric, numeric);

create or replace function public.v2_teacher_classroom_analytics(
  p_group_id uuid default null,
  p_period_id uuid default null,
  p_from date default null,
  p_to date default null,
  p_accuracy_threshold numeric default 60,
  p_participation_threshold numeric default 60,
  p_timezone text default 'UTC'
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
with
me as (
  select auth.uid() as uid
),
selected_period as (
  select p.*
  from public.v2_academic_periods p, me
  where p.teacher_id = me.uid
    and p.id = p_period_id
    and (p_group_id is null or p.group_id = p_group_id)
),
eligible_groups as (
  select g.*
  from public.v2_groups g, me
  where g.teacher_id = me.uid
    and not coalesce(g.is_demo, false)
    and (p_group_id is null or g.id = p_group_id)
    and (p_period_id is null or g.id = (select group_id from selected_period limit 1))
),
requested_timezone as (
  select coalesce(
    (select name from pg_timezone_names where name = nullif(p_timezone, '') limit 1),
    'UTC'
  ) as name
),
raw_bounds as (
  select
    coalesce(
      (select starts_on from selected_period limit 1),
      p_from,
      coalesce((select ends_on from selected_period limit 1), p_to, current_date) - 89
    ) as starts_on,
    coalesce((select ends_on from selected_period limit 1), p_to, current_date) as ends_on
),
bounds as (
  select least(starts_on, ends_on) as starts_on, greatest(starts_on, ends_on) as ends_on
  from raw_bounds
),
scoped_sessions as (
  select s.*
  from public.v2_sessions s
  join eligible_groups g on g.id = s.group_id and g.teacher_id = s.teacher_id
  cross join bounds b
  cross join requested_timezone tz
  where s.status = 'closed'
    and s.is_demo = false
    and (p_period_id is null or exists (select 1 from selected_period))
    and coalesce(s.started_at, s.created_at) >= (b.starts_on::timestamp at time zone tz.name)
    and coalesce(s.started_at, s.created_at) < ((b.ends_on + 1)::timestamp at time zone tz.name)
),
session_roster_counts as (
  select s.id as session_id, count(st.id)::int as roster_count
  from scoped_sessions s
  left join public.v2_group_students st
    on st.group_id = s.group_id
   and st.teacher_id = s.teacher_id
   and st.active
   and st.created_at <= coalesce(s.started_at, s.created_at)
  group by s.id
),
presented_questions as (
  select q.*
  from public.v2_questions q
  join scoped_sessions s on s.id = q.session_id
  where q.launched_at is not null
     or exists (select 1 from public.v2_responses r where r.question_id = q.id)
),
participant_identity as (
  select
    p.id as participant_id,
    p.session_id,
    matched.student_id as linked_student_id,
    coalesce(
      'student:' || matched.student_id::text,
      case
        when nullif(lower(btrim(p.matricula)), '') is not null
          then 'enrollment:' || lower(btrim(p.matricula))
        else 'participant:' || p.id::text
      end
    ) as identity_key
  from public.v2_participants p
  join scoped_sessions s on s.id = p.session_id
  left join lateral (
    select st.id as student_id
    from public.v2_group_students st
    where st.group_id = s.group_id
      and st.teacher_id = s.teacher_id
      and st.active
      and st.created_at <= coalesce(s.started_at, s.created_at)
      and (
        st.id = p.roster_student_id
        or (
          p.roster_student_id is null
          and nullif(lower(btrim(st.enrollment)), '') = nullif(lower(btrim(p.matricula)), '')
        )
      )
    order by (st.id = p.roster_student_id) desc
    limit 1
  ) matched on true
),
ranked_responses as (
  select
    r.id as response_id,
    r.question_id,
    q.session_id,
    pi.identity_key,
    pi.linked_student_id,
    r.is_correct,
    row_number() over (
      partition by r.question_id, pi.identity_key
      order by r.submitted_at desc, r.id desc
    ) as response_rank
  from presented_questions q
  join public.v2_responses r on r.question_id = q.id
  join participant_identity pi on pi.participant_id = r.participant_id and pi.session_id = q.session_id
),
deduplicated_responses as (
  select response_id, question_id, session_id, identity_key, linked_student_id, is_correct
  from ranked_responses
  where response_rank = 1
),
question_counts as (
  select
    q.session_id,
    count(*)::int as questions,
    count(*) filter (
      where q.correct_answer is not null
         or exists (
           select 1 from deduplicated_responses r
           where r.question_id = q.id and r.is_correct is not null
         )
    )::int as scored_questions
  from presented_questions q
  group by q.session_id
),
participant_counts as (
  select
    session_id,
    count(distinct identity_key)::int as participants,
    count(distinct identity_key) filter (where linked_student_id is not null)::int as linked_participants,
    count(distinct identity_key) filter (where linked_student_id is null)::int as unmatched_participants
  from participant_identity
  group by session_id
),
response_counts as (
  select
    q.session_id,
    count(r.response_id)::int as responses,
    count(r.response_id) filter (where r.is_correct is not null)::int as scored_responses,
    count(r.response_id) filter (where r.is_correct)::int as correct_responses,
    count(distinct r.identity_key)::int as active_participants,
    count(distinct r.linked_student_id) filter (where r.linked_student_id is not null)::int as linked_active_participants
  from presented_questions q
  left join deduplicated_responses r on r.question_id = q.id
  group by q.session_id
),
session_metrics as (
  select
    s.id,
    s.group_id,
    s.code,
    s.title,
    s.created_at,
    s.started_at,
    s.closed_at,
    coalesce(qc.questions, 0) as questions,
    coalesce(qc.scored_questions, 0) as scored_questions,
    coalesce(pc.participants, 0) as participants,
    coalesce(pc.linked_participants, 0) as linked_participants,
    coalesce(pc.unmatched_participants, 0) as unmatched_participants,
    case when coalesce(rc.roster_count, 0) > 0 then rc.roster_count else coalesce(pc.participants, 0) end::int as expected_participants,
    coalesce(rsp.active_participants, 0) as active_participants,
    coalesce(rsp.linked_active_participants, 0) as linked_active_participants,
    coalesce(rsp.responses, 0) as responses,
    coalesce(rsp.scored_responses, 0) as scored_responses,
    coalesce(rsp.correct_responses, 0) as correct_responses,
    round(100.0 * rsp.correct_responses / nullif(rsp.scored_responses, 0), 1) as accuracy,
    round(100.0 * rsp.active_participants / nullif(pc.participants, 0), 1) as response_rate,
    least(100, round(100.0 * rsp.linked_active_participants / nullif(rc.roster_count, 0), 1)) as roster_reach,
    case
      when coalesce(rc.roster_count, 0) > 0 then least(100, round(100.0 * rsp.linked_active_participants / nullif(rc.roster_count, 0), 1))
      else round(100.0 * rsp.active_participants / nullif(pc.participants, 0), 1)
    end as participation
  from scoped_sessions s
  left join question_counts qc on qc.session_id = s.id
  left join participant_counts pc on pc.session_id = s.id
  left join response_counts rsp on rsp.session_id = s.id
  left join session_roster_counts rc on rc.session_id = s.id
),
group_metrics as (
  select
    g.id,
    coalesce(g.group_name, g.name, 'Grupo') as name,
    coalesce(g.subject, g.program, 'Asignatura') as subject,
    count(sm.id)::int as sessions,
    coalesce(sum(sm.responses), 0)::int as responses,
    round(100.0 * sum(sm.correct_responses) / nullif(sum(sm.scored_responses), 0), 1) as accuracy,
    round(avg(sm.participation), 1) as participation,
    max(sm.created_at) as last_session_at
  from eligible_groups g
  left join session_metrics sm on sm.group_id = g.id
  group by g.id, g.group_name, g.name, g.subject, g.program
),
question_metrics as (
  select
    q.id,
    q.session_id,
    s.group_id,
    s.title as session_title,
    s.created_at as session_date,
    q.bank_id,
    q.position,
    q.prompt,
    q.question_type,
    q.difficulty,
    coalesce(nullif(btrim(bank.topic), ''), 'Sin tema') as topic,
    count(r.response_id)::int as responses,
    count(r.response_id) filter (where r.is_correct is not null)::int as scored_responses,
    count(r.response_id) filter (where r.is_correct)::int as correct_responses,
    round(100.0 * count(r.response_id) filter (where r.is_correct) / nullif(count(r.response_id) filter (where r.is_correct is not null), 0), 1) as accuracy
  from presented_questions q
  join scoped_sessions s on s.id = q.session_id
  left join public.v2_question_bank bank on bank.id = q.bank_id and bank.teacher_id = s.teacher_id
  left join deduplicated_responses r on r.question_id = q.id
  where p_group_id is not null
  group by q.id, q.session_id, s.group_id, s.title, s.created_at, q.bank_id, q.position, q.prompt, q.question_type, q.difficulty, bank.topic
),
student_session_presence as (
  select distinct session_id, linked_student_id, identity_key
  from participant_identity
  where linked_student_id is not null
),
student_session_metrics as (
  select
    st.id as student_id,
    st.group_id,
    st.full_name,
    st.enrollment,
    sm.id as session_id,
    sm.questions,
    (count(p.identity_key) > 0) as joined,
    count(distinct r.question_id)::int as responses,
    count(distinct r.question_id) filter (where r.is_correct is not null)::int as scored_responses,
    count(distinct r.question_id) filter (where r.is_correct)::int as correct_responses,
    round(100.0 * count(distinct r.question_id) / nullif(sm.questions, 0), 1) as response_coverage,
    round(100.0 * count(distinct r.question_id) filter (where r.is_correct) / nullif(count(distinct r.question_id) filter (where r.is_correct is not null), 0), 1) as accuracy
  from public.v2_group_students st
  join eligible_groups g on g.id = st.group_id and g.teacher_id = st.teacher_id
  join session_metrics sm
    on sm.group_id = st.group_id
   and sm.questions > 0
   and st.created_at <= coalesce(sm.started_at, sm.created_at)
  left join student_session_presence p on p.session_id = sm.id and p.linked_student_id = st.id
  left join deduplicated_responses r on r.session_id = sm.id and r.identity_key = p.identity_key
  where p_group_id is not null and st.active
  group by st.id, st.group_id, st.full_name, st.enrollment, sm.id, sm.questions
),
student_metrics as (
  select
    student_id,
    group_id,
    full_name,
    enrollment,
    count(*)::int as sessions_total,
    count(*) filter (where joined)::int as sessions_joined,
    count(*) filter (where responses > 0)::int as sessions_answered,
    sum(responses)::int as responses,
    sum(scored_responses)::int as scored_responses,
    sum(correct_responses)::int as correct_responses,
    round(100.0 * sum(responses) / nullif(sum(questions), 0), 1) as participation,
    round(100.0 * sum(correct_responses) / nullif(sum(scored_responses), 0), 1) as accuracy,
    count(*) filter (
      where response_coverage < greatest(0, least(100, coalesce(p_participation_threshold, 60)))
         or (scored_responses > 0 and accuracy < greatest(0, least(100, coalesce(p_accuracy_threshold, 60))))
    )::int as alert_sessions,
    count(*) filter (where response_coverage < greatest(0, least(100, coalesce(p_participation_threshold, 60))))::int as low_participation_sessions,
    count(*) filter (where scored_responses > 0 and accuracy < greatest(0, least(100, coalesce(p_accuracy_threshold, 60))))::int as low_accuracy_sessions
  from student_session_metrics
  group by student_id, group_id, full_name, enrollment
),
topic_metrics as (
  select
    topic,
    count(*)::int as questions,
    sum(responses)::int as responses,
    sum(scored_responses)::int as scored_responses,
    sum(correct_responses)::int as correct_responses,
    round(100.0 * sum(correct_responses) / nullif(sum(scored_responses), 0), 1) as accuracy
  from question_metrics
  group by topic
),
coverage as (
  select
    coalesce(sum(unmatched_participants), 0)::int as unmatched_participants,
    count(*) filter (where responses = 0)::int as sessions_without_responses,
    (select count(*)::int from question_metrics where topic = 'Sin tema') as questions_without_topic,
    (select count(*)::int from deduplicated_responses where is_correct is null) as non_scorable_responses
  from session_metrics
),
overview as (
  select
    count(*)::int as sessions,
    count(distinct group_id)::int as active_groups,
    coalesce(sum(responses), 0)::int as responses,
    coalesce(sum(active_participants), 0)::int as participations,
    round(100.0 * sum(correct_responses) / nullif(sum(scored_responses), 0), 1) as accuracy,
    round(avg(participation), 1) as participation
  from session_metrics
)
select jsonb_build_object(
  'meta', jsonb_build_object(
    'group_id', p_group_id,
    'period_id', p_period_id,
    'from', (select starts_on from bounds),
    'to', (select ends_on from bounds),
    'timezone', (select name from requested_timezone),
    'accuracy_threshold', greatest(0, least(100, coalesce(p_accuracy_threshold, 60))),
    'participation_threshold', greatest(0, least(100, coalesce(p_participation_threshold, 60)))
  ),
  'overview', coalesce((select to_jsonb(overview) from overview), '{}'::jsonb),
  'groups', coalesce((
    select jsonb_agg(to_jsonb(gm) order by gm.subject, gm.name)
    from group_metrics gm
  ), '[]'::jsonb),
  'sessions', coalesce((
    select jsonb_agg(to_jsonb(sm) order by sm.created_at)
    from session_metrics sm
  ), '[]'::jsonb),
  'questions', coalesce((
    select jsonb_agg(to_jsonb(qm) order by qm.accuracy nulls last, qm.session_date desc, qm.position)
    from question_metrics qm
  ), '[]'::jsonb),
  'topics', coalesce((
    select jsonb_agg(to_jsonb(tm) order by tm.accuracy nulls last, tm.topic)
    from topic_metrics tm
  ), '[]'::jsonb),
  'students', coalesce((
    select jsonb_agg(to_jsonb(stm) order by stm.alert_sessions desc, stm.participation, stm.accuracy nulls first, stm.full_name)
    from student_metrics stm
  ), '[]'::jsonb),
  'coverage', coalesce((select to_jsonb(coverage) from coverage), '{}'::jsonb)
);
$$;

revoke all on function public.v2_teacher_classroom_analytics(uuid, uuid, date, date, numeric, numeric, text) from public, anon;
grant execute on function public.v2_teacher_classroom_analytics(uuid, uuid, date, date, numeric, numeric, text) to authenticated;
