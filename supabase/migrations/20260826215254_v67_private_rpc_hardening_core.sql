-- Recovered from the production migration ledger for deterministic rebuilds.
create table if not exists tedvio_private.rate_limits_v67(
  scope text not null,
  fingerprint text not null,
  bucket_start timestamptz not null,
  hits integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key(scope,fingerprint,bucket_start)
);
revoke all on tedvio_private.rate_limits_v67 from public,anon,authenticated;

create or replace function tedvio_private.rate_limit_v67(p_scope text,p_key text,p_limit integer,p_window_seconds integer)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_headers jsonb:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
  v_ip text; v_fp text; v_bucket timestamptz; v_hits integer;
  v_window integer:=greatest(1,coalesce(p_window_seconds,60));
  v_limit integer:=greatest(1,coalesce(p_limit,60));
begin
  v_ip:=trim(split_part(coalesce(v_headers->>'x-forwarded-for',v_headers->>'cf-connecting-ip',v_headers->>'x-real-ip','unknown'),',',1));
  v_fp:=encode(extensions.digest(coalesce(v_ip,'unknown')||'|'||coalesce(p_key,''),'sha256'),'hex');
  v_bucket:=to_timestamp(floor(extract(epoch from clock_timestamp())/v_window)*v_window);
  insert into tedvio_private.rate_limits_v67(scope,fingerprint,bucket_start,hits,updated_at)
  values(left(coalesce(p_scope,'unknown'),80),v_fp,v_bucket,1,now())
  on conflict(scope,fingerprint,bucket_start) do update set hits=tedvio_private.rate_limits_v67.hits+1,updated_at=now()
  returning hits into v_hits;
  if random()<0.01 then delete from tedvio_private.rate_limits_v67 where bucket_start<now()-interval '2 days'; end if;
  if v_hits>v_limit then
    raise sqlstate 'PGRST' using
      message=jsonb_build_object('code','RATE_LIMITED','message','Demasiadas solicitudes. Intenta de nuevo en unos segundos.')::text,
      detail=jsonb_build_object('status',429,'headers',jsonb_build_object('Retry-After',v_window::text))::text;
  end if;
end $$;
revoke all on function tedvio_private.rate_limit_v67(text,text,integer,integer) from public;
grant execute on function tedvio_private.rate_limit_v67(text,text,integer,integer) to anon,authenticated;

alter function public.v2_attendance_pro_action(uuid,text) set schema tedvio_private;
alter function tedvio_private.v2_attendance_pro_action(uuid,text) rename to v2_attendance_pro_action_impl_v67;
alter function public.v2_attendance_pro_open(uuid,date,integer,boolean) set schema tedvio_private;
alter function tedvio_private.v2_attendance_pro_open(uuid,date,integer,boolean) rename to v2_attendance_pro_open_impl_v67;
alter function public.v2_close_attendance_qr(uuid) set schema tedvio_private;
alter function tedvio_private.v2_close_attendance_qr(uuid) rename to v2_close_attendance_qr_impl_v67;
alter function public.v2_delete_teacher_session(uuid) set schema tedvio_private;
alter function tedvio_private.v2_delete_teacher_session(uuid) rename to v2_delete_teacher_session_impl_v67;
alter function public.v2_issue_attendance_qr(uuid,date) set schema tedvio_private;
alter function tedvio_private.v2_issue_attendance_qr(uuid,date) rename to v2_issue_attendance_qr_impl_v67;
alter function public.v2_join_session_v3(text,text,text,text) set schema tedvio_private;
alter function tedvio_private.v2_join_session_v3(text,text,text,text) rename to v2_join_session_v3_impl_v67;
alter function public.v2_public_attendance_checkin(text,text) set schema tedvio_private;
alter function tedvio_private.v2_public_attendance_checkin(text,text) rename to v2_public_attendance_checkin_impl_v67;
alter function public.v2_public_live_counts(text) set schema tedvio_private;
alter function tedvio_private.v2_public_live_counts(text) rename to v2_public_live_counts_impl_v67;
alter function public.v2_public_question_results(uuid,uuid) set schema tedvio_private;
alter function tedvio_private.v2_public_question_results(uuid,uuid) rename to v2_public_question_results_impl_v67;
alter function public.v2_public_ranking(text) set schema tedvio_private;
alter function tedvio_private.v2_public_ranking(text) rename to v2_public_ranking_impl_v67;
alter function public.v2_public_session_meta(text) set schema tedvio_private;
alter function tedvio_private.v2_public_session_meta(text) rename to v2_public_session_meta_impl_v67;
alter function public.v2_public_session_people(text) set schema tedvio_private;
alter function tedvio_private.v2_public_session_people(text) rename to v2_public_session_people_impl_v67;
alter function public.v2_student_answer_feedback(uuid,uuid) set schema tedvio_private;
alter function tedvio_private.v2_student_answer_feedback(uuid,uuid) rename to v2_student_answer_feedback_impl_v67;
alter function public.v2_student_feedback(uuid,uuid) set schema tedvio_private;
alter function tedvio_private.v2_student_feedback(uuid,uuid) rename to v2_student_feedback_impl_v67;
alter function public.v2_submit_response(uuid,uuid,jsonb) set schema tedvio_private;
alter function tedvio_private.v2_submit_response(uuid,uuid,jsonb) rename to v2_submit_response_impl_v67;

