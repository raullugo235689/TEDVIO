-- Recovered from the production migration ledger for deterministic rebuilds.
drop policy if exists v2_participants_teacher_delete on public.v2_participants;
create policy v2_participants_teacher_delete on public.v2_participants for delete to authenticated using (exists(select 1 from public.v2_sessions s where s.id=v2_participants.session_id and s.teacher_id=(select auth.uid())));

