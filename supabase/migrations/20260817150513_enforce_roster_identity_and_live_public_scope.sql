-- Recovered from the production migration ledger for deterministic rebuilds.
create or replace function public.v2_join_session_v3(p_code text,p_name text,p_matricula text default null,p_team text default null)
returns table(session_id uuid,participant_id uuid,display_name text,team_name text,roster_student_id uuid,group_name text)
language plpgsql
security definer
set search_path='public'
as $$
declare
  s public.v2_sessions%rowtype;
  rs public.v2_roster_students%rowtype;
  p public.v2_participants%rowtype;
  v_name text:=nullif(trim(coalesce(p_name,'')),'');
  v_mat text:=nullif(trim(coalesce(p_matricula,'')),'');
  v_team text:=nullif(trim(coalesce(p_team,'')),'');
begin
  if v_name is null then raise exception 'NAME_REQUIRED'; end if;
  select * into s from public.v2_sessions where code=p_code and status<>'closed' limit 1;
  if s.id is null then raise exception 'SESSION_NOT_FOUND'; end if;
  if s.team_mode and v_team is null then raise exception 'TEAM_REQUIRED'; end if;

  if s.group_id is not null then
    if s.roster_required and v_mat is null then
      raise exception 'MATRICULA_REQUIRED';
    end if;

    if v_mat is not null then
      select * into rs
      from public.v2_roster_students
      where group_id=s.group_id and lower(matricula)=lower(v_mat)
      limit 1;
      if rs.id is null then raise exception 'ROSTER_NOT_FOUND'; end if;
    elsif not s.roster_required then
      select * into rs
      from public.v2_roster_students
      where group_id=s.group_id
        and lower(regexp_replace(display_name,'\s+','','g'))=lower(regexp_replace(v_name,'\s+','','g'))
      limit 1;
    end if;
  end if;

  if rs.id is not null then
    select * into p
    from public.v2_participants
    where session_id=s.id and roster_student_id=rs.id
    limit 1;

    if p.id is not null then
      update public.v2_participants
         set display_name=rs.display_name,
             matricula=rs.matricula,
             team_name=coalesce(v_team,team_name),
             last_seen_at=now()
       where id=p.id
       returning * into p;
      return query select s.id,p.id,p.display_name,p.team_name,p.roster_student_id,s.group_name;
      return;
    end if;
  end if;

  insert into public.v2_participants(session_id,display_name,team_name,roster_student_id,matricula)
  values(s.id,coalesce(rs.display_name,v_name),v_team,rs.id,coalesce(rs.matricula,v_mat))
  returning * into p;

  return query select s.id,p.id,p.display_name,p.team_name,p.roster_student_id,s.group_name;
end;
$$;

grant execute on function public.v2_join_session_v3(text,text,text,text) to anon,authenticated;

create or replace function public.v2_public_live_counts(p_code text)
returns table(participant_count bigint,answered_count bigint,current_question_id uuid)
language sql
security definer
set search_path='public'
as $$
  select
    (select count(*) from public.v2_participants p where p.session_id=s.id)::bigint,
    (select count(*) from public.v2_responses r where r.question_id=s.current_question_id)::bigint,
    s.current_question_id
  from public.v2_sessions s
  where s.code=p_code and s.status<>'closed'
  limit 1;
$$;

create or replace function public.v2_public_ranking(p_code text)
returns table(name text,team text,points bigint,correct bigint,answered bigint,max_streak integer)
language sql
security definer
set search_path='public'
as $$
  select p.display_name,p.team_name,
         coalesce(sum(r.points),0)::bigint,
         count(*) filter(where r.is_correct is true)::bigint,
         count(r.id)::bigint,
         coalesce(max(r.streak),0)::int
  from public.v2_sessions s
  join public.v2_participants p on p.session_id=s.id
  left join public.v2_responses r on r.participant_id=p.id
  where s.code=p_code and s.status<>'closed'
  group by p.id,p.display_name,p.team_name
  order by coalesce(sum(r.points),0) desc,p.display_name;
$$;

