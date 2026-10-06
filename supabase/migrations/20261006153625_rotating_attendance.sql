-- Existing classes keep their links; new clients explicitly request rotating verification.
alter table public.v2_attendance_events add column verification_mode text not null default 'static'
  check (verification_mode in ('static','rotating'));

-- One current challenge per event. Never exposed to the Data API or Realtime.
create table tedvio_private.attendance_event_challenges (
  event_id uuid primary key references public.v2_attendance_events(id) on delete cascade,
  qr_proof text not null check (qr_proof ~ '^[a-f0-9]{32}$'),
  code text not null check (code ~ '^[0-9]{6}$'),
  expires_at timestamptz not null
);
alter table tedvio_private.attendance_event_challenges enable row level security;
revoke all on tedvio_private.attendance_event_challenges from public,anon,authenticated;

create or replace function tedvio_private.create_attendance_event(p_request_id uuid,p_payload jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  uid uuid:=auth.uid(); e public.v2_attendance_events%rowtype;
  gids uuid[]; gid uuid; sid uuid; s public.v2_attendance_sessions%rowtype;
  d date; mins integer; late integer; title text; auto_absent boolean; mode text:=coalesce(p_payload->>'verification_mode','static');
begin
  if uid is null then raise exception 'Inicia sesión como docente.'; end if;
  if p_request_id is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Solicitud inválida.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('attendance-event:'||uid::text,0));
  select * into e from public.v2_attendance_events where id=p_request_id;
  if found then
    if e.teacher_id<>uid or e.request_payload<>p_payload then raise exception 'La solicitud cambió. Vuelve a abrir el formulario.'; end if;
    return e.id;
  end if;
  if mode not in ('static','rotating') then raise exception 'Modo de registro inválido.'; end if;
  select array_agg(distinct value::uuid order by value::uuid) into gids from jsonb_array_elements_text(p_payload->'group_ids');
  if coalesce(cardinality(gids),0) not between 1 and 12 or array_position(gids,null) is not null then raise exception 'Selecciona entre 1 y 12 grupos.'; end if;
  if (select count(*) from public.v2_groups where id=any(gids) and teacher_id=uid)<>cardinality(gids) then raise exception 'Selecciona únicamente tus grupos.'; end if;
  d:=(p_payload->>'attendance_date')::date; mins:=(p_payload->>'duration_minutes')::integer;
  late:=(p_payload->>'late_after_minutes')::integer; title:=btrim(p_payload->>'title'); auto_absent:=(p_payload->>'auto_mark_absent')::boolean;
  if d is null or d<current_date-1 or d>current_date+1 then raise exception 'El registro QR debe corresponder a la fecha actual de tu clase.'; end if;
  if mins is null or mins not between 5 and 180 or late is null or late not between 0 and 120 or auto_absent is null or title is null or length(title) not between 1 and 120 then raise exception 'Revisa el título y los minutos del registro.'; end if;
  if exists(select 1 from public.v2_attendance_event_groups eg join public.v2_attendance_events ev on ev.id=eg.event_id where eg.group_id=any(gids) and ev.attendance_date=d and ev.status='open') then raise exception 'Uno de los grupos ya tiene una asistencia conjunta abierta. Ciérrala antes de iniciar otra.'; end if;
  insert into public.v2_attendance_events(id,teacher_id,title,attendance_date,expires_at,late_after_minutes,auto_mark_absent,request_payload,verification_mode)
    values(p_request_id,uid,title,d,now()+make_interval(mins=>mins),late,auto_absent,p_payload,mode);
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

