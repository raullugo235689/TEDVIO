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
  select vs.* into s from public.v2_sessions vs where vs.code=p_code and vs.status<>'closed' limit 1;
  if s.id is null then raise exception 'SESSION_NOT_FOUND'; end if;
  if s.team_mode and v_team is null then raise exception 'TEAM_REQUIRED'; end if;

  if s.group_id is not null then
    if s.roster_required and v_mat is null then raise exception 'MATRICULA_REQUIRED'; end if;
    if v_mat is not null then
      select vrs.* into rs from public.v2_roster_students vrs
      where vrs.group_id=s.group_id and lower(vrs.matricula)=lower(v_mat) limit 1;
      if rs.id is null then raise exception 'ROSTER_NOT_FOUND'; end if;
    elsif not s.roster_required then
      select vrs.* into rs from public.v2_roster_students vrs
      where vrs.group_id=s.group_id
        and lower(regexp_replace(vrs.display_name,'\s+','','g'))=lower(regexp_replace(v_name,'\s+','','g'))
      limit 1;
    end if;
  end if;

  if rs.id is not null then
    select vp.* into p from public.v2_participants vp
    where vp.session_id=s.id and vp.roster_student_id=rs.id
    limit 1;
    if p.id is not null then
      update public.v2_participants vp
         set display_name=rs.display_name,
             matricula=rs.matricula,
             team_name=coalesce(v_team,vp.team_name),
             last_seen_at=now()
       where vp.id=p.id
       returning vp.* into p;
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

