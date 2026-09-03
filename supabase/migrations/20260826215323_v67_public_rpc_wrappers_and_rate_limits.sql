-- Recovered from the production migration ledger for deterministic rebuilds.
create function public.v2_attendance_pro_action(p_session_id uuid,p_action text) returns jsonb language sql security invoker set search_path='' as $$select tedvio_private.v2_attendance_pro_action_impl_v67(p_session_id,p_action)$$;
revoke all on function public.v2_attendance_pro_action(uuid,text) from public; grant execute on function public.v2_attendance_pro_action(uuid,text) to authenticated;
create function public.v2_attendance_pro_open(p_group_id uuid,p_attendance_date date,p_late_after_minutes integer default 10,p_auto_mark_absent boolean default true) returns jsonb language sql security invoker set search_path='' as $$select tedvio_private.v2_attendance_pro_open_impl_v67(p_group_id,p_attendance_date,p_late_after_minutes,p_auto_mark_absent)$$;
revoke all on function public.v2_attendance_pro_open(uuid,date,integer,boolean) from public; grant execute on function public.v2_attendance_pro_open(uuid,date,integer,boolean) to authenticated;
create function public.v2_close_attendance_qr(p_attendance_session_id uuid) returns boolean language sql security invoker set search_path='' as $$select tedvio_private.v2_close_attendance_qr_impl_v67(p_attendance_session_id)$$;
revoke all on function public.v2_close_attendance_qr(uuid) from public; grant execute on function public.v2_close_attendance_qr(uuid) to authenticated;
create function public.v2_delete_teacher_session(p_session_id uuid) returns boolean language sql security invoker set search_path='' as $$select tedvio_private.v2_delete_teacher_session_impl_v67(p_session_id)$$;
revoke all on function public.v2_delete_teacher_session(uuid) from public; grant execute on function public.v2_delete_teacher_session(uuid) to authenticated;
create function public.v2_issue_attendance_qr(p_group_id uuid,p_attendance_date date) returns jsonb language sql security invoker set search_path='' as $$select tedvio_private.v2_issue_attendance_qr_impl_v67(p_group_id,p_attendance_date)$$;
revoke all on function public.v2_issue_attendance_qr(uuid,date) from public; grant execute on function public.v2_issue_attendance_qr(uuid,date) to authenticated;

create function public.v2_join_session_v3(p_code text,p_name text,p_matricula text default null,p_team text default null)
returns table(session_id uuid,participant_id uuid,display_name text,team_name text,roster_student_id uuid,group_name text)
language plpgsql security invoker set search_path='' as $$begin
 perform tedvio_private.rate_limit_v67('join_ip','*',900,60);
 perform tedvio_private.rate_limit_v67('join_identity',lower(trim(coalesce(p_code,'')))||'|'||lower(trim(coalesce(p_matricula,p_name,''))),15,60);
 return query select * from tedvio_private.v2_join_session_v3_impl_v67(p_code,p_name,p_matricula,p_team);
end$$;
revoke all on function public.v2_join_session_v3(text,text,text,text) from public; grant execute on function public.v2_join_session_v3(text,text,text,text) to anon,authenticated;

create function public.v2_public_attendance_checkin(p_token text,p_enrollment text) returns jsonb language plpgsql security invoker set search_path='' as $$begin
 perform tedvio_private.rate_limit_v67('attendance_ip','*',900,60);
 perform tedvio_private.rate_limit_v67('attendance_identity',coalesce(p_token,'')||'|'||lower(trim(coalesce(p_enrollment,''))),8,60);
 return tedvio_private.v2_public_attendance_checkin_impl_v67(p_token,p_enrollment);
end$$;
revoke all on function public.v2_public_attendance_checkin(text,text) from public; grant execute on function public.v2_public_attendance_checkin(text,text) to anon,authenticated;

