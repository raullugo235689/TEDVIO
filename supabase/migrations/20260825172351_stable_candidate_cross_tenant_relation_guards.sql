-- Recovered from the production migration ledger for deterministic rebuilds.
-- Harden tenant integrity: every parent/child reference written by a teacher must belong to that same teacher.

-- Academic hierarchy.
drop policy if exists v2_programs_owner on public.v2_programs;
create policy v2_programs_owner on public.v2_programs for all to authenticated
using (teacher_id=(select auth.uid()))
with check (
  teacher_id=(select auth.uid())
  and exists(select 1 from public.v2_universities u where u.id=v2_programs.university_id and u.teacher_id=(select auth.uid()))
);

drop policy if exists v2_groups_owner on public.v2_groups;
create policy v2_groups_owner on public.v2_groups for all to authenticated
using (teacher_id=(select auth.uid()))
with check (
  teacher_id=(select auth.uid())
  and exists(select 1 from public.v2_programs p where p.id=v2_groups.program_id and p.teacher_id=(select auth.uid()))
);

drop policy if exists group_students_teacher_all on public.v2_group_students;
create policy group_students_teacher_all on public.v2_group_students for all to authenticated
using (teacher_id=(select auth.uid()))
with check (
  teacher_id=(select auth.uid())
  and exists(select 1 from public.v2_groups g where g.id=v2_group_students.group_id and g.teacher_id=(select auth.uid()))
);

-- Sessions and prepared content.
drop policy if exists v2_sessions_owner_all on public.v2_sessions;
create policy v2_sessions_owner_all on public.v2_sessions for all to authenticated
using (teacher_id=(select auth.uid()))
with check (
  teacher_id=(select auth.uid())
  and (group_id is null or exists(select 1 from public.v2_groups g where g.id=v2_sessions.group_id and g.teacher_id=(select auth.uid())))
);

drop policy if exists v2_items_owner_all on public.v2_prepared_items;
create policy v2_items_owner_all on public.v2_prepared_items for all to authenticated
using (
  exists(select 1 from public.v2_prepared_quizzes q where q.id=v2_prepared_items.quiz_id and q.teacher_id=(select auth.uid()))
)
with check (
  exists(select 1 from public.v2_prepared_quizzes q where q.id=v2_prepared_items.quiz_id and q.teacher_id=(select auth.uid()))
  and exists(select 1 from public.v2_question_bank b where b.id=v2_prepared_items.bank_id and b.teacher_id=(select auth.uid()))
);

drop policy if exists v2_questions_teacher_write on public.v2_questions;
create policy v2_questions_teacher_write on public.v2_questions for all to authenticated
using (
  exists(select 1 from public.v2_sessions s where s.id=v2_questions.session_id and s.teacher_id=(select auth.uid()))
)
with check (
  exists(select 1 from public.v2_sessions s where s.id=v2_questions.session_id and s.teacher_id=(select auth.uid()))
  and (bank_id is null or exists(select 1 from public.v2_question_bank b where b.id=v2_questions.bank_id and b.teacher_id=(select auth.uid())))
);

-- Attendance.
drop policy if exists attendance_sessions_teacher_all on public.v2_attendance_sessions;
create policy attendance_sessions_teacher_all on public.v2_attendance_sessions for all to authenticated
using (teacher_id=(select auth.uid()))
with check (
  teacher_id=(select auth.uid())
  and exists(select 1 from public.v2_groups g where g.id=v2_attendance_sessions.group_id and g.teacher_id=(select auth.uid()))
);

drop policy if exists attendance_records_teacher_all on public.v2_attendance_records;
create policy attendance_records_teacher_all on public.v2_attendance_records for all to authenticated
using (teacher_id=(select auth.uid()))
with check (
  teacher_id=(select auth.uid())
  and exists(
    select 1
    from public.v2_attendance_sessions s
    join public.v2_group_students st on st.id=v2_attendance_records.student_id and st.group_id=s.group_id
    where s.id=v2_attendance_records.attendance_session_id
      and s.teacher_id=(select auth.uid())
      and st.teacher_id=(select auth.uid())
  )
);

