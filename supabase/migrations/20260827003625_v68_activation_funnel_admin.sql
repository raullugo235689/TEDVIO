-- Recovered from the production migration ledger for deterministic rebuilds.
create or replace function tedvio_private.activation_funnel_v68()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=auth.uid(); out jsonb;
begin
 if uid is null or not tedvio_private.is_admin_v62() then raise exception 'Admin required'; end if;
 with profiles as (
   select user_id from public.tedvio_user_profiles where status='active'
 ), per_user_days as (
   select e.user_id,count(distinct (e.created_at at time zone 'America/Mazatlan')::date) active_days
   from public.tedvio_activation_events e group by e.user_id
 )
 select jsonb_build_object(
   'version','2026.08.26.68',
   'accounts',(select count(*) from profiles),
   'onboarding_seen',(select count(distinct user_id) from public.tedvio_activation_events where event_type='onboarding_viewed'),
   'demo_created',(select count(distinct user_id) from public.tedvio_activation_events where event_type='demo_workspace_created'),
   'course_created',(select count(distinct user_id) from public.tedvio_activation_events where event_type='course_created'),
   'students_imported',(select count(distinct user_id) from public.tedvio_activation_events where event_type='students_imported'),
   'question_created',(select count(distinct user_id) from public.tedvio_activation_events where event_type='question_created'),
   'first_session',(select count(distinct user_id) from public.tedvio_activation_events where event_type='first_session_created'),
   'completed',(select count(*) from public.tedvio_onboarding_progress where completed_at is not null),
   'returned_2_days',(select count(*) from per_user_days where active_days>=2)
 ) into out;
 return out;
end$$;
revoke all on function tedvio_private.activation_funnel_v68() from public,anon;
grant execute on function tedvio_private.activation_funnel_v68() to authenticated,service_role;
create or replace function public.tedvio_activation_funnel_v68() returns jsonb language sql security invoker set search_path='' as $$select tedvio_private.activation_funnel_v68()$$;
revoke execute on function public.tedvio_activation_funnel_v68() from public,anon;
grant execute on function public.tedvio_activation_funnel_v68() to authenticated,service_role;

