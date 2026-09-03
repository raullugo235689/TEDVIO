-- Recovered from the production migration ledger for deterministic rebuilds.
create schema if not exists tedvio_private;
revoke all on schema tedvio_private from public;
revoke all on schema tedvio_private from anon;
grant usage on schema tedvio_private to authenticated, service_role;

create table if not exists public.tedvio_institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'active' check (status in ('active','suspended')),
  plan text not null default 'institutional' check (plan in ('institutional')),
  seat_limit integer check (seat_limit is null or seat_limit > 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tedvio_user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'teacher' check (role in ('admin','teacher','institution_admin')),
  status text not null default 'active' check (status in ('active','suspended')),
  plan text not null default 'free' check (plan in ('free','pro','institutional')),
  last_sign_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists tedvio_user_profiles_email_lower_uq on public.tedvio_user_profiles(lower(email));

create table if not exists public.tedvio_institution_memberships (
  institution_id uuid not null references public.tedvio_institutions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  member_role text not null default 'teacher' check (member_role in ('teacher','institution_admin')),
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (institution_id,user_id)
);
create index if not exists tedvio_memberships_user_idx on public.tedvio_institution_memberships(user_id,status);

create table if not exists public.tedvio_plan_limits (
  plan text primary key check (plan in ('free','pro','institutional')),
  display_name text not null,
  max_groups integer,
  max_students_per_group integer,
  max_live_sessions_month integer,
  max_storage_mb integer,
  analytics_level text not null default 'basic' check (analytics_level in ('basic','pro','institutional')),
  institutional_admin boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.tedvio_plan_limits(plan,display_name,max_groups,max_students_per_group,max_live_sessions_month,max_storage_mb,analytics_level,institutional_admin)
values
 ('free','Free',3,60,20,250,'basic',false),
 ('pro','Pro',20,250,250,5000,'pro',false),
 ('institutional','Institucional',null,null,null,null,'institutional',true)
on conflict(plan) do update set
 display_name=excluded.display_name,
 max_groups=excluded.max_groups,
 max_students_per_group=excluded.max_students_per_group,
 max_live_sessions_month=excluded.max_live_sessions_month,
 max_storage_mb=excluded.max_storage_mb,
 analytics_level=excluded.analytics_level,
 institutional_admin=excluded.institutional_admin,
 updated_at=now();

create table if not exists public.tedvio_admin_audit_log (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_user_id uuid references auth.users(id) on delete set null,
  target_institution_id uuid references public.tedvio_institutions(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists tedvio_admin_audit_created_idx on public.tedvio_admin_audit_log(created_at desc);

alter table public.tedvio_institutions enable row level security;
alter table public.tedvio_user_profiles enable row level security;
alter table public.tedvio_institution_memberships enable row level security;
alter table public.tedvio_plan_limits enable row level security;
alter table public.tedvio_admin_audit_log enable row level security;

revoke all on public.tedvio_institutions from anon, authenticated;
revoke all on public.tedvio_user_profiles from anon, authenticated;
revoke all on public.tedvio_institution_memberships from anon, authenticated;
revoke all on public.tedvio_plan_limits from anon, authenticated;
revoke all on public.tedvio_admin_audit_log from anon, authenticated;
grant select on public.tedvio_institutions to authenticated;
grant select on public.tedvio_user_profiles to authenticated;
grant select on public.tedvio_institution_memberships to authenticated;
grant select on public.tedvio_plan_limits to authenticated;
grant all on public.tedvio_institutions, public.tedvio_user_profiles, public.tedvio_institution_memberships, public.tedvio_plan_limits, public.tedvio_admin_audit_log to service_role;

create policy tedvio_profile_self_select on public.tedvio_user_profiles
for select to authenticated
using (user_id=(select auth.uid()));

create policy tedvio_membership_self_select on public.tedvio_institution_memberships
for select to authenticated
using (user_id=(select auth.uid()));

create policy tedvio_institution_member_select on public.tedvio_institutions
for select to authenticated
using (exists(select 1 from public.tedvio_institution_memberships m where m.institution_id=id and m.user_id=(select auth.uid()) and m.status='active'));

create policy tedvio_plan_limits_read on public.tedvio_plan_limits
for select to authenticated
using (true);

insert into public.tedvio_user_profiles(user_id,email,full_name,role,status,plan,last_sign_in_at,created_at,updated_at)
select u.id,
       coalesce(u.email,''),
       coalesce(nullif(u.raw_user_meta_data->>'full_name',''),nullif(u.raw_user_meta_data->>'name',''),split_part(coalesce(u.email,''),'@',1)),
       case when exists(select 1 from public.tedvio_admin_roles r where lower(r.email)=lower(coalesce(u.email,'')) and r.role='admin') then 'admin' else 'teacher' end,
       'active',
       case when exists(select 1 from public.tedvio_admin_roles r where lower(r.email)=lower(coalesce(u.email,'')) and r.role='admin') then 'pro' else 'free' end,
       u.last_sign_in_at,
       u.created_at,
       now()
from auth.users u
where u.email is not null
on conflict(user_id) do update set
 email=excluded.email,
 full_name=coalesce(nullif(public.tedvio_user_profiles.full_name,''),excluded.full_name),
 last_sign_in_at=excluded.last_sign_in_at,
 updated_at=now();

create or replace function tedvio_private.sync_user_profile_v62()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.email is null then return new; end if;
  insert into public.tedvio_user_profiles(user_id,email,full_name,role,status,plan,last_sign_in_at,created_at,updated_at)
  values(
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data->>'full_name',''),nullif(new.raw_user_meta_data->>'name',''),split_part(new.email,'@',1)),
    case when exists(select 1 from public.tedvio_admin_roles r where lower(r.email)=lower(new.email) and r.role='admin') then 'admin' else 'teacher' end,
    'active',
    case when exists(select 1 from public.tedvio_admin_roles r where lower(r.email)=lower(new.email) and r.role='admin') then 'pro' else 'free' end,
    new.last_sign_in_at,
    new.created_at,
    now()
  )
  on conflict(user_id) do update set
    email=excluded.email,
    full_name=coalesce(nullif(public.tedvio_user_profiles.full_name,''),excluded.full_name),
    last_sign_in_at=excluded.last_sign_in_at,
    updated_at=now();
  return new;
end;
$$;
revoke all on function tedvio_private.sync_user_profile_v62() from public, anon, authenticated;

 drop trigger if exists tedvio_sync_user_profile_v62 on auth.users;
create trigger tedvio_sync_user_profile_v62
after insert or update of email,raw_user_meta_data,last_sign_in_at on auth.users
for each row execute function tedvio_private.sync_user_profile_v62();

create or replace function tedvio_private.is_admin_v62()
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1 from public.tedvio_user_profiles p
    where p.user_id=(select auth.uid()) and p.role='admin' and p.status='active'
  )
$$;
revoke all on function tedvio_private.is_admin_v62() from public, anon;
grant execute on function tedvio_private.is_admin_v62() to authenticated, service_role;

create or replace function tedvio_private.admin_snapshot_v62()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare out jsonb;
begin
  if not tedvio_private.is_admin_v62() then
    raise exception 'administrative access required' using errcode='42501';
  end if;

  select jsonb_build_object(
    'metrics',jsonb_build_object(
      'users',(select count(*) from auth.users),
      'active30',(select count(*) from auth.users where last_sign_in_at>=now()-interval '30 days'),
      'admins',(select count(*) from public.tedvio_user_profiles where role='admin' and status='active'),
      'teachers',(select count(*) from public.tedvio_user_profiles where role in ('teacher','institution_admin') and status='active'),
      'suspended',(select count(*) from public.tedvio_user_profiles where status='suspended'),
      'institutions',(select count(*) from public.tedvio_institutions),
      'activeInstitutions',(select count(*) from public.tedvio_institutions where status='active'),
      'groups',(select count(*) from public.v2_groups),
      'students',(select count(*) from public.v2_group_students where active=true),
      'sessions',(select count(*) from public.v2_sessions),
      'sessions30',(select count(*) from public.v2_sessions where created_at>=now()-interval '30 days'),
      'responses',(select count(*) from public.v2_responses)
    ),
    'users',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',p.user_id,
        'email',p.email,
        'full_name',p.full_name,
        'role',p.role,
        'status',p.status,
        'plan',p.plan,
        'created_at',p.created_at,
        'last_sign_in_at',u.last_sign_in_at,
        'groups',(select count(*) from public.v2_groups g where g.teacher_id=p.user_id),
        'students',(select count(*) from public.v2_group_students s where s.teacher_id=p.user_id and s.active=true),
        'sessions',(select count(*) from public.v2_sessions s where s.teacher_id=p.user_id),
        'memberships',coalesce((select jsonb_agg(jsonb_build_object(
          'institution_id',m.institution_id,'institution_name',i.name,'role',m.member_role,'status',m.status
        ) order by i.name) from public.tedvio_institution_memberships m join public.tedvio_institutions i on i.id=m.institution_id where m.user_id=p.user_id),'[]'::jsonb)
      ) order by p.created_at desc)
      from public.tedvio_user_profiles p join auth.users u on u.id=p.user_id
    ),'[]'::jsonb),
    'institutions',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',i.id,'name',i.name,'slug',i.slug,'status',i.status,'plan',i.plan,'seat_limit',i.seat_limit,
        'members',(select count(*) from public.tedvio_institution_memberships m where m.institution_id=i.id and m.status='active'),
        'admins',(select count(*) from public.tedvio_institution_memberships m where m.institution_id=i.id and m.status='active' and m.member_role='institution_admin'),
        'created_at',i.created_at
      ) order by i.name) from public.tedvio_institutions i
    ),'[]'::jsonb),
    'plans',coalesce((select jsonb_agg(to_jsonb(p) order by case p.plan when 'free' then 1 when 'pro' then 2 else 3 end) from public.tedvio_plan_limits p),'[]'::jsonb),
    'audit',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',l.id,'action',l.action,'actor_user_id',l.actor_user_id,'actor_email',au.email,
        'target_user_id',l.target_user_id,'target_email',tu.email,'target_institution_id',l.target_institution_id,
        'details',l.details,'created_at',l.created_at
      ) order by l.created_at desc)
      from (select * from public.tedvio_admin_audit_log order by created_at desc limit 100) l
      left join auth.users au on au.id=l.actor_user_id
      left join auth.users tu on tu.id=l.target_user_id
    ),'[]'::jsonb)
  ) into out;
  return out;
