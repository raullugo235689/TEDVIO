-- Calendar evolution: existing weekly slots retain their dates and ownership.
alter table public.v2_group_schedule_slots
  add column starts_on date,
  add column ends_on date,
  add column recurrence text not null default 'weekly' check (recurrence in ('weekly','once')),
  add column revision bigint not null default 1,
  add constraint v2_schedule_date_order check (ends_on is null or starts_on is null or ends_on >= starts_on),
  add constraint v2_schedule_once_date check (recurrence <> 'once' or (starts_on is not null and ends_on = starts_on));
-- Successive versions can share a weekday/time while covering different dates.
alter table public.v2_group_schedule_slots drop constraint v2_group_schedule_slots_unique;

create function public.v2_schedule_touch() returns trigger language plpgsql security invoker set search_path = '' as $$
begin new.updated_at := clock_timestamp(); new.revision := old.revision + 1; return new; end;
$$;
revoke all on function public.v2_schedule_touch() from public, anon, authenticated;
create trigger v2_schedule_revision before update on public.v2_group_schedule_slots for each row execute function public.v2_schedule_touch();

create table public.v2_schedule_exceptions (
  slot_id uuid not null references public.v2_group_schedule_slots(id) on delete cascade,
  teacher_id uuid not null references auth.users(id) on delete cascade,
  original_date date not null,
  status text not null check (status in ('moved','cancelled')),
  class_date date,
  start_time time without time zone,
  end_time time without time zone,
  room text check(length(room) <= 120),
  modality text check(length(modality) <= 80),
  note text check(length(note) <= 300),
  primary key (slot_id, original_date),
  constraint v2_schedule_exception_times check(status = 'cancelled' or (class_date is not null and start_time is not null and end_time is not null and end_time > start_time))
);
create index v2_schedule_exceptions_teacher_date on public.v2_schedule_exceptions(teacher_id, original_date);
alter table public.v2_schedule_exceptions enable row level security;
revoke all on public.v2_schedule_exceptions from anon, authenticated;
grant select, insert, update, delete on public.v2_schedule_exceptions to authenticated;
create policy schedule_exceptions_owner on public.v2_schedule_exceptions to authenticated
  using(teacher_id = (select auth.uid()) and exists(select 1 from public.v2_group_schedule_slots s where s.id = slot_id and s.teacher_id = (select auth.uid())))
  with check(teacher_id = (select auth.uid()) and exists(select 1 from public.v2_group_schedule_slots s where s.id = slot_id and s.teacher_id = (select auth.uid())));

-- Retry receipts are private; a lost response cannot duplicate a weekly series.
create schema if not exists tedvio_private;
grant usage on schema tedvio_private to authenticated;
create table tedvio_private.schedule_write_receipts (
  teacher_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(teacher_id, request_id)
);
alter table tedvio_private.schedule_write_receipts enable row level security;
revoke all on tedvio_private.schedule_write_receipts from public, anon, authenticated;
grant select, insert on tedvio_private.schedule_write_receipts to authenticated;
create policy schedule_receipts_owner on tedvio_private.schedule_write_receipts to authenticated
  using(teacher_id = (select auth.uid())) with check(teacher_id = (select auth.uid()));

create function public.v2_schedule_occurrences(p_from date, p_to date)
returns table(slot_id uuid, group_id uuid, original_date date, class_date date, start_time time, end_time time)
language sql stable security invoker set search_path = '' as $$
  with days as (select p_from + n as d from generate_series(0, least(p_to - p_from, 732)) n),
  own as (select * from public.v2_group_schedule_slots where teacher_id = (select auth.uid()) and active)
  select s.id, s.group_id, d.d, d.d, s.start_time, s.end_time
  from own s cross join days d
  where extract(dow from d.d)::int = s.weekday and (s.starts_on is null or d.d >= s.starts_on) and (s.ends_on is null or d.d <= s.ends_on)
    and (s.recurrence = 'weekly' or d.d = s.starts_on)
    and not exists(select 1 from public.v2_schedule_exceptions e where e.slot_id = s.id and e.original_date = d.d)
  union all
  select s.id, s.group_id, e.original_date, e.class_date, e.start_time, e.end_time
  from own s join public.v2_schedule_exceptions e on e.slot_id = s.id
  where e.status = 'moved' and e.class_date between p_from and p_to
    and (s.starts_on is null or e.original_date >= s.starts_on) and (s.ends_on is null or e.original_date <= s.ends_on);
