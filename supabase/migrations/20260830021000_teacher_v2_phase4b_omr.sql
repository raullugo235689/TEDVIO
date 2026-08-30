-- TEDVIO 2.0 · Etapa 4B · OMR
-- Captura local de imágenes, revisión docente obligatoria y confirmación atómica de resultados.

alter table public.v2_paper_exam_results
  add column if not exists capture_source text not null default 'legacy',
  add column if not exists capture_status text not null default 'pending_review',
  add column if not exists scan_quality jsonb not null default '{}'::jsonb,
  add column if not exists scan_metadata jsonb not null default '{}'::jsonb,
  add column if not exists confirmed_at timestamptz,
  add column if not exists revision_log jsonb not null default '[]'::jsonb;

update public.v2_paper_exam_results
set capture_status = case when reviewed then 'confirmed' else 'pending_review' end,
    confirmed_at = case when reviewed then coalesce(confirmed_at, updated_at, created_at, now()) else null end,
    capture_source = coalesce(nullif(capture_source, ''), 'legacy'),
    scan_quality = coalesce(scan_quality, '{}'::jsonb),
    scan_metadata = coalesce(scan_metadata, '{}'::jsonb),
    revision_log = coalesce(revision_log, '[]'::jsonb);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'v2_paper_results_capture_source_check'
      and conrelid = 'public.v2_paper_exam_results'::regclass
  ) then
    alter table public.v2_paper_exam_results
      add constraint v2_paper_results_capture_source_check
      check (capture_source in ('legacy','camera','upload','manual'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'v2_paper_results_capture_status_check'
      and conrelid = 'public.v2_paper_exam_results'::regclass
  ) then
    alter table public.v2_paper_exam_results
      add constraint v2_paper_results_capture_status_check
      check (capture_status in ('pending_review','confirmed'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'v2_paper_results_scan_quality_object'
      and conrelid = 'public.v2_paper_exam_results'::regclass
  ) then
    alter table public.v2_paper_exam_results
      add constraint v2_paper_results_scan_quality_object
      check (jsonb_typeof(scan_quality) = 'object');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'v2_paper_results_scan_metadata_object'
      and conrelid = 'public.v2_paper_exam_results'::regclass
  ) then
    alter table public.v2_paper_exam_results
      add constraint v2_paper_results_scan_metadata_object
      check (jsonb_typeof(scan_metadata) = 'object');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'v2_paper_results_revision_log_array'
      and conrelid = 'public.v2_paper_exam_results'::regclass
  ) then
    alter table public.v2_paper_exam_results
      add constraint v2_paper_results_revision_log_array
      check (jsonb_typeof(revision_log) = 'array');
  end if;
end $$;

create index if not exists v2_paper_results_teacher_capture_idx
  on public.v2_paper_exam_results(teacher_id, exam_id, capture_status, updated_at desc);

create or replace function public.v2_paper_result_capture_normalize()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.capture_source := coalesce(nullif(trim(new.capture_source), ''), 'legacy');
  new.scan_quality := coalesce(new.scan_quality, '{}'::jsonb);
  new.scan_metadata := coalesce(new.scan_metadata, '{}'::jsonb);
  new.revision_log := coalesce(new.revision_log, '[]'::jsonb);

  if new.capture_status = 'confirmed' or new.reviewed then
    new.capture_status := 'confirmed';
    new.reviewed := true;
    new.confirmed_at := coalesce(new.confirmed_at, now());
  else
    new.capture_status := 'pending_review';
    new.reviewed := false;
    new.confirmed_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_v2_paper_result_capture_normalize on public.v2_paper_exam_results;
create trigger trg_v2_paper_result_capture_normalize
before insert or update on public.v2_paper_exam_results
for each row execute function public.v2_paper_result_capture_normalize();

create or replace function public.v2_confirm_paper_omr_result(
  p_exam_id uuid,
  p_student_id uuid,
  p_version text,
  p_answers jsonb,
  p_scan_quality jsonb default '{}'::jsonb,
  p_scan_metadata jsonb default '{}'::jsonb,
  p_capture_source text default 'camera'
)
returns public.v2_paper_exam_results
language plpgsql
security invoker
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  exam_row public.v2_paper_exams%rowtype;
  student_row public.v2_group_students%rowtype;
  existing public.v2_paper_exam_results%rowtype;
  saved public.v2_paper_exam_results%rowtype;
  normalized_version text := upper(trim(coalesce(p_version, 'A')));
  normalized_source text := lower(trim(coalesce(p_capture_source, 'camera')));
  key_answers jsonb;
  normalized_answers jsonb := '[]'::jsonb;
  answer_value text;
  key_value text;
  item_index integer;
  correct_total integer := 0;
  blank_total integer := 0;
  calculated_score numeric(5,2);
  existing_count integer := 0;
  previous_entry jsonb;
