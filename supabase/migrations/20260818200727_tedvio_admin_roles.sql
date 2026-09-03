-- Recovered from the production migration ledger for deterministic rebuilds.
create table if not exists public.tedvio_admin_roles (email text primary key, role text not null default 'admin', created_at timestamptz not null default now()); alter table public.tedvio_admin_roles enable row level security;

