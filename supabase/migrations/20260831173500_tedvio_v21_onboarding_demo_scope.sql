-- TEDVIO 2.1 · Launch onboarding and resettable demo
-- The commercial 1.0 scope intentionally excludes Assignments/Tareas.

begin;

create or replace function public.tedvio_onboarding_snapshot_v21()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
with me as (
  select auth.uid() as id
), progress as (
  select p.*
  from public.tedvio_onboarding_progress p
  where p.user_id = (select id from me)
), counts as (
  select
    (select count(*) from public.v2_universities where teacher_id = (select id from me))::int as universities,
    (select count(*) from public.v2_programs where teacher_id = (select id from me))::int as programs,
    (select count(*) from public.v2_groups where teacher_id = (select id from me) and coalesce(is_demo, false) = false)::int as groups,
    (
      select count(*)
      from public.v2_group_students gs
      join public.v2_groups g on g.id = gs.group_id
      where gs.teacher_id = (select id from me)
        and gs.active = true
        and coalesce(g.is_demo, false) = false
    )::int as students,
    (
      select count(*)
      from public.v2_attendance_sessions a
      join public.v2_groups g on g.id = a.group_id
      where a.teacher_id = (select id from me)
        and coalesce(g.is_demo, false) = false
    )::int as attendance_sessions,
    (
      select count(*)
      from public.v2_question_bank
      where teacher_id = (select id from me)
        and coalesce(archived, false) = false
        and coalesce(folder, '') <> 'TEDVIO Demo'
    )::int as questions,
    (
      select count(*)
      from public.v2_sessions
      where teacher_id = (select id from me)
        and coalesce(is_demo, false) = false
    )::int as sessions,
    (
      select count(*)
      from public.v2_groups
      where teacher_id = (select id from me)
        and coalesce(is_demo, false) = true
    )::int as demo_groups
)
select jsonb_build_object(
  'version', '2026.08.31.21',
  'universities', c.universities,
  'programs', c.programs,
  'groups', c.groups,
  'students', c.students,
  'attendance_sessions', c.attendance_sessions,
  'questions', c.questions,
  'sessions', c.sessions,
  'demo_ready', c.demo_groups > 0,
  'demo_group_id', p.demo_group_id,
  'demo_session_id', p.demo_session_id,
  'dismissed', coalesce(p.dismissed, false),
  'last_step', coalesce(p.last_step, 'welcome'),
  'completed_steps', coalesce(p.completed_steps, '{}'::text[]),
  'started_at', p.started_at,
  'completed_at', p.completed_at,
  'completed', c.groups > 0
    and c.students > 0
    and c.attendance_sessions > 0
    and c.questions > 0
    and c.sessions > 0,
  'score',
    (case when c.groups > 0 then 1 else 0 end)
    + (case when c.students > 0 then 1 else 0 end)
    + (case when c.attendance_sessions > 0 then 1 else 0 end)
    + (case when c.questions > 0 then 1 else 0 end)
    + (case when c.sessions > 0 then 1 else 0 end)
)
from counts c
left join progress p on true;
$function$;

revoke all on function public.tedvio_onboarding_snapshot_v21() from public, anon;
grant execute on function public.tedvio_onboarding_snapshot_v21() to authenticated;

-- Refresh the existing demo builder so the sample experience matches the
-- launch scope and never advertises Tareas/Assignments.
create or replace function tedvio_private.create_demo_workspace_v68()
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  uid uuid := auth.uid();
  v_uni uuid;
  v_prog uuid;
  v_group uuid;
  v_session uuid;
  v_code text;
  i int;