create function public.v2_public_live_counts(p_code text) returns table(participant_count bigint,answered_count bigint,current_question_id uuid) language plpgsql security invoker set search_path='' as $$begin
 perform tedvio_private.rate_limit_v67('live_counts',coalesce(p_code,''),600,60);
 return query select * from tedvio_private.v2_public_live_counts_impl_v67(p_code);
end$$;
revoke all on function public.v2_public_live_counts(text) from public; grant execute on function public.v2_public_live_counts(text) to anon,authenticated;

create function public.v2_public_question_results(p_session_id uuid,p_question_id uuid) returns table(answer jsonb,votes bigint,total bigint) language plpgsql security invoker set search_path='' as $$begin
 perform tedvio_private.rate_limit_v67('question_results',coalesce(p_session_id::text,'')||'|'||coalesce(p_question_id::text,''),300,60);
 return query select * from tedvio_private.v2_public_question_results_impl_v67(p_session_id,p_question_id);
end$$;
revoke all on function public.v2_public_question_results(uuid,uuid) from public; grant execute on function public.v2_public_question_results(uuid,uuid) to anon,authenticated;

create function public.v2_public_ranking(p_code text) returns table(name text,team text,points bigint,correct bigint,answered bigint,max_streak integer) language plpgsql security invoker set search_path='' as $$begin
 perform tedvio_private.rate_limit_v67('public_ranking',coalesce(p_code,''),300,60);
 return query select * from tedvio_private.v2_public_ranking_impl_v67(p_code);
end$$;
revoke all on function public.v2_public_ranking(text) from public; grant execute on function public.v2_public_ranking(text) to anon,authenticated;

create function public.v2_public_session_meta(p_code text) returns table(session_id uuid,title text,group_id uuid,university text,educational_program text,group_name text,team_mode boolean,competitive boolean,roster_required boolean,status text) language plpgsql security invoker set search_path='' as $$begin
 perform tedvio_private.rate_limit_v67('session_meta',coalesce(p_code,''),600,60);
 return query select * from tedvio_private.v2_public_session_meta_impl_v67(p_code);
end$$;
revoke all on function public.v2_public_session_meta(text) from public; grant execute on function public.v2_public_session_meta(text) to anon,authenticated;

create function public.v2_public_session_people(p_code text) returns table(display_name text,team_name text) language plpgsql security invoker set search_path='' as $$begin
 perform tedvio_private.rate_limit_v67('session_people',coalesce(p_code,''),300,60);
 return query select * from tedvio_private.v2_public_session_people_impl_v67(p_code);
end$$;
revoke all on function public.v2_public_session_people(text) from public; grant execute on function public.v2_public_session_people(text) to anon,authenticated;

create function public.v2_student_answer_feedback(p_question_id uuid,p_participant_id uuid) returns table(explanation text) language plpgsql security invoker set search_path='' as $$begin
 perform tedvio_private.rate_limit_v67('answer_feedback',coalesce(p_question_id::text,'')||'|'||coalesce(p_participant_id::text,''),60,60);
 return query select * from tedvio_private.v2_student_answer_feedback_impl_v67(p_question_id,p_participant_id);
end$$;
revoke all on function public.v2_student_answer_feedback(uuid,uuid) from public; grant execute on function public.v2_student_answer_feedback(uuid,uuid) to anon,authenticated;

create function public.v2_student_feedback(p_session_id uuid,p_participant_id uuid) returns table(total_points bigint,correct_count bigint,answered_count bigint,current_streak integer,rank bigint,participant_count bigint,team_rank bigint) language plpgsql security invoker set search_path='' as $$begin
 perform tedvio_private.rate_limit_v67('student_feedback',coalesce(p_session_id::text,'')||'|'||coalesce(p_participant_id::text,''),120,60);
 return query select * from tedvio_private.v2_student_feedback_impl_v67(p_session_id,p_participant_id);
