-- A shared entry point keeps attendance in each original group/date.
create table public.v2_attendance_events (
  id uuid primary key,
  teacher_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(title) between 1 and 120),
  attendance_date date not null,
  status text not null default 'open' check (status in ('open','closed')),
  token text not null unique default replace(gen_random_uuid()::text,'-',''),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  closed_at timestamptz,
  late_after_minutes integer not null check (late_after_minutes between 0 and 120),
  auto_mark_absent boolean not null default true,
  request_payload jsonb not null,
  check (expires_at > created_at)
);
create index attendance_events_teacher_created on public.v2_attendance_events(teacher_id,created_at desc);
alter table public.v2_attendance_events enable row level security;
create policy attendance_events_owner on public.v2_attendance_events for select to authenticated using (teacher_id=(select auth.uid()));
revoke all on public.v2_attendance_events from public,anon,authenticated;
grant select on public.v2_attendance_events to authenticated;

alter table public.v2_attendance_sessions
  add column entry_mode text not null default 'manual' check (entry_mode in ('manual','qr')),
  add column checkin_event_id uuid references public.v2_attendance_events(id) on delete set null;
create index attendance_sessions_checkin_event on public.v2_attendance_sessions(checkin_event_id) where checkin_event_id is not null;

create table public.v2_attendance_event_groups (
  event_id uuid not null references public.v2_attendance_events(id) on delete cascade,
  group_id uuid not null references public.v2_groups(id) on delete cascade,
  attendance_session_id uuid not null references public.v2_attendance_sessions(id) on delete cascade,
  teacher_id uuid not null references auth.users(id) on delete cascade,
  primary key(event_id,group_id),
  unique(event_id,attendance_session_id)
);
create index attendance_event_groups_teacher on public.v2_attendance_event_groups(teacher_id);
create index attendance_event_groups_group on public.v2_attendance_event_groups(group_id);
create index attendance_event_groups_session on public.v2_attendance_event_groups(attendance_session_id);
alter table public.v2_attendance_event_groups enable row level security;
create policy attendance_event_groups_owner on public.v2_attendance_event_groups for select to authenticated using(teacher_id=(select auth.uid()));
revoke all on public.v2_attendance_event_groups from public,anon,authenticated;
grant select on public.v2_attendance_event_groups to authenticated;

create table public.v2_attendance_event_checkins (
  event_id uuid not null references public.v2_attendance_events(id) on delete cascade,
  student_id uuid not null references public.v2_group_students(id) on delete cascade,
  group_id uuid not null references public.v2_groups(id) on delete cascade,
  teacher_id uuid not null references auth.users(id) on delete cascade,
  registered_at timestamptz not null default now(),
  primary key(event_id,student_id)
);
create index attendance_event_checkins_teacher on public.v2_attendance_event_checkins(teacher_id);
create index attendance_event_checkins_student on public.v2_attendance_event_checkins(student_id);
create index attendance_event_checkins_group on public.v2_attendance_event_checkins(group_id);
alter table public.v2_attendance_event_checkins enable row level security;
create policy attendance_event_checkins_owner on public.v2_attendance_event_checkins for select to authenticated using(teacher_id=(select auth.uid()));
revoke all on public.v2_attendance_event_checkins from public,anon,authenticated;
grant select on public.v2_attendance_event_checkins to authenticated;

