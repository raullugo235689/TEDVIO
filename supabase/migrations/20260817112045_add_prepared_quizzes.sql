-- Recovered from the production migration ledger for deterministic rebuilds.
create table if not exists public.prepared_quizzes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.prepared_quiz_items (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.prepared_quizzes(id) on delete cascade,
  question_bank_id uuid not null references public.question_bank(id) on delete cascade,
  position integer not null,
  timer_seconds integer,
  unique(quiz_id, position)
);

alter table public.prepared_quizzes enable row level security;
alter table public.prepared_quiz_items enable row level security;

drop policy if exists "mvp_prepared_quizzes_all" on public.prepared_quizzes;
create policy "mvp_prepared_quizzes_all" on public.prepared_quizzes for all to anon using (true) with check (true);

drop policy if exists "mvp_prepared_quiz_items_all" on public.prepared_quiz_items;
create policy "mvp_prepared_quiz_items_all" on public.prepared_quiz_items for all to anon using (true) with check (true);

