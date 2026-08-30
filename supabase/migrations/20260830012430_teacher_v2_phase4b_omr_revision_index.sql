create index if not exists v2_paper_exam_result_revisions_exam_idx
  on public.v2_paper_exam_result_revisions(exam_id);

comment on index public.v2_paper_exam_result_revisions_exam_idx
is 'Covers the exam foreign key used by OMR revision history and retention checks.';