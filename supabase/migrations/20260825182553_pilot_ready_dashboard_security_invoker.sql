-- Recovered from the production migration ledger for deterministic rebuilds.
alter function public.v2_teacher_today_dashboard() security invoker;
revoke all on function public.v2_teacher_today_dashboard() from public,anon;
grant execute on function public.v2_teacher_today_dashboard() to authenticated;

