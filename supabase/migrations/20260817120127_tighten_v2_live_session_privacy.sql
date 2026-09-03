-- Recovered from the production migration ledger for deterministic rebuilds.
drop policy if exists v2_sessions_public_read on public.v2_sessions;
create policy v2_sessions_public_read on public.v2_sessions for select to anon, authenticated using (status <> 'closed' or teacher_id = auth.uid());

drop policy if exists v2_participants_public_all on public.v2_participants;
drop policy if exists v2_participants_live_read on public.v2_participants;
drop policy if exists v2_participants_live_insert on public.v2_participants;
drop policy if exists v2_participants_live_update on public.v2_participants;
create policy v2_participants_live_read on public.v2_participants for select to anon, authenticated using (
  exists (select 1 from public.v2_sessions s where s.id=session_id and (s.status <> 'closed' or s.teacher_id=auth.uid()))
);
create policy v2_participants_live_insert on public.v2_participants for insert to anon, authenticated with check (
  exists (select 1 from public.v2_sessions s where s.id=session_id and s.status <> 'closed')
);
create policy v2_participants_live_update on public.v2_participants for update to anon, authenticated using (
  exists (select 1 from public.v2_sessions s where s.id=session_id and s.status <> 'closed')
) with check (
  exists (select 1 from public.v2_sessions s where s.id=session_id and s.status <> 'closed')
);

drop policy if exists v2_questions_public_read on public.v2_questions;
create policy v2_questions_public_read on public.v2_questions for select to anon, authenticated using (
  exists (select 1 from public.v2_sessions s where s.id=session_id and (s.status <> 'closed' or s.teacher_id=auth.uid()))
);

