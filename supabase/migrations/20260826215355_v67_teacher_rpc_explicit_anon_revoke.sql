-- Recovered from the production migration ledger for deterministic rebuilds.
revoke execute on function public.v2_attendance_pro_action(uuid,text) from anon;
revoke execute on function public.v2_attendance_pro_open(uuid,date,integer,boolean) from anon;
revoke execute on function public.v2_close_attendance_qr(uuid) from anon;
revoke execute on function public.v2_delete_teacher_session(uuid) from anon;
revoke execute on function public.v2_issue_attendance_qr(uuid,date) from anon;
grant execute on function public.v2_attendance_pro_action(uuid,text) to authenticated;
grant execute on function public.v2_attendance_pro_open(uuid,date,integer,boolean) to authenticated;
grant execute on function public.v2_close_attendance_qr(uuid) to authenticated;
grant execute on function public.v2_delete_teacher_session(uuid) to authenticated;
grant execute on function public.v2_issue_attendance_qr(uuid,date) to authenticated;

