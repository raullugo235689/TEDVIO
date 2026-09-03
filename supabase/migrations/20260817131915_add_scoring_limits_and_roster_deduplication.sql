-- Recovered from the production migration ledger for deterministic rebuilds.
alter table public.v2_sessions add column if not exists base_points integer not null default 1000 check (base_points between 0 and 10000);
alter table public.v2_sessions add column if not exists speed_bonus_max integer not null default 500 check (speed_bonus_max between 0 and 5000);
alter table public.v2_sessions add column if not exists streak_bonus_step integer not null default 100 check (streak_bonus_step between 0 and 2000);

create unique index if not exists v2_participants_session_roster_unique on public.v2_participants(session_id,roster_student_id) where roster_student_id is not null;

create or replace function public.v2_join_session_v3(p_code text,p_name text,p_matricula text default null,p_team text default null)
returns table(session_id uuid,participant_id uuid,display_name text,team_name text,roster_student_id uuid,group_name text)
language plpgsql security definer set search_path=public as $$
declare s public.v2_sessions%rowtype; rs public.v2_roster_students%rowtype; p public.v2_participants%rowtype;
begin
  select * into s from public.v2_sessions where code=p_code and status<>'closed' limit 1;
  if s.id is null then raise exception 'SESSION_NOT_FOUND'; end if;
  if s.team_mode and nullif(trim(coalesce(p_team,'')),'') is null then raise exception 'TEAM_REQUIRED'; end if;
  if s.group_id is not null then
    if nullif(trim(coalesce(p_matricula,'')),'') is not null then
      select * into rs from public.v2_roster_students where group_id=s.group_id and lower(matricula)=lower(trim(p_matricula)) limit 1;
    end if;
    if rs.id is null then
      select * into rs from public.v2_roster_students where group_id=s.group_id and lower(regexp_replace(display_name,'\s+','','g'))=lower(regexp_replace(trim(p_name),'\s+','','g')) limit 1;
    end if;
    if s.roster_required and rs.id is null then raise exception 'ROSTER_NOT_FOUND'; end if;
  end if;
  if rs.id is not null then
    select * into p from public.v2_participants where session_id=s.id and roster_student_id=rs.id limit 1;
    if p.id is not null then
      update public.v2_participants set team_name=coalesce(nullif(trim(coalesce(p_team,'')),''),team_name),last_seen_at=now() where id=p.id returning * into p;
      return query select s.id,p.id,p.display_name,p.team_name,p.roster_student_id,s.group_name;
      return;
    end if;
  end if;
  insert into public.v2_participants(session_id,display_name,team_name,roster_student_id,matricula)
  values(s.id,coalesce(nullif(trim(p_name),''),rs.display_name),nullif(trim(coalesce(p_team,'')),''),rs.id,coalesce(nullif(trim(coalesce(p_matricula,'')),''),rs.matricula)) returning * into p;
  return query select s.id,p.id,p.display_name,p.team_name,p.roster_student_id,s.group_name;
end;$$;

drop function if exists public.v2_submit_response(uuid,uuid,jsonb);
create function public.v2_submit_response(p_question_id uuid,p_participant_id uuid,p_answer jsonb)
returns table(is_correct boolean,points integer,streak integer,explanation text)
language plpgsql security definer set search_path=public as $$
declare q public.v2_questions%rowtype; s public.v2_sessions%rowtype; p public.v2_participants%rowtype; v_correct boolean; v_points integer:=0; v_streak integer:=0; v_prev_streak integer:=0; v_prev_correct boolean:=false; v_elapsed numeric:=0; v_bonus integer:=0; dx numeric; dy numeric; radius numeric;
begin
  select * into q from public.v2_questions where id=p_question_id;
  if q.id is null or q.status<>'live' then raise exception 'QUESTION_NOT_LIVE'; end if;
  select * into s from public.v2_sessions where id=q.session_id;
  select * into p from public.v2_participants where id=p_participant_id and session_id=s.id;
  if p.id is null then raise exception 'PARTICIPANT_NOT_IN_SESSION'; end if;
  if exists(select 1 from public.v2_responses where question_id=q.id and participant_id=p.id) then raise exception 'duplicate response'; end if;
  if q.question_type in ('multiple_choice','multiple_select','true_false','numeric','ordering') then v_correct:=p_answer=q.correct_answer;
  elsif q.question_type='hotspot' then
    if q.correct_answer ? 'x' and q.correct_answer ? 'y' and q.correct_answer ? 'radius' and p_answer ? 'x' and p_answer ? 'y' then
      dx:=(p_answer->>'x')::numeric-(q.correct_answer->>'x')::numeric;dy:=(p_answer->>'y')::numeric-(q.correct_answer->>'y')::numeric;radius:=(q.correct_answer->>'radius')::numeric;v_correct:=sqrt(dx*dx+dy*dy)<=radius;
    else v_correct:=false;end if;
  else v_correct:=null;end if;
  if v_correct is true then
    select coalesce(r.streak,0),coalesce(r.is_correct,false) into v_prev_streak,v_prev_correct from public.v2_responses r join public.v2_questions pq on pq.id=r.question_id where r.participant_id=p.id and pq.session_id=s.id order by r.submitted_at desc limit 1;
    v_streak:=case when v_prev_correct then v_prev_streak+1 else 1 end;
    if s.competitive and s.scoring_mode<>'none' then
      v_points:=s.base_points;
      if s.scoring_mode='speed' or s.speed_bonus then v_elapsed:=greatest(0,extract(epoch from(now()-q.launched_at)));v_bonus:=greatest(0,round(s.speed_bonus_max*(1-least(v_elapsed/greatest(q.timer_seconds,1),1)))::int);v_points:=v_points+v_bonus;end if;
      if s.streak_bonus and v_streak>=3 then v_points:=v_points+least(s.speed_bonus_max,(v_streak-2)*s.streak_bonus_step);end if;
    end if;
  elsif v_correct is false then v_streak:=0;end if;
  insert into public.v2_responses(question_id,participant_id,answer,is_correct,points,streak) values(q.id,p.id,p_answer,v_correct,v_points,v_streak);
  return query select v_correct,v_points,v_streak,q.explanation;
end;$$;
grant execute on function public.v2_submit_response(uuid,uuid,jsonb) to anon,authenticated;

