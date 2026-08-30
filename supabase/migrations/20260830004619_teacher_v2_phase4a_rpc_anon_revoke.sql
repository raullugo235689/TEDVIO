-- TEDVIO 2.0 · Etapa 4A · Endurecimiento explícito de privilegios
-- Las funciones verifican auth.uid(), pero además retiramos cualquier EXECUTE heredado del rol anon.

revoke all on function public.v2_save_paper_exam_v2(uuid,uuid,uuid,text,text,date,text,numeric,numeric,text[],text,jsonb) from anon;
revoke all on function public.v2_set_paper_exam_status(uuid,text) from anon;
revoke all on function public.v2_duplicate_paper_exam(uuid) from anon;

revoke all on public.v2_paper_exam_questions from anon;

grant execute on function public.v2_save_paper_exam_v2(uuid,uuid,uuid,text,text,date,text,numeric,numeric,text[],text,jsonb) to authenticated;
grant execute on function public.v2_set_paper_exam_status(uuid,text) to authenticated;
grant execute on function public.v2_duplicate_paper_exam(uuid) to authenticated;
grant select,insert,update,delete on public.v2_paper_exam_questions to authenticated;