end;
$$;
revoke all on function tedvio_private.admin_snapshot_v62() from public, anon;
grant execute on function tedvio_private.admin_snapshot_v62() to authenticated, service_role;

create or replace function public.tedvio_my_admin_role()
returns text
language sql
stable
security invoker
set search_path=''
as $$
  select case when tedvio_private.is_admin_v62() then 'admin'
    else (select p.role from public.tedvio_user_profiles p where p.user_id=(select auth.uid()) and p.status='active' limit 1)
  end
$$;

create or replace function public.tedvio_admin_v62_snapshot()
returns jsonb
language sql
stable
security invoker
set search_path=''
as $$ select tedvio_private.admin_snapshot_v62() $$;

create or replace function public.tedvio_admin_metrics()
returns jsonb
language sql
stable
security invoker
set search_path=''
as $$
  select case when tedvio_private.is_admin_v62() then
    jsonb_build_object(
      'universities',(select count(*) from public.v2_universities),
      'programs',(select count(*) from public.v2_programs),
      'groups',(select count(*) from public.v2_groups),
      'sessions',(select count(*) from public.v2_sessions)
    ) else null end
$$;

revoke all on function public.tedvio_my_admin_role() from public, anon;
revoke all on function public.tedvio_admin_v62_snapshot() from public, anon;
revoke all on function public.tedvio_admin_metrics() from public, anon;
grant execute on function public.tedvio_my_admin_role() to authenticated, service_role;
grant execute on function public.tedvio_admin_v62_snapshot() to authenticated, service_role;
grant execute on function public.tedvio_admin_metrics() to authenticated, service_role;

