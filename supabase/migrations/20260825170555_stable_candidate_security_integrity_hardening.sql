-- Recovered from the production migration ledger for deterministic rebuilds.
-- TEDVIO stable-candidate hardening: public join surface, participant privacy, feedback gating,
-- attendance idempotency, function privileges, active-table indexes, and media upload limits.

-- 1) Canonical group roster join (v2_group_students) instead of deprecated v2_roster_students.
create or replace function public.v2_join_session_v3(
  p_code text,
  p_name text,
  p_matricula text default null,
  p_team text default null
)
returns table(
  session_id uuid,
  participant_id uuid,
  display_name text,
  team_name text,
  roster_student_id uuid,
  group_name text
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s public.v2_sessions%rowtype;
  gs public.v2_group_students%rowtype;
  p public.v2_participants%rowtype;
  v_name text:=nullif(trim(coalesce(p_name,'')),'');
  v_mat text:=nullif(trim(coalesce(p_matricula,'')),'');
  v_team text:=nullif(trim(coalesce(p_team,'')),'');
begin
  if v_name is null then raise exception 'NAME_REQUIRED'; end if;
  select vs.* into s
  from public.v2_sessions vs
  where vs.code=p_code and vs.status<>'closed'
  limit 1;
  if s.id is null then raise exception 'SESSION_NOT_FOUND'; end if;
  if s.team_mode and v_team is null then raise exception 'TEAM_REQUIRED'; end if;

  if s.group_id is not null then
    if s.roster_required and v_mat is null then raise exception 'MATRICULA_REQUIRED'; end if;

    if v_mat is not null then
      select vgs.* into gs
      from public.v2_group_students vgs
      where vgs.group_id=s.group_id
        and vgs.active=true
        and lower(trim(vgs.enrollment))=lower(v_mat)
      limit 1;
      if gs.id is null then raise exception 'ROSTER_NOT_FOUND'; end if;
    elsif not s.roster_required then
      select vgs.* into gs
      from public.v2_group_students vgs
      where vgs.group_id=s.group_id
        and vgs.active=true
        and lower(regexp_replace(vgs.full_name,'\s+','','g'))=lower(regexp_replace(v_name,'\s+','','g'))
      limit 1;
    end if;
  end if;

  if gs.id is not null then
    select vp.* into p
    from public.v2_participants vp
    where vp.session_id=s.id
      and lower(trim(vp.matricula))=lower(trim(gs.enrollment))
    limit 1;
    if p.id is not null then
      update public.v2_participants vp
      set display_name=gs.full_name,
          matricula=gs.enrollment,
          team_name=coalesce(v_team,vp.team_name),
          last_seen_at=now()
      where vp.id=p.id
      returning vp.* into p;
      return query select s.id,p.id,p.display_name,p.team_name,p.roster_student_id,s.group_name;
      return;
    end if;
  end if;

  insert into public.v2_participants(session_id,display_name,team_name,roster_student_id,matricula)
  values(s.id,coalesce(gs.full_name,v_name),v_team,null,coalesce(gs.enrollment,v_mat))
  returning * into p;

  return query select s.id,p.id,p.display_name,p.team_name,p.roster_student_id,s.group_name;
end;
$function$;

create unique index if not exists v2_participants_session_matricula_unique
  on public.v2_participants(session_id, lower(btrim(matricula)))
  where matricula is not null;

-- 2) Public projection gets only display-safe participant fields through an RPC.
create or replace function public.v2_public_session_people(p_code text)
returns table(display_name text, team_name text)
language sql
security definer
set search_path to 'public'
as $function$
  select p.display_name,p.team_name
  from public.v2_sessions s
  join public.v2_participants p on p.session_id=s.id
  where s.code=p_code and s.status<>'closed'
  order by p.joined_at;
$function$;

revoke all on function public.v2_public_session_people(text) from public;
grant execute on function public.v2_public_session_people(text) to anon, authenticated;

-- 3) Remove anonymous direct insert/update/read of participants.
drop policy if exists v2_participants_live_insert on public.v2_participants;
drop policy if exists v2_participants_live_update on public.v2_participants;
drop policy if exists v2_participants_live_read on public.v2_participants;
drop policy if exists v2_participants_teacher_select on public.v2_participants;
drop policy if exists v2_participants_teacher_update on public.v2_participants;

create policy v2_participants_teacher_select
on public.v2_participants
for select
to authenticated
using (
  exists(
    select 1 from public.v2_sessions s
    where s.id=v2_participants.session_id
      and s.teacher_id=(select auth.uid())
  )
);

create policy v2_participants_teacher_update
on public.v2_participants
for update
to authenticated
using (
  exists(
    select 1 from public.v2_sessions s
    where s.id=v2_participants.session_id
      and s.teacher_id=(select auth.uid())
  )
)
with check (
  exists(
    select 1 from public.v2_sessions s
    where s.id=v2_participants.session_id
      and s.teacher_id=(select auth.uid())
  )
);

