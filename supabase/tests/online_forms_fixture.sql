-- Minimal contracts from the existing bank and academic roster. No production data.
create role anon;
create role authenticated;
create schema auth;
create schema tedvio_private;
grant usage on schema public,auth to anon,authenticated;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
create table auth.users(id uuid primary key);
create table public.v2_groups(id uuid primary key,teacher_id uuid not null references auth.users(id),group_name text);
create table public.v2_group_students(
  id uuid primary key,group_id uuid not null references public.v2_groups(id) on delete cascade,
  teacher_id uuid not null references auth.users(id),full_name text,enrollment text,active boolean default true
);
create table public.v2_question_bank(
  id uuid primary key,teacher_id uuid not null references auth.users(id),title text,subject text,topic text,
  question_type text,prompt text,options jsonb,correct_answer jsonb,explanation text,difficulty text,
  media_url text,media_type text,archived boolean not null default false,
  created_at timestamptz default now(),updated_at timestamptz default now(),
  folder text,tags text[] not null default '{}',bloom text,favorite boolean not null default false
);
