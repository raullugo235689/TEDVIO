-- Recovered from the production migration ledger for deterministic rebuilds.
alter table public.tedvio_plan_limits
  add column if not exists feature_omr boolean not null default false,
  add column if not exists feature_analytics_pro boolean not null default false,
  add column if not exists feature_exports boolean not null default false;

update public.tedvio_plan_limits
set feature_omr = case when plan in ('pro','institutional') then true else false end,
    feature_analytics_pro = case when plan in ('pro','institutional') then true else false end,
    feature_exports = case when plan in ('pro','institutional') then true else false end,
    updated_at = now();

create or replace function public.tedvio_current_entitlements()
returns jsonb
language sql
stable
security invoker
set search_path = public, storage
as $$
with me as (
  select p.user_id, coalesce(p.plan,'free') as plan, p.role, p.status
  from public.tedvio_user_profiles p
  where p.user_id = (select auth.uid())
), lim as (
  select l.* from public.tedvio_plan_limits l join me on me.plan=l.plan
), usage as (
  select
    (select count(*) from public.v2_groups g where g.teacher_id=(select auth.uid()))::int as groups_used,
    (select count(*) from public.v2_sessions s where s.teacher_id=(select auth.uid()) and s.created_at >= date_trunc('month', now()))::int as sessions_month_used,
    coalesce((select sum(case when coalesce(o.metadata->>'size','') ~ '^[0-9]+$' then (o.metadata->>'size')::bigint else 0 end) from storage.objects o where o.bucket_id='tedvio-media-v2' and o.owner_id=(select auth.uid())::text),0)::bigint as storage_bytes_used
)
select jsonb_build_object(
  'version','2026.08.26.63',
  'plan',coalesce(me.plan,'free'),
  'display_name',coalesce(lim.display_name,'Free'),
  'role',coalesce(me.role,'teacher'),
  'status',coalesce(me.status,'active'),
  'limits',jsonb_build_object(
    'max_groups',lim.max_groups,
    'max_students_per_group',lim.max_students_per_group,
    'max_live_sessions_month',lim.max_live_sessions_month,
    'max_storage_mb',lim.max_storage_mb
  ),
  'features',jsonb_build_object(
    'omr',coalesce(lim.feature_omr,false),
    'analytics_pro',coalesce(lim.feature_analytics_pro,false),
    'exports',coalesce(lim.feature_exports,false),
    'qr_attendance',true,
    'live_sessions',true,
    'live_ranking',true,
    'institutional_admin',coalesce(lim.institutional_admin,false)
  ),
  'usage',jsonb_build_object(
    'groups',coalesce(usage.groups_used,0),
    'sessions_month',coalesce(usage.sessions_month_used,0),
    'storage_bytes',coalesce(usage.storage_bytes_used,0)
  ),
  'analytics_level',coalesce(lim.analytics_level,'basic')
)
from me
left join lim on true
cross join usage;
$$;
revoke all on function public.tedvio_current_entitlements() from public, anon;
grant execute on function public.tedvio_current_entitlements() to authenticated, service_role;

create or replace function tedvio_private.enforce_group_limit_v63()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_plan text; v_limit int; v_count int;
begin
  select coalesce(p.plan,'free') into v_plan from public.tedvio_user_profiles p where p.user_id=new.teacher_id;
  v_plan:=coalesce(v_plan,'free');
  select max_groups into v_limit from public.tedvio_plan_limits where plan=v_plan;
  if v_limit is not null then
    select count(*) into v_count from public.v2_groups where teacher_id=new.teacher_id;
    if v_count >= v_limit then raise exception 'Tu plan % permite hasta % grupos. Cambia de plan para crear otro grupo.', upper(v_plan), v_limit; end if;
  end if;
  return new;
end $$;
drop trigger if exists tedvio_v63_group_limit on public.v2_groups;
create trigger tedvio_v63_group_limit before insert on public.v2_groups for each row execute function tedvio_private.enforce_group_limit_v63();

