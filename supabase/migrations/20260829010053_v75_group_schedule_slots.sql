-- TEDVIO v75 · Agenda Académica
-- Weekly class slots owned by the authenticated teacher.

create table if not exists public.v2_group_schedule_slots (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid not null references public.v2_groups(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time without time zone not null,
  end_time time without time zone not null,
  room text,
  modality text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint v2_group_schedule_slots_time_order check (end_time > start_time),
  constraint v2_group_schedule_slots_unique unique (teacher_id, group_id, weekday, start_time, end_time)
);

create index if not exists v2_group_schedule_slots_teacher_idx
  on public.v2_group_schedule_slots (teacher_id, weekday, start_time);

create index if not exists v2_group_schedule_slots_group_idx
  on public.v2_group_schedule_slots (group_id, weekday, start_time);

alter table public.v2_group_schedule_slots enable row level security;

revoke all on table public.v2_group_schedule_slots from anon, authenticated;
grant select, insert, update, delete on table public.v2_group_schedule_slots to authenticated;

create policy "v2_group_schedule_slots_select_own"
  on public.v2_group_schedule_slots
  for select
  to authenticated
  using ((select auth.uid()) = teacher_id and exists (select 1 from public.v2_groups g where g.id = group_id and g.teacher_id = (select auth.uid())));

create policy "v2_group_schedule_slots_insert_own"
  on public.v2_group_schedule_slots
  for insert
  to authenticated
  with check ((select auth.uid()) = teacher_id and exists (select 1 from public.v2_groups g where g.id = group_id and g.teacher_id = (select auth.uid())));

create policy "v2_group_schedule_slots_update_own"
  on public.v2_group_schedule_slots
  for update
  to authenticated
  using ((select auth.uid()) = teacher_id and exists (select 1 from public.v2_groups g where g.id = group_id and g.teacher_id = (select auth.uid())))
  with check ((select auth.uid()) = teacher_id and exists (select 1 from public.v2_groups g where g.id = group_id and g.teacher_id = (select auth.uid())));

create policy "v2_group_schedule_slots_delete_own"
  on public.v2_group_schedule_slots
  for delete
  to authenticated
  using ((select auth.uid()) = teacher_id and exists (select 1 from public.v2_groups g where g.id = group_id and g.teacher_id = (select auth.uid())));
