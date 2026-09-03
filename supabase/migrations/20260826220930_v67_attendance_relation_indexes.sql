-- Recovered from the production migration ledger for deterministic rebuilds.
create index if not exists v2_attendance_group_idx on public.v2_attendance(group_id);
create index if not exists v2_attendance_participant_idx on public.v2_attendance(participant_id);
create index if not exists v2_attendance_roster_idx on public.v2_attendance(roster_student_id);