create or replace function tedvio_private.v2_join_session_v3_impl_v67(p_code text,p_name text,p_matricula text default null,p_team text default null)
returns table(session_id uuid,participant_id uuid,display_name text,team_name text,roster_student_id uuid,group_name text)
language plpgsql security definer set search_path='' as $$
declare s public.v2_sessions%rowtype; gs public.v2_group_students%rowtype; p public.v2_participants%rowtype;
 v_name text:=nullif(trim(coalesce(p_name,'')),''); v_mat text:=nullif(trim(coalesce(p_matricula,'')),''); v_team text:=nullif(trim(coalesce(p_team,'')),'');
begin
 if v_name is null then raise exception 'NAME_REQUIRED'; end if;
 select vs.* into s from public.v2_sessions vs where vs.code=p_code and vs.status<>'closed' limit 1;
 if s.id is null then raise exception 'SESSION_NOT_FOUND'; end if;
 if s.team_mode and v_team is null then raise exception 'TEAM_REQUIRED'; end if;
 if s.group_id is not null then
   if s.roster_required and v_mat is null then raise exception 'MATRICULA_REQUIRED'; end if;
   if v_mat is not null then
     select vgs.* into gs from public.v2_group_students vgs where vgs.group_id=s.group_id and vgs.active=true and lower(trim(vgs.enrollment))=lower(v_mat) limit 1;
     if gs.id is null then raise exception 'ROSTER_NOT_FOUND'; end if;
   elsif not s.roster_required then
     select vgs.* into gs from public.v2_group_students vgs where vgs.group_id=s.group_id and vgs.active=true and lower(regexp_replace(vgs.full_name,'\s+','','g'))=lower(regexp_replace(v_name,'\s+','','g')) limit 1;
   end if;
 end if;
 if gs.id is not null then
   select vp.* into p from public.v2_participants vp where vp.session_id=s.id and lower(trim(vp.matricula))=lower(trim(gs.enrollment)) limit 1;
   if p.id is not null then
     update public.v2_participants vp set display_name=gs.full_name,matricula=gs.enrollment,roster_student_id=gs.id,team_name=coalesce(v_team,vp.team_name),last_seen_at=now() where vp.id=p.id returning vp.* into p;
     return query select s.id,p.id,p.display_name,p.team_name,p.roster_student_id,s.group_name; return;
   end if;
 end if;
 insert into public.v2_participants(session_id,display_name,team_name,roster_student_id,matricula)
 values(s.id,coalesce(gs.full_name,v_name),v_team,gs.id,coalesce(gs.enrollment,v_mat)) returning * into p;
 return query select s.id,p.id,p.display_name,p.team_name,p.roster_student_id,s.group_name;
end $$;

create or replace function tedvio_private.v2_public_ranking_impl_v67(p_code text)
returns table(name text,team text,points bigint,correct bigint,answered bigint,max_streak integer)
language sql security definer set search_path='' as $$
 select p.display_name,p.team_name,
        coalesce(sum(r.points) filter(where s.status='closed' or q.status='revealed'),0)::bigint,
        count(*) filter(where r.is_correct is true and (s.status='closed' or q.status='revealed'))::bigint,
        count(r.id) filter(where s.status='closed' or q.status='revealed')::bigint,
        coalesce(max(r.streak) filter(where s.status='closed' or q.status='revealed'),0)::int
 from public.v2_sessions s join public.v2_participants p on p.session_id=s.id
 left join public.v2_responses r on r.participant_id=p.id left join public.v2_questions q on q.id=r.question_id
 where s.code=p_code and s.status<>'closed'
 group by p.id,p.display_name,p.team_name
 order by coalesce(sum(r.points) filter(where q.status='revealed'),0) desc,p.display_name;
$$;

