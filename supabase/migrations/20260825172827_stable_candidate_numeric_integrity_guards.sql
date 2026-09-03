-- Recovered from the production migration ledger for deterministic rebuilds.
-- Numeric integrity on Attendance Pro, gradebook and OMR write paths.

alter table public.v2_attendance_sessions
  drop constraint if exists v2_attendance_sessions_late_after_minutes_check;
alter table public.v2_attendance_sessions
  add constraint v2_attendance_sessions_late_after_minutes_check
  check (late_after_minutes between 0 and 120);

-- Grade score must fit the referenced activity's configured maximum.
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
      and (v2_grade_scores.score is null or (v2_grade_scores.score>=0 and v2_grade_scores.score<=i.max_score))
  )
);

-- OMR result ranges and relationship to exam length.
drop policy if exists v2_paper_results_owner on public.v2_paper_exam_results;
create policy v2_paper_results_owner on public.v2_paper_exam_results for all to authenticated
using (teacher_id=(select auth.uid()))
with check (
  teacher_id=(select auth.uid())
  and score between 0 and 10
  and correct_count>=0
  and blank_count>=0
  and exists(
    select 1
    from public.v2_paper_exams e
    where e.id=v2_paper_exam_results.exam_id
      and e.teacher_id=(select auth.uid())
      and v2_paper_exam_results.correct_count<=e.question_count
      and v2_paper_exam_results.blank_count<=e.question_count
      and (v2_paper_exam_results.correct_count+v2_paper_exam_results.blank_count)<=e.question_count
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

