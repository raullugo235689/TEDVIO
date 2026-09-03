-- Recovered from the production migration ledger for deterministic rebuilds.
-- Quarantine the pre-v2 MVP surface. Current TEDVIO stable runtime uses v2_* tables/RPCs.
-- Keep legacy data in place, but stop exposing unrestricted anonymous CRUD/RPC access.

drop policy if exists mvp_sessions_all on public.sessions;
drop policy if exists mvp_questions_all on public.questions;
drop policy if exists mvp_participants_all on public.participants;
drop policy if exists mvp_responses_all on public.responses;
drop policy if exists mvp_question_bank_all on public.question_bank;
drop policy if exists mvp_prepared_quizzes_all on public.prepared_quizzes;
drop policy if exists mvp_prepared_quiz_items_all on public.prepared_quiz_items;

revoke all on function public.get_student_session(text,uuid) from public, anon, authenticated;
revoke all on function public.join_session(text,text) from public, anon, authenticated;
revoke all on function public.submit_response(uuid,uuid,text) from public, anon, authenticated;

