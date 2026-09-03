-- Recovered from the production migration ledger for deterministic rebuilds.
create or replace function public.v2_student_answer_feedback(p_question_id uuid,p_participant_id uuid)
returns table(explanation text)
language sql
security definer
set search_path='public'
as $$
  select sec.explanation
  from public.v2_question_secrets sec
  where sec.question_id=p_question_id
    and exists (
      select 1
      from public.v2_responses r
      where r.question_id=p_question_id
        and r.participant_id=p_participant_id
    )
  limit 1;
$$;

grant execute on function public.v2_student_answer_feedback(uuid,uuid) to anon,authenticated;

