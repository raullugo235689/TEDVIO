-- TEDVIO 2.0 · Etapa 4A · Ejecución con identidad docente
-- Las operaciones de Evaluaciones ya están cubiertas por RLS y verificaciones de propiedad.
-- SECURITY INVOKER garantiza que cada RPC conserve los permisos y la identidad del docente autenticado.

alter function public.v2_save_paper_exam_v2(uuid,uuid,uuid,text,text,date,text,numeric,numeric,text[],text,jsonb)
  security invoker;
alter function public.v2_set_paper_exam_status(uuid,text)
  security invoker;
alter function public.v2_duplicate_paper_exam(uuid)
  security invoker;

revoke all on function public.v2_save_paper_exam_v2(uuid,uuid,uuid,text,text,date,text,numeric,numeric,text[],text,jsonb) from public;
revoke all on function public.v2_set_paper_exam_status(uuid,text) from public;
revoke all on function public.v2_duplicate_paper_exam(uuid) from public;
revoke all on function public.v2_save_paper_exam_v2(uuid,uuid,uuid,text,text,date,text,numeric,numeric,text[],text,jsonb) from anon;
revoke all on function public.v2_set_paper_exam_status(uuid,text) from anon;
revoke all on function public.v2_duplicate_paper_exam(uuid) from anon;

grant execute on function public.v2_save_paper_exam_v2(uuid,uuid,uuid,text,text,date,text,numeric,numeric,text[],text,jsonb) to authenticated;
grant execute on function public.v2_set_paper_exam_status(uuid,text) to authenticated;
grant execute on function public.v2_duplicate_paper_exam(uuid) to authenticated;

-- La tabla nueva no necesita TRUNCATE, TRIGGER ni REFERENCES desde el navegador.
revoke all on public.v2_paper_exam_questions from anon;
revoke all on public.v2_paper_exam_questions from authenticated;
grant select,insert,update,delete on public.v2_paper_exam_questions to authenticated;