-- Mutation privileges remain private. Teacher calls always validate auth.uid();
-- anonymous calls use a high-entropy, expiring bearer token and never expose rosters.
create or replace function tedvio_private.create_attendance_event(p_request_id uuid,p_payload jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  uid uuid:=auth.uid(); e public.v2_attendance_events%rowtype;
  gids uuid[]; gid uuid; sid uuid; s public.v2_attendance_sessions%rowtype;
  d date; mins integer; late integer; title text; auto_absent boolean;
begin
  if uid is null then raise exception 'Inicia sesión como docente.'; end if;
  if p_request_id is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Solicitud inválida.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('attendance-event:'||uid::text,0));
  select * into e from public.v2_attendance_events where id=p_request_id;
  if found then
    if e.teacher_id<>uid or e.request_payload<>p_payload then raise exception 'La solicitud cambió. Vuelve a abrir el formulario.'; end if;
    return e.id;
  end if;
  select array_agg(distinct value::uuid order by value::uuid) into gids from jsonb_array_elements_text(p_payload->'group_ids');
  if coalesce(cardinality(gids),0) not between 1 and 12 or array_position(gids,null) is not null then raise exception 'Selecciona entre 1 y 12 grupos.'; end if;
  if (select count(*) from public.v2_groups where id=any(gids) and teacher_id=uid)<>cardinality(gids) then raise exception 'Selecciona únicamente tus grupos.'; end if;
  d:=(p_payload->>'attendance_date')::date; mins:=(p_payload->>'duration_minutes')::integer;
  late:=(p_payload->>'late_after_minutes')::integer; title:=btrim(p_payload->>'title'); auto_absent:=(p_payload->>'auto_mark_absent')::boolean;
  if d is null or d<current_date-1 or d>current_date+1 then raise exception 'El registro QR debe corresponder a la fecha actual de tu clase.'; end if;
  if mins is null or mins not between 5 and 180 or late is null or late not between 0 and 120 or auto_absent is null or title is null or length(title) not between 1 and 120 then raise exception 'Revisa el título y los minutos del registro.'; end if;
  if exists(select 1 from public.v2_attendance_event_groups eg join public.v2_attendance_events ev on ev.id=eg.event_id where eg.group_id=any(gids) and ev.attendance_date=d and ev.status='open') then raise exception 'Uno de los grupos ya tiene una asistencia conjunta abierta. Ciérrala antes de iniciar otra.'; end if;
  insert into public.v2_attendance_events(id,teacher_id,title,attendance_date,expires_at,late_after_minutes,auto_mark_absent,request_payload)
    values(p_request_id,uid,title,d,now()+make_interval(mins=>mins),late,auto_absent,p_payload);
  foreach gid in array gids loop
    if not exists(select 1 from public.v2_group_students where group_id=gid and teacher_id=uid and active) then raise exception 'Todos los grupos seleccionados deben tener alumnos activos.'; end if;
    insert into public.v2_attendance_sessions(group_id,teacher_id,attendance_date,status,opened_at,late_after_minutes,auto_mark_absent,entry_mode,checkin_event_id)
      values(gid,uid,d,'open',now(),late,auto_absent,'qr',p_request_id) on conflict(group_id,attendance_date) do nothing;
    select * into s from public.v2_attendance_sessions where group_id=gid and attendance_date=d for update;
    if s.teacher_id<>uid or s.status<>'open' then raise exception 'Una lista está cerrada o pausada. Reábrela desde Asistencia antes de incluirla.'; end if;
    update public.v2_attendance_sessions set entry_mode='qr',checkin_event_id=p_request_id,updated_at=now() where id=s.id;
    insert into public.v2_attendance_event_groups(event_id,group_id,attendance_session_id,teacher_id) values(p_request_id,gid,s.id,uid);
  end loop;
  return p_request_id;
end $$;
revoke all on function tedvio_private.create_attendance_event(uuid,jsonb) from public,anon;
grant execute on function tedvio_private.create_attendance_event(uuid,jsonb) to authenticated;
create function public.v2_create_attendance_event(p_request_id uuid,p_payload jsonb) returns uuid language sql security invoker set search_path='' as $$select tedvio_private.create_attendance_event(p_request_id,p_payload)$$;
revoke all on function public.v2_create_attendance_event(uuid,jsonb) from public,anon;
grant execute on function public.v2_create_attendance_event(uuid,jsonb) to authenticated;

create or replace function tedvio_private.close_attendance_event(p_event_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); e public.v2_attendance_events%rowtype; s public.v2_attendance_sessions%rowtype;
begin
  if uid is null then raise exception 'Inicia sesión como docente.'; end if;
  select * into e from public.v2_attendance_events where id=p_event_id and teacher_id=uid for update;
  if not found then raise exception 'La asistencia no está disponible.'; end if;
  if e.status='closed' then return e.id; end if;
  for s in select a.* from public.v2_attendance_sessions a join public.v2_attendance_event_groups eg on eg.attendance_session_id=a.id where eg.event_id=e.id and a.teacher_id=uid order by a.id for update of a loop
    if e.auto_mark_absent then
      insert into public.v2_attendance_records(attendance_session_id,student_id,teacher_id,status,observation)
        select s.id,st.id,uid,'absent','Sin registro al cerrar asistencia conjunta' from public.v2_group_students st where st.group_id=s.group_id and st.teacher_id=uid and st.active
        on conflict(attendance_session_id,student_id) do nothing;
    end if;
    update public.v2_attendance_sessions set status='closed',closed_at=now(),paused_at=null,updated_at=now() where id=s.id;
    update public.v2_attendance_qr_tokens set active=false where attendance_session_id=s.id;
  end loop;
  update public.v2_attendance_events set status='closed',closed_at=now() where id=e.id;
  return e.id;
end $$;
revoke all on function tedvio_private.close_attendance_event(uuid) from public,anon;
grant execute on function tedvio_private.close_attendance_event(uuid) to authenticated;
create function public.v2_close_attendance_event(p_event_id uuid) returns uuid language sql security invoker set search_path='' as $$select tedvio_private.close_attendance_event(p_event_id)$$;
revoke all on function public.v2_close_attendance_event(uuid) from public,anon;
grant execute on function public.v2_close_attendance_event(uuid) to authenticated;

