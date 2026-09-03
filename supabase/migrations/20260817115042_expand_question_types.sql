-- Recovered from the production migration ledger for deterministic rebuilds.
alter table public.question_bank drop constraint if exists question_bank_question_type_check;
alter table public.question_bank add constraint question_bank_question_type_check check (question_type in ('multiple_choice','true_false','open_text','poll','scale','numeric','multiple_select'));
alter table public.questions drop constraint if exists questions_question_type_check;
alter table public.questions add constraint questions_question_type_check check (question_type in ('multiple_choice','true_false','open_text','poll','scale','numeric','multiple_select'));

