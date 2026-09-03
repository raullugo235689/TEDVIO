-- Recovered from the production migration ledger for deterministic rebuilds.
create index if not exists tedvio_admin_audit_actor_idx on public.tedvio_admin_audit_log(actor_user_id) where actor_user_id is not null;
create index if not exists tedvio_admin_audit_target_user_idx on public.tedvio_admin_audit_log(target_user_id) where target_user_id is not null;
create index if not exists tedvio_admin_audit_target_institution_idx on public.tedvio_admin_audit_log(target_institution_id) where target_institution_id is not null;
create index if not exists tedvio_institutions_created_by_idx on public.tedvio_institutions(created_by) where created_by is not null;