create or replace function tedvio_private.attendance_event_meta(p_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.v2_attendance_events%rowtype; groups jsonb;
begin
  if length(coalesce(p_token,''))<>32 then return jsonb_build_object('ok',false,'message','El enlace de asistencia no es válido.'); end if;
  select * into e from public.v2_attendance_events where token=p_token;
  if not found then return jsonb_build_object('ok',false,'message','El enlace de asistencia no es válido.'); end if;
  if e.status='closed' or e.expires_at<=clock_timestamp() then return jsonb_build_object('ok',false,'message',case when e.status='closed' then 'El docente ya cerró la asistencia.' else 'Terminó el tiempo de registro. Comunícate con tu docente.' end); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'name',coalesce(g.group_name,g.name),'subject',g.subject,'university',g.university) order by g.name),'[]'::jsonb) into groups
    from public.v2_attendance_event_groups eg join public.v2_groups g on g.id=eg.group_id join public.v2_attendance_sessions s on s.id=eg.attendance_session_id
    where eg.event_id=e.id and g.teacher_id=e.teacher_id and s.teacher_id=e.teacher_id and s.status='open';
  return jsonb_build_object('ok',true,'title',e.title,'attendance_date',e.attendance_date,'expires_at',e.expires_at,'server_now',clock_timestamp(),'groups',groups);
end $$;
revoke all on function tedvio_private.attendance_event_meta(text) from public;
grant execute on function tedvio_private.attendance_event_meta(text) to anon,authenticated;
create function public.v2_attendance_event_meta(p_token text) returns jsonb language plpgsql security invoker set search_path='' as $$begin
  perform tedvio_private.rate_limit_v67('joint_attendance_meta','*',1200,60);
  return tedvio_private.attendance_event_meta(p_token);
end $$;
revoke all on function public.v2_attendance_event_meta(text) from public;
grant execute on function public.v2_attendance_event_meta(text) to anon,authenticated;

