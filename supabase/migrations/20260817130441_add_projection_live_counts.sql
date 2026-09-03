-- Recovered from the production migration ledger for deterministic rebuilds.
create or replace function public.v2_public_live_counts(p_code text)
returns table(participant_count bigint,answered_count bigint,current_question_id uuid)
language sql security definer set search_path=public as $$
  select
    (select count(*) from public.v2_participants p where p.session_id=s.id)::bigint,
    (select count(*) from public.v2_responses r where r.question_id=s.current_question_id)::bigint,
    s.current_question_id
  from public.v2_sessions s where s.code=p_code limit 1;
$$;
grant execute on function public.v2_public_live_counts(text) to anon,authenticated;

