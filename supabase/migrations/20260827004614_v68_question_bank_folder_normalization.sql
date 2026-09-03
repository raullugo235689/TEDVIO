-- Recovered from the production migration ledger for deterministic rebuilds.
update public.v2_question_bank set folder='' where folder is null;
create or replace function tedvio_private.normalize_question_bank_folder_v68()
returns trigger language plpgsql set search_path='public' as $$
begin
  new.folder:=coalesce(nullif(trim(new.folder),''),'');
  return new;
end$$;
revoke all on function tedvio_private.normalize_question_bank_folder_v68() from public,anon,authenticated;
drop trigger if exists tedvio_v68_normalize_question_bank_folder on public.v2_question_bank;
create trigger tedvio_v68_normalize_question_bank_folder before insert or update of folder on public.v2_question_bank for each row execute function tedvio_private.normalize_question_bank_folder_v68();