begin
  if actor is null then raise exception 'Sesión docente requerida.'; end if;
  if p_exam_id is null then raise exception 'Selecciona una evaluación.'; end if;
  if p_student_id is null then raise exception 'Selecciona un alumno del padrón.'; end if;
  if normalized_source not in ('camera','upload','manual') then raise exception 'Origen de captura no válido.'; end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'array' then raise exception 'Las respuestas no tienen un formato válido.'; end if;
  if jsonb_typeof(coalesce(p_scan_quality, '{}'::jsonb)) <> 'object' then raise exception 'La calidad de lectura no tiene un formato válido.'; end if;
  if jsonb_typeof(coalesce(p_scan_metadata, '{}'::jsonb)) <> 'object' then raise exception 'Los metadatos de captura no tienen un formato válido.'; end if;

  select * into exam_row
  from public.v2_paper_exams
  where id = p_exam_id and teacher_id = actor
  for update;

  if not found then raise exception 'No se encontró la evaluación.'; end if;
  if exam_row.status <> 'ready' then raise exception 'La evaluación debe estar lista para aceptar capturas OMR.'; end if;
  if exam_row.group_id is null then raise exception 'La evaluación necesita un grupo para vincular resultados.'; end if;
  if not (normalized_version = any(exam_row.versions)) then raise exception 'La versión seleccionada no pertenece a la evaluación.'; end if;
  if jsonb_array_length(p_answers) <> exam_row.question_count then raise exception 'La cantidad de respuestas no coincide con el examen.'; end if;

  key_answers := case
    when jsonb_typeof(exam_row.answer_keys) = 'array' then exam_row.answer_keys
    else exam_row.answer_keys -> normalized_version
  end;
  if key_answers is null or jsonb_typeof(key_answers) <> 'array' or jsonb_array_length(key_answers) <> exam_row.question_count then
    raise exception 'La clave de la versión está incompleta.';
  end if;

  select * into student_row
  from public.v2_group_students
  where id = p_student_id
    and group_id = exam_row.group_id
    and teacher_id = actor;

  if not found then raise exception 'El alumno no pertenece al padrón de esta evaluación.'; end if;

  for item_index in 0..(exam_row.question_count - 1) loop
    answer_value := upper(trim(coalesce(p_answers ->> item_index, '')));
    key_value := upper(trim(coalesce(key_answers ->> item_index, '')));

    if answer_value = '' then
      normalized_answers := normalized_answers || jsonb_build_array(null);
      blank_total := blank_total + 1;
    else
      if answer_value !~ '^[A-E]$' then raise exception 'La respuesta % no es válida.', item_index + 1; end if;
      normalized_answers := normalized_answers || jsonb_build_array(answer_value);
      if answer_value = key_value then correct_total := correct_total + 1; end if;
    end if;
  end loop;

  calculated_score := round((correct_total::numeric / exam_row.question_count::numeric) * 10, 2);

  select count(*) into existing_count
  from public.v2_paper_exam_results
  where exam_id = exam_row.id
    and teacher_id = actor
    and student_id = student_row.id;

  if existing_count > 1 then
    raise exception 'Existen resultados históricos duplicados para este alumno. Revísalos antes de capturar de nuevo.';
  end if;

  select * into existing
  from public.v2_paper_exam_results
  where exam_id = exam_row.id
    and teacher_id = actor
    and student_id = student_row.id
  order by updated_at desc
  limit 1
  for update;

  if found then
    previous_entry := jsonb_build_object(
      'changed_at', now(),
      'changed_by', actor,
      'version', existing.version,
      'answers', existing.answers,
      'correct_count', existing.correct_count,
      'blank_count', existing.blank_count,
      'score', existing.score,
      'capture_source', existing.capture_source,
      'scan_quality', existing.scan_quality,
      'confirmed_at', existing.confirmed_at
    );

    update public.v2_paper_exam_results
    set enrollment = student_row.enrollment,
        student_name = student_row.full_name,
        version = normalized_version,
        answers = normalized_answers,
        correct_count = correct_total,
        blank_count = blank_total,
        score = calculated_score,
        reviewed = true,
        capture_source = normalized_source,
        capture_status = 'confirmed',
        scan_quality = coalesce(p_scan_quality, '{}'::jsonb),
        scan_metadata = coalesce(p_scan_metadata, '{}'::jsonb) || jsonb_build_object(
          'server_confirmed_at', now(),
          'question_count', exam_row.question_count,
          'version', normalized_version
        ),
        confirmed_at = now(),
        revision_log = coalesce(existing.revision_log, '[]'::jsonb) || jsonb_build_array(previous_entry),
        updated_at = now()
    where id = existing.id
      and teacher_id = actor
    returning * into saved;
  else
    insert into public.v2_paper_exam_results(
      exam_id, teacher_id, student_id, enrollment, student_name, version, answers,
      correct_count, blank_count, score, reviewed, capture_source, capture_status,
      scan_quality, scan_metadata, confirmed_at, revision_log, updated_at
    ) values (
      exam_row.id, actor, student_row.id, student_row.enrollment, student_row.full_name,
      normalized_version, normalized_answers, correct_total, blank_total, calculated_score,
      true, normalized_source, 'confirmed', coalesce(p_scan_quality, '{}'::jsonb),
      coalesce(p_scan_metadata, '{}'::jsonb) || jsonb_build_object(
        'server_confirmed_at', now(),
        'question_count', exam_row.question_count,
        'version', normalized_version
      ),
      now(), '[]'::jsonb, now()
    ) returning * into saved;
  end if;

  return saved;
end;
$$;

revoke all on function public.v2_confirm_paper_omr_result(uuid,uuid,text,jsonb,jsonb,jsonb,text) from public;
revoke all on function public.v2_confirm_paper_omr_result(uuid,uuid,text,jsonb,jsonb,jsonb,text) from anon;
grant execute on function public.v2_confirm_paper_omr_result(uuid,uuid,text,jsonb,jsonb,jsonb,text) to authenticated;

comment on column public.v2_paper_exam_results.scan_quality is 'Per-item OMR reading quality. No image bytes are stored.';
comment on column public.v2_paper_exam_results.revision_log is 'Append-only snapshots of prior confirmed values when a teacher corrects an OMR result.';
comment on function public.v2_confirm_paper_omr_result(uuid,uuid,text,jsonb,jsonb,jsonb,text) is 'Validates ownership, roster, exam state and answer key; recalculates and confirms an OMR result atomically.';
