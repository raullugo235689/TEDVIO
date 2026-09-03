\set ON_ERROR_STOP on

begin;

do $$
declare
  missing_tables text[];
  rls_disabled text[];
  missing_functions text[];
  missing_realtime_tables text[];
  migration_count integer;
  active_access_codes integer;
begin
  select array_agg(expected.name order by expected.name)
    into missing_tables
  from unnest(array[
    'v2_groups',
    'v2_group_students',
    'v2_attendance_sessions',
    'v2_attendance_records',
    'v2_sessions',
    'v2_questions',
    'v2_participants',
    'v2_responses',
    'v2_question_bank',
    'v2_paper_exams',
    'v2_paper_exam_results',
    'v2_grade_categories',
    'v2_grade_items',
    'v2_grade_scores',
    'v2_academic_periods'
  ]) as expected(name)
  where to_regclass(format('public.%I', expected.name)) is null;

  if missing_tables is not null then
    raise exception 'Missing critical tables: %', missing_tables;
  end if;

  select array_agg(expected.name order by expected.name)
    into rls_disabled
  from unnest(array[
    'v2_groups',
    'v2_group_students',
    'v2_attendance_sessions',
    'v2_attendance_records',
    'v2_sessions',
    'v2_questions',
    'v2_participants',
    'v2_responses',
    'v2_question_bank',
    'v2_paper_exams',
    'v2_paper_exam_results',
    'v2_grade_categories',
    'v2_grade_items',
    'v2_grade_scores',
    'v2_academic_periods'
  ]) as expected(name)
  left join pg_class relation
    on relation.oid = to_regclass(format('public.%I', expected.name))
  where not coalesce(relation.relrowsecurity, false);

  if rls_disabled is not null then
    raise exception 'RLS disabled on critical tables: %', rls_disabled;
  end if;

  select array_agg(expected.name order by expected.name)
    into missing_functions
  from unnest(array[
    'v2_join_session_v3',
    'v2_submit_response',
    'v2_public_session_meta',
    'v2_public_session_people',
    'v2_gradebook_home',
    'v2_teacher_today_dashboard',
    'v2_teacher_start_session_check'
  ]) as expected(name)
  where not exists (
    select 1
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = expected.name
  );

  if missing_functions is not null then
    raise exception 'Missing critical RPCs: %', missing_functions;
  end if;

  select array_agg(expected.name order by expected.name)
    into missing_realtime_tables
  from unnest(array[
    'v2_sessions',
    'v2_questions',
    'v2_participants',
    'v2_responses'
  ]) as expected(name)
  where not exists (
    select 1
    from pg_publication_tables publication
    where publication.pubname = 'supabase_realtime'
      and publication.schemaname = 'public'
      and publication.tablename = expected.name
  );

  if missing_realtime_tables is not null then
    raise exception 'Critical Realtime tables are not published: %', missing_realtime_tables;
  end if;

  select count(*) into migration_count
  from supabase_migrations.schema_migrations;

  if migration_count < 101 then
    raise exception 'Only % migrations were restored; expected at least 101', migration_count;
  end if;

  if to_regclass('public.teacher_access_codes') is not null then
    execute 'select count(*) from public.teacher_access_codes where is_active'
      into active_access_codes;
    if active_access_codes <> 0 then
      raise exception 'A clean restore created % active static teacher access code(s)', active_access_codes;
    end if;
  end if;

  if not exists (
    select 1
    from pg_trigger trigger
    where trigger.tgname = 'on_auth_user_created'
      and not trigger.tgisinternal
  ) then
    raise exception 'Auth profile bootstrap trigger is missing';
  end if;
end
$$;

select 'TEDVIO isolated restore contract passed' as result;

rollback;