create or replace function tedvio_private.attendance_event_checkin(p_token text,p_group_id uuid,p_enrollment text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.v2_attendance_events%rowtype; s public.v2_attendance_sessions%rowtype; st public.v2_group_students%rowtype; r public.v2_attendance_records%rowtype; receipt public.v2_attendance_event_checkins%rowtype; matches integer; v_status text; gname text;
begin
  if length(coalesce(p_token,''))<>32 or length(btrim(coalesce(p_enrollment,''))) not between 1 and 100 then return jsonb_build_object('ok',false,'message','Revisa el enlace y escribe tu matrícula.'); end if;
  -- Shared lock permits parallel students; closing takes an exclusive lock.
  select * into e from public.v2_attendance_events where token=p_token for share;
  if not found or e.status<>'open' or e.expires_at<=clock_timestamp() then return jsonb_build_object('ok',false,'message','El registro terminó o el enlace no es válido. Comunícate con tu docente.'); end if;
  select a.* into s from public.v2_attendance_sessions a join public.v2_attendance_event_groups eg on eg.attendance_session_id=a.id
    where eg.event_id=e.id and eg.group_id=p_group_id and eg.teacher_id=e.teacher_id and a.teacher_id=e.teacher_id and a.group_id=p_group_id for share of a;
  if not found or s.status<>'open' then return jsonb_build_object('ok',false,'message','Este grupo no tiene el registro abierto. Consulta a tu docente.'); end if;
  select count(*) into matches from public.v2_group_students where group_id=p_group_id and teacher_id=e.teacher_id and active and lower(btrim(enrollment))=lower(btrim(p_enrollment));
  if matches<>1 then return jsonb_build_object('ok',false,'message',case when matches>1 then 'Hay matrículas duplicadas en este grupo. Solicita el registro a tu docente.' else 'La matrícula no está registrada en el grupo seleccionado. Revisa ambos datos.' end); end if;
  select * into st from public.v2_group_students where group_id=p_group_id and teacher_id=e.teacher_id and active and lower(btrim(enrollment))=lower(btrim(p_enrollment)) for share;
  perform pg_advisory_xact_lock(hashtextextended('attendance-checkin:'||s.id::text||':'||st.id::text,0));
  v_status:=case when clock_timestamp()>e.created_at+make_interval(mins=>e.late_after_minutes) then 'late' else 'present' end;
  insert into public.v2_attendance_records(attendance_session_id,student_id,teacher_id,status,observation,updated_at)
    values(s.id,st.id,e.teacher_id,v_status,'Registro por asistencia conjunta',now())
    on conflict(attendance_session_id,student_id) do update set
      status=case when v2_attendance_records.status in ('present','late','justified') then v2_attendance_records.status else excluded.status end,
      observation=case when v2_attendance_records.status in ('present','late','justified') then v2_attendance_records.observation else excluded.observation end,
      updated_at=case when v2_attendance_records.status in ('present','late','justified') then v2_attendance_records.updated_at else excluded.updated_at end
    returning * into r;
  insert into public.v2_attendance_event_checkins(event_id,student_id,group_id,teacher_id) values(e.id,st.id,p_group_id,e.teacher_id) on conflict(event_id,student_id) do nothing;
  select * into receipt from public.v2_attendance_event_checkins where event_id=e.id and student_id=st.id;
  select coalesce(group_name,name) into gname from public.v2_groups where id=p_group_id and teacher_id=e.teacher_id;
  return jsonb_build_object('ok',true,'student_name',st.full_name,'group_name',gname,'attendance_date',e.attendance_date,'status',r.status,'registered_at',receipt.registered_at,'message',case when r.status='late' then 'Retardo registrado' when r.status='justified' then 'Tu registro justificado se conserva' else 'Asistencia registrada' end);
end $$;
revoke all on function tedvio_private.attendance_event_checkin(text,uuid,text) from public;
grant execute on function tedvio_private.attendance_event_checkin(text,uuid,text) to anon,authenticated;
create function public.v2_attendance_event_checkin(p_token text,p_group_id uuid,p_enrollment text) returns jsonb language plpgsql security invoker set search_path='' as $$begin
  perform tedvio_private.rate_limit_v67('joint_attendance_ip','*',900,60);
  perform tedvio_private.rate_limit_v67('joint_attendance_identity',left(coalesce(p_token,''),64)||'|'||coalesce(p_group_id::text,'')||'|'||lower(btrim(left(coalesce(p_enrollment,''),100))),8,60);
  return tedvio_private.attendance_event_checkin(p_token,p_group_id,p_enrollment);
end $$;
revoke all on function public.v2_attendance_event_checkin(text,uuid,text) from public;
grant execute on function public.v2_attendance_event_checkin(text,uuid,text) to anon,authenticated;

-- Owner-only aggregate avoids transferring whole rosters to the live control panel.
create function public.v2_attendance_event_summary(p_event_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('event',to_jsonb(e)-'request_payload','groups',coalesce((
    select jsonb_agg(jsonb_build_object('group_id',g.id,'name',coalesce(g.group_name,g.name),'subject',g.subject,'university',g.university,'session_id',s.id,'session_status',s.status,
      'total',(select count(*) from public.v2_group_students st where st.group_id=g.id and st.active),
      'registered',(select count(*) from public.v2_attendance_event_checkins c join public.v2_group_students st on st.id=c.student_id and st.active where c.event_id=e.id and c.group_id=g.id),
      'present',(select count(*) from public.v2_attendance_records r join public.v2_group_students st on st.id=r.student_id and st.active where r.attendance_session_id=s.id and r.status='present'),
      'late',(select count(*) from public.v2_attendance_records r join public.v2_group_students st on st.id=r.student_id and st.active where r.attendance_session_id=s.id and r.status='late'),
      'absent',(select count(*) from public.v2_attendance_records r join public.v2_group_students st on st.id=r.student_id and st.active where r.attendance_session_id=s.id and r.status='absent'),
      'justified',(select count(*) from public.v2_attendance_records r join public.v2_group_students st on st.id=r.student_id and st.active where r.attendance_session_id=s.id and r.status='justified')
    ) order by g.name) from public.v2_attendance_event_groups eg join public.v2_groups g on g.id=eg.group_id join public.v2_attendance_sessions s on s.id=eg.attendance_session_id where eg.event_id=e.id
  ),'[]'::jsonb),'recent',coalesce((select jsonb_agg(x) from (
    select st.full_name,coalesce(g.group_name,g.name) as group_name,c.registered_at from public.v2_attendance_event_checkins c join public.v2_group_students st on st.id=c.student_id join public.v2_groups g on g.id=c.group_id where c.event_id=e.id order by c.registered_at desc limit 10
  ) x),'[]'::jsonb),'server_now',now()) from public.v2_attendance_events e where e.id=p_event_id and e.teacher_id=(select auth.uid());
$$;
revoke all on function public.v2_attendance_event_summary(uuid) from public,anon;
grant execute on function public.v2_attendance_event_summary(uuid) to authenticated;

-- Realtime delivers check-in and closure changes to the authenticated owner.
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='v2_attendance_event_checkins') then
      alter publication supabase_realtime add table public.v2_attendance_event_checkins;
    end if;
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='v2_attendance_events') then
      alter publication supabase_realtime add table public.v2_attendance_events;
    end if;
  end if;
end $$;