drop policy if exists v2_attendance_qr_tokens_owner on public.v2_attendance_qr_tokens;
create policy v2_attendance_qr_tokens_owner on public.v2_attendance_qr_tokens for all to authenticated
using (teacher_id=(select auth.uid()))
with check (
  teacher_id=(select auth.uid())
  and exists(
    select 1 from public.v2_attendance_sessions s
    where s.id=v2_attendance_qr_tokens.attendance_session_id
      and s.group_id=v2_attendance_qr_tokens.group_id
      and s.teacher_id=(select auth.uid())
  )
);

-- Gradebook and student records.
drop policy if exists v2_grade_categories_owner on public.v2_grade_categories;
create policy v2_grade_categories_owner on public.v2_grade_categories for all to authenticated
using (teacher_id=(select auth.uid()))
with check (
  teacher_id=(select auth.uid())
  and exists(select 1 from public.v2_groups g where g.id=v2_grade_categories.group_id and g.teacher_id=(select auth.uid()))
);

drop policy if exists v2_grade_items_owner on public.v2_grade_items;
create policy v2_grade_items_owner on public.v2_grade_items for all to authenticated
using (teacher_id=(select auth.uid()))
with check (
  teacher_id=(select auth.uid())
  and exists(
    select 1 from public.v2_grade_categories c
    where c.id=v2_grade_items.category_id
      and c.group_id=v2_grade_items.group_id
      and c.teacher_id=(select auth.uid())
  )
);

drop policy if exists v2_grade_scores_owner on public.v2_grade_scores;
create policy v2_grade_scores_owner on public.v2_grade_scores for all to authenticated
using (teacher_id=(select auth.uid()))
with check (
  teacher_id=(select auth.uid())
  and exists(
    select 1
    from public.v2_grade_items i
    join public.v2_group_students st on st.id=v2_grade_scores.student_id and st.group_id=i.group_id
    where i.id=v2_grade_scores.item_id
      and i.teacher_id=(select auth.uid())
      and st.teacher_id=(select auth.uid())
  )
);

drop policy if exists v2_group_alert_settings_owner on public.v2_group_alert_settings;
create policy v2_group_alert_settings_owner on public.v2_group_alert_settings for all to authenticated
using (teacher_id=(select auth.uid()))
with check (
  teacher_id=(select auth.uid())
  and exists(select 1 from public.v2_groups g where g.id=v2_group_alert_settings.group_id and g.teacher_id=(select auth.uid()))
);

drop policy if exists v2_student_notes_owner on public.v2_student_notes;
create policy v2_student_notes_owner on public.v2_student_notes for all to authenticated
using (teacher_id=(select auth.uid()))
with check (
  teacher_id=(select auth.uid())
  and exists(
    select 1 from public.v2_group_students st
    where st.id=v2_student_notes.student_id
      and st.group_id=v2_student_notes.group_id
      and st.teacher_id=(select auth.uid())
  )
);

-- Paper exams / OMR.
drop policy if exists v2_paper_exams_owner on public.v2_paper_exams;
create policy v2_paper_exams_owner on public.v2_paper_exams for all to authenticated
using (teacher_id=(select auth.uid()))
with check (
  teacher_id=(select auth.uid())
  and (group_id is null or exists(select 1 from public.v2_groups g where g.id=v2_paper_exams.group_id and g.teacher_id=(select auth.uid())))
);

drop policy if exists v2_paper_results_owner on public.v2_paper_exam_results;
create policy v2_paper_results_owner on public.v2_paper_exam_results for all to authenticated
using (teacher_id=(select auth.uid()))
with check (
  teacher_id=(select auth.uid())
  and exists(
    select 1
    from public.v2_paper_exams e
    where e.id=v2_paper_exam_results.exam_id
      and e.teacher_id=(select auth.uid())
      and (
        v2_paper_exam_results.student_id is null
        or exists(
          select 1 from public.v2_group_students st
          where st.id=v2_paper_exam_results.student_id
            and st.teacher_id=(select auth.uid())
            and (e.group_id is null or st.group_id=e.group_id)
        )
      )
  )
);