create or replace function tedvio_private.v2_student_feedback_impl_v67(p_session_id uuid,p_participant_id uuid)
returns table(total_points bigint,correct_count bigint,answered_count bigint,current_streak integer,rank bigint,participant_count bigint,team_rank bigint)
language sql security definer set search_path='' as $$
with sess as (select status from public.v2_sessions where id=p_session_id),
scores as (
 select p.id,p.team_name,
        coalesce(sum(r.points) filter(where (select status from sess)='closed' or q.status='revealed'),0)::bigint pts,
        count(r.id) filter(where (select status from sess)='closed' or q.status='revealed')::bigint answered,
        count(*) filter(where r.is_correct is true and ((select status from sess)='closed' or q.status='revealed'))::bigint correct,
        coalesce((array_agg(r.streak order by r.submitted_at desc) filter(where r.id is not null and ((select status from sess)='closed' or q.status='revealed')))[1],0)::int streak
 from public.v2_participants p left join public.v2_responses r on r.participant_id=p.id left join public.v2_questions q on q.id=r.question_id
 where p.session_id=p_session_id group by p.id,p.team_name
), ranked as (select *,dense_rank() over(order by pts desc,correct desc) rnk from scores),
teams as (select coalesce(team_name,'Sin equipo') team,sum(pts)::bigint pts from scores group by coalesce(team_name,'Sin equipo')),
tr as (select team,dense_rank() over(order by pts desc) rnk from teams)
select me.pts,me.correct,me.answered,me.streak,me.rnk,(select count(*) from scores)::bigint,
 case when me.team_name is null then null else (select tr.rnk from tr where tr.team=me.team_name) end
from ranked me where me.id=p_participant_id;
$$;

create or replace function tedvio_private.v2_student_answer_result_impl_v67(p_question_id uuid,p_participant_id uuid)
returns table(answer jsonb,is_correct boolean,points integer,streak integer,submitted_at timestamptz)
language sql security definer set search_path='' as $$
 select r.answer,r.is_correct,r.points,r.streak,r.submitted_at
 from public.v2_responses r join public.v2_questions q on q.id=r.question_id join public.v2_sessions s on s.id=q.session_id
 join public.v2_participants p on p.id=r.participant_id and p.session_id=s.id
 where r.question_id=p_question_id and r.participant_id=p_participant_id and (q.status='revealed' or s.status='closed') limit 1;
$$;

revoke all on function tedvio_private.v2_attendance_pro_action_impl_v67(uuid,text) from public; grant execute on function tedvio_private.v2_attendance_pro_action_impl_v67(uuid,text) to authenticated;
revoke all on function tedvio_private.v2_attendance_pro_open_impl_v67(uuid,date,integer,boolean) from public; grant execute on function tedvio_private.v2_attendance_pro_open_impl_v67(uuid,date,integer,boolean) to authenticated;
revoke all on function tedvio_private.v2_close_attendance_qr_impl_v67(uuid) from public; grant execute on function tedvio_private.v2_close_attendance_qr_impl_v67(uuid) to authenticated;
revoke all on function tedvio_private.v2_delete_teacher_session_impl_v67(uuid) from public; grant execute on function tedvio_private.v2_delete_teacher_session_impl_v67(uuid) to authenticated;
revoke all on function tedvio_private.v2_issue_attendance_qr_impl_v67(uuid,date) from public; grant execute on function tedvio_private.v2_issue_attendance_qr_impl_v67(uuid,date) to authenticated;
revoke all on function tedvio_private.v2_join_session_v3_impl_v67(text,text,text,text) from public; grant execute on function tedvio_private.v2_join_session_v3_impl_v67(text,text,text,text) to anon,authenticated;
revoke all on function tedvio_private.v2_public_attendance_checkin_impl_v67(text,text) from public; grant execute on function tedvio_private.v2_public_attendance_checkin_impl_v67(text,text) to anon,authenticated;
revoke all on function tedvio_private.v2_public_live_counts_impl_v67(text) from public; grant execute on function tedvio_private.v2_public_live_counts_impl_v67(text) to anon,authenticated;
revoke all on function tedvio_private.v2_public_question_results_impl_v67(uuid,uuid) from public; grant execute on function tedvio_private.v2_public_question_results_impl_v67(uuid,uuid) to anon,authenticated;
revoke all on function tedvio_private.v2_public_ranking_impl_v67(text) from public; grant execute on function tedvio_private.v2_public_ranking_impl_v67(text) to anon,authenticated;
revoke all on function tedvio_private.v2_public_session_meta_impl_v67(text) from public; grant execute on function tedvio_private.v2_public_session_meta_impl_v67(text) to anon,authenticated;
revoke all on function tedvio_private.v2_public_session_people_impl_v67(text) from public; grant execute on function tedvio_private.v2_public_session_people_impl_v67(text) to anon,authenticated;
revoke all on function tedvio_private.v2_student_answer_feedback_impl_v67(uuid,uuid) from public; grant execute on function tedvio_private.v2_student_answer_feedback_impl_v67(uuid,uuid) to anon,authenticated;
revoke all on function tedvio_private.v2_student_feedback_impl_v67(uuid,uuid) from public; grant execute on function tedvio_private.v2_student_feedback_impl_v67(uuid,uuid) to anon,authenticated;
revoke all on function tedvio_private.v2_submit_response_impl_v67(uuid,uuid,jsonb) from public; grant execute on function tedvio_private.v2_submit_response_impl_v67(uuid,uuid,jsonb) to anon,authenticated;
revoke all on function tedvio_private.v2_student_answer_result_impl_v67(uuid,uuid) from public; grant execute on function tedvio_private.v2_student_answer_result_impl_v67(uuid,uuid) to anon,authenticated;

