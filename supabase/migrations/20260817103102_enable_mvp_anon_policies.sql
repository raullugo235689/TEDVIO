-- Recovered from the production migration ledger for deterministic rebuilds.
alter table public.sessions enable row level security;
alter table public.participants enable row level security;
alter table public.questions enable row level security;
alter table public.responses enable row level security;

drop policy if exists "mvp_sessions_all" on public.sessions;
create policy "mvp_sessions_all" on public.sessions for all to anon using (true) with check (true);
drop policy if exists "mvp_participants_all" on public.participants;
create policy "mvp_participants_all" on public.participants for all to anon using (true) with check (true);
drop policy if exists "mvp_questions_all" on public.questions;
create policy "mvp_questions_all" on public.questions for all to anon using (true) with check (true);
drop policy if exists "mvp_responses_all" on public.responses;
create policy "mvp_responses_all" on public.responses for all to anon using (true) with check (true);

