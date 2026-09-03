-- Recovered from the production migration ledger for deterministic rebuilds.
create table if not exists public.question_bank (
 id uuid primary key default gen_random_uuid(),
 title text not null,
 subject text,
 topic text,
 question_type text not null default 'multiple_choice' check (question_type in ('multiple_choice','true_false','open_text')),
 prompt text not null,
 options jsonb,
 correct_answer text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.question_bank enable row level security;
create policy "mvp_question_bank_all" on public.question_bank for all to anon using (true) with check (true);

