alter table public.tedvio_institutions
  add column if not exists report_display_name text,
  add column if not exists report_logo_path text,
  add column if not exists report_title text not null default 'REGISTRO DE ASISTENCIA Y EVALUACIÓN',
  add column if not exists report_approver_name text,
  add column if not exists report_approver_title text,
  add column if not exists report_approval_label text not null default 'Vo. Bo.',
  add column if not exists report_document_code text;

create schema if not exists tedvio_private;

create or replace function tedvio_private.update_institution_branding_v6811(
  p_institution_id uuid,
  p_name text,
  p_report_logo_path text,
  p_report_title text,
  p_report_approver_name text,
  p_report_approver_title text,
  p_report_approval_label text,
  p_report_document_code text
) returns public.tedvio_institutions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.tedvio_institutions;
  v_existing_logo_path text;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (
    select 1 from public.tedvio_institution_memberships m
    where m.institution_id = p_institution_id
      and m.user_id = v_uid
      and m.status = 'active'
      and m.member_role = 'institution_admin'
  ) then raise exception 'INSTITUTION_ADMIN_REQUIRED'; end if;

  select i.report_logo_path into v_existing_logo_path
  from public.tedvio_institutions i
  where i.id = p_institution_id;

  if p_report_logo_path is not null
     and p_report_logo_path is distinct from v_existing_logo_path
     and p_report_logo_path !~ ('^' || v_uid::text || '/institution-branding/' || p_institution_id::text || '/[A-Za-z0-9._-]+$') then
    raise exception 'INVALID_LOGO_PATH';
  end if;

  update public.tedvio_institutions i set
    report_display_name = nullif(left(btrim(coalesce(p_name,'')),160),''),
    report_logo_path = nullif(btrim(coalesce(p_report_logo_path,'')),''),
    report_title = left(coalesce(nullif(btrim(coalesce(p_report_title,'')),''),'REGISTRO DE ASISTENCIA Y EVALUACIÓN'),160),
    report_approver_name = nullif(left(btrim(coalesce(p_report_approver_name,'')),160),''),
    report_approver_title = nullif(left(btrim(coalesce(p_report_approver_title,'')),160),''),
    report_approval_label = left(coalesce(nullif(btrim(coalesce(p_report_approval_label,'')),''),'Vo. Bo.'),80),
    report_document_code = nullif(left(btrim(coalesce(p_report_document_code,'')),80),'')
  where i.id = p_institution_id
  returning i.* into v_row;
  return v_row;
end $$;

create or replace function public.tedvio_update_institution_branding_v6811(
  p_institution_id uuid,
  p_name text,
  p_report_logo_path text default null,
  p_report_title text default 'REGISTRO DE ASISTENCIA Y EVALUACIÓN',
  p_report_approver_name text default null,
  p_report_approver_title text default null,
  p_report_approval_label text default 'Vo. Bo.',
  p_report_document_code text default null
) returns public.tedvio_institutions
language sql
security invoker
set search_path = public, tedvio_private, pg_temp
as $$
  select tedvio_private.update_institution_branding_v6811(
    p_institution_id,p_name,p_report_logo_path,p_report_title,
    p_report_approver_name,p_report_approver_title,p_report_approval_label,p_report_document_code
  );
$$;

revoke all on function tedvio_private.update_institution_branding_v6811(uuid,text,text,text,text,text,text,text) from public;
revoke execute on function tedvio_private.update_institution_branding_v6811(uuid,text,text,text,text,text,text,text) from anon;
grant execute on function tedvio_private.update_institution_branding_v6811(uuid,text,text,text,text,text,text,text) to authenticated;
revoke all on function public.tedvio_update_institution_branding_v6811(uuid,text,text,text,text,text,text,text) from public;
revoke execute on function public.tedvio_update_institution_branding_v6811(uuid,text,text,text,text,text,text,text) from anon;
grant execute on function public.tedvio_update_institution_branding_v6811(uuid,text,text,text,text,text,text,text) to authenticated;
