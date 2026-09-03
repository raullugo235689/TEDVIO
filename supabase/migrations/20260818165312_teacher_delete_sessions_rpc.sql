-- Recovered from the production migration ledger for deterministic rebuilds.
create or replace function public.v2_delete_teacher_session(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if not exists(select 1 from public.v2_sessions where id=p_session_id and teacher_id=auth.uid()) then
    raise exception 'Sesión no encontrada o sin permiso';
  end if;
  delete from public.v2_sessions where id=p_session_id and teacher_id=auth.uid();
  return true;
end;
$$;
grant execute on function public.v2_delete_teacher_session(uuid) to authenticated;

