-- TEDVIO 2.0 · Etapa 4A · Corrección del escritor atómico
-- Resuelve la ambigüedad entre la variable exam_id y la columna homónima dentro de PL/pgSQL.

do $$
declare
  ddl text;
  patched text;
begin
  ddl:=pg_get_functiondef('public.v2_save_paper_exam_v2(uuid,uuid,uuid,text,text,date,text,numeric,numeric,text[],text,jsonb)'::regprocedure);
  patched:=replace(ddl,E'AS $function$\ndeclare',E'AS $function$\n#variable_conflict use_variable\ndeclare');
  patched:=replace(patched,'where exam_id=v2_save_paper_exam_v2.exam_id','where public.v2_paper_exam_questions.exam_id=exam_id');
  if patched=ddl then
    raise exception 'No se pudo localizar el cuerpo esperado de v2_save_paper_exam_v2.';
  end if;
  execute patched;
end $$;

comment on function public.v2_save_paper_exam_v2(uuid,uuid,uuid,text,text,date,text,numeric,numeric,text[],text,jsonb)
is 'Creates or replaces a draft evaluation blueprint atomically from the teacher question bank; Phase 4A ambiguity fix applied.';
