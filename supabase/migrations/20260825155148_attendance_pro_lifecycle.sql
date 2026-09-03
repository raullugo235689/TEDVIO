-- Recovered from the production migration ledger for deterministic rebuilds.
alter table public.v2_attendance_sessions add column if not exists status text not null default 'open';
alter table public.v2_attendance_sessions add column if not exists opened_at timestamptz not null default now();
alter table public.v2_attendance_sessions add column if not exists paused_at timestamptz;
alter table public.v2_attendance_sessions add column if not exists closed_at timestamptz;
alter table public.v2_attendance_sessions add column if not exists late_after_minutes integer not null default 10;
alter table public.v2_attendance_sessions add column if not exists auto_mark_absent boolean not null default true;
alter table public.v2_attendance_sessions add column if not exists updated_at timestamptz not null default now();

do $$ begin
  if not exists(select 1 from pg_constraint where conname='v2_attendance_sessions_status_check') then
    alter table public.v2_attendance_sessions add constraint v2_attendance_sessions_status_check check(status in ('open','paused','closed'));
  end if;
end $$;

update public.v2_attendance_sessions
set status='closed', closed_at=coalesce(closed_at,created_at), updated_at=now()
where attendance_date<current_date and status='open';

create or replace function public.v2_attendance_pro_open(p_group_id uuid,p_attendance_date date,p_late_after_minutes integer default 10,p_auto_mark_absent boolean default true)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare uid uuid:=auth.uid(); s public.v2_attendance_sessions%rowtype;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.v2_groups g where g.id=p_group_id and g.teacher_id=uid) then raise exception 'Group not found'; end if;
  select * into s from public.v2_attendance_sessions where group_id=p_group_id and teacher_id=uid and attendance_date=p_attendance_date limit 1;
  if s.id is null then
    insert into public.v2_attendance_sessions(group_id,teacher_id,attendance_date,status,opened_at,late_after_minutes,auto_mark_absent,updated_at)
    values(p_group_id,uid,p_attendance_date,'open',now(),greatest(0,coalesce(p_late_after_minutes,10)),coalesce(p_auto_mark_absent,true),now()) returning * into s;
  else
    update public.v2_attendance_sessions set late_after_minutes=greatest(0,coalesce(p_late_after_minutes,late_after_minutes)),auto_mark_absent=coalesce(p_auto_mark_absent,auto_mark_absent),updated_at=now() where id=s.id returning * into s;
  end if;
  return jsonb_build_object('ok',true,'id',s.id,'status',s.status,'attendance_date',s.attendance_date,'opened_at',s.opened_at,'late_after_minutes',s.late_after_minutes,'auto_mark_absent',s.auto_mark_absent,'closed_at',s.closed_at);
end $$;

grant execute on function public.v2_attendance_pro_open(uuid,date,integer,boolean) to authenticated;

create or replace function public.v2_attendance_pro_action(p_session_id uuid,p_action text)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare uid uuid:=auth.uid(); s public.v2_attendance_sessions%rowtype; p int; l int; a int; j int;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select * into s from public.v2_attendance_sessions where id=p_session_id and teacher_id=uid;
  if s.id is null then raise exception 'Attendance session not found'; end if;
  if p_action='pause' then
    update public.v2_attendance_sessions set status='paused',paused_at=now(),updated_at=now() where id=s.id returning * into s;
    update public.v2_attendance_qr_tokens set active=false where attendance_session_id=s.id and teacher_id=uid and active=true;
  elsif p_action in ('resume','reopen') then
    update public.v2_attendance_sessions set status='open',paused_at=null,closed_at=null,opened_at=case when p_action='reopen' then now() else opened_at end,updated_at=now() where id=s.id returning * into s;
  elsif p_action='close' then
    if s.auto_mark_absent then
      insert into public.v2_attendance_records(attendance_session_id,student_id,teacher_id,status,observation,updated_at)
      select s.id,gs.id,uid,'absent','Marcado automáticamente al cerrar asistencia',now()
      from public.v2_group_students gs
      where gs.group_id=s.group_id and gs.teacher_id=uid and gs.active=true
      and not exists(select 1 from public.v2_attendance_records r where r.attendance_session_id=s.id and r.student_id=gs.id)
      on conflict(attendance_session_id,student_id) do nothing;
    end if;
    update public.v2_attendance_sessions set status='closed',closed_at=now(),paused_at=null,updated_at=now() where id=s.id returning * into s;
    update public.v2_attendance_qr_tokens set active=false where attendance_session_id=s.id and teacher_id=uid and active=true;
  else
    raise exception 'Unsupported action';
  end if;
  select count(*) filter(where status='present'),count(*) filter(where status='late'),count(*) filter(where status='absent'),count(*) filter(where status='justified') into p,l,a,j from public.v2_attendance_records where attendance_session_id=s.id;
  return jsonb_build_object('ok',true,'id',s.id,'status',s.status,'present',p,'late',l,'absent',a,'justified',j,'closed_at',s.closed_at);