create or replace function tedvio_private.enforce_student_limit_v63()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_plan text; v_limit int; v_count int;
begin
  if coalesce(new.active,true)=false then return new; end if;
  select coalesce(p.plan,'free') into v_plan from public.tedvio_user_profiles p where p.user_id=new.teacher_id;
  v_plan:=coalesce(v_plan,'free');
  select max_students_per_group into v_limit from public.tedvio_plan_limits where plan=v_plan;
  if v_limit is not null then
    select count(*) into v_count from public.v2_group_students where group_id=new.group_id and active=true and id is distinct from new.id;
    if v_count >= v_limit then raise exception 'Tu plan % permite hasta % alumnos activos por grupo. Cambia de plan para agregar más.', upper(v_plan), v_limit; end if;
  end if;
  return new;
end $$;
drop trigger if exists tedvio_v63_student_limit on public.v2_group_students;
create trigger tedvio_v63_student_limit before insert or update of active,group_id,teacher_id on public.v2_group_students for each row execute function tedvio_private.enforce_student_limit_v63();

create or replace function tedvio_private.enforce_session_limit_v63()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_plan text; v_limit int; v_count int;
begin
  select coalesce(p.plan,'free') into v_plan from public.tedvio_user_profiles p where p.user_id=new.teacher_id;
  v_plan:=coalesce(v_plan,'free');
  select max_live_sessions_month into v_limit from public.tedvio_plan_limits where plan=v_plan;
  if v_limit is not null then
    select count(*) into v_count from public.v2_sessions where teacher_id=new.teacher_id and created_at>=date_trunc('month',now());
    if v_count >= v_limit then raise exception 'Tu plan % permite hasta % sesiones nuevas por mes. Cambia de plan para continuar.', upper(v_plan), v_limit; end if;
  end if;
  return new;
end $$;
drop trigger if exists tedvio_v63_session_limit on public.v2_sessions;
create trigger tedvio_v63_session_limit before insert on public.v2_sessions for each row execute function tedvio_private.enforce_session_limit_v63();

create or replace function tedvio_private.enforce_omr_entitlement_v63()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_plan text; v_allowed boolean;
begin
  select coalesce(p.plan,'free') into v_plan from public.tedvio_user_profiles p where p.user_id=new.teacher_id;
  v_plan:=coalesce(v_plan,'free');
  select feature_omr into v_allowed from public.tedvio_plan_limits where plan=v_plan;
  if coalesce(v_allowed,false)=false then raise exception 'Exámenes OMR están disponibles en TEDVIO Pro e Institucional.'; end if;
  return new;
end $$;
drop trigger if exists tedvio_v63_omr_entitlement on public.v2_paper_exams;
create trigger tedvio_v63_omr_entitlement before insert on public.v2_paper_exams for each row execute function tedvio_private.enforce_omr_entitlement_v63();

create or replace function tedvio_private.enforce_storage_limit_v63()
returns trigger language plpgsql security definer set search_path=public,storage as $$
declare v_uid uuid; v_plan text; v_limit_mb int; v_used bigint; v_new bigint;
begin
  if new.bucket_id <> 'tedvio-media-v2' then return new; end if;
  begin v_uid:=coalesce(new.owner, nullif(new.owner_id,'')::uuid, nullif((storage.foldername(new.name))[1],'')::uuid); exception when others then v_uid:=null; end;
  if v_uid is null then return new; end if;
  select coalesce(p.plan,'free') into v_plan from public.tedvio_user_profiles p where p.user_id=v_uid;
  v_plan:=coalesce(v_plan,'free');
  select max_storage_mb into v_limit_mb from public.tedvio_plan_limits where plan=v_plan;
  if v_limit_mb is null then return new; end if;
  select coalesce(sum(case when coalesce(metadata->>'size','') ~ '^[0-9]+$' then (metadata->>'size')::bigint else 0 end),0) into v_used from storage.objects where bucket_id='tedvio-media-v2' and owner_id=v_uid::text;
  v_new:=case when coalesce(new.metadata->>'size','') ~ '^[0-9]+$' then (new.metadata->>'size')::bigint else 0 end;
  if v_new>0 and v_used+v_new > v_limit_mb::bigint*1024*1024 then raise exception 'Tu plan % alcanzó su límite de almacenamiento de % MB.', upper(v_plan), v_limit_mb; end if;
  return new;
end $$;
drop trigger if exists tedvio_v63_storage_limit on storage.objects;
create trigger tedvio_v63_storage_limit before insert on storage.objects for each row execute function tedvio_private.enforce_storage_limit_v63();

