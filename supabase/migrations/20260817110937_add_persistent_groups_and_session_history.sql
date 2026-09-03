-- Recovered from the production migration ledger for deterministic rebuilds.
create table if not exists public.groups (
 id uuid primary key default gen_random_uuid(),
 name text not null,
 subject text,
 section text,
 permanent_code text not null unique check (permanent_code ~ '^[0-9]{6}$'),
 created_at timestamptz not null default now()
);
alter table public.groups enable row level security;
drop policy if exists "mvp_groups_all" on public.groups;
create policy "mvp_groups_all" on public.groups for all to anon using (true) with check (true);
alter table public.sessions add column if not exists group_id uuid references public.groups(id) on delete set null;
create index if not exists sessions_group_id_idx on public.sessions(group_id);

