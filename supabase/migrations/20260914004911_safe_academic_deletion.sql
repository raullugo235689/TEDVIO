-- Explicit, owner-scoped deletion. Never let a CASCADE/SET NULL silently erase
-- academic history. Preview and commit use the same checks; commit re-locks and
-- rechecks. No records are deleted by applying this migration.
begin;

-- Internal catalog-driven guard also catches future FK dependencies, including
-- rows hidden by RLS. Only the owner-checked implementation may call it.
create function tedvio_private.academic_delete_dependencies(
  p_table regclass, p_id uuid, p_session_id uuid default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  dependency record;
  links bigint;
  blockers jsonb := '[]'::jsonb;
  extra_filter text;
begin
  for dependency in
    select c.oid, ns.nspname as schema_name, child.relname as table_name,
      parent_ns.nspname as parent_schema, parent.relname as parent_table,
      string_agg(format('child.%I = parent.%I', ca.attname, pa.attname), ' and ' order by keys.ordinality) as join_sql
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class child on child.oid = c.conrelid
    join pg_catalog.pg_namespace ns on ns.oid = child.relnamespace
    join pg_catalog.pg_class parent on parent.oid = c.confrelid
    join pg_catalog.pg_namespace parent_ns on parent_ns.oid = parent.relnamespace
    cross join lateral unnest(c.conkey, c.confkey) with ordinality as keys(child_key, parent_key, ordinality)
    join pg_catalog.pg_attribute ca on ca.attrelid = c.conrelid and ca.attnum = keys.child_key
    join pg_catalog.pg_attribute pa on pa.attrelid = c.confrelid and pa.attnum = keys.parent_key
    where c.contype = 'f' and c.confrelid = p_table
    group by c.oid, ns.nspname, child.relname, parent_ns.nspname, parent.relname
    order by ns.nspname, child.relname, c.oid
  loop
    -- Only the session's own questions and their answer-key copies may cascade.
    if p_session_id is not null and dependency.schema_name = 'public' and (
      (p_table = 'public.v2_sessions'::regclass and dependency.table_name = 'v2_questions') or
      (p_table = 'public.v2_questions'::regclass and dependency.table_name = 'v2_question_secrets')
    ) then continue; end if;
    extra_filter := '';
    if p_session_id is not null and p_table = 'public.v2_questions'::regclass
      and dependency.schema_name = 'public' and dependency.table_name = 'v2_sessions' then
      extra_filter := ' and child.id <> $2';
    end if;
    execute format('select count(*) from %I.%I child join %I.%I parent on %s where parent.id = $1%s',
      dependency.schema_name, dependency.table_name, dependency.parent_schema, dependency.parent_table,
      dependency.join_sql, extra_filter) into links using p_id, p_session_id;
    if links > 0 then
      blockers := blockers || jsonb_build_array(jsonb_build_object('resource', dependency.table_name, 'count', links));
    end if;
  end loop;
  return blockers;
end $$;
revoke all on function tedvio_private.academic_delete_dependencies(regclass, uuid, uuid) from public, anon, authenticated;

create function tedvio_private.academic_delete_impl(
  p_kind text, p_id uuid, p_expected_version text default null
) returns jsonb language plpgsql security definer set search_path = '' set lock_timeout = '3s' as $$
declare
  actor uuid := auth.uid();
  target_table text;
  target_row jsonb;
  target_label text;
  target_version text;
  blockers jsonb;
  question_row record;
  question_snapshot jsonb := '[]'::jsonb;
  result jsonb;
  deleted_count integer;
begin
  if actor is null then raise exception using errcode = '42501', message = 'Inicia sesión para eliminar.'; end if;
  target_table := case p_kind
    when 'question' then 'v2_question_bank' when 'session' then 'v2_sessions'
    when 'group' then 'v2_groups' when 'program' then 'v2_programs'
    when 'university' then 'v2_universities' end;
  if target_table is null or p_id is null then
    raise exception using errcode = '22023', message = 'Tipo o identificador no válido.';
  end if;
  -- The target lock prevents new FK links between validation and DELETE.
  execute format('select to_jsonb(t) from public.%I t where id = $1 and teacher_id = $2 for update', target_table)
    into target_row using p_id, actor;
  if target_row is null then
    raise exception using errcode = '42501', message = 'El registro ya no existe o no te pertenece. Actualiza la lista.';
  end if;
  target_label := coalesce(nullif(target_row->>'title', ''), nullif(target_row->>'name', ''), nullif(target_row->>'prompt', ''), 'Sin título');
  blockers := tedvio_private.academic_delete_dependencies(
    format('public.%I', target_table)::regclass, p_id, case when p_kind = 'session' then p_id end);
  if p_kind = 'session' then
    if target_row->>'status' = 'live' then
      blockers := blockers || jsonb_build_array(jsonb_build_object('resource', 'live_session', 'count', 1));
    end if;
    -- Lock every question before checking responses/receipts, not just the session.
    for question_row in select q.* from public.v2_questions q where q.session_id = p_id order by q.id for update loop
      question_snapshot := question_snapshot || jsonb_build_array(to_jsonb(question_row));
      blockers := blockers || tedvio_private.academic_delete_dependencies('public.v2_questions'::regclass, question_row.id, p_id);
    end loop;
  end if;
  -- Merge repeated resources (e.g. responses spread over several questions).
  select coalesce(jsonb_agg(jsonb_build_object('resource', resource, 'count', total) order by resource), '[]'::jsonb)
    into blockers from (select b->>'resource' resource, sum((b->>'count')::bigint) total
      from jsonb_array_elements(blockers) b group by b->>'resource') counts;
  target_version := md5(target_row::text || question_snapshot::text);
  result := jsonb_build_object('id', p_id, 'kind', p_kind, 'label', target_label,
    'version', target_version, 'can_delete', jsonb_array_length(blockers) = 0,
    'blockers', blockers, 'question_count', jsonb_array_length(question_snapshot), 'deleted', false);
  if p_expected_version is null then return result; end if;
  if p_expected_version is distinct from target_version then
    raise exception using errcode = '40001', message = 'El registro cambió. Revisa de nuevo antes de eliminar.';
  end if;
  if jsonb_array_length(blockers) > 0 then
    raise exception using errcode = '23503', message = 'Hay registros vinculados o la sesión está en vivo. Revisa de nuevo; no se eliminó nada.';
  end if;
  execute format('delete from public.%I where id = $1 and teacher_id = $2', target_table) using p_id, actor;
  get diagnostics deleted_count = row_count;
  if deleted_count <> 1 then raise exception 'No se confirmó la eliminación. Actualiza la lista.'; end if;
  return result || jsonb_build_object('deleted', true);
end $$;
revoke all on function tedvio_private.academic_delete_impl(text, uuid, text) from public, anon;
grant execute on function tedvio_private.academic_delete_impl(text, uuid, text) to authenticated;

create function public.v2_academic_delete(p_kind text, p_id uuid, p_expected_version text default null)
returns jsonb language sql security invoker set search_path = '' as $$
  select tedvio_private.academic_delete_impl(p_kind, p_id, p_expected_version)
$$;
revoke all on function public.v2_academic_delete(text, uuid, text) from public, anon;
grant execute on function public.v2_academic_delete(text, uuid, text) to authenticated;

-- Keep the legacy endpoint compatible, but subject it to the same history guard.
create or replace function tedvio_private.v2_delete_teacher_session_impl_v67(p_session_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare preview jsonb;
begin
  preview := tedvio_private.academic_delete_impl('session', p_session_id, null);
  return (tedvio_private.academic_delete_impl('session', p_session_id, preview->>'version')->>'deleted')::boolean;
end $$;
revoke all on function tedvio_private.v2_delete_teacher_session_impl_v67(uuid) from public, anon;
grant execute on function tedvio_private.v2_delete_teacher_session_impl_v67(uuid) to authenticated;

comment on function public.v2_academic_delete(text, uuid, text) is
  'Owner-scoped safe deletion: null version previews; matching version commits after locking and rechecking every FK dependency.';
notify pgrst, 'reload schema';
commit;
