-- TEDVIO 2.0 · Fase 5 · Periodos, Reportes y Configuración

create or replace function public.v2_save_academic_period_v2(
  p_period_id uuid,
  p_group_id uuid,
  p_name text,
  p_starts_on date,
  p_ends_on date,
  p_course_weight numeric,
  p_order_index integer
)
returns public.v2_academic_periods
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  current_row public.v2_academic_periods%rowtype;
  result_row public.v2_academic_periods%rowtype;
  normalized_name text := nullif(btrim(coalesce(p_name, '')), '');
begin
  if actor is null then raise exception 'Sesión docente requerida.'; end if;
  if normalized_name is null or char_length(normalized_name) > 80 then raise exception 'Escribe un nombre de periodo válido.'; end if;
  if p_starts_on is null or p_ends_on is null or p_ends_on < p_starts_on then raise exception 'El rango de fechas del periodo no es válido.'; end if;
  if coalesce(p_course_weight, -1) < 0 or p_course_weight > 100 then raise exception 'El peso del periodo debe estar entre 0 y 100.'; end if;
  if coalesce(p_order_index, 0) < 1 or p_order_index > 99 then raise exception 'El orden del periodo debe estar entre 1 y 99.'; end if;
  if not exists (select 1 from public.v2_groups g where g.id=p_group_id and g.teacher_id=actor) then raise exception 'El grupo no pertenece al docente autenticado.'; end if;

  if p_period_id is null then
    insert into public.v2_academic_periods(teacher_id,group_id,name,starts_on,ends_on,course_weight,order_index,status)
    values(actor,p_group_id,normalized_name,p_starts_on,p_ends_on,p_course_weight,p_order_index,'open')
    returning * into result_row;
  else
    select * into current_row from public.v2_academic_periods p
    where p.id=p_period_id and p.teacher_id=actor and p.group_id=p_group_id for update;
    if not found then raise exception 'Periodo académico no disponible.'; end if;
    if current_row.status='closed' then raise exception 'El periodo está cerrado. Reábrelo antes de editarlo.'; end if;
    update public.v2_academic_periods set
      name=normalized_name,starts_on=p_starts_on,ends_on=p_ends_on,
      course_weight=p_course_weight,order_index=p_order_index,updated_at=now()
    where id=current_row.id and teacher_id=actor returning * into result_row;
  end if;
  return result_row;
end;
$$;

create or replace function public.v2_create_period_template_v2(p_group_id uuid,p_starts_on date,p_ends_on date)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  actor uuid:=auth.uid(); total_days integer; i integer; start_day date; end_day date;
  names text[]:=array['Parcial 1','Parcial 2','Parcial 3','Final']; result_rows jsonb;
begin
  if actor is null then raise exception 'Sesión docente requerida.'; end if;
  if not exists(select 1 from public.v2_groups g where g.id=p_group_id and g.teacher_id=actor) then raise exception 'El grupo no pertenece al docente autenticado.'; end if;
  if p_starts_on is null or p_ends_on is null or p_ends_on<p_starts_on then raise exception 'El rango del curso no es válido.'; end if;
  total_days:=(p_ends_on-p_starts_on)+1;
  if total_days<8 then raise exception 'El rango debe contener al menos ocho días.'; end if;
  if exists(select 1 from public.v2_academic_periods p where p.group_id=p_group_id and p.teacher_id=actor) then raise exception 'La plantilla solo puede aplicarse antes de crear periodos.'; end if;
  for i in 0..3 loop
    start_day:=p_starts_on+floor((total_days::numeric*i)/4)::integer;
    end_day:=case when i=3 then p_ends_on else p_starts_on+floor((total_days::numeric*(i+1))/4)::integer-1 end;
    insert into public.v2_academic_periods(teacher_id,group_id,name,starts_on,ends_on,course_weight,order_index,status)
    values(actor,p_group_id,names[i+1],start_day,end_day,25,i+1,'open');
  end loop;
  select coalesce(jsonb_agg(to_jsonb(p) order by p.order_index),'[]'::jsonb) into result_rows
  from public.v2_academic_periods p where p.teacher_id=actor and p.group_id=p_group_id;
  return result_rows;
end;
$$;