create function tedvio_private.enable_attendance_rotation(p_event_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare e public.v2_attendance_events%rowtype;
begin
  if auth.uid() is null then raise exception 'Inicia sesión como docente.'; end if;
  select * into e from public.v2_attendance_events where id=p_event_id and teacher_id=(select auth.uid()) for update;
  if not found then raise exception 'La asistencia no está disponible.'; end if;
  if e.status<>'open' or e.expires_at<=clock_timestamp() then raise exception 'El registro ya terminó.'; end if;
  update public.v2_attendance_events set verification_mode='rotating' where id=e.id;
  return e.id;
end $$;
revoke all on function tedvio_private.enable_attendance_rotation(uuid) from public,anon;
grant execute on function tedvio_private.enable_attendance_rotation(uuid) to authenticated;
create function public.v2_enable_attendance_rotation(p_event_id uuid) returns uuid language sql security invoker set search_path='' as $$select tedvio_private.enable_attendance_rotation(p_event_id)$$;
revoke all on function public.v2_enable_attendance_rotation(uuid) from public,anon;
grant execute on function public.v2_enable_attendance_rotation(uuid) to authenticated;

create function tedvio_private.attendance_event_challenge(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.v2_attendance_events%rowtype; c tedvio_private.attendance_event_challenges%rowtype; n timestamptz; next_code text;
begin
  if auth.uid() is null then raise exception 'Inicia sesión como docente.'; end if;
  select * into e from public.v2_attendance_events where id=p_event_id and teacher_id=(select auth.uid()) for share;
  if not found then raise exception 'La asistencia no está disponible.'; end if;
  perform tedvio_private.rate_limit_v67('joint_challenge_teacher',e.id::text,60,60);
  if e.status<>'open' or e.expires_at<=clock_timestamp() or e.verification_mode<>'rotating' then
    return jsonb_build_object('available',false,'server_now',clock_timestamp());
  end if;
  -- Concurrent teacher tabs reuse the same challenge; pupils cannot issue challenges.
  perform pg_advisory_xact_lock(hashtextextended('attendance-challenge:'||e.id::text,0));
  select * into c from tedvio_private.attendance_event_challenges where event_id=e.id for update;
  n:=clock_timestamp();
  if e.expires_at<=n then return jsonb_build_object('available',false,'server_now',n); end if;
  if c.event_id is null or c.expires_at<=n then
    loop
      next_code:=lpad(((('x'||substr(replace(gen_random_uuid()::text,'-',''),1,12))::bit(48)::bigint)%1000000)::text,6,'0');
      exit when next_code is distinct from c.code;
    end loop;
    insert into tedvio_private.attendance_event_challenges(event_id,qr_proof,code,expires_at)
      values(e.id,replace(gen_random_uuid()::text,'-',''),next_code,least(n+interval '60 seconds',e.expires_at))
      on conflict(event_id) do update set qr_proof=excluded.qr_proof,code=excluded.code,expires_at=excluded.expires_at returning * into c;
  end if;
  return jsonb_build_object('available',true,'qr_proof',c.qr_proof,'code',c.code,'expires_at',c.expires_at,'server_now',clock_timestamp());
end $$;
revoke all on function tedvio_private.attendance_event_challenge(uuid) from public,anon;
grant execute on function tedvio_private.attendance_event_challenge(uuid) to authenticated;
create function public.v2_attendance_event_challenge(p_event_id uuid) returns jsonb language sql security invoker set search_path='' as $$select tedvio_private.attendance_event_challenge(p_event_id)$$;
revoke all on function public.v2_attendance_event_challenge(uuid) from public,anon;
grant execute on function public.v2_attendance_event_challenge(uuid) to authenticated;

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
  return jsonb_build_object('ok',true,'title',e.title,'attendance_date',e.attendance_date,'expires_at',e.expires_at,'server_now',clock_timestamp(),'groups',groups,'verification_mode',e.verification_mode);
end $$;

create or replace function tedvio_private.attendance_event_checkin(p_token text,p_group_id uuid,p_enrollment text,p_proof text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.v2_attendance_events%rowtype; s public.v2_attendance_sessions%rowtype; st public.v2_group_students%rowtype; r public.v2_attendance_records%rowtype; receipt public.v2_attendance_event_checkins%rowtype; matches integer; v_status text; gname text; c tedvio_private.attendance_event_challenges%rowtype;
begin
  perform tedvio_private.rate_limit_v67('joint_attendance_ip','*',900,60);
  perform tedvio_private.rate_limit_v67('joint_attendance_identity',left(coalesce(p_token,''),64)||'|'||coalesce(p_group_id::text,'')||'|'||lower(btrim(left(coalesce(p_enrollment,''),100))),8,60);
  if length(coalesce(p_token,''))<>32 or length(btrim(coalesce(p_enrollment,''))) not between 1 and 100 then return jsonb_build_object('ok',false,'message','Revisa el enlace y escribe tu matrícula.'); end if;
  -- Shared lock permits parallel students; closing takes an exclusive lock.
  select * into e from public.v2_attendance_events where token=p_token for share;
  if not found or e.status<>'open' or e.expires_at<=clock_timestamp() then return jsonb_build_object('ok',false,'message','El registro terminó o el enlace no es válido. Comunícate con tu docente.'); end if;
  if e.verification_mode='rotating' then
    select * into c from tedvio_private.attendance_event_challenges where event_id=e.id for share;
    if c.event_id is null or c.expires_at<=clock_timestamp() or coalesce(p_proof,'') not in (c.qr_proof,c.code) then
      -- Failed guesses share a budget across all matrícula/group values on this IP/event.
      perform tedvio_private.rate_limit_v67('joint_code_guess',e.id::text,12,60);
      return jsonb_build_object('ok',false,'error_code','code_expired','message','El QR o código ya no es válido. Escribe el código que tu docente muestra ahora.');
    end if;
  end if;
  select a.* into s from public.v2_attendance_sessions a join public.v2_attendance_event_groups eg on eg.attendance_session_id=a.id
    where eg.event_id=e.id and eg.group_id=p_group_id and eg.teacher_id=e.teacher_id and a.teacher_id=e.teacher_id and a.group_id=p_group_id for share of a;
  if not found or s.status<>'open' then return jsonb_build_object('ok',false,'message','Este grupo no tiene el registro abierto. Consulta a tu docente.'); end if;
  select count(*) into matches from public.v2_group_students where group_id=p_group_id and teacher_id=e.teacher_id and active and lower(btrim(enrollment))=lower(btrim(p_enrollment));
  if matches<>1 then return jsonb_build_object('ok',false,'message',case when matches>1 then 'Hay matrículas duplicadas en este grupo. Solicita el registro a tu docente.' else 'La matrícula no está registrada en el grupo seleccionado. Revisa ambos datos.' end); end if;
  select * into st from public.v2_group_students where group_id=p_group_id and teacher_id=e.teacher_id and active and lower(btrim(enrollment))=lower(btrim(p_enrollment)) for share;
  perform pg_advisory_xact_lock(hashtextextended('attendance-checkin:'||s.id::text||':'||st.id::text,0));
  -- Recheck the clock after waiting for the pupil/session locks and before any write.
  if e.expires_at<=clock_timestamp() then return jsonb_build_object('ok',false,'message','Terminó el tiempo de registro.'); end if;
  if e.verification_mode='rotating' and c.expires_at<=clock_timestamp() then
    return jsonb_build_object('ok',false,'error_code','code_expired','message','El código cambió mientras confirmabas. Escribe el nuevo código; tus datos se conservan.');
  end if;
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
revoke all on function tedvio_private.attendance_event_checkin(text,uuid,text,text) from public;
grant execute on function tedvio_private.attendance_event_checkin(text,uuid,text,text) to anon,authenticated;

-- Old endpoints enforce the same check: a static event link cannot bypass rotation.
create or replace function tedvio_private.attendance_event_checkin(p_token text,p_group_id uuid,p_enrollment text)
returns jsonb language sql security invoker set search_path='' as $$select tedvio_private.attendance_event_checkin(p_token,p_group_id,p_enrollment,null)$$;
create or replace function public.v2_attendance_event_checkin(p_token text,p_group_id uuid,p_enrollment text)
returns jsonb language sql security invoker set search_path='' as $$select tedvio_private.attendance_event_checkin(p_token,p_group_id,p_enrollment,null)$$;
create function public.v2_attendance_event_checkin_secure(p_token text,p_group_id uuid,p_enrollment text,p_proof text)
returns jsonb language sql security invoker set search_path='' as $$select tedvio_private.attendance_event_checkin(p_token,p_group_id,p_enrollment,p_proof)$$;
revoke all on function public.v2_attendance_event_checkin_secure(text,uuid,text,text) from public;
grant execute on function public.v2_attendance_event_checkin_secure(text,uuid,text,text) to anon,authenticated;
