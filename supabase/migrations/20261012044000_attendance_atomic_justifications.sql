-- Atomic attendance writes and explicit, audited bulk justifications.
-- No existing attendance status or grading rule is changed by this migration.
alter table public.v2_attendance_sessions add column if not exists revision bigint not null default 0;
alter table public.v2_attendance_records add column if not exists revision bigint not null default 0;

create table if not exists tedvio_private.attendance_write_receipts (
  teacher_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (teacher_id,request_id)
);
alter table tedvio_private.attendance_write_receipts enable row level security;
revoke all on tedvio_private.attendance_write_receipts from public,anon,authenticated;

create table if not exists public.v2_attendance_change_log (
  id bigint generated always as identity primary key,
  teacher_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  record_id uuid,
  session_id uuid not null,
  student_id uuid,
  action text not null check(action in ('save','open','paused','closed','justify','revoke')),
  reason text,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);
alter table public.v2_attendance_change_log enable row level security;
create policy attendance_changes_read_own on public.v2_attendance_change_log for select to authenticated using(teacher_id=(select auth.uid()));
revoke all on public.v2_attendance_change_log from public,anon,authenticated;
grant select on public.v2_attendance_change_log to authenticated;
create index if not exists attendance_changes_owner_request_idx on public.v2_attendance_change_log(teacher_id,request_id,created_at);

create or replace function tedvio_private.attendance_session_revision() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  new.revision:=old.revision+1;
  new.updated_at:=clock_timestamp();
  return new;
end $$;
revoke all on function tedvio_private.attendance_session_revision() from public,anon,authenticated;
create trigger attendance_session_revision before update on public.v2_attendance_sessions for each row execute function tedvio_private.attendance_session_revision();

create or replace function tedvio_private.attendance_record_revision() returns trigger
language plpgsql security definer set search_path='' as $$
declare sid uuid;
begin
  if tg_op='UPDATE' and (new.attendance_session_id is distinct from old.attendance_session_id or new.student_id is distinct from old.student_id or new.teacher_id is distinct from old.teacher_id) then
    raise exception 'No se puede trasladar un registro de asistencia.' using errcode='P0001';
  end if;
  sid:=case when tg_op='DELETE' then old.attendance_session_id else new.attendance_session_id end;
  -- Serializes old and new clients on the parent. A conflicting transaction may
  -- be retried, but cannot silently overwrite a new client's reviewed revision.
  update public.v2_attendance_sessions set updated_at=clock_timestamp() where id=sid;
  if tg_op='DELETE' then return old; end if;
  new.revision:=case when tg_op='INSERT' then 0 else old.revision+1 end;
  new.updated_at:=clock_timestamp();
  return new;
end $$;
revoke all on function tedvio_private.attendance_record_revision() from public,anon,authenticated;
create trigger attendance_record_revision before insert or update or delete on public.v2_attendance_records for each row execute function tedvio_private.attendance_record_revision();

