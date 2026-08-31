-- TEDVIO 2.1 · P0 launch readiness
-- Remove unnecessary SECURITY DEFINER exposure from public legal RPCs while
-- preserving anonymous read-only access to the current required documents.

begin;

-- Anonymous users may read only the fields needed to review published,
-- required legal documents before creating an account.
grant select (
  document_key,
  version,
  title,
  summary,
  content_html,
  effective_at,
  required,
  status
) on table public.tedvio_legal_documents to anon;

drop policy if exists tedvio_legal_public_required_select
  on public.tedvio_legal_documents;

create policy tedvio_legal_public_required_select
  on public.tedvio_legal_documents
  for select
  to anon
  using (status = 'published' and required);

-- This public reader now executes with the caller's privileges. RLS limits
-- anonymous callers to published required documents.
create or replace function public.tedvio_required_legal_documents_v21()
returns table (
  document_key text,
  version text,
  title text,
  summary text,
  content_html text,
  effective_at timestamptz,
  required boolean
)
language sql
stable
security invoker
set search_path = ''
as $function$
  with ranked as (
    select
      d.document_key,
      d.version,
      d.title,
      d.summary,
      d.content_html,
      d.effective_at,
      d.required,
      row_number() over (
        partition by d.document_key
        order by d.effective_at desc, d.version desc
      ) as position
    from public.tedvio_legal_documents d
    where d.status = 'published'
      and d.required
  )
  select
    r.document_key,
    r.version,
    r.title,
    r.summary,
    r.content_html,
    r.effective_at,
    r.required
  from ranked r
  where r.position = 1
  order by r.document_key;
$function$;

revoke all on function public.tedvio_required_legal_documents_v21()
  from public;
grant execute on function public.tedvio_required_legal_documents_v21()
  to anon, authenticated;

-- Keep the privileged insert implementation out of the exposed API schema.
create or replace function tedvio_private.accept_required_legal_v21(
  p_source text default 'teacher_v2_gate'
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_count integer := 0;
begin
  if v_uid is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;

  with latest as (
    select distinct on (d.document_key)
      d.document_key,
      d.version
    from public.tedvio_legal_documents d
    where d.status = 'published'
      and d.required
    order by d.document_key, d.effective_at desc, d.version desc
  ), upserted as (
    insert into public.tedvio_user_consents (
      user_id,
      document_key,
      document_version,
      accepted_at,
      source
    )
    select
      v_uid,
      l.document_key,
      l.version,
      now(),
      left(coalesce(nullif(btrim(p_source), ''), 'teacher_v2_gate'), 80)
    from latest l
    on conflict (user_id, document_key, document_version)
    do update set
      accepted_at = excluded.accepted_at,
      source = excluded.source
    returning 1
  )
  select count(*) into v_count from upserted;

  if v_count = 0 then
    raise exception using errcode = 'P0001', message = 'LEGAL_DOCUMENT_NOT_FOUND';
  end if;

  return v_count;
end;
$function$;

revoke all on function tedvio_private.accept_required_legal_v21(text)
  from public, anon;
grant execute on function tedvio_private.accept_required_legal_v21(text)
  to authenticated;

-- The public API wrapper remains callable by signed-in users but no longer
-- runs with elevated privileges itself.
create or replace function public.tedvio_accept_required_legal_v21(
  p_source text default 'teacher_v2_gate'
)
returns integer
language sql
security invoker
set search_path = ''
as $function$
  select tedvio_private.accept_required_legal_v21(p_source);
$function$;

revoke all on function public.tedvio_accept_required_legal_v21(text)
  from public, anon;
grant execute on function public.tedvio_accept_required_legal_v21(text)
  to authenticated;

commit;
