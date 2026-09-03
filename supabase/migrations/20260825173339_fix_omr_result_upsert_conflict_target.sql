-- Recovered from the production migration ledger for deterministic rebuilds.
-- OMR personalized saves use ON CONFLICT(exam_id,student_id,version).
-- A partial unique index cannot be inferred by that conflict target without a predicate.
drop index if exists public.v2_paper_result_one_per_student;
create unique index v2_paper_result_one_per_student
  on public.v2_paper_exam_results(exam_id,student_id,version);