begin
  if uid is null then raise exception 'Authentication required'; end if;

  insert into public.v2_universities(teacher_id, name)
  values(uid, 'TEDVIO Demo')
  on conflict(teacher_id, name) do update set name = excluded.name
  returning id into v_uni;

  insert into public.v2_programs(teacher_id, university_id, name)
  values(uid, v_uni, 'Experiencia TEDVIO')
  on conflict(university_id, name) do update set teacher_id = excluded.teacher_id
  returning id into v_prog;

  insert into public.v2_groups(
    teacher_id, program_id, name, term, subject, university,
    program, group_name, school_cycle, is_demo
  )
  values(
    uid, v_prog, 'DEMO-01', 'Demo', 'TEDVIO Demo', 'TEDVIO Demo',
    'Experiencia TEDVIO', 'DEMO-01', 'Demo', true
  )
  on conflict(program_id, name) do update
    set is_demo = true, subject = excluded.subject
  returning id into v_group;

  for i in 1..10 loop
    insert into public.v2_group_students(group_id, teacher_id, enrollment, full_name, active)
    values(v_group, uid, 'DEMO' || lpad(i::text, 3, '0'), 'Alumno Demo ' || i, true)
    on conflict(group_id, enrollment) do update
      set full_name = excluded.full_name, active = true;
  end loop;

  update public.v2_sessions
    set status = 'closed', closed_at = coalesce(closed_at, now())
  where teacher_id = uid
    and coalesce(is_demo, false) = true
    and status <> 'closed';

  delete from public.v2_question_bank
  where teacher_id = uid
    and folder = 'TEDVIO Demo';

  insert into public.v2_question_bank(
    teacher_id, title, subject, topic, question_type, prompt, options,
    correct_answer, explanation, difficulty, folder, tags, bloom
  ) values
  (
    uid, 'Demo 1', 'TEDVIO Demo', 'Conociendo TEDVIO', 'multiple_choice',
    '¿Qué conecta TEDVIO en un solo espacio docente?',
    '["Asistencia, evaluación y seguimiento", "Solo videollamadas", "Solo archivos", "Solo mensajería"]'::jsonb,
    '"Asistencia, evaluación y seguimiento"'::jsonb,
    'TEDVIO conecta los procesos esenciales de la jornada docente.',
    'baja', 'TEDVIO Demo', array['demo','inicio'], 'comprender'
  ),
  (
    uid, 'Demo 2', 'TEDVIO Demo', 'Evaluación', 'true_false',
    'TEDVIO puede revisar una hoja OMR antes de confirmar la calificación.',
    '["Verdadero", "Falso"]'::jsonb,
    '"Verdadero"'::jsonb,
    'Las marcas dudosas permanecen pendientes hasta la revisión docente.',
    'baja', 'TEDVIO Demo', array['demo','omr'], 'recordar'
  ),
  (
    uid, 'Demo 3', 'TEDVIO Demo', 'Preferencias', 'poll',
    '¿Qué flujo te gustaría probar primero?',
    '["Modo Clase", "Asistencia", "OMR", "Alumno 360°"]'::jsonb,
    null, null,
    'baja', 'TEDVIO Demo', array['demo','encuesta'], 'comprender'
  ),
  (
    uid, 'Demo 4', 'TEDVIO Demo', 'Experiencia', 'scale_5',
    '¿Qué tan clara te parece esta experiencia inicial?',
    '["1", "2", "3", "4", "5"]'::jsonb,
    null, null,
    'baja', 'TEDVIO Demo', array['demo','escala'], 'evaluar'
  ),
  (
    uid, 'Demo 5', 'TEDVIO Demo', 'Funciones', 'multiple_select',
    'Selecciona funciones incluidas en TEDVIO 1.0.',
    '["Asistencia", "Modo Clase", "OMR", "Libro de calificaciones", "Control de tráfico aéreo"]'::jsonb,
    '["Asistencia", "Modo Clase", "OMR", "Libro de calificaciones"]'::jsonb,
    'TEDVIO 1.0 concentra operación de clase, evaluación y seguimiento.',
    'baja', 'TEDVIO Demo', array['demo','funciones'], 'comprender'
  );

  for i in 1..20 loop
    v_code := (floor(random() * 900000) + 100000)::int::text;
    begin
      insert into public.v2_sessions(
        teacher_id, code, title, status, competitive, team_mode,
        group_id, roster_required, is_demo
      )
      values(uid, v_code, 'Clase Demo TEDVIO', 'draft', true, false, v_group, false, true)
      returning id into v_session;
      exit;
    exception when unique_violation then
      null;
    end;
  end loop;

  if v_session is null then raise exception 'No pude generar un código demo'; end if;

  insert into public.v2_questions(
    session_id, bank_id, position, prompt, question_type, options,
    correct_answer, media_url, media_type, timer_seconds, status,
    explanation, difficulty
  )
  select
    v_session,
    b.id,
    row_number() over(order by b.title),
    b.prompt,
    b.question_type,
    b.options,
    b.correct_answer,
    b.media_url,
    b.media_type,
    30,
    'queued',
    b.explanation,
    b.difficulty
  from public.v2_question_bank b
  where b.teacher_id = uid
    and b.folder = 'TEDVIO Demo'
  order by b.title
  limit 5;

  insert into public.tedvio_onboarding_progress(
    user_id, last_step, completed_steps, dismissed,
    demo_group_id, demo_session_id, updated_at
  )
  values(uid, 'demo', array['demo'], false, v_group, v_session, now())
  on conflict(user_id) do update
    set last_step = 'demo',
        completed_steps = (
          select array_agg(distinct x)
          from unnest(public.tedvio_onboarding_progress.completed_steps || array['demo']) x
        ),
        dismissed = false,
        demo_group_id = v_group,
        demo_session_id = v_session,
        updated_at = now();

  insert into public.tedvio_activation_events(user_id, event_type, context)
  values(uid, 'demo_workspace_created', jsonb_build_object('group_id', v_group, 'session_id', v_session, 'scope', 'launch_1_0'));

  return jsonb_build_object(
    'ok', true,
    'group_id', v_group,
    'session_id', v_session,
    'code', v_code,
    'students', 10,
    'questions', 5
  );
end;
$function$;

create or replace function tedvio_private.reset_demo_workspace_v21()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  uid uuid := auth.uid();
  v_result jsonb;
begin
  if uid is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;

  delete from public.v2_sessions
  where teacher_id = uid
    and coalesce(is_demo, false) = true;

  delete from public.v2_question_bank
  where teacher_id = uid
    and folder = 'TEDVIO Demo';

  update public.tedvio_onboarding_progress
    set demo_session_id = null,
        last_step = 'demo_reset',
        updated_at = now()
  where user_id = uid;

  select tedvio_private.create_demo_workspace_v68() into v_result;

  insert into public.tedvio_activation_events(user_id, event_type, context)
  values(uid, 'demo_workspace_reset', jsonb_build_object('scope', 'launch_1_0'));

  return v_result;
end;
$function$;

revoke all on function tedvio_private.reset_demo_workspace_v21() from public, anon;
grant execute on function tedvio_private.reset_demo_workspace_v21() to authenticated;

create or replace function public.tedvio_reset_demo_v21()
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select tedvio_private.reset_demo_workspace_v21();
$function$;

revoke all on function public.tedvio_reset_demo_v21() from public, anon;
grant execute on function public.tedvio_reset_demo_v21() to authenticated;

commit;