end$$;
revoke all on function public.v2_student_feedback(uuid,uuid) from public; grant execute on function public.v2_student_feedback(uuid,uuid) to anon,authenticated;

create function public.v2_submit_response(p_question_id uuid,p_participant_id uuid,p_answer jsonb) returns table(is_correct boolean,points integer,streak integer,explanation text) language plpgsql security invoker set search_path='' as $$begin
 perform tedvio_private.rate_limit_v67('submit_ip','*',1500,60);
 perform tedvio_private.rate_limit_v67('submit_identity',coalesce(p_question_id::text,'')||'|'||coalesce(p_participant_id::text,''),8,60);
 return query select null::boolean,null::integer,null::integer,null::text from tedvio_private.v2_submit_response_impl_v67(p_question_id,p_participant_id,p_answer) limit 1;
end$$;
revoke all on function public.v2_submit_response(uuid,uuid,jsonb) from public; grant execute on function public.v2_submit_response(uuid,uuid,jsonb) to anon,authenticated;

create function public.v2_student_answer_result(p_question_id uuid,p_participant_id uuid) returns table(answer jsonb,is_correct boolean,points integer,streak integer,submitted_at timestamptz) language plpgsql security invoker set search_path='' as $$begin
 perform tedvio_private.rate_limit_v67('answer_result',coalesce(p_question_id::text,'')||'|'||coalesce(p_participant_id::text,''),60,60);
 return query select * from tedvio_private.v2_student_answer_result_impl_v67(p_question_id,p_participant_id);
end$$;
revoke all on function public.v2_student_answer_result(uuid,uuid) from public; grant execute on function public.v2_student_answer_result(uuid,uuid) to anon,authenticated;

create or replace function public.v2_public_assignment_meta(p_code text) returns jsonb language plpgsql security invoker set search_path='' as $$begin
 perform tedvio_private.rate_limit_v67('assignment_meta',coalesce(p_code,''),600,60);
 return tedvio_private.assignment_meta_v66(p_code);
end$$;
create or replace function public.v2_assignment_start_attempt(p_code text,p_name text,p_enrollment text) returns jsonb language plpgsql security invoker set search_path='' as $$begin
 perform tedvio_private.rate_limit_v67('assignment_start_ip','*',900,60);
 perform tedvio_private.rate_limit_v67('assignment_start_identity',lower(trim(coalesce(p_code,'')))||'|'||lower(trim(coalesce(p_enrollment,p_name,''))),15,60);
 return tedvio_private.start_assignment_attempt_v66(p_code,p_name,p_enrollment);
end$$;
create or replace function public.v2_assignment_attempt_state(p_token uuid) returns jsonb language plpgsql security invoker set search_path='' as $$begin
 perform tedvio_private.rate_limit_v67('assignment_state',coalesce(p_token::text,''),120,60);
 return tedvio_private.assignment_attempt_state_v66(p_token);
end$$;
create or replace function public.v2_assignment_submit_answer(p_token uuid,p_item_id uuid,p_answer jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$begin
 perform tedvio_private.rate_limit_v67('assignment_answer',coalesce(p_token::text,'')||'|'||coalesce(p_item_id::text,''),30,60);
 return tedvio_private.submit_assignment_answer_v66(p_token,p_item_id,p_answer);
end$$;
create or replace function public.v2_assignment_submit_attempt(p_token uuid) returns jsonb language plpgsql security invoker set search_path='' as $$begin
 perform tedvio_private.rate_limit_v67('assignment_submit',coalesce(p_token::text,''),10,60);
 return tedvio_private.submit_assignment_attempt_v66(p_token);
end$$;
create or replace function public.v2_assignment_feedback(p_token uuid) returns jsonb language plpgsql security invoker set search_path='' as $$begin
 perform tedvio_private.rate_limit_v67('assignment_feedback',coalesce(p_token::text,''),60,60);
 return tedvio_private.assignment_feedback_v66(p_token);
end$$;

