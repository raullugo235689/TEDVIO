-- TEDVIO 2.0 · Etapa 4B · Correcciones de flujo OMR
-- Registra captura en evaluaciones Lista o Cerrada y evita restauraciones duplicadas.

alter table public.v2_paper_exam_results
  add column if not exists archive_reason text;

do $patch$
declare
  ddl text;
  patched text;
begin
  ddl := pg_get_functiondef('public.v2_save_omr_result(uuid,uuid,uuid,text,text,text,jsonb,text,jsonb,integer,integer,boolean,text,text)'::regprocedure);
  if position('exam_row.status not in (''ready'',''closed'')' in ddl) > 0 then
    null;
  elsif position('exam_row.status<>''ready''' in ddl) > 0 then
    patched := replace(
      ddl,
      'if exam_row.status<>''ready'' then raise exception ''La captura OMR solo está disponible para evaluaciones marcadas como Lista.''; end if;',
      'if exam_row.status not in (''ready'',''closed'') then raise exception ''La evaluación debe estar marcada como Lista o Cerrada antes de capturar OMR.''; end if;'
    );
    if patched = ddl then raise exception 'No se pudo actualizar la validación de estado de v2_save_omr_result.'; end if;
    execute patched;
  else
    raise exception 'La validación de estado de v2_save_omr_result no coincide con la versión esperada.';
  end if;
end $patch$;

create or replace function public.v2_set_omr_result_archived(
  p_result_id uuid,
  p_archived boolean,
  p_reason text default null
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
  from public.v2_paper_exam_results r
  where r.id=p_result_id and r.teacher_id=actor
  for update;
  if not found then raise exception 'No se encontró el resultado.'; end if;

  select * into exam_row from public.v2_paper_exams
  where id=result_row.exam_id and teacher_id=actor;
  if not found then raise exception 'No se encontró la evaluación.'; end if;
  if exam_row.period_id is not null then
    perform public.v2_assert_period_link_open(exam_row.period_id,exam_row.teacher_id,exam_row.group_id);
  end if;

  if not coalesce(p_archived,false)
     and result_row.student_id is not null
     and exists (
       select 1
       from public.v2_paper_exam_results active_result
       where active_result.exam_id=result_row.exam_id
         and active_result.student_id=result_row.student_id
         and active_result.version=result_row.version
         and active_result.archived_at is null
         and active_result.id<>result_row.id
     ) then
    raise exception 'Ya existe un resultado activo para este alumno y versión. Conserva el registro archivado como antecedente.';
  end if;

  update public.v2_paper_exam_results set
    archived_at=case when coalesce(p_archived,false) then coalesce(archived_at,now()) else null end,
    archive_reason=case when coalesce(p_archived,false) then coalesce(nullif(trim(p_reason),''),'Archivado por el docente') else null end,
    review_status=case
      when coalesce(p_archived,false) then 'archived'
      when reviewed then 'confirmed'
      else 'needs_review'
    end,
    review_note=coalesce(nullif(trim(p_reason),''),review_note),
    updated_at=now()
  where id=result_row.id and teacher_id=actor
  returning * into result_row;
  return result_row;
end;
$$;

alter function public.v2_save_omr_result(uuid,uuid,uuid,text,text,text,jsonb,text,jsonb,integer,integer,boolean,text,text) security invoker;
alter function public.v2_set_omr_result_archived(uuid,boolean,text) security invoker;
revoke all on function public.v2_save_omr_result(uuid,uuid,uuid,text,text,text,jsonb,text,jsonb,integer,integer,boolean,text,text) from public,anon;
revoke all on function public.v2_set_omr_result_archived(uuid,boolean,text) from public,anon;
grant execute on function public.v2_save_omr_result(uuid,uuid,uuid,text,text,text,jsonb,text,jsonb,integer,integer,boolean,text,text) to authenticated;
grant execute on function public.v2_set_omr_result_archived(uuid,boolean,text) to authenticated;
