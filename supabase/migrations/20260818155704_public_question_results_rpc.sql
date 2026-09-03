-- Recovered from the production migration ledger for deterministic rebuilds.
create or replace function public.v2_public_question_results(p_session_id uuid, p_question_id uuid)
returns table(answer jsonb, votes bigint, total bigint)
language sql
security definer
set search_path = public
as $$
  with allowed as (
    select q.id
    from public.v2_questions q
    join public.v2_sessions s on s.id=q.session_id
    where q.id=p_question_id and q.session_id=p_session_id
      and s.status <> 'closed'
      and q.status='revealed'
  ), normalized as (
    select case
      when jsonb_typeof(r.answer)='array' then x.value
      else r.answer
    end as answer
    from public.v2_responses r
    join allowed a on a.id=r.question_id
    left join lateral jsonb_array_elements(case when jsonb_typeof(r.answer)='array' then r.answer else '[]'::jsonb end) x on jsonb_typeof(r.answer)='array'
    where (jsonb_typeof(r.answer)<>'array' or x.value is not null)
  ), counts as (
    select n.answer,count(*)::bigint votes from normalized n group by n.answer
  ), t as (select coalesce(sum(votes),0)::bigint total from counts)
  select c.answer,c.votes,t.total from counts c cross join t order by c.votes desc,c.answer::text;
$$;
grant execute on function public.v2_public_question_results(uuid,uuid) to anon, authenticated;