create or replace function public.v2_commit_attendance(p_request_id uuid,p_session_id uuid,p_expected_revision bigint,p_action text,p_records jsonb,p_options jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid(); s public.v2_attendance_sessions%rowtype;
  entry jsonb; old_record public.v2_attendance_records%rowtype; new_record public.v2_attendance_records%rowtype;
  sid uuid; note_value text; status_value text; previous jsonb;
  payload_value jsonb; receipt tedvio_private.attendance_write_receipts%rowtype; result_value jsonb;
  n integer; late_minutes integer;
begin
  if actor is null then raise exception 'Inicia sesión para guardar asistencia.' using errcode='42501'; end if;
  if p_request_id is null or p_session_id is null or p_expected_revision is null or p_action is null or p_action not in ('save','open','paused','closed') then raise exception 'Solicitud de asistencia inválida.'; end if;
  payload_value:=jsonb_build_object('kind','commit','session',p_session_id,'revision',p_expected_revision,'action',p_action,'records',p_records,'options',p_options);
  perform pg_advisory_xact_lock(hashtextextended(actor::text||p_request_id::text,0));
  select * into receipt from tedvio_private.attendance_write_receipts where teacher_id=actor and request_id=p_request_id;
  if found then
    if receipt.payload is distinct from payload_value then raise exception 'La solicitud cambió; revisa los datos antes de reintentar.'; end if;
    return receipt.result;
  end if;
  select * into s from public.v2_attendance_sessions where id=p_session_id and teacher_id=actor for update;
  if not found then raise exception 'La lista no está disponible para tu cuenta.' using errcode='42501'; end if;
  perform 1 from public.v2_academic_periods p where p.teacher_id=actor and p.group_id=s.group_id and s.attendance_date between p.starts_on and p.ends_on for share;
  perform public.v2_assert_group_date_open(actor,s.group_id,s.attendance_date);
  if s.revision<>p_expected_revision then raise exception 'La lista guardada cambió. Revisa los cambios de otro dispositivo.' using errcode='PT409'; end if;
  if s.entry_mode='qr' and s.checkin_event_id is not null and s.status<>'closed' then raise exception 'Finaliza primero el registro de Asistencia conjunta.'; end if;
  previous:=to_jsonb(s);
  if p_action='open' and s.status='closed' then
    update public.v2_attendance_sessions set status='open',opened_at=now(),paused_at=null,closed_at=null,checkin_event_id=null where id=s.id;
  else
    if s.status='closed' then raise exception 'Reabre la lista antes de guardar cambios.'; end if;
    if jsonb_typeof(p_records) is distinct from 'array' or jsonb_array_length(p_records)>1000 or jsonb_typeof(p_options) is distinct from 'object' then raise exception 'Captura de asistencia inválida.'; end if;
    if (select count(distinct x->>'studentId') from jsonb_array_elements(p_records) x)<>jsonb_array_length(p_records) then raise exception 'Hay alumnos repetidos o sin identificar.'; end if;
    late_minutes:=(p_options->>'lateAfterMinutes')::integer;
    if late_minutes is null or late_minutes not between 0 and 120 or jsonb_typeof(p_options->'autoMarkAbsent') is distinct from 'boolean' or length(coalesce(p_options->>'notes',''))>4000 then raise exception 'Opciones de lista inválidas.'; end if;
    for entry in select value from jsonb_array_elements(p_records) order by value->>'studentId' loop
      sid:=(entry->>'studentId')::uuid; status_value:=entry->>'status'; note_value:=nullif(btrim(coalesce(entry->>'note','')),'');
      if sid is null or status_value is null or status_value not in ('present','late','absent','justified') or length(coalesce(note_value,''))>4000 then raise exception 'Estado u observación inválidos.'; end if;
      perform 1 from public.v2_group_students st where st.id=sid and st.group_id=s.group_id and st.teacher_id=actor and st.active for share;
      if not found then raise exception 'Un alumno ya no está activo en este grupo.' using errcode='PT409'; end if;
      select * into old_record from public.v2_attendance_records where attendance_session_id=s.id and student_id=sid for update;
      if found and old_record.status=status_value and coalesce(old_record.observation,old_record.note,'')=coalesce(note_value,'') then continue; end if;
      insert into public.v2_attendance_records(attendance_session_id,student_id,teacher_id,status,note,observation)
        values(s.id,sid,actor,status_value,note_value,note_value)
        on conflict(attendance_session_id,student_id) do update set status=excluded.status,note=excluded.note,observation=excluded.observation
        returning * into new_record;
      insert into public.v2_attendance_change_log(teacher_id,request_id,record_id,session_id,student_id,action,before_state,after_state)
        values(actor,p_request_id,new_record.id,s.id,sid,'save',case when old_record.id is null then null else to_jsonb(old_record) end,to_jsonb(new_record));
    end loop;
    update public.v2_attendance_sessions set late_after_minutes=late_minutes,auto_mark_absent=(p_options->>'autoMarkAbsent')::boolean,
      notes=nullif(btrim(coalesce(p_options->>'notes','')),''),
      status=case when p_action='save' then status else p_action end,
      paused_at=case when p_action='paused' then now() when p_action in ('closed','open') then null else paused_at end,
      closed_at=case when p_action='closed' then now() else closed_at end where id=s.id;
  end if;
  select * into s from public.v2_attendance_sessions where id=p_session_id;
  insert into public.v2_attendance_change_log(teacher_id,request_id,session_id,action,before_state,after_state) values(actor,p_request_id,s.id,p_action,previous,to_jsonb(s));
  result_value:=jsonb_build_object('request_id',p_request_id,'session_id',s.id,'revision',s.revision,'status',s.status);
  insert into tedvio_private.attendance_write_receipts values(actor,p_request_id,payload_value,result_value,now());
  return result_value;
end $$;
revoke all on function public.v2_commit_attendance(uuid,uuid,bigint,text,jsonb,jsonb) from public,anon;
grant execute on function public.v2_commit_attendance(uuid,uuid,bigint,text,jsonb,jsonb) to authenticated;

create or replace function public.v2_preview_attendance_justifications(p_group_ids uuid[],p_from date,p_to date,p_search text default '',p_status text default 'absent')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); result_value jsonb;
begin
  if actor is null then raise exception 'Inicia sesión para consultar faltas.' using errcode='42501'; end if;
  if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 or p_status is null or p_status not in ('absent','justified') or length(coalesce(p_search,''))>120 then raise exception 'Revisa las fechas y los filtros.'; end if;
  if cardinality(p_group_ids)>200 or exists(select 1 from unnest(p_group_ids) as requested(group_id) where not exists(select 1 from public.v2_groups g where g.id=requested.group_id and g.teacher_id=actor)) then raise exception 'Selecciona únicamente tus grupos.' using errcode='42501'; end if;
  with candidates as (
    select r.id,r.revision,r.student_id,r.attendance_session_id as session_id,r.status,
      coalesce(r.observation,r.note,'') as note,st.full_name,st.enrollment,s.attendance_date,s.status as session_status,g.id as group_id,g.name as group_name,g.subject,
      exists(select 1 from public.v2_academic_periods p where p.teacher_id=actor and p.group_id=s.group_id and p.status='closed' and s.attendance_date between p.starts_on and p.ends_on) as period_closed,
      (s.entry_mode='qr' and s.checkin_event_id is not null and s.status<>'closed') as qr_active
    from public.v2_attendance_records r
    join public.v2_attendance_sessions s on s.id=r.attendance_session_id and s.teacher_id=actor
    join public.v2_group_students st on st.id=r.student_id and st.group_id=s.group_id and st.teacher_id=actor
    join public.v2_groups g on g.id=s.group_id and g.teacher_id=actor
    where r.teacher_id=actor and r.status=p_status and s.attendance_date between p_from and p_to
      and (coalesce(cardinality(p_group_ids),0)=0 or g.id=any(p_group_ids))
      and (btrim(coalesce(p_search,''))='' or strpos(lower(st.full_name||' '||st.enrollment),lower(btrim(p_search)))>0)
    order by s.attendance_date desc,r.id limit 501
  )
  select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from candidates limit 500) x),'[]'::jsonb),'truncated',(select count(*)>500 from candidates)) into result_value;
  return result_value;
