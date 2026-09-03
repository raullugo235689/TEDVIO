-- Recovered from the production migration ledger for deterministic rebuilds.
alter table public.v2_question_bank add column if not exists folder text;
alter table public.v2_question_bank add column if not exists tags text[] not null default '{}'::text[];
alter table public.v2_question_bank add column if not exists bloom text;
alter table public.v2_question_bank add column if not exists favorite boolean not null default false;
alter table public.v2_question_bank add column if not exists archived boolean not null default false;

do $$ begin
  if not exists(select 1 from pg_constraint where conname='v2_question_bank_bloom_check') then
    alter table public.v2_question_bank add constraint v2_question_bank_bloom_check check (bloom is null or bloom = any(array['recordar'::text,'comprender'::text,'aplicar'::text,'analizar'::text,'evaluar'::text,'crear'::text]));
  end if;
end $$;

create index if not exists v2_question_bank_teacher_folder_idx on public.v2_question_bank(teacher_id,folder) where archived=false;
create index if not exists v2_question_bank_teacher_favorite_idx on public.v2_question_bank(teacher_id,favorite) where favorite=true and archived=false;
create index if not exists v2_question_bank_tags_gin_idx on public.v2_question_bank using gin(tags);

create or replace function public.v2_teacher_question_bank_metrics()
returns table(
  bank_id uuid,
  times_used bigint,
  total_responses bigint,
  correct_responses bigint,
  accuracy_pct numeric,
  discrimination numeric
)
language sql
stable
security invoker
set search_path=''
as $$
with instances as (
  select q.id as question_id,q.bank_id,q.session_id
  from public.v2_questions q
  join public.v2_sessions s on s.id=q.session_id
  where s.teacher_id=(select auth.uid()) and q.bank_id is not null
), scored as (
  select i.bank_id,i.question_id,i.session_id,r.participant_id,
         case when r.is_correct is true then 1.0 when r.is_correct is false then 0.0 else null end as item_score,
         (
           select sum(case when r2.is_correct is true then 1 else 0 end)::double precision
           from public.v2_responses r2
           join public.v2_questions q2 on q2.id=r2.question_id
           where r2.participant_id=r.participant_id
             and q2.session_id=i.session_id
             and q2.id<>i.question_id
             and r2.is_correct is not null
         ) as other_score
  from instances i
  join public.v2_responses r on r.question_id=i.question_id
  where r.is_correct is not null
), uses as (
  select bank_id,count(distinct question_id)::bigint as times_used
  from instances group by bank_id
), agg as (
  select bank_id,
         count(*)::bigint as total_responses,
         count(*) filter(where item_score=1)::bigint as correct_responses,
         round((avg(item_score)*100)::numeric,1) as accuracy_pct,
         case when count(other_score)>=8 then round(corr(item_score,other_score)::numeric,2) else null end as discrimination
  from scored group by bank_id
)
select u.bank_id,u.times_used,coalesce(a.total_responses,0),coalesce(a.correct_responses,0),a.accuracy_pct,a.discrimination
from uses u left join agg a using(bank_id);
$$;
revoke all on function public.v2_teacher_question_bank_metrics() from public,anon;
grant execute on function public.v2_teacher_question_bank_metrics() to authenticated;

create or replace function tedvio_private.question_bank_copy_metadata_v65()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare b public.v2_question_bank%rowtype;
begin
  if new.bank_id is null then return new; end if;
  select * into b from public.v2_question_bank where id=new.bank_id;
  if b.id is null then return new; end if;
  if new.explanation is null then new.explanation:=b.explanation; end if;
  if new.difficulty is null then new.difficulty:=b.difficulty; end if;
  return new;
end;
$$;
revoke all on function tedvio_private.question_bank_copy_metadata_v65() from public,anon,authenticated;

drop trigger if exists tedvio_v65_question_bank_metadata on public.v2_questions;
create trigger tedvio_v65_question_bank_metadata before insert or update of bank_id on public.v2_questions for each row execute function tedvio_private.question_bank_copy_metadata_v65();

