-- Recovered from the production migration ledger for deterministic rebuilds.
alter table public.v2_question_secrets
  drop constraint if exists v2_question_secrets_question_id_fkey;

alter table public.v2_question_secrets
  add constraint v2_question_secrets_question_id_fkey
  foreign key (question_id)
  references public.v2_questions(id)
  on delete cascade
  deferrable initially deferred;

