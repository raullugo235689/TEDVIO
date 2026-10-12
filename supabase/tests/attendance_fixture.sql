-- Synthetic baseline for isolated PostgreSQL/PGlite tests only.
create role anon; create role authenticated; create schema auth; create schema tedvio_private;
 grant usage on schema public,auth to authenticated,anon;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table auth.users(id uuid primary key);
 create table public.v2_groups(id uuid primary key,teacher_id uuid not null,name text,subject text);
 create table public.v2_group_students(id uuid primary key,group_id uuid references v2_groups(id),teacher_id uuid not null,full_name text,enrollment text,active boolean default true);
 create table public.v2_academic_periods(id uuid primary key default gen_random_uuid(),teacher_id uuid,group_id uuid,status text,starts_on date,ends_on date);
 create table public.v2_attendance_sessions(id uuid primary key default gen_random_uuid(),group_id uuid not null references v2_groups(id),teacher_id uuid not null references auth.users(id),attendance_date date not null,status text not null default 'open',notes text,created_at timestamptz default now(),opened_at timestamptz default now(),paused_at timestamptz,closed_at timestamptz,late_after_minutes int default 10,auto_mark_absent boolean default true,updated_at timestamptz default now(),entry_mode text default 'manual',checkin_event_id uuid,unique(group_id,attendance_date));
 create table public.v2_attendance_records(id uuid primary key default gen_random_uuid(),attendance_session_id uuid references v2_attendance_sessions(id) on delete cascade,student_id uuid references v2_group_students(id),teacher_id uuid,status text check(status in ('present','late','absent','justified')),note text,observation text,updated_at timestamptz default now(),unique(attendance_session_id,student_id));
 create function public.v2_assert_group_date_open(t uuid,g uuid,d date) returns void language plpgsql as $$begin if exists(select 1 from public.v2_academic_periods where teacher_id=t and group_id=g and status='closed' and d between starts_on and ends_on) then raise exception 'Periodo académico cerrado'; end if;end$$;
