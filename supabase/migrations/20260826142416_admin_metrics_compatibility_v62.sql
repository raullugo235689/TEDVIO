-- Recovered from the production migration ledger for deterministic rebuilds.
create or replace function public.tedvio_admin_metrics()
returns jsonb
language sql
stable
security invoker
set search_path=''
as $$
  select tedvio_private.admin_snapshot_v62()->'metrics'
$$;
revoke all on function public.tedvio_admin_metrics() from public, anon;
grant execute on function public.tedvio_admin_metrics() to authenticated, service_role;

