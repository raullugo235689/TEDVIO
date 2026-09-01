-- Correct FILTER placement in the preflight latency aggregate.

do $migration$
declare
  v_definition text;
begin
  select pg_catalog.pg_get_functiondef(p.oid) into v_definition
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'tedvio_private'
    and p.proname = 'v2_teacher_finish_session_check_impl_v1'
    and pg_catalog.pg_get_function_identity_arguments(p.oid) = 'p_run_id uuid, p_check_results jsonb, p_duration_ms integer';

  if v_definition is null then
    raise exception 'SESSION_PREFLIGHT_FINISH_FUNCTION_NOT_FOUND';
  end if;

  v_definition := replace(
    v_definition,
    'coalesce(round(avg(latency_ms)) filter (where latency_ms is not null), 0)::integer',
    'coalesce(round(avg(latency_ms) filter (where latency_ms is not null)), 0)::integer'
  );
  execute v_definition;
end;
$migration$;
