-- Recovered from the production migration ledger for deterministic rebuilds.
drop policy if exists v2_responses_public_all on public.v2_responses;
drop policy if exists v2_responses_teacher_read on public.v2_responses;
create policy v2_responses_teacher_read on public.v2_responses for select to authenticated using (
  exists (
    select 1 from public.v2_questions q join public.v2_sessions s on s.id=q.session_id
    where q.id=question_id and s.teacher_id=auth.uid()
  )
);

create or replace function public.v2_submit_response(p_question_id uuid, p_participant_id uuid, p_answer jsonb)
returns table(response_id uuid, is_correct boolean, points integer, streak integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  q public.v2_questions%rowtype;
  s public.v2_sessions%rowtype;
  p public.v2_participants%rowtype;
  v_correct boolean;
  v_points integer := 0;
  v_streak integer := 0;
  v_prev_correct boolean;
  v_prev_streak integer := 0;
  v_elapsed numeric := 0;
  v_speed integer := 0;
  v_id uuid;
begin
  select * into q from public.v2_questions where id=p_question_id;
  if q.id is null or q.status <> 'live' then raise exception 'Question is not accepting responses'; end if;
  select * into s from public.v2_sessions where id=q.session_id;
  select * into p from public.v2_participants where id=p_participant_id and session_id=q.session_id;
  if p.id is null then raise exception 'Participant does not belong to session'; end if;

  if q.question_type in ('multiple_choice','multiple_select','true_false','numeric','ordering') then
    v_correct := (p_answer = q.correct_answer);
  else
    v_correct := null;
  end if;

  if v_correct is true then
    select r.is_correct, r.streak into v_prev_correct, v_prev_streak
    from public.v2_responses r
    join public.v2_questions pq on pq.id=r.question_id
    where r.participant_id=p_participant_id and pq.session_id=q.session_id
    order by r.submitted_at desc limit 1;
    v_streak := case when v_prev_correct is true then coalesce(v_prev_streak,0)+1 else 1 end;
    if s.competitive then
      if q.launched_at is not null then
        v_elapsed := greatest(0, extract(epoch from (now()-q.launched_at)));
        v_speed := greatest(0, round(500 * (1 - least(v_elapsed, q.timer_seconds)::numeric / q.timer_seconds::numeric))::integer);
      end if;
      v_points := 1000 + v_speed + least(greatest(v_streak-1,0),5)*100;
    end if;
  else
    v_streak := 0;
  end if;

  insert into public.v2_responses(question_id,participant_id,answer,is_correct,points,streak)
  values(p_question_id,p_participant_id,p_answer,v_correct,v_points,v_streak)
  returning id into v_id;

  return query select v_id,v_correct,v_points,v_streak;
end;
$$;

grant execute on function public.v2_submit_response(uuid,uuid,jsonb) to anon, authenticated;

create or replace function public.v2_student_feedback(p_session_id uuid, p_participant_id uuid)
returns table(total_points bigint, correct_count bigint, answered_count bigint, current_streak integer, rank bigint, participant_count bigint, team_rank bigint)
language sql
security definer
set search_path = public
as $$
with scores as (
  select p.id,p.team_name,
         coalesce(sum(r.points),0)::bigint pts,
         count(r.id)::bigint answered,
         count(*) filter (where r.is_correct is true)::bigint correct,
         coalesce((array_agg(r.streak order by r.submitted_at desc))[1],0)::int streak
  from public.v2_participants p
  left join public.v2_responses r on r.participant_id=p.id
  where p.session_id=p_session_id
  group by p.id,p.team_name
), ranked as (
  select *, dense_rank() over(order by pts desc, correct desc) rnk from scores
), teams as (
  select coalesce(team_name,'Sin equipo') team, sum(pts)::bigint pts from scores group by coalesce(team_name,'Sin equipo')
), tr as (
  select team,dense_rank() over(order by pts desc) rnk from teams
)
select me.pts,me.correct,me.answered,me.streak,me.rnk,
       (select count(*) from scores)::bigint,
       case when me.team_name is null then null else (select tr.rnk from tr where tr.team=me.team_name) end
from ranked me where me.id=p_participant_id;
$$;

grant execute on function public.v2_student_feedback(uuid,uuid) to anon, authenticated;

