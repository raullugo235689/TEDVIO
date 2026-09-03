-- Recovered from the production migration ledger for deterministic rebuilds.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.create_live_session(text) from public, anon; grant execute on function public.create_live_session(text) to authenticated;
revoke execute on function public.teacher_launch_question(uuid,text,jsonb,text) from public, anon; grant execute on function public.teacher_launch_question(uuid,text,jsonb,text) to authenticated;
revoke execute on function public.get_live_results(uuid) from public, anon; grant execute on function public.get_live_results(uuid) to authenticated;
revoke execute on function public.join_session(text,text) from public; grant execute on function public.join_session(text,text) to anon,authenticated;
revoke execute on function public.get_student_session(text,uuid) from public; grant execute on function public.get_student_session(text,uuid) to anon,authenticated;
revoke execute on function public.submit_response(uuid,uuid,text) from public; grant execute on function public.submit_response(uuid,uuid,text) to anon,authenticated;