-- 4) Never reveal teacher explanation while the question is still live/closed-but-not-revealed.
create or replace function public.v2_student_answer_feedback(p_question_id uuid, p_participant_id uuid)
returns table(explanation text)
language sql
security definer
set search_path to 'public'
as $function$
  select sec.explanation
  from public.v2_question_secrets sec
  join public.v2_questions q on q.id=sec.question_id
  join public.v2_sessions s on s.id=q.session_id
  where sec.question_id=p_question_id
    and (q.status='revealed' or s.status='closed')
    and exists (
      select 1
      from public.v2_responses r
      where r.question_id=p_question_id
        and r.participant_id=p_participant_id
    )
  limit 1;
$function$;

create or replace function public.v2_submit_response(p_question_id uuid, p_participant_id uuid, p_answer jsonb)
returns table(is_correct boolean, points integer, streak integer, explanation text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  q public.v2_questions%rowtype;
  s public.v2_sessions%rowtype;
  p public.v2_participants%rowtype;
  v_key jsonb;
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

  select sec.correct_answer into v_key
  from public.v2_question_secrets sec where sec.question_id=q.id;
  v_key:=coalesce(v_key,q.correct_answer);

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

  -- Explanations are intentionally withheld until the teacher reveals the question.
  return query select v_correct,v_points,v_streak,null::text;
end;
$function$;

-- 5) Attendance check-in is idempotent: rescanning cannot turn an on-time record into a late one
-- or overwrite a teacher's justified/manual state.
create or replace function public.v2_public_attendance_checkin(p_token text, p_enrollment text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  t public.v2_attendance_qr_tokens%rowtype;
  st public.v2_group_students%rowtype;
  s public.v2_attendance_sessions%rowtype;
  g public.v2_groups%rowtype;
  r public.v2_attendance_records%rowtype;
  v_status text;
  v_msg text;
begin
  select * into t
  from public.v2_attendance_qr_tokens
  where token=p_token and active=true and expires_at>now()
  order by created_at desc limit 1;
  if t.id is null then
    return jsonb_build_object('ok',false,'message','El código de asistencia expiró. Escanea el QR actualizado.');
  end if;

  select * into s from public.v2_attendance_sessions where id=t.attendance_session_id;
  if s.id is null or s.status<>'open' then
    return jsonb_build_object('ok',false,'message',case when s.status='paused' then 'La asistencia está pausada.' else 'La asistencia ya fue cerrada.' end);
  end if;

  select * into st
  from public.v2_group_students
  where group_id=t.group_id and active=true
    and lower(trim(enrollment))=lower(trim(p_enrollment))
  limit 1;
  if st.id is null then
    return jsonb_build_object('ok',false,'message','La matrícula no pertenece a este grupo.');
  end if;

  select * into g from public.v2_groups where id=t.group_id;
  select * into r
  from public.v2_attendance_records
  where attendance_session_id=t.attendance_session_id and student_id=st.id
  limit 1;

  if r.id is not null and r.status in ('present','late','justified') then
    return jsonb_build_object(
      'ok',true,
      'message',case when r.status='present' then 'Asistencia ya registrada' when r.status='late' then 'Retardo ya registrado' else 'Registro ya justificado por el docente' end,
      'student_name',st.full_name,
      'status',r.status,
      'group_name',coalesce(g.name,g.group_name),
      'attendance_date',s.attendance_date,
      'registered_at',r.updated_at
    );
  end if;

  if now()>s.opened_at + make_interval(mins=>greatest(0,s.late_after_minutes)) then
    v_status:='late'; v_msg:='Retardo registrado';
  else
    v_status:='present'; v_msg:='Asistencia registrada';
  end if;

  insert into public.v2_attendance_records(attendance_session_id,student_id,teacher_id,status,observation,updated_at)
  values(
    t.attendance_session_id,
    st.id,
    t.teacher_id,
    v_status,
    case when v_status='late' then 'Registro por QR fuera de ventana de puntualidad' else 'Registro por QR' end,
    now()
  )
  on conflict(attendance_session_id,student_id) do update
    set status=excluded.status,
        observation=excluded.observation,
        updated_at=now();

  return jsonb_build_object(
    'ok',true,
    'message',v_msg,
    'student_name',st.full_name,
    'status',v_status,
    'group_name',coalesce(g.name,g.group_name),
    'attendance_date',s.attendance_date,
    'registered_at',now()
  );
end;
$function$;

-- 6) Private SECURITY DEFINER RPCs are authenticated-only.
revoke all on function public.v2_attendance_pro_action(uuid,text) from public, anon;
grant execute on function public.v2_attendance_pro_action(uuid,text) to authenticated;
revoke all on function public.v2_attendance_pro_open(uuid,date,integer,boolean) from public, anon;
grant execute on function public.v2_attendance_pro_open(uuid,date,integer,boolean) to authenticated;
revoke all on function public.v2_close_attendance_qr(uuid) from public, anon;
grant execute on function public.v2_close_attendance_qr(uuid) to authenticated;
revoke all on function public.v2_delete_teacher_session(uuid) from public, anon;
grant execute on function public.v2_delete_teacher_session(uuid) to authenticated;
revoke all on function public.v2_issue_attendance_qr(uuid,date) from public, anon;
grant execute on function public.v2_issue_attendance_qr(uuid,date) to authenticated;
revoke all on function public.tedvio_admin_metrics() from public, anon;
grant execute on function public.tedvio_admin_metrics() to authenticated;
revoke all on function public.tedvio_my_admin_role() from public, anon;
grant execute on function public.tedvio_my_admin_role() to authenticated;

