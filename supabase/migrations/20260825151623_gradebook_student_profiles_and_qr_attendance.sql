-- Recovered from the production migration ledger for deterministic rebuilds.
create extension if not exists pgcrypto;

create table if not exists public.v2_grade_categories (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.v2_groups(id) on delete cascade,
  teacher_id uuid not null,
  name text not null,
  kind text not null default 'manual' check (kind in ('manual','omr','attendance','live')),
  weight numeric(6,2) not null default 0 check (weight >= 0 and weight <= 100),
  created_at timestamptz not null default now(),
  unique(group_id,name)
);
create table if not exists public.v2_grade_items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.v2_groups(id) on delete cascade,
  teacher_id uuid not null,
  category_id uuid not null references public.v2_grade_categories(id) on delete cascade,
  title text not null,
  max_score numeric(8,2) not null default 10 check (max_score > 0),
  item_date date,
  created_at timestamptz not null default now()
);
create table if not exists public.v2_grade_scores (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.v2_grade_items(id) on delete cascade,
  student_id uuid not null references public.v2_group_students(id) on delete cascade,
  teacher_id uuid not null,
  score numeric(8,2),
  note text,
  updated_at timestamptz not null default now(),
  unique(item_id,student_id)
);
create table if not exists public.v2_group_alert_settings (
  group_id uuid primary key references public.v2_groups(id) on delete cascade,
  teacher_id uuid not null,
  min_attendance numeric(5,2) not null default 80 check (min_attendance >= 0 and min_attendance <= 100),
  min_grade numeric(5,2) not null default 6 check (min_grade >= 0 and min_grade <= 10),
  updated_at timestamptz not null default now()
);
create table if not exists public.v2_student_notes (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.v2_groups(id) on delete cascade,
  student_id uuid not null references public.v2_group_students(id) on delete cascade,
  teacher_id uuid not null,
  note text,
  updated_at timestamptz not null default now(),
  unique(group_id,student_id)
);
create table if not exists public.v2_attendance_qr_tokens (
  id uuid primary key default gen_random_uuid(),
  attendance_session_id uuid not null references public.v2_attendance_sessions(id) on delete cascade,
  group_id uuid not null references public.v2_groups(id) on delete cascade,
  teacher_id uuid not null,
  token text not null unique,
  active boolean not null default true,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists v2_grade_categories_group_idx on public.v2_grade_categories(group_id);
create index if not exists v2_grade_items_group_idx on public.v2_grade_items(group_id);
create index if not exists v2_grade_scores_student_idx on public.v2_grade_scores(student_id);
create index if not exists v2_attendance_qr_token_idx on public.v2_attendance_qr_tokens(token);

alter table public.v2_grade_categories enable row level security;
alter table public.v2_grade_items enable row level security;
alter table public.v2_grade_scores enable row level security;
alter table public.v2_group_alert_settings enable row level security;
alter table public.v2_student_notes enable row level security;
alter table public.v2_attendance_qr_tokens enable row level security;

drop policy if exists v2_grade_categories_owner on public.v2_grade_categories;
create policy v2_grade_categories_owner on public.v2_grade_categories for all to authenticated using (teacher_id=auth.uid()) with check (teacher_id=auth.uid());
drop policy if exists v2_grade_items_owner on public.v2_grade_items;
create policy v2_grade_items_owner on public.v2_grade_items for all to authenticated using (teacher_id=auth.uid()) with check (teacher_id=auth.uid());
drop policy if exists v2_grade_scores_owner on public.v2_grade_scores;
create policy v2_grade_scores_owner on public.v2_grade_scores for all to authenticated using (teacher_id=auth.uid()) with check (teacher_id=auth.uid());
drop policy if exists v2_group_alert_settings_owner on public.v2_group_alert_settings;
create policy v2_group_alert_settings_owner on public.v2_group_alert_settings for all to authenticated using (teacher_id=auth.uid()) with check (teacher_id=auth.uid());
drop policy if exists v2_student_notes_owner on public.v2_student_notes;
create policy v2_student_notes_owner on public.v2_student_notes for all to authenticated using (teacher_id=auth.uid()) with check (teacher_id=auth.uid());
drop policy if exists v2_attendance_qr_tokens_owner on public.v2_attendance_qr_tokens;
create policy v2_attendance_qr_tokens_owner on public.v2_attendance_qr_tokens for all to authenticated using (teacher_id=auth.uid()) with check (teacher_id=auth.uid());

create or replace function public.v2_public_attendance_checkin(p_token text,p_enrollment text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  t public.v2_attendance_qr_tokens%rowtype;
  st public.v2_group_students%rowtype;
begin
  select * into t from public.v2_attendance_qr_tokens
  where token=p_token and active=true and expires_at>now()
  order by created_at desc limit 1;
  if t.id is null then return jsonb_build_object('ok',false,'message','El código de asistencia expiró. Escanea el QR actualizado.'); end if;
  select * into st from public.v2_group_students
  where group_id=t.group_id and active=true and lower(trim(enrollment))=lower(trim(p_enrollment)) limit 1;
  if st.id is null then return jsonb_build_object('ok',false,'message','La matrícula no pertenece a este grupo.'); end if;
  insert into public.v2_attendance_records(attendance_session_id,student_id,teacher_id,status,observation,updated_at)
  values(t.attendance_session_id,st.id,t.teacher_id,'present','Registro por QR',now())
  on conflict(attendance_session_id,student_id) do update set status='present',observation='Registro por QR',updated_at=now();
  return jsonb_build_object('ok',true,'message','Asistencia registrada','student_name',st.full_name);
end $$;
grant execute on function public.v2_public_attendance_checkin(text,text) to anon,authenticated;