$$;
revoke all on function public.v2_schedule_occurrences(date,date) from public, anon, authenticated;
grant execute on function public.v2_schedule_occurrences(date,date) to authenticated;

create function public.v2_save_schedule(p_request_id uuid, p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  actor uuid := auth.uid();
  command text := p_payload->>'action';
  scope_value text := p_payload->>'scope';
  source_id uuid := nullif(p_payload->>'slot_id','')::uuid;
  target_id uuid;
  group_value uuid;
  original_day date := nullif(p_payload->>'original_date','')::date;
  class_day date;
  final_day date;
  starts time;
  ends time;
  repeat_value text;
  source public.v2_group_schedule_slots%rowtype;
  receipt tedvio_private.schedule_write_receipts%rowtype;
  result_value jsonb;
  conflicts jsonb;
  range_start date;
  range_end date;
begin
  if actor is null then raise exception 'Inicia sesión para editar tu agenda.' using errcode = '42501'; end if;
  if p_request_id is null or command is null or command not in ('save','suspend','restore') or scope_value is null or scope_value not in ('one','future') then
    raise exception 'La operación de agenda no es válida.';
  end if;
  -- Serialize this teacher's edits, including overlap checks and retry receipts.
  perform pg_advisory_xact_lock(hashtextextended('tedvio.agenda:' || actor::text, 0));
  select * into receipt from tedvio_private.schedule_write_receipts where teacher_id = actor and request_id = p_request_id;
  if found then
    if receipt.payload <> p_payload then raise exception 'La solicitud cambió. Reabre el editor.'; end if;
    return receipt.result;
  end if;
  if source_id is not null then
    select * into source from public.v2_group_schedule_slots where id = source_id and teacher_id = actor for update;
    if not found then raise exception 'El horario ya no está disponible.' using errcode = '42501'; end if;
    if not source.active or nullif(p_payload->>'revision','')::bigint is distinct from source.revision then
      raise exception 'El horario cambió en otro dispositivo. Actualiza la agenda y vuelve a abrir la clase.' using errcode = '40001';
    end if;
    if original_day is null or extract(dow from original_day)::int <> source.weekday or (source.starts_on is not null and original_day < source.starts_on) or (source.ends_on is not null and original_day > source.ends_on) or (source.recurrence = 'once' and original_day <> source.starts_on) then
      raise exception 'La fecha no pertenece a este horario.';
    end if;
    group_value := source.group_id;
  else
    if command <> 'save' then raise exception 'Selecciona una clase para modificarla.'; end if;
    group_value := nullif(p_payload->>'group_id','')::uuid;
  end if;
  if not exists(select 1 from public.v2_groups g where g.id = group_value and g.teacher_id = actor) then
    raise exception 'Selecciona uno de tus grupos.' using errcode = '42501';
  end if;
  if length(coalesce(p_payload->>'room','')) > 120 or length(coalesce(p_payload->>'modality','')) > 80 or length(coalesce(p_payload->>'note','')) > 300 then raise exception 'Reduce el texto del aula o de la nota.'; end if;

  if command = 'save' then
    class_day := nullif(p_payload->>'class_date','')::date;
    starts := nullif(p_payload->>'start_time','')::time;
    ends := nullif(p_payload->>'end_time','')::time;
    repeat_value := p_payload->>'recurrence';
    if class_day is null or starts is null or ends is null or starts >= ends or repeat_value is null or repeat_value not in ('weekly','once') then raise exception 'Revisa la fecha y las horas de la clase.'; end if;
    if source_id is not null and scope_value = 'future' and class_day < original_day then raise exception 'La nueva serie debe comenzar en la fecha seleccionada o después.'; end if;
    if source_id is not null and abs(class_day-original_day) > 730 then raise exception 'Reprograma dentro de un plazo de dos años.'; end if;
    final_day := case when repeat_value = 'once' or (source_id is not null and scope_value = 'one') then class_day else nullif(p_payload->>'end_date','')::date end;
    if final_day is null or final_day < class_day or final_day-class_day > 730 then raise exception 'Selecciona una fecha final válida, dentro de dos años.'; end if;
  end if;

  target_id := source_id;
  if source_id is null then
    target_id := p_request_id;
    insert into public.v2_group_schedule_slots(id,teacher_id,group_id,weekday,start_time,end_time,room,modality,starts_on,ends_on,recurrence)
    values(target_id,actor,group_value,extract(dow from class_day)::int,starts,ends,nullif(trim(p_payload->>'room'),''),nullif(trim(p_payload->>'modality'),''),class_day,final_day,repeat_value);
  elsif command = 'restore' then
    if scope_value <> 'one' then raise exception 'Restaura una clase a la vez.'; end if;
    delete from public.v2_schedule_exceptions where slot_id = source_id and original_date = original_day;
    update public.v2_group_schedule_slots set updated_at = clock_timestamp() where id = source_id;
    class_day := original_day; final_day := original_day;
  elsif scope_value = 'one' then
    insert into public.v2_schedule_exceptions(slot_id,teacher_id,original_date,status,class_date,start_time,end_time,room,modality,note)
    values(source_id,actor,original_day,case when command='suspend' then 'cancelled' else 'moved' end,class_day,starts,ends,nullif(trim(p_payload->>'room'),''),nullif(trim(p_payload->>'modality'),''),nullif(trim(p_payload->>'note'),''))
    on conflict(slot_id,original_date) do update set status=excluded.status,class_date=excluded.class_date,start_time=excluded.start_time,end_time=excluded.end_time,room=excluded.room,modality=excluded.modality,note=excluded.note;
    update public.v2_group_schedule_slots set updated_at = clock_timestamp() where id = source_id;
  else
    -- Split at the selected ORIGINAL date. Earlier classes and exceptions survive.
    update public.v2_group_schedule_slots set ends_on = case when starts_on = original_day then ends_on else original_day-1 end,
      active = case when starts_on = original_day then false else active end where id = source_id;
    delete from public.v2_schedule_exceptions where slot_id = source_id and original_date >= original_day;
    if command = 'save' then
      target_id := p_request_id;
      insert into public.v2_group_schedule_slots(id,teacher_id,group_id,weekday,start_time,end_time,room,modality,starts_on,ends_on,recurrence)
      values(target_id,actor,group_value,extract(dow from class_day)::int,starts,ends,nullif(trim(p_payload->>'room'),''),nullif(trim(p_payload->>'modality'),''),class_day,final_day,repeat_value);
    end if;
  end if;

  if command <> 'suspend' and coalesce((p_payload->>'allow_conflicts')::boolean,false) = false then
    range_start := class_day; range_end := final_day;
    with occurrences as materialized (select * from public.v2_schedule_occurrences(range_start,range_end)),
    overlap_rows as (
      select distinct b.slot_id,b.class_date,b.start_time,b.end_time,b.group_id
      from occurrences a join occurrences b on a.class_date=b.class_date and a.start_time < b.end_time and a.end_time > b.start_time
      where a.slot_id=target_id and (source_id is null or scope_value='future' or a.original_date=original_day)
        and (a.slot_id,a.original_date) <> (b.slot_id,b.original_date)
      order by b.class_date,b.start_time limit 5
    ) select jsonb_agg(to_jsonb(overlap_rows)) into conflicts from overlap_rows;
    if conflicts is not null then raise exception 'Hay clases que se empalman. Revisa los horarios antes de guardar.' using errcode='P0001', detail=conflicts::text; end if;
  end if;
  result_value := jsonb_build_object('saved',true,'slot_id',target_id,'action',command);
  insert into tedvio_private.schedule_write_receipts(teacher_id,request_id,payload,result) values(actor,p_request_id,p_payload,result_value);
  return result_value;
end;
$$;
revoke all on function public.v2_save_schedule(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.v2_save_schedule(uuid,jsonb) to authenticated;
