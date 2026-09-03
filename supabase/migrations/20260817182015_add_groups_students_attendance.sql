-- Recovered from the production migration ledger for deterministic rebuilds.
create extension if not exists pgcrypto;

create table if not exists public.v2_groups (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  university text,
  program text,
  subject text,
  group_name text not null,
  school_cycle text,
  created_at timestamptz not null default now()
);

create table if not exists public.v2_group_students (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.v2_groups(id) on delete cascade,
  teacher_id uuid not null references auth.users(id) on delete cascade,
  enrollment text not null,
  full_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(group_id,enrollment)
);

create table if not exists public.v2_attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.v2_groups(id) on delete cascade,
  teacher_id uuid not null references auth.users(id) on delete cascade,
  attendance_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  unique(group_id,attendance_date)
);

create table if not exists public.v2_attendance_records (
  id uuid primary key default gen_random_uuid(),
  attendance_session_id uuid not null references public.v2_attendance_sessions(id) on delete cascade,
  student_id uuid not null references public.v2_group_students(id) on delete cascade,
  teacher_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'present' check(status in ('present','late','absent','justified')),
  note text,
  updated_at timestamptz not null default now(),
  unique(attendance_session_id,student_id)
);

alter table public.v2_groups enable row level security;
alter table public.v2_group_students enable row level security;
alter table public.v2_attendance_sessions enable row level security;
alter table public.v2_attendance_records enable row level security;

drop policy if exists groups_teacher_all on public.v2_groups;
create policy groups_teacher_all on public.v2_groups for all using (teacher_id=auth.uid()) with check (teacher_id=auth.uid());
drop policy if exists group_students_teacher_all on public.v2_group_students;
create policy group_students_teacher_all on public.v2_group_students for all using (teacher_id=auth.uid()) with check (teacher_id=auth.uid());
drop policy if exists attendance_sessions_teacher_all on public.v2_attendance_sessions;
create policy attendance_sessions_teacher_all on public.v2_attendance_sessions for all using (teacher_id=auth.uid()) with check (teacher_id=auth.uid());
drop policy if exists attendance_records_teacher_all on public.v2_attendance_records;
create policy attendance_records_teacher_all on public.v2_attendance_records for all using (teacher_id=auth.uid()) with check (teacher_id=auth.uid());

create index if not exists idx_v2_groups_teacher on public.v2_groups(teacher_id);
create index if not exists idx_v2_students_group on public.v2_group_students(group_id);
create index if not exists idx_v2_att_sessions_group_date on public.v2_attendance_sessions(group_id,attendance_date);
create index if not exists idx_v2_att_records_session on public.v2_attendance_records(attendance_session_id);

