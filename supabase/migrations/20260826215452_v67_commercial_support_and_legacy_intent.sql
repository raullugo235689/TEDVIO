-- Recovered from the production migration ledger for deterministic rebuilds.
do $$declare t text; begin
 foreach t in array array['demo_teacher_tokens','participants','prepared_quiz_items','prepared_quizzes','question_bank','questions','responses','sessions','teacher_access_codes','tedvio_admin_audit_log','tedvio_admin_roles'] loop
   execute format('drop policy if exists tedvio_v67_legacy_deny_all on public.%I',t);
   execute format('create policy tedvio_v67_legacy_deny_all on public.%I for all to anon,authenticated using (false) with check (false)',t);
 end loop;
end$$;

create table if not exists public.tedvio_support_reports(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 category text not null default 'bug' check(category in ('bug','question','feature','billing','other')),
 message text not null check(char_length(message) between 5 and 4000),
 page text,
 app_version text,
 user_agent text,
 context jsonb not null default '{}'::jsonb,
 status text not null default 'new' check(status in ('new','in_progress','resolved','closed')),
 admin_note text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.tedvio_support_reports enable row level security;
create index if not exists tedvio_support_user_created_idx on public.tedvio_support_reports(user_id,created_at desc);
create index if not exists tedvio_support_status_created_idx on public.tedvio_support_reports(status,created_at desc);
revoke all on public.tedvio_support_reports from anon,authenticated;
grant select,insert,update on public.tedvio_support_reports to authenticated;

drop policy if exists tedvio_support_select on public.tedvio_support_reports;
create policy tedvio_support_select on public.tedvio_support_reports for select to authenticated
using(user_id=(select auth.uid()) or (select tedvio_private.is_admin_v62()));
drop policy if exists tedvio_support_insert on public.tedvio_support_reports;
create policy tedvio_support_insert on public.tedvio_support_reports for insert to authenticated
with check(user_id=(select auth.uid()));
drop policy if exists tedvio_support_admin_update on public.tedvio_support_reports;
create policy tedvio_support_admin_update on public.tedvio_support_reports for update to authenticated
using((select tedvio_private.is_admin_v62())) with check((select tedvio_private.is_admin_v62()));

create or replace function public.tedvio_public_health_v67()
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('ok',true,'version','2026.08.26.67','server_time',now(),'database','reachable');
$$;
revoke all on function public.tedvio_public_health_v67() from public,anon,authenticated;
grant execute on function public.tedvio_public_health_v67() to anon,authenticated;

create or replace function public.tedvio_support_my_reports_v67()
returns table(id uuid,category text,message text,status text,admin_note text,created_at timestamptz,updated_at timestamptz)
language sql stable security invoker set search_path='' as $$
 select r.id,r.category,r.message,r.status,r.admin_note,r.created_at,r.updated_at
 from public.tedvio_support_reports r
 where r.user_id=(select auth.uid()) order by r.created_at desc limit 20;
$$;
revoke all on function public.tedvio_support_my_reports_v67() from public,anon,authenticated;
grant execute on function public.tedvio_support_my_reports_v67() to authenticated;

