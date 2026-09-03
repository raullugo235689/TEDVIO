-- Recovered from the production migration ledger for deterministic rebuilds.
create index if not exists v2_assignment_attempts_group_student_idx on public.v2_assignment_attempts(group_student_id) where group_student_id is not null;

