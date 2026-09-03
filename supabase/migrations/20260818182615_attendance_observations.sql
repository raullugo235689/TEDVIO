-- Recovered from the production migration ledger for deterministic rebuilds.
alter table public.v2_attendance_records add column if not exists observation text;

