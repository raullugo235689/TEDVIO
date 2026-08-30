-- TEDVIO 2.0 · Etapa 4B · OMR
-- Captura, revisión, calificación atómica y archivo sin eliminación física.

alter table public.v2_paper_exam_results
  add column if not exists capture_method text not null default 'legacy',
  add column if not exists review_status text not null default 'needs_review',
  add column if not exists scan_warnings integer not null default 0,
  add column if not exists manual_corrections integer not null default 0,
  add column if not exists scan_quality jsonb not null default '{}'::jsonb,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid,
  add column if not exists review_note text,
  add column if not exists source_fingerprint text,
  add column if not exists archived_at timestamptz;

update public.v2_paper_exam_results
set review_status=case when reviewed then 'confirmed' else 'needs_review' end,
    capture_method=coalesce(nullif(capture_method,''),'legacy'),
    reviewed_at=case when reviewed then coalesce(reviewed_at,updated_at,created_at) else reviewed_at end,
    reviewed_by=case when reviewed then coalesce(reviewed_by,teacher_id) else reviewed_by end
where review_status is distinct from case when reviewed then 'confirmed' else 'needs_review' end
   or capture_method is null
   or (reviewed and reviewed_at is null);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='v2_paper_results_capture_method_check'
      and conrelid='public.v2_paper_exam_results'::regclass
  ) then
    alter table public.v2_paper_exam_results
      add constraint v2_paper_results_capture_method_check
      check (capture_method in ('camera','upload','manual','legacy'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='v2_paper_results_review_status_check'
      and conrelid='public.v2_paper_exam_results'::regclass
  ) then
    alter table public.v2_paper_exam_results
      add constraint v2_paper_results_review_status_check
      check (review_status in ('needs_review','confirmed','archived'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='v2_paper_results_scan_counts_check'
      and conrelid='public.v2_paper_exam_results'::regclass
  ) then
    alter table public.v2_paper_exam_results
      add constraint v2_paper_results_scan_counts_check
      check (scan_warnings>=0 and manual_corrections>=0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='v2_paper_results_answers_array_check'
      and conrelid='public.v2_paper_exam_results'::regclass
  ) then
    alter table public.v2_paper_exam_results
      add constraint v2_paper_results_answers_array_check
      check (jsonb_typeof(answers)='array');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='v2_paper_results_scan_quality_object_check'
      and conrelid='public.v2_paper_exam_results'::regclass
  ) then
    alter table public.v2_paper_exam_results
      add constraint v2_paper_results_scan_quality_object_check
      check (jsonb_typeof(scan_quality)='object');
  end if;
end $$;

create index if not exists v2_paper_results_teacher_exam_active_idx
  on public.v2_paper_exam_results(teacher_id,exam_id,updated_at desc)
  where archived_at is null;

create unique index if not exists v2_paper_result_one_generic_enrollment
  on public.v2_paper_exam_results(exam_id,lower(btrim(enrollment)),version)
  where student_id is null and enrollment is not null;

create table if not exists public.v2_paper_exam_result_revisions (
  id uuid primary key default gen_random_uuid(),
  result_id uuid not null references public.v2_paper_exam_results(id) on delete restrict,
  exam_id uuid not null references public.v2_paper_exams(id) on delete restrict,
  teacher_id uuid not null,
  revision_no integer not null,
  snapshot jsonb not null,
  reason text,
  created_at timestamptz not null default now(),
  constraint v2_paper_exam_result_revisions_snapshot_check check (jsonb_typeof(snapshot)='object'),
  constraint v2_paper_exam_result_revisions_number_check check (revision_no>0),
  constraint v2_paper_exam_result_revisions_unique unique(result_id,revision_no)
);

create index if not exists v2_paper_exam_result_revisions_owner_idx
  on public.v2_paper_exam_result_revisions(teacher_id,result_id,revision_no desc);

alter table public.v2_paper_exam_result_revisions enable row level security;

drop policy if exists v2_paper_exam_result_revisions_owner_select on public.v2_paper_exam_result_revisions;
create policy v2_paper_exam_result_revisions_owner_select
on public.v2_paper_exam_result_revisions
for select
to authenticated
using (
  teacher_id=(select auth.uid())
  and exists (
    select 1 from public.v2_paper_exams e
    where e.id=v2_paper_exam_result_revisions.exam_id
      and e.teacher_id=(select auth.uid())
  )
);

revoke all on public.v2_paper_exam_result_revisions from public;
revoke all on public.v2_paper_exam_result_revisions from anon;
revoke all on public.v2_paper_exam_result_revisions from authenticated;
grant select on public.v2_paper_exam_result_revisions to authenticated;

create or replace function tedvio_private.capture_omr_result_revision()
returns trigger
language plpgsql
security definer
set search_path=public,tedvio_private,pg_temp
as $$
declare
  next_revision integer;
begin
  if old.answers is not distinct from new.answers
     and old.version is not distinct from new.version
     and old.student_id is not distinct from new.student_id
     and old.enrollment is not distinct from new.enrollment
     and old.student_name is not distinct from new.student_name
     and old.correct_count is not distinct from new.correct_count
     and old.blank_count is not distinct from new.blank_count
     and old.score is not distinct from new.score
     and old.reviewed is not distinct from new.reviewed
     and old.review_status is not distinct from new.review_status
     and old.archived_at is not distinct from new.archived_at
     and old.review_note is not distinct from new.review_note then
    return new;
  end if;

  select coalesce(max(revision_no),0)+1
    into next_revision
  from public.v2_paper_exam_result_revisions
  where result_id=old.id;

  insert into public.v2_paper_exam_result_revisions(
    result_id,exam_id,teacher_id,revision_no,snapshot,reason
  ) values (
    old.id,old.exam_id,old.teacher_id,next_revision,to_jsonb(old),nullif(btrim(new.review_note),'')
  );
  return new;
end;
$$;

revoke all on function tedvio_private.capture_omr_result_revision() from public;
revoke all on function tedvio_private.capture_omr_result_revision() from anon;
revoke all on function tedvio_private.capture_omr_result_revision() from authenticated;

drop trigger if exists trg_v2_paper_result_revision on public.v2_paper_exam_results;
create trigger trg_v2_paper_result_revision
after update on public.v2_paper_exam_results
for each row execute function tedvio_private.capture_omr_result_revision();

create or replace function tedvio_private.normalize_omr_result()
returns trigger
language plpgsql
security definer
set search_path=public,tedvio_private,pg_temp
as $$
declare
  exam_row public.v2_paper_exams%rowtype;
  answer_key jsonb;
  answer_value jsonb;
  answer_text text;
  expected_text text;
  answer_position integer;
  correct_total integer:=0;
  blank_total integer:=0;
begin
  select * into exam_row from public.v2_paper_exams where id=new.exam_id;
  if not found or exam_row.teacher_id is distinct from new.teacher_id then
    raise exception 'El resultado no pertenece a una evaluación del docente.';
  end if;
  if upper(btrim(new.version)) <> all(coalesce(exam_row.versions,array['A']::text[])) then
    raise exception 'La versión no pertenece a la evaluación.';
  end if;
  new.version:=upper(btrim(new.version));
  answer_key:=exam_row.answer_keys->new.version;
  if jsonb_typeof(answer_key)<>'array' or jsonb_array_length(answer_key)<>exam_row.question_count then
    raise exception 'La clave de la evaluación está incompleta.';
  end if;
  if jsonb_typeof(new.answers)<>'array' or jsonb_array_length(new.answers)<>exam_row.question_count then
    raise exception 'La lectura no coincide con el número de reactivos.';
  end if;

  for answer_value,answer_position in
    select value,ordinality::integer
    from jsonb_array_elements(new.answers) with ordinality as answers(value,ordinality)
  loop
    expected_text:=upper(coalesce(answer_key->>(answer_position-1),''));
    if answer_value='null'::jsonb then
      blank_total:=blank_total+1;
    else
      if jsonb_typeof(answer_value)<>'string' then raise exception 'Respuesta OMR no válida.'; end if;
      answer_text:=upper(btrim(answer_value#>>'{}'));
      if answer_text !~ '^[A-E]$' or ascii(answer_text)-64>exam_row.option_count then
        raise exception 'Respuesta OMR fuera de las opciones permitidas.';
      end if;
      if answer_text=expected_text then correct_total:=correct_total+1; end if;
    end if;
  end loop;

  new.correct_count:=correct_total;
  new.blank_count:=blank_total;
  new.score:=round((correct_total::numeric/nullif(exam_row.question_count,0))*10,2);
  new.capture_method:=coalesce(nullif(lower(btrim(new.capture_method)),''),'legacy');
  new.scan_quality:=coalesce(new.scan_quality,'{}'::jsonb);
  new.scan_warnings:=greatest(0,coalesce(new.scan_warnings,0));
  new.manual_corrections:=greatest(0,coalesce(new.manual_corrections,0));
  if new.archived_at is not null then
    new.review_status:='archived';
  elsif new.reviewed then
    new.review_status:='confirmed';
    new.reviewed_at:=coalesce(new.reviewed_at,now());
    new.reviewed_by:=coalesce(new.reviewed_by,new.teacher_id);
  elsif new.review_status='confirmed' then
    new.reviewed:=true;
    new.reviewed_at:=coalesce(new.reviewed_at,now());
    new.reviewed_by:=coalesce(new.reviewed_by,new.teacher_id);
  else
    new.review_status:='needs_review';
  end if;
  new.updated_at:=coalesce(new.updated_at,now());
  return new;
end;
$$;

revoke all on function tedvio_private.normalize_omr_result() from public;
revoke all on function tedvio_private.normalize_omr_result() from anon;
revoke all on function tedvio_private.normalize_omr_result() from authenticated;

drop trigger if exists trg_v2_paper_result_omr_normalize on public.v2_paper_exam_results;
create trigger trg_v2_paper_result_omr_normalize
before insert or update on public.v2_paper_exam_results
for each row execute function tedvio_private.normalize_omr_result();

create or replace function tedvio_private.prevent_omr_result_delete()
returns trigger
language plpgsql
security definer
set search_path=public,tedvio_private,pg_temp
as $$
begin
  raise exception 'Los resultados OMR no se eliminan. Archiva el resultado para conservar la trazabilidad.' using errcode='P0001';
end;
$$;

revoke all on function tedvio_private.prevent_omr_result_delete() from public;
revoke all on function tedvio_private.prevent_omr_result_delete() from anon;
revoke all on function tedvio_private.prevent_omr_result_delete() from authenticated;

drop trigger if exists trg_v2_paper_result_no_delete on public.v2_paper_exam_results;
create trigger trg_v2_paper_result_no_delete
before delete on public.v2_paper_exam_results
for each row execute function tedvio_private.prevent_omr_result_delete();

drop policy if exists v2_paper_results_owner on public.v2_paper_exam_results;
drop policy if exists v2_paper_results_owner_select on public.v2_paper_exam_results;
drop policy if exists v2_paper_results_owner_insert on public.v2_paper_exam_results;
drop policy if exists v2_paper_results_owner_update on public.v2_paper_exam_results;

create policy v2_paper_results_owner_select
on public.v2_paper_exam_results
for select
to authenticated
using (
  teacher_id=(select auth.uid())
  and exists (
    select 1 from public.v2_paper_exams e
    where e.id=v2_paper_exam_results.exam_id
      and e.teacher_id=(select auth.uid())
  )
);

create policy v2_paper_results_owner_insert
on public.v2_paper_exam_results
for insert
to authenticated
with check (
  teacher_id=(select auth.uid())
  and score between 0 and 10
  and correct_count>=0
  and blank_count>=0
  and scan_warnings>=0
  and manual_corrections>=0
  and exists (
    select 1 from public.v2_paper_exams e
    where e.id=v2_paper_exam_results.exam_id
      and e.teacher_id=(select auth.uid())
      and correct_count<=e.question_count
      and blank_count<=e.question_count
      and correct_count+blank_count<=e.question_count
      and scan_warnings<=e.question_count
      and manual_corrections<=e.question_count
      and (
        student_id is null
        or exists (
          select 1 from public.v2_group_students st
          where st.id=v2_paper_exam_results.student_id
            and st.teacher_id=(select auth.uid())
            and (e.group_id is null or st.group_id=e.group_id)
        )
      )
  )
);

create policy v2_paper_results_owner_update
on public.v2_paper_exam_results
for update
to authenticated
using (
  teacher_id=(select auth.uid())
  and exists (
    select 1 from public.v2_paper_exams e
    where e.id=v2_paper_exam_results.exam_id
      and e.teacher_id=(select auth.uid())
  )
)
with check (
  teacher_id=(select auth.uid())
  and score between 0 and 10
  and correct_count>=0
  and blank_count>=0
  and scan_warnings>=0
  and manual_corrections>=0
  and exists (
    select 1 from public.v2_paper_exams e
    where e.id=v2_paper_exam_results.exam_id
      and e.teacher_id=(select auth.uid())
      and correct_count<=e.question_count
      and blank_count<=e.question_count
      and correct_count+blank_count<=e.question_count
      and scan_warnings<=e.question_count
      and manual_corrections<=e.question_count
      and (
        student_id is null
        or exists (
          select 1 from public.v2_group_students st
          where st.id=v2_paper_exam_results.student_id
            and st.teacher_id=(select auth.uid())
            and (e.group_id is null or st.group_id=e.group_id)
        )
      )
  )
);

revoke all on public.v2_paper_exam_results from anon;
revoke all on public.v2_paper_exam_results from authenticated;
grant select,insert,update on public.v2_paper_exam_results to authenticated;

create or replace function public.v2_save_omr_result(
  p_result_id uuid,
  p_exam_id uuid,
  p_student_id uuid,
  p_enrollment text,
  p_student_name text,
  p_version text,
  p_answers jsonb,
  p_capture_method text,
  p_scan_quality jsonb,
  p_scan_warnings integer,
  p_manual_corrections integer,
  p_review_confirmed boolean,
  p_review_note text,
  p_source_fingerprint text
)
returns public.v2_paper_exam_results
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  actor uuid:=auth.uid();
  exam_row public.v2_paper_exams%rowtype;
  result_row public.v2_paper_exam_results%rowtype;
  existing_row public.v2_paper_exam_results%rowtype;
  student_row public.v2_group_students%rowtype;
  version_value text:=upper(btrim(coalesce(p_version,'A')));
  method_value text:=lower(btrim(coalesce(p_capture_method,'manual')));
  quality_value jsonb:=coalesce(p_scan_quality,'{}'::jsonb);
  answer_key jsonb;
  answer_value jsonb;
  answer_text text;
  expected_text text;
  answer_position integer;
  correct_total integer:=0;
  blank_total integer:=0;
  unresolved_warnings integer:=0;
  score_value numeric(6,2):=0;
  resolved_student_id uuid:=p_student_id;
  resolved_enrollment text:=nullif(btrim(p_enrollment),'');
  resolved_name text:=nullif(btrim(p_student_name),'');
  warning_total integer:=greatest(0,coalesce(p_scan_warnings,0));
  correction_total integer:=greatest(0,coalesce(p_manual_corrections,0));
  confirmed boolean:=coalesce(p_review_confirmed,false);
begin
  if actor is null then raise exception 'Sesión docente requerida.'; end if;

  select * into exam_row
  from public.v2_paper_exams
  where id=p_exam_id and teacher_id=actor
  for update;
  if not found then raise exception 'No se encontró la evaluación.'; end if;
  if exam_row.status not in ('ready','closed') then
    raise exception 'La evaluación debe estar marcada como Lista antes de capturar OMR.';
  end if;
  if exam_row.period_id is not null then
    perform public.v2_assert_period_link_open(exam_row.period_id,exam_row.teacher_id,exam_row.group_id);
  end if;

  if version_value <> all(coalesce(exam_row.versions,array['A']::text[])) then
    raise exception 'La versión % no pertenece a esta evaluación.',version_value;
  end if;
  answer_key:=exam_row.answer_keys->version_value;
  if jsonb_typeof(answer_key)<>'array' or jsonb_array_length(answer_key)<>exam_row.question_count then
    raise exception 'La clave de la versión % está incompleta.',version_value;
  end if;
  if jsonb_typeof(p_answers)<>'array' or jsonb_array_length(p_answers)<>exam_row.question_count then
    raise exception 'La lectura debe contener exactamente % respuestas.',exam_row.question_count;
  end if;
  if method_value not in ('camera','upload','manual','legacy') then
    raise exception 'Método de captura no válido.';
  end if;
  if jsonb_typeof(quality_value)<>'object' then
    raise exception 'La información de calidad no es válida.';
  end if;
  if warning_total>exam_row.question_count or correction_total>exam_row.question_count then
    raise exception 'Los contadores de revisión exceden el número de reactivos.';
  end if;

  if confirmed and warning_total>0 then
    if jsonb_typeof(quality_value->'marks')<>'array' then
      raise exception 'La revisión de marcas dudosas está incompleta.';
    end if;
    select count(*) into unresolved_warnings
    from jsonb_array_elements(quality_value->'marks') mark
    where coalesce(mark->>'status','ok')<>'ok'
      and coalesce((mark->>'reviewed')::boolean,false)=false;
    if unresolved_warnings>0 then
      raise exception 'Quedan % marcas dudosas sin revisar.',unresolved_warnings;
    end if;
  end if;

  for answer_value,answer_position in
    select value,ordinality::integer
    from jsonb_array_elements(p_answers) with ordinality as answers(value,ordinality)
  loop
    expected_text:=upper(coalesce(answer_key->>(answer_position-1),''));
    if answer_value='null'::jsonb then
      blank_total:=blank_total+1;
      continue;
    end if;
    if jsonb_typeof(answer_value)<>'string' then
      raise exception 'La respuesta % no tiene un formato válido.',answer_position;
    end if;
    answer_text:=upper(btrim(answer_value#>>'{}'));
    if answer_text !~ '^[A-E]$' or ascii(answer_text)-64>exam_row.option_count then
      raise exception 'La respuesta % está fuera de las opciones permitidas.',answer_position;
    end if;
    if answer_text=expected_text then correct_total:=correct_total+1; end if;
  end loop;

  score_value:=round((correct_total::numeric/nullif(exam_row.question_count,0))*10,2);

  if resolved_student_id is null and exam_row.group_id is not null and resolved_enrollment is not null then
    select * into student_row
    from public.v2_group_students
    where group_id=exam_row.group_id
      and teacher_id=actor
      and lower(btrim(enrollment))=lower(resolved_enrollment)
    limit 1;
    if found then resolved_student_id:=student_row.id; end if;
  end if;

  if resolved_student_id is not null then
    select * into student_row
    from public.v2_group_students
    where id=resolved_student_id and teacher_id=actor;
    if not found then raise exception 'El alumno no pertenece al docente.'; end if;
    if exam_row.group_id is not null and student_row.group_id<>exam_row.group_id then
      raise exception 'El alumno no pertenece al grupo de la evaluación.';
    end if;
    resolved_enrollment:=student_row.enrollment;
    resolved_name:=student_row.full_name;
  elsif resolved_enrollment is null and resolved_name is null then
    raise exception 'Selecciona un alumno o escribe nombre o matrícula.';
  end if;

  if p_result_id is not null then
    select * into existing_row
    from public.v2_paper_exam_results
    where id=p_result_id and exam_id=exam_row.id and teacher_id=actor
    for update;
    if not found then raise exception 'No se encontró el resultado que deseas corregir.'; end if;
  elsif resolved_student_id is not null then
    select * into existing_row
    from public.v2_paper_exam_results
    where exam_id=exam_row.id
      and teacher_id=actor
      and student_id=resolved_student_id
      and version=version_value
    order by updated_at desc
    limit 1
    for update;
  elsif resolved_enrollment is not null then
    select * into existing_row
    from public.v2_paper_exam_results
    where exam_id=exam_row.id
      and teacher_id=actor
      and student_id is null
      and lower(btrim(enrollment))=lower(resolved_enrollment)
      and version=version_value
    order by updated_at desc
    limit 1
    for update;
  end if;

  if existing_row.id is null then
    insert into public.v2_paper_exam_results(
      exam_id,teacher_id,student_id,enrollment,student_name,version,answers,
      correct_count,blank_count,score,reviewed,capture_method,review_status,
      scan_warnings,manual_corrections,scan_quality,reviewed_at,reviewed_by,
      review_note,source_fingerprint,archived_at,updated_at
    ) values (
      exam_row.id,actor,resolved_student_id,resolved_enrollment,resolved_name,version_value,p_answers,
      correct_total,blank_total,score_value,confirmed,method_value,
      case when confirmed then 'confirmed' else 'needs_review' end,
      warning_total,correction_total,quality_value,
      case when confirmed then now() else null end,
      case when confirmed then actor else null end,
      nullif(btrim(p_review_note),''),nullif(btrim(p_source_fingerprint),''),null,now()
    ) returning * into result_row;
  else
    update public.v2_paper_exam_results set
      student_id=resolved_student_id,
      enrollment=resolved_enrollment,
      student_name=resolved_name,
      version=version_value,
      answers=p_answers,
      correct_count=correct_total,
      blank_count=blank_total,
      score=score_value,
      reviewed=confirmed,
      capture_method=method_value,
      review_status=case when confirmed then 'confirmed' else 'needs_review' end,
      scan_warnings=warning_total,
      manual_corrections=correction_total,
      scan_quality=quality_value,
      reviewed_at=case when confirmed then now() else null end,
      reviewed_by=case when confirmed then actor else null end,
      review_note=nullif(btrim(p_review_note),''),
      source_fingerprint=nullif(btrim(p_source_fingerprint),''),
      archived_at=null,
      updated_at=now()
    where id=existing_row.id and teacher_id=actor
    returning * into result_row;
  end if;

  return result_row;
end;
$$;

create or replace function public.v2_set_omr_result_archived(
  p_result_id uuid,
  p_archived boolean,
  p_reason text
)
returns public.v2_paper_exam_results
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  actor uuid:=auth.uid();
  result_row public.v2_paper_exam_results%rowtype;
  exam_row public.v2_paper_exams%rowtype;
begin
  if actor is null then raise exception 'Sesión docente requerida.'; end if;
  select * into result_row
  from public.v2_paper_exam_results
  where id=p_result_id and teacher_id=actor
  for update;
  if not found then raise exception 'No se encontró el resultado.'; end if;

  select * into exam_row from public.v2_paper_exams
  where id=result_row.exam_id and teacher_id=actor;
  if not found then raise exception 'No se encontró la evaluación.'; end if;
  if exam_row.period_id is not null then
    perform public.v2_assert_period_link_open(exam_row.period_id,exam_row.teacher_id,exam_row.group_id);
  end if;

  update public.v2_paper_exam_results set
    archived_at=case when coalesce(p_archived,false) then now() else null end,
    review_status=case
      when coalesce(p_archived,false) then 'archived'
      when reviewed then 'confirmed'
      else 'needs_review'
    end,
    review_note=coalesce(nullif(btrim(p_reason),''),review_note),
    updated_at=now()
  where id=result_row.id and teacher_id=actor
  returning * into result_row;

  return result_row;
end;
$$;

revoke all on function public.v2_save_omr_result(uuid,uuid,uuid,text,text,text,jsonb,text,jsonb,integer,integer,boolean,text,text) from public;
revoke all on function public.v2_save_omr_result(uuid,uuid,uuid,text,text,text,jsonb,text,jsonb,integer,integer,boolean,text,text) from anon;
revoke all on function public.v2_set_omr_result_archived(uuid,boolean,text) from public;
revoke all on function public.v2_set_omr_result_archived(uuid,boolean,text) from anon;
grant execute on function public.v2_save_omr_result(uuid,uuid,uuid,text,text,text,jsonb,text,jsonb,integer,integer,boolean,text,text) to authenticated;
grant execute on function public.v2_set_omr_result_archived(uuid,boolean,text) to authenticated;

comment on table public.v2_paper_exam_result_revisions is 'Immutable prior snapshots for TEDVIO OMR result corrections.';
comment on function public.v2_save_omr_result(uuid,uuid,uuid,text,text,text,jsonb,text,jsonb,integer,integer,boolean,text,text) is 'Validates ownership, version and answers, recalculates score server-side, and saves a reviewed or pending OMR result.';
comment on function public.v2_set_omr_result_archived(uuid,boolean,text) is 'Archives or restores an OMR result without physical deletion and preserves revision history.';