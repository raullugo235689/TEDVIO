-- TEDVIO v73 · Assessment Intelligence
-- Additive metadata only. Existing OMR answers and scores are untouched.
alter table public.v2_paper_exams
  add column if not exists question_metadata jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'v2_paper_exams_question_metadata_object'
      and conrelid = 'public.v2_paper_exams'::regclass
  ) then
    alter table public.v2_paper_exams
      add constraint v2_paper_exams_question_metadata_object
      check (jsonb_typeof(question_metadata) = 'object');
  end if;
end $$;

comment on column public.v2_paper_exams.question_metadata is
  'TEDVIO Assessment Intelligence metadata: topic ranges and non-destructive item review flags.';
