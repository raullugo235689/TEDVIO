-- TEDVIO 2.1 · Access and legal-consent enforcement
-- Reproducible database definition for the controls already validated in production.

begin;

create index if not exists tedvio_legal_documents_latest_required_idx
  on public.tedvio_legal_documents (document_key, effective_at desc, version desc)
  where status = 'published' and required;

create or replace function tedvio_private.capture_signup_legal_consents_v21()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_acceptances jsonb := new.raw_user_meta_data -> 'tedvio_legal_acceptances';
  v_required_count integer := 0;
  v_accepted_count integer := 0;
begin
  if v_acceptances is null or jsonb_typeof(v_acceptances) <> 'array' then
    raise exception using errcode = 'P0001', message = 'LEGAL_ACCEPTANCE_REQUIRED';
  end if;

  with latest as (
    select distinct on (d.document_key)
      d.document_key,
      d.version
    from public.tedvio_legal_documents d
    where d.status = 'published'
      and d.required
    order by d.document_key, d.effective_at desc, d.version desc
  ), accepted as (
    select distinct
      l.document_key,
      l.version
    from latest l
    join lateral jsonb_array_elements(v_acceptances) item on true
    where item ->> 'document_key' = l.document_key
      and item ->> 'document_version' = l.version
      and lower(coalesce(item ->> 'accepted', 'false')) = 'true'
  )
  select
    (select count(*) from latest),
    (select count(*) from accepted)
  into v_required_count, v_accepted_count;

  if v_required_count = 0 or v_accepted_count <> v_required_count then
    raise exception using errcode = 'P0001', message = 'LEGAL_ACCEPTANCE_REQUIRED';
  end if;

  with latest as (
    select distinct on (d.document_key)
      d.document_key,
      d.version
    from public.tedvio_legal_documents d
    where d.status = 'published'
      and d.required
    order by d.document_key, d.effective_at desc, d.version desc
  ), accepted as (
    select distinct
      l.document_key,
      l.version
    from latest l
    join lateral jsonb_array_elements(v_acceptances) item on true
    where item ->> 'document_key' = l.document_key
      and item ->> 'document_version' = l.version
      and lower(coalesce(item ->> 'accepted', 'false')) = 'true'
  )
  insert into public.tedvio_user_consents (
    user_id,
    document_key,
    document_version,
    accepted_at,
    source
  )
  select
    new.id,
    a.document_key,
    a.version,
    now(),
    'teacher_v2_signup'
  from accepted a
  on conflict (user_id, document_key, document_version)
  do update set
    accepted_at = excluded.accepted_at,
    source = excluded.source;

  return new;
end;
$function$;

revoke all on function tedvio_private.capture_signup_legal_consents_v21()
  from public, anon, authenticated;

drop trigger if exists tedvio_capture_signup_legal_consents_v21
  on auth.users;

create trigger tedvio_capture_signup_legal_consents_v21
after insert on auth.users
for each row
execute function tedvio_private.capture_signup_legal_consents_v21();

comment on function tedvio_private.capture_signup_legal_consents_v21() is
  'Rejects new TEDVIO accounts unless every latest required legal-document version is explicitly accepted, then records the server timestamp.';

commit;
