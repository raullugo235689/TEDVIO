-- TEDVIO 2.0 · Etapa 4D · Alumno 360°
-- Conserva historial de observaciones docentes y centraliza su escritura.

create table if not exists public.v2_student_note_revisions (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.v2_student_notes(id) on delete restrict,
  group_id uuid not null references public.v2_groups(id) on delete restrict,
  student_id uuid not null references public.v2_group_students(id) on delete restrict,
  teacher_id uuid not null,
  revision_no integer not null,
  action text not null,
  previous_note text,
  current_note text,
  reason text,
  created_at timestamptz not null default now(),
  constraint v2_student_note_revisions_number_check check (revision_no > 0),
  constraint v2_student_note_revisions_action_check check (action in ('created','updated')),
  constraint v2_student_note_revisions_unique unique (note_id, revision_no)
);

create index if not exists v2_student_note_revisions_owner_idx
  on public.v2_student_note_revisions(teacher_id, group_id, student_id, created_at desc);

alter table public.v2_student_note_revisions enable row level security;

drop policy if exists v2_student_note_revisions_owner_select on public.v2_student_note_revisions;
create policy v2_student_note_revisions_owner_select
on public.v2_student_note_revisions
for select
to authenticated
using (
  teacher_id = (select auth.uid())
  and exists (
    select 1
    from public.v2_group_students st
    where st.id = v2_student_note_revisions.student_id
      and st.group_id = v2_student_note_revisions.group_id
      and st.teacher_id = (select auth.uid())
  )
);

revoke all on public.v2_student_note_revisions from public;
revoke all on public.v2_student_note_revisions from anon;
revoke all on public.v2_student_note_revisions from authenticated;
grant select on public.v2_student_note_revisions to authenticated;

create or replace function tedvio_private.capture_student_note_revision()
returns trigger
language plpgsql
security definer
set search_path = public, tedvio_private, pg_temp
as $$
declare
  next_revision integer;
  change_reason text := nullif(btrim(coalesce(current_setting('tedvio.student_note_reason', true), '')), '');
begin
  if tg_op = 'UPDATE' and old.note is not distinct from new.note then
    return new;
  end if;

  select coalesce(max(r.revision_no), 0) + 1
    into next_revision
  from public.v2_student_note_revisions r
  where r.note_id = new.id;

  insert into public.v2_student_note_revisions(
    note_id, group_id, student_id, teacher_id, revision_no, action,
    previous_note, current_note, reason
  ) values (
    new.id, new.group_id, new.student_id, new.teacher_id, next_revision,
    case when tg_op = 'INSERT' then 'created' else 'updated' end,
    case when tg_op = 'INSERT' then null else old.note end,
    new.note,
    coalesce(change_reason, case when tg_op = 'INSERT' then 'Observación inicial' else 'Actualización docente' end)
  );

  return new;
end;
$$;

revoke all on function tedvio_private.capture_student_note_revision() from public;
revoke all on function tedvio_private.capture_student_note_revision() from anon;
revoke all on function tedvio_private.capture_student_note_revision() from authenticated;

drop trigger if exists trg_v2_student_note_revision on public.v2_student_notes;
create trigger trg_v2_student_note_revision
after insert or update of note on public.v2_student_notes
for each row execute function tedvio_private.capture_student_note_revision();

create or replace function tedvio_private.prevent_student_note_delete()
returns trigger
language plpgsql
security definer
set search_path = public, tedvio_private, pg_temp
as $$
begin
  raise exception 'Las observaciones docentes no se eliminan. Actualiza el contenido y conserva su historial.';
end;
$$;

revoke all on function tedvio_private.prevent_student_note_delete() from public;
revoke all on function tedvio_private.prevent_student_note_delete() from anon;
revoke all on function tedvio_private.prevent_student_note_delete() from authenticated;

drop trigger if exists trg_v2_student_note_no_delete on public.v2_student_notes;
create trigger trg_v2_student_note_no_delete
before delete on public.v2_student_notes
for each row execute function tedvio_private.prevent_student_note_delete();

create or replace function public.v2_save_student_note_v2(
  p_group_id uuid,
  p_student_id uuid,
  p_note text,
  p_reason text default null
)
returns public.v2_student_notes
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  existing public.v2_student_notes%rowtype;
  result_row public.v2_student_notes%rowtype;
  normalized_note text := nullif(btrim(coalesce(p_note, '')), '');
  normalized_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if actor is null then
    raise exception 'Sesión docente requerida.';
  end if;

  if not exists (
    select 1
    from public.v2_group_students st
    where st.id = p_student_id
      and st.group_id = p_group_id
      and st.teacher_id = actor
  ) then
    raise exception 'El alumno no pertenece a este grupo docente.';
  end if;

  select * into existing
  from public.v2_student_notes n
  where n.group_id = p_group_id
    and n.student_id = p_student_id
    and n.teacher_id = actor;

  if found and existing.note is distinct from normalized_note
     and coalesce(char_length(normalized_reason), 0) < 5 then
    raise exception 'Indica brevemente el motivo de la actualización.';
  end if;

  perform set_config(
    'tedvio.student_note_reason',
    coalesce(normalized_reason, case when found then 'Actualización docente' else 'Observación inicial' end),
    true
  );

  insert into public.v2_student_notes(group_id, student_id, teacher_id, note, updated_at)
  values (p_group_id, p_student_id, actor, normalized_note, now())
  on conflict (group_id, student_id)
  do update set
    note = excluded.note,
    teacher_id = actor,
    updated_at = now()
  where public.v2_student_notes.teacher_id = actor
  returning * into result_row;

  if result_row.id is null then
    raise exception 'No se pudo guardar la observación del alumno.';
  end if;

  return result_row;
end;
$$;

revoke all on function public.v2_save_student_note_v2(uuid, uuid, text, text) from public;
revoke all on function public.v2_save_student_note_v2(uuid, uuid, text, text) from anon;
grant execute on function public.v2_save_student_note_v2(uuid, uuid, text, text) to authenticated;

revoke all on public.v2_student_notes from anon;
revoke delete, truncate on public.v2_student_notes from authenticated;
grant select, insert, update on public.v2_student_notes to authenticated;