end $$;

grant execute on function public.v2_attendance_pro_action(uuid,text) to authenticated;

create or replace function public.v2_issue_attendance_qr(p_group_id uuid,p_attendance_date date)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare uid uuid:=auth.uid(); s public.v2_attendance_sessions%rowtype; tok text; exp timestamptz;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.v2_groups g where g.id=p_group_id and g.teacher_id=uid) then raise exception 'Group not found'; end if;
  select * into s from public.v2_attendance_sessions where group_id=p_group_id and teacher_id=uid and attendance_date=p_attendance_date limit 1;
  if s.id is null then
    insert into public.v2_attendance_sessions(group_id,teacher_id,attendance_date,status,opened_at,updated_at) values(p_group_id,uid,p_attendance_date,'open',now(),now()) returning * into s;
  end if;
  if s.status='closed' then raise exception 'La asistencia está cerrada. Reábrela antes de generar un QR.'; end if;
  if s.status='paused' then raise exception 'La asistencia está pausada. Reanúdala antes de generar un QR.'; end if;
  update public.v2_attendance_qr_tokens set active=false where attendance_session_id=s.id and teacher_id=uid and active=true;
  tok:=replace(gen_random_uuid()::text,'-',''); exp:=now()+interval '45 seconds';
  insert into public.v2_attendance_qr_tokens(attendance_session_id,group_id,teacher_id,token,active,expires_at) values(s.id,p_group_id,uid,tok,true,exp);
  return jsonb_build_object('ok',true,'attendance_session_id',s.id,'token',tok,'expires_at',exp,'status',s.status,'late_after_minutes',s.late_after_minutes);
end $$;

grant execute on function public.v2_issue_attendance_qr(uuid,date) to authenticated;

create or replace function public.v2_public_attendance_checkin(p_token text,p_enrollment text)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare t public.v2_attendance_qr_tokens%rowtype; st public.v2_group_students%rowtype; s public.v2_attendance_sessions%rowtype; g public.v2_groups%rowtype; v_status text; v_msg text;
begin
  select * into t from public.v2_attendance_qr_tokens where token=p_token and active=true and expires_at>now() order by created_at desc limit 1;
  if t.id is null then return jsonb_build_object('ok',false,'message','El código de asistencia expiró. Escanea el QR actualizado.'); end if;
  select * into s from public.v2_attendance_sessions where id=t.attendance_session_id;
  if s.id is null or s.status<>'open' then return jsonb_build_object('ok',false,'message',case when s.status='paused' then 'La asistencia está pausada.' else 'La asistencia ya fue cerrada.' end); end if;
  select * into st from public.v2_group_students where group_id=t.group_id and active=true and lower(trim(enrollment))=lower(trim(p_enrollment)) limit 1;
  if st.id is null then return jsonb_build_object('ok',false,'message','La matrícula no pertenece a este grupo.'); end if;
  select * into g from public.v2_groups where id=t.group_id;
  if now()>s.opened_at + make_interval(mins=>greatest(0,s.late_after_minutes)) then v_status:='late'; v_msg:='Retardo registrado'; else v_status:='present'; v_msg:='Asistencia registrada'; end if;
  insert into public.v2_attendance_records(attendance_session_id,student_id,teacher_id,status,observation,updated_at)
  values(t.attendance_session_id,st.id,t.teacher_id,v_status,case when v_status='late' then 'Registro por QR fuera de ventana de puntualidad' else 'Registro por QR' end,now())
  on conflict(attendance_session_id,student_id) do update set status=excluded.status,observation=excluded.observation,updated_at=now();
  return jsonb_build_object('ok',true,'message',v_msg,'student_name',st.full_name,'status',v_status,'group_name',coalesce(g.name,g.group_name),'attendance_date',s.attendance_date,'registered_at',now());
end $$;

grant execute on function public.v2_public_attendance_checkin(text,text) to anon,authenticated;

