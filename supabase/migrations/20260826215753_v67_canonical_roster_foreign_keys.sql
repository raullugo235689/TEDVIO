-- Recovered from the production migration ledger for deterministic rebuilds.
alter table public.v2_participants drop constraint if exists v2_participants_roster_student_id_fkey;
alter table public.v2_participants add constraint v2_participants_roster_student_id_fkey foreign key(roster_student_id) references public.v2_group_students(id) on delete set null;
alter table public.v2_attendance drop constraint if exists v2_attendance_roster_student_id_fkey;
alter table public.v2_attendance add constraint v2_attendance_roster_student_id_fkey foreign key(roster_student_id) references public.v2_group_students(id) on delete cascade;