end $$;
revoke all on function public.v2_preview_attendance_justifications(uuid[],date,date,text,text) from public,anon;
grant execute on function public.v2_preview_attendance_justifications(uuid[],date,date,text,text) to authenticated;

create or replace function public.v2_change_attendance_justifications(p_request_id uuid,p_action text,p_records jsonb,p_reason text,p_allow_closed boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid(); payload_value jsonb; receipt tedvio_private.attendance_write_receipts%rowtype;
  s public.v2_attendance_sessions%rowtype; r public.v2_attendance_records%rowtype; changed public.v2_attendance_records%rowtype;
  entry jsonb; wanted text; target text; reason_value text:=btrim(p_reason); n integer; result_value jsonb;
begin
  if actor is null then raise exception 'Inicia sesión para justificar faltas.' using errcode='42501'; end if;
  if p_request_id is null or p_action is null or p_action not in ('justify','revoke') or reason_value is null or length(reason_value) not between 3 and 1000 or jsonb_typeof(p_records) is distinct from 'array' then raise exception 'Selecciona faltas y escribe un motivo de 3 a 1000 caracteres.'; end if;
  n:=jsonb_array_length(p_records);
  if n not between 1 and 500 or (select count(distinct x->>'id') from jsonb_array_elements(p_records) x)<>n then raise exception 'Selecciona de 1 a 500 registros, sin duplicados.'; end if;
  payload_value:=jsonb_build_object('kind',p_action,'records',p_records,'reason',reason_value,'allow_closed',coalesce(p_allow_closed,false));
  perform pg_advisory_xact_lock(hashtextextended(actor::text||p_request_id::text,0));
  select * into receipt from tedvio_private.attendance_write_receipts where teacher_id=actor and request_id=p_request_id;
  if found then
    if receipt.payload is distinct from payload_value then raise exception 'La solicitud cambió; vuelve a revisar el lote.'; end if;
    return receipt.result;
  end if;
  wanted:=case when p_action='justify' then 'absent' else 'justified' end;
  target:=case when p_action='justify' then 'justified' else 'absent' end;
  -- Lock parents in deterministic order BEFORE records, preventing partial lots
  -- and coordinating with every writer using the revision trigger.
  for s in select ses.* from public.v2_attendance_sessions ses where ses.teacher_id=actor and ses.id in (
    select ar.attendance_session_id from public.v2_attendance_records ar join jsonb_array_elements(p_records) x on ar.id=(x->>'id')::uuid where ar.teacher_id=actor
  ) order by ses.id for update loop
    perform 1 from public.v2_academic_periods p where p.teacher_id=actor and p.group_id=s.group_id and s.attendance_date between p.starts_on and p.ends_on for share;
    perform public.v2_assert_group_date_open(actor,s.group_id,s.attendance_date);
    if s.status='closed' and not coalesce(p_allow_closed,false) then raise exception 'Confirma explícitamente la corrección de listas cerradas.'; end if;
    if s.entry_mode='qr' and s.checkin_event_id is not null and s.status<>'closed' then raise exception 'Finaliza primero la asistencia conjunta.'; end if;
  end loop;
  for entry in select value from jsonb_array_elements(p_records) order by value->>'id' loop
    select * into r from public.v2_attendance_records where id=(entry->>'id')::uuid and teacher_id=actor for update;
    if not found then raise exception 'Un registro no está disponible para tu cuenta.' using errcode='42501'; end if;
    if entry->>'revision' is null or r.revision<>(entry->>'revision')::bigint or r.status<>wanted then raise exception 'Una falta cambió desde la revisión. Actualiza y confirma de nuevo.' using errcode='PT409'; end if;
    perform 1 from public.v2_attendance_sessions ses join public.v2_group_students st on st.group_id=ses.group_id and st.id=r.student_id and st.teacher_id=actor where ses.id=r.attendance_session_id and ses.teacher_id=actor;
    if not found then raise exception 'El alumno y la lista no corresponden al mismo grupo.'; end if;
    -- Notes/observations remain untouched; reasons live in an append-only log.
    update public.v2_attendance_records set status=target where id=r.id returning * into changed;
    insert into public.v2_attendance_change_log(teacher_id,request_id,record_id,session_id,student_id,action,reason,before_state,after_state)
      values(actor,p_request_id,r.id,r.attendance_session_id,r.student_id,p_action,reason_value,to_jsonb(r),to_jsonb(changed));
  end loop;
  result_value:=jsonb_build_object('request_id',p_request_id,'changed',n,'action',p_action);
  insert into tedvio_private.attendance_write_receipts values(actor,p_request_id,payload_value,result_value,now());
  return result_value;
end $$;
revoke all on function public.v2_change_attendance_justifications(uuid,text,jsonb,text,boolean) from public,anon;
grant execute on function public.v2_change_attendance_justifications(uuid,text,jsonb,text,boolean) to authenticated;
