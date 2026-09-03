-- Recovered from the production migration ledger for deterministic rebuilds.
create table if not exists public.v2_question_secrets (
  question_id uuid primary key references public.v2_questions(id) on delete cascade,
  correct_answer jsonb,
  explanation text,
  updated_at timestamptz not null default now()
);

alter table public.v2_question_secrets enable row level security;
drop policy if exists v2_question_secrets_teacher_read on public.v2_question_secrets;
create policy v2_question_secrets_teacher_read on public.v2_question_secrets
for select to authenticated
using (
  exists (
    select 1
    from public.v2_questions q
    join public.v2_sessions s on s.id=q.session_id
    where q.id=v2_question_secrets.question_id
      and s.teacher_id=(select auth.uid())
  )
);

insert into public.v2_question_secrets(question_id,correct_answer,explanation)
select id,correct_answer,explanation
from public.v2_questions
where correct_answer is not null or explanation is not null
on conflict(question_id) do update
set correct_answer=coalesce(excluded.correct_answer,public.v2_question_secrets.correct_answer),
    explanation=coalesce(excluded.explanation,public.v2_question_secrets.explanation),
    updated_at=now();

create or replace function public.v2_protect_question_secret()
returns trigger
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_closed boolean:=false;
  v_key jsonb;
  v_explanation text;
begin
  if new.correct_answer is not null or new.explanation is not null then
    insert into public.v2_question_secrets(question_id,correct_answer,explanation,updated_at)
    values(new.id,new.correct_answer,new.explanation,now())
    on conflict(question_id) do update
      set correct_answer=coalesce(excluded.correct_answer,public.v2_question_secrets.correct_answer),
          explanation=coalesce(excluded.explanation,public.v2_question_secrets.explanation),
          updated_at=now();
  end if;

  select (s.status='closed') into v_closed
  from public.v2_sessions s where s.id=new.session_id;

  select correct_answer,explanation into v_key,v_explanation
  from public.v2_question_secrets where question_id=new.id;

  if new.status='revealed' or coalesce(v_closed,false) then
    new.correct_answer:=coalesce(v_key,new.correct_answer);
    new.explanation:=coalesce(v_explanation,new.explanation);
  else
    new.correct_answer:=null;
    new.explanation:=null;
  end if;
  return new;
end;
$$;

drop trigger if exists zz_v2_questions_protect_secret on public.v2_questions;
create trigger zz_v2_questions_protect_secret
before insert or update of correct_answer,explanation,status,bank_id
on public.v2_questions
for each row execute function public.v2_protect_question_secret();

create or replace function public.v2_restore_question_secrets_on_close()
returns trigger
language plpgsql
security definer
set search_path='public'
as $$
begin
  if new.status='closed' and old.status is distinct from 'closed' then
    update public.v2_questions q
       set correct_answer=sec.correct_answer,
           explanation=sec.explanation
      from public.v2_question_secrets sec
     where q.session_id=new.id
       and sec.question_id=q.id;
  end if;
  return new;
end;
$$;

drop trigger if exists v2_sessions_restore_question_secrets on public.v2_sessions;
create trigger v2_sessions_restore_question_secrets
after update of status on public.v2_sessions
for each row execute function public.v2_restore_question_secrets_on_close();

create or replace function public.v2_submit_response(p_question_id uuid,p_participant_id uuid,p_answer jsonb)
returns table(is_correct boolean,points integer,streak integer,explanation text)
language plpgsql
security definer
set search_path='public'
as $$
declare
  q public.v2_questions%rowtype;
  s public.v2_sessions%rowtype;
  p public.v2_participants%rowtype;
  v_key jsonb;
  v_explanation text;
  v_correct boolean;
  v_points integer:=0;
  v_streak integer:=0;
  v_prev_streak integer:=0;
  v_prev_correct boolean:=false;
  v_elapsed numeric:=0;
  v_bonus integer:=0;
  dx numeric;
  dy numeric;
  radius numeric;
begin
  select * into q from public.v2_questions where id=p_question_id;
  if q.id is null or q.status<>'live' then raise exception 'QUESTION_NOT_LIVE'; end if;
  if q.launched_at is not null and now() > q.launched_at + (greatest(q.timer_seconds,1) * interval '1 second') then
    raise exception 'QUESTION_EXPIRED';
  end if;

  select * into s from public.v2_sessions where id=q.session_id;
  select * into p from public.v2_participants where id=p_participant_id and session_id=s.id;
  if p.id is null then raise exception 'PARTICIPANT_NOT_IN_SESSION'; end if;
  if exists(select 1 from public.v2_responses where question_id=q.id and participant_id=p.id) then raise exception 'duplicate response'; end if;

  select sec.correct_answer,sec.explanation into v_key,v_explanation
  from public.v2_question_secrets sec where sec.question_id=q.id;
  v_key:=coalesce(v_key,q.correct_answer);
  v_explanation:=coalesce(v_explanation,q.explanation);

  if q.question_type in ('multiple_choice','multiple_select','true_false','numeric','ordering') then
    v_correct:=p_answer=v_key;
  elsif q.question_type='hotspot' then
    if v_key ? 'x' and v_key ? 'y' and v_key ? 'radius' and p_answer ? 'x' and p_answer ? 'y' then
      dx:=(p_answer->>'x')::numeric-(v_key->>'x')::numeric;
      dy:=(p_answer->>'y')::numeric-(v_key->>'y')::numeric;
      radius:=(v_key->>'radius')::numeric;
      v_correct:=sqrt(dx*dx+dy*dy)<=radius;
    else
      v_correct:=false;
    end if;
  else
    v_correct:=null;
  end if;

  if v_correct is true then
    select coalesce(r.streak,0),coalesce(r.is_correct,false)
      into v_prev_streak,v_prev_correct
    from public.v2_responses r
    join public.v2_questions pq on pq.id=r.question_id
    where r.participant_id=p.id
      and pq.session_id=s.id
      and r.is_correct is not null
    order by r.submitted_at desc
    limit 1;

    v_streak:=case when v_prev_correct then v_prev_streak+1 else 1 end;
    if s.competitive and s.scoring_mode<>'none' then
      v_points:=s.base_points;
      if s.scoring_mode='speed' and s.speed_bonus then
        v_elapsed:=greatest(0,extract(epoch from(now()-q.launched_at)));
        v_bonus:=greatest(0,round(s.speed_bonus_max*(1-least(v_elapsed/greatest(q.timer_seconds,1),1)))::int);
        v_points:=v_points+v_bonus;
      end if;
      if s.streak_bonus and v_streak>=3 then
        v_points:=v_points+least(s.base_points,(v_streak-2)*s.streak_bonus_step);
      end if;
    end if;
  elsif v_correct is false then
    v_streak:=0;
  end if;

  insert into public.v2_responses(question_id,participant_id,answer,is_correct,points,streak)
  values(q.id,p.id,p_answer,v_correct,v_points,v_streak);

  return query select v_correct,v_points,v_streak,v_explanation;
end;
$$;

-- Run the protection trigger on any currently active questions so answer keys are never exposed live.
update public.v2_questions q
set status=q.status
where exists (
  select 1 from public.v2_sessions s
  where s.id=q.session_id and s.status<>'closed'
);

revoke all on public.v2_question_secrets from anon;
grant select on public.v2_question_secrets to authenticated;

