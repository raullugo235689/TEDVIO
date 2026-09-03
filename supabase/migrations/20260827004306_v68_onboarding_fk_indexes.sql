-- Recovered from the production migration ledger for deterministic rebuilds.
create index if not exists tedvio_onboarding_demo_group_idx on public.tedvio_onboarding_progress(demo_group_id) where demo_group_id is not null;
create index if not exists tedvio_onboarding_demo_session_idx on public.tedvio_onboarding_progress(demo_session_id) where demo_session_id is not null;

