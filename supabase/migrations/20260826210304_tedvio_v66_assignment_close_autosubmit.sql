-- Recovered from the production migration ledger for deterministic rebuilds.
create or replace function tedvio_private.assignment_close_attempts_v66()
returns trigger language plpgsql security definer set search_path='' as $$
declare r record;
begin
  if new.status='closed' and old.status is distinct from 'closed' then
    for r in select id from public.v2_assignment_attempts where assignment_id=new.id and status='in_progress' loop
      perform tedvio_private.finalize_assignment_attempt_v66(r.id,true);
    end loop;
  end if;
  return new;
end $$;
revoke all on function tedvio_private.assignment_close_attempts_v66() from public,anon,authenticated;
drop trigger if exists tedvio_v66_assignment_close_attempts on public.v2_assignments;
create trigger tedvio_v66_assignment_close_attempts after update of status on public.v2_assignments for each row execute function tedvio_private.assignment_close_attempts_v66();

