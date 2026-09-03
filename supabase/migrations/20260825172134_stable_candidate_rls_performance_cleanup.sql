-- Recovered from the production migration ledger for deterministic rebuilds.
-- Quarantine legacy authenticated policies now that / routes to the v2 stable runtime.
drop policy if exists sessions_teacher_all on public.sessions;
drop policy if exists questions_teacher_all on public.questions;
drop policy if exists participants_teacher_select on public.participants;
drop policy if exists responses_teacher_select on public.responses;

-- Active v2 owner policies: cache auth.uid() once per statement.
drop policy if exists v2_bank_owner_all on public.v2_question_bank;
create policy v2_bank_owner_all on public.v2_question_bank for all to authenticated
using (teacher_id=(select auth.uid())) with check (teacher_id=(select auth.uid()));

drop policy if exists v2_sessions_owner_all on public.v2_sessions;
create policy v2_sessions_owner_all on public.v2_sessions for all to authenticated
using (teacher_id=(select auth.uid())) with check (teacher_id=(select auth.uid()));

drop policy if exists v2_sessions_public_read on public.v2_sessions;
create policy v2_sessions_public_read on public.v2_sessions for select to anon
using (status<>'closed');

drop policy if exists v2_questions_teacher_write on public.v2_questions;
create policy v2_questions_teacher_write on public.v2_questions for all to authenticated
using (exists(select 1 from public.v2_sessions s where s.id=v2_questions.session_id and s.teacher_id=(select auth.uid())))
with check (exists(select 1 from public.v2_sessions s where s.id=v2_questions.session_id and s.teacher_id=(select auth.uid())));

drop policy if exists v2_questions_public_read on public.v2_questions;
create policy v2_questions_public_read on public.v2_questions for select to anon
using (exists(select 1 from public.v2_sessions s where s.id=v2_questions.session_id and s.status<>'closed'));

drop policy if exists v2_quizzes_owner_all on public.v2_prepared_quizzes;
create policy v2_quizzes_owner_all on public.v2_prepared_quizzes for all to authenticated
using (teacher_id=(select auth.uid())) with check (teacher_id=(select auth.uid()));

drop policy if exists v2_items_owner_all on public.v2_prepared_items;
create policy v2_items_owner_all on public.v2_prepared_items for all to authenticated
using (exists(select 1 from public.v2_prepared_quizzes q where q.id=v2_prepared_items.quiz_id and q.teacher_id=(select auth.uid())))
with check (exists(select 1 from public.v2_prepared_quizzes q where q.id=v2_prepared_items.quiz_id and q.teacher_id=(select auth.uid())));

drop policy if exists v2_responses_teacher_read on public.v2_responses;
create policy v2_responses_teacher_read on public.v2_responses for select to authenticated
using (exists(select 1 from public.v2_questions q join public.v2_sessions s on s.id=q.session_id where q.id=v2_responses.question_id and s.teacher_id=(select auth.uid())));

drop policy if exists v2_paper_exams_owner on public.v2_paper_exams;
create policy v2_paper_exams_owner on public.v2_paper_exams for all to authenticated
using (teacher_id=(select auth.uid())) with check (teacher_id=(select auth.uid()));

drop policy if exists v2_paper_results_owner on public.v2_paper_exam_results;
create policy v2_paper_results_owner on public.v2_paper_exam_results for all to authenticated
using (teacher_id=(select auth.uid())) with check (teacher_id=(select auth.uid()));

drop policy if exists v2_grade_categories_owner on public.v2_grade_categories;
create policy v2_grade_categories_owner on public.v2_grade_categories for all to authenticated
using (teacher_id=(select auth.uid())) with check (teacher_id=(select auth.uid()));

drop policy if exists v2_grade_items_owner on public.v2_grade_items;
create policy v2_grade_items_owner on public.v2_grade_items for all to authenticated
using (teacher_id=(select auth.uid())) with check (teacher_id=(select auth.uid()));

drop policy if exists v2_grade_scores_owner on public.v2_grade_scores;
create policy v2_grade_scores_owner on public.v2_grade_scores for all to authenticated
using (teacher_id=(select auth.uid())) with check (teacher_id=(select auth.uid()));

drop policy if exists v2_group_alert_settings_owner on public.v2_group_alert_settings;
create policy v2_group_alert_settings_owner on public.v2_group_alert_settings for all to authenticated
using (teacher_id=(select auth.uid())) with check (teacher_id=(select auth.uid()));

drop policy if exists v2_student_notes_owner on public.v2_student_notes;
create policy v2_student_notes_owner on public.v2_student_notes for all to authenticated
using (teacher_id=(select auth.uid())) with check (teacher_id=(select auth.uid()));