-- Trigger/helper functions are not part of the client RPC surface.
revoke all on function public.v2_protect_question_secret() from public, anon, authenticated;
revoke all on function public.v2_restore_question_secrets_on_close() from public, anon, authenticated;
revoke all on function public.v2_fill_question_metadata() from public, anon, authenticated;
revoke all on function public.v2_randomize_live_options() from public, anon, authenticated;
revoke all on function public.v2_attendance_from_participant() from public, anon, authenticated;
revoke all on function public.v2_fill_academic_context() from public, anon, authenticated;
revoke all on function public.v2_fill_structured_session_context() from public, anon, authenticated;
alter function public.v2_shuffle_jsonb_array(jsonb) set search_path = public, pg_temp;
revoke all on function public.v2_shuffle_jsonb_array(jsonb) from public, anon, authenticated;

-- Quarantine obsolete demo/teacher RPCs from the exposed API surface.
revoke all on function public.create_live_session(text) from public, anon, authenticated;
revoke all on function public.demo_create_session(text,text) from public, anon, authenticated;
revoke all on function public.demo_get_results(text,uuid) from public, anon, authenticated;
revoke all on function public.demo_launch_question(text,uuid,text,jsonb,text) from public, anon, authenticated;
revoke all on function public.demo_session_state(text,uuid) from public, anon, authenticated;
revoke all on function public.demo_teacher_login(text) from public, anon, authenticated;
revoke all on function public.get_live_results(uuid) from public, anon, authenticated;
revoke all on function public.teacher_launch_question(uuid,text,jsonb,text) from public, anon, authenticated;

-- 7) Remove duplicate/overly broad v2 group policy and tighten current group/attendance policies.
drop policy if exists groups_teacher_all on public.v2_groups;

drop policy if exists group_students_teacher_all on public.v2_group_students;
create policy group_students_teacher_all
on public.v2_group_students for all to authenticated
using (teacher_id=(select auth.uid()))
with check (teacher_id=(select auth.uid()));

drop policy if exists attendance_sessions_teacher_all on public.v2_attendance_sessions;
create policy attendance_sessions_teacher_all
on public.v2_attendance_sessions for all to authenticated
using (teacher_id=(select auth.uid()))
with check (teacher_id=(select auth.uid()));

drop policy if exists attendance_records_teacher_all on public.v2_attendance_records;
create policy attendance_records_teacher_all
on public.v2_attendance_records for all to authenticated
using (teacher_id=(select auth.uid()))
with check (teacher_id=(select auth.uid()));

drop policy if exists v2_attendance_qr_tokens_owner on public.v2_attendance_qr_tokens;
create policy v2_attendance_qr_tokens_owner
on public.v2_attendance_qr_tokens for all to authenticated
using (teacher_id=(select auth.uid()))
with check (teacher_id=(select auth.uid()));

-- 8) Cover active foreign-key/filter paths used by Group Center / Attendance Pro / OMR.
create index if not exists v2_attendance_qr_tokens_session_idx on public.v2_attendance_qr_tokens(attendance_session_id);
create index if not exists v2_attendance_qr_tokens_group_idx on public.v2_attendance_qr_tokens(group_id);
create index if not exists v2_attendance_records_student_idx on public.v2_attendance_records(student_id);
create index if not exists v2_attendance_records_teacher_idx on public.v2_attendance_records(teacher_id);
create index if not exists v2_attendance_sessions_teacher_status_idx on public.v2_attendance_sessions(teacher_id,status,attendance_date desc);
create index if not exists v2_grade_items_category_idx on public.v2_grade_items(category_id);
create index if not exists v2_group_students_teacher_idx on public.v2_group_students(teacher_id);
create index if not exists v2_paper_exam_results_student_idx on public.v2_paper_exam_results(student_id);
create index if not exists v2_paper_exams_group_idx on public.v2_paper_exams(group_id);
create index if not exists v2_programs_teacher_idx on public.v2_programs(teacher_id);
create index if not exists v2_student_notes_student_idx on public.v2_student_notes(student_id);
drop index if exists public.v2_responses_one_per_student;

-- 9) Enforce the same upload envelope server-side that the UI advertises.
update storage.buckets
set file_size_limit=26214400,
    allowed_mime_types=array[
      'image/jpeg','image/png','image/webp','image/gif','image/svg+xml',
      'audio/mpeg','audio/wav','audio/ogg','audio/mp4','audio/x-m4a',
      'video/mp4','video/webm','video/quicktime'
    ]::text[]
where id='tedvio-media-v2';