create or replace function public.v2_delete_academic_period_v2(p_period_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare actor uuid:=auth.uid(); period_row public.v2_academic_periods%rowtype;
begin
  if actor is null then raise exception 'Sesión docente requerida.'; end if;
  select * into period_row from public.v2_academic_periods p where p.id=p_period_id and p.teacher_id=actor for update;
  if not found then raise exception 'Periodo académico no disponible.'; end if;
  if period_row.status='closed' then raise exception 'No se puede eliminar un periodo cerrado.'; end if;
  delete from public.v2_academic_periods where id=period_row.id and teacher_id=actor;
  return true;
end;
$$;

alter table public.profiles enable row level security;
drop policy if exists profiles_self_insert on public.profiles;
create policy profiles_self_insert on public.profiles for insert to authenticated with check(id=(select auth.uid()));

create or replace function public.v2_save_teacher_profile_settings(
  p_display_name text,p_institution text,p_educational_program text,p_default_group uuid
)
returns public.profiles
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare actor uuid:=auth.uid(); result_row public.profiles%rowtype; display_value text:=nullif(btrim(coalesce(p_display_name,'')),'');
begin
  if actor is null then raise exception 'Sesión docente requerida.'; end if;
  if display_value is not null and char_length(display_value)>120 then raise exception 'El nombre mostrado es demasiado largo.'; end if;
  if p_default_group is not null and not exists(select 1 from public.v2_groups g where g.id=p_default_group and g.teacher_id=actor) then raise exception 'El grupo predeterminado no pertenece al docente autenticado.'; end if;
  insert into public.profiles(id,display_name,institution,educational_program,default_group)
  values(actor,display_value,nullif(btrim(coalesce(p_institution,'')),''),nullif(btrim(coalesce(p_educational_program,'')),''),p_default_group::text)
  on conflict(id) do update set display_name=excluded.display_name,institution=excluded.institution,educational_program=excluded.educational_program,default_group=excluded.default_group
  returning * into result_row;
  return result_row;
end;
$$;

create or replace function public.v2_save_group_alert_settings_v2(p_group_id uuid,p_min_attendance numeric,p_min_grade numeric)
returns public.v2_group_alert_settings
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare actor uuid:=auth.uid(); result_row public.v2_group_alert_settings%rowtype;
begin
  if actor is null then raise exception 'Sesión docente requerida.'; end if;
  if not exists(select 1 from public.v2_groups g where g.id=p_group_id and g.teacher_id=actor) then raise exception 'El grupo no pertenece al docente autenticado.'; end if;
  if p_min_attendance<0 or p_min_attendance>100 then raise exception 'El umbral de asistencia debe estar entre 0 y 100.'; end if;
  if p_min_grade<0 or p_min_grade>10 then raise exception 'El umbral de calificación debe estar entre 0 y 10.'; end if;
  insert into public.v2_group_alert_settings(group_id,teacher_id,min_attendance,min_grade,updated_at)
  values(p_group_id,actor,p_min_attendance,p_min_grade,now())
  on conflict(group_id) do update set teacher_id=actor,min_attendance=excluded.min_attendance,min_grade=excluded.min_grade,updated_at=now()
  where public.v2_group_alert_settings.teacher_id=actor returning * into result_row;
  if result_row.group_id is null then raise exception 'No se pudo guardar la configuración del grupo.'; end if;
  return result_row;
end;
$$;

revoke all on function public.v2_save_academic_period_v2(uuid,uuid,text,date,date,numeric,integer) from public;
revoke all on function public.v2_save_academic_period_v2(uuid,uuid,text,date,date,numeric,integer) from anon;
grant execute on function public.v2_save_academic_period_v2(uuid,uuid,text,date,date,numeric,integer) to authenticated;
revoke all on function public.v2_create_period_template_v2(uuid,date,date) from public;
revoke all on function public.v2_create_period_template_v2(uuid,date,date) from anon;
grant execute on function public.v2_create_period_template_v2(uuid,date,date) to authenticated;
revoke all on function public.v2_delete_academic_period_v2(uuid) from public;
revoke all on function public.v2_delete_academic_period_v2(uuid) from anon;
grant execute on function public.v2_delete_academic_period_v2(uuid) to authenticated;
revoke all on function public.v2_save_teacher_profile_settings(text,text,text,uuid) from public;
revoke all on function public.v2_save_teacher_profile_settings(text,text,text,uuid) from anon;
grant execute on function public.v2_save_teacher_profile_settings(text,text,text,uuid) to authenticated;
revoke all on function public.v2_save_group_alert_settings_v2(uuid,numeric,numeric) from public;
revoke all on function public.v2_save_group_alert_settings_v2(uuid,numeric,numeric) from anon;
grant execute on function public.v2_save_group_alert_settings_v2(uuid,numeric,numeric) to authenticated;

revoke all on public.profiles from anon;
revoke delete,truncate,references,trigger on public.profiles from authenticated;
grant select,insert,update on public.profiles to authenticated;
revoke all on public.v2_group_alert_settings from anon;
revoke delete,truncate,references,trigger on public.v2_group_alert_settings from authenticated;
grant select,insert,update on public.v2_group_alert_settings to authenticated;
