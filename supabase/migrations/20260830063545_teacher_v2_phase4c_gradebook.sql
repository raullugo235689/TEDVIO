-- TEDVIO 2.0 · Etapa 4C · Libro de calificaciones
-- Configuración ponderada, captura masiva, vínculo OMR y trazabilidad sin eliminación física.

alter table public.v2_paper_exam_results
  add column if not exists archive_reason text;

alter table public.v2_grade_categories
  add column if not exists updated_at timestamptz not null default now();

alter table public.v2_grade_items
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists source_type text not null default 'manual',
  add column if not exists source_id uuid;

alter table public.v2_grade_scores
  add column if not exists source_type text not null default 'manual',
  add column if not exists source_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='v2_grade_items_source_type_check'
      and conrelid='public.v2_grade_items'::regclass
  ) then
    alter table public.v2_grade_items
      add constraint v2_grade_items_source_type_check
      check (source_type in ('manual','omr','assignment'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='v2_grade_scores_source_type_check'
      and conrelid='public.v2_grade_scores'::regclass
  ) then
    alter table public.v2_grade_scores
      add constraint v2_grade_scores_source_type_check
      check (source_type in ('manual','omr','assignment'));
  end if;
end $$;

create unique index if not exists v2_grade_items_source_unique
  on public.v2_grade_items(teacher_id,source_type,source_id)
  where source_id is not null;

create unique index if not exists v2_grade_categories_normalized_name_unique
  on public.v2_grade_categories(group_id,lower(btrim(name)));

create index if not exists v2_grade_items_group_period_idx
  on public.v2_grade_items(teacher_id,group_id,period_id,item_date);

create index if not exists v2_grade_scores_teacher_item_idx
  on public.v2_grade_scores(teacher_id,item_id,student_id);

create table if not exists public.v2_gradebook_revisions (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null,
  group_id uuid not null references public.v2_groups(id) on delete restrict,
  period_id uuid references public.v2_academic_periods(id) on delete restrict,
  entity_type text not null check (entity_type in ('category','item','score')),
  entity_id uuid not null,
  action text not null check (action in ('insert','update')),
  before_state jsonb,
  after_state jsonb not null,
  reason text,
  created_at timestamptz not null default now(),
  constraint v2_gradebook_revisions_before_check check (before_state is null or jsonb_typeof(before_state)='object'),
  constraint v2_gradebook_revisions_after_check check (jsonb_typeof(after_state)='object')
);

create index if not exists v2_gradebook_revisions_owner_idx
  on public.v2_gradebook_revisions(teacher_id,group_id,created_at desc);
create index if not exists v2_gradebook_revisions_entity_idx
  on public.v2_gradebook_revisions(entity_type,entity_id,created_at desc);

alter table public.v2_gradebook_revisions enable row level security;

drop policy if exists v2_gradebook_revisions_owner_select on public.v2_gradebook_revisions;
create policy v2_gradebook_revisions_owner_select
on public.v2_gradebook_revisions
for select
to authenticated
using (
  teacher_id=(select auth.uid())
  and exists (
    select 1 from public.v2_groups g
    where g.id=v2_gradebook_revisions.group_id
      and g.teacher_id=(select auth.uid())
  )
);

revoke all on public.v2_gradebook_revisions from public,anon,authenticated;
grant select on public.v2_gradebook_revisions to authenticated;

create or replace function tedvio_private.touch_gradebook_updated_at()
returns trigger
language plpgsql
security definer
set search_path=public,tedvio_private,pg_temp
as $$
begin
  new.updated_at:=now();
  return new;
end;
$$;

revoke all on function tedvio_private.touch_gradebook_updated_at() from public,anon,authenticated;

drop trigger if exists trg_v2_grade_categories_touch on public.v2_grade_categories;
create trigger trg_v2_grade_categories_touch
before update on public.v2_grade_categories
for each row execute function tedvio_private.touch_gradebook_updated_at();

drop trigger if exists trg_v2_grade_items_touch on public.v2_grade_items;
create trigger trg_v2_grade_items_touch
before update on public.v2_grade_items
for each row execute function tedvio_private.touch_gradebook_updated_at();

create or replace function tedvio_private.capture_gradebook_revision()
returns trigger
language plpgsql
security definer
set search_path=public,tedvio_private,pg_temp
as $$
declare
  entity_kind text;
  entity_uuid uuid;
  owner_uuid uuid;
  group_uuid uuid;
  period_uuid uuid;
  reason_value text:=nullif(current_setting('tedvio.gradebook_reason',true),'');
begin
  if tg_op='UPDATE' and to_jsonb(old) is not distinct from to_jsonb(new) then
    return new;
  end if;

  if tg_table_name='v2_grade_categories' then
    entity_kind:='category';
    entity_uuid:=new.id;
    owner_uuid:=new.teacher_id;
    group_uuid:=new.group_id;
    period_uuid:=null;
  elsif tg_table_name='v2_grade_items' then
    entity_kind:='item';
    entity_uuid:=new.id;
    owner_uuid:=new.teacher_id;
    group_uuid:=new.group_id;
    period_uuid:=new.period_id;
  elsif tg_table_name='v2_grade_scores' then
    entity_kind:='score';
    entity_uuid:=new.id;
    owner_uuid:=new.teacher_id;
    select i.group_id,i.period_id into group_uuid,period_uuid
      from public.v2_grade_items i where i.id=new.item_id;
  else
    return new;
  end if;

  insert into public.v2_gradebook_revisions(
    teacher_id,group_id,period_id,entity_type,entity_id,action,before_state,after_state,reason
  ) values (
    owner_uuid,group_uuid,period_uuid,entity_kind,entity_uuid,lower(tg_op),
    case when tg_op='UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new),reason_value
  );
  return new;
end;
$$;

revoke all on function tedvio_private.capture_gradebook_revision() from public,anon,authenticated;

drop trigger if exists trg_v2_grade_categories_revision on public.v2_grade_categories;
create trigger trg_v2_grade_categories_revision
after insert or update on public.v2_grade_categories
for each row execute function tedvio_private.capture_gradebook_revision();

drop trigger if exists trg_v2_grade_items_revision on public.v2_grade_items;
create trigger trg_v2_grade_items_revision
after insert or update on public.v2_grade_items
for each row execute function tedvio_private.capture_gradebook_revision();

drop trigger if exists trg_v2_grade_scores_revision on public.v2_grade_scores;
create trigger trg_v2_grade_scores_revision
after insert or update on public.v2_grade_scores
for each row execute function tedvio_private.capture_gradebook_revision();

revoke all on public.v2_grade_categories from anon;
revoke all on public.v2_grade_items from anon;
revoke all on public.v2_grade_scores from anon;
revoke delete,truncate,references,trigger on public.v2_grade_categories from authenticated;
revoke delete,truncate,references,trigger on public.v2_grade_items from authenticated;
revoke delete,truncate,references,trigger on public.v2_grade_scores from authenticated;
grant select,insert,update on public.v2_grade_categories to authenticated;
grant select,insert,update on public.v2_grade_items to authenticated;
grant select,insert,update on public.v2_grade_scores to authenticated;

create or replace function public.v2_gradebook_ensure_defaults(p_group_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  actor uuid:=auth.uid();
  result jsonb;
begin
  if actor is null then raise exception 'Sesión docente requerida.'; end if;
  if not exists(select 1 from public.v2_groups g where g.id=p_group_id and g.teacher_id=actor) then
    raise exception 'Grupo no disponible.';
  end if;
  if not exists(select 1 from public.v2_grade_categories c where c.group_id=p_group_id and c.teacher_id=actor) then
    perform set_config('tedvio.gradebook_reason','Estructura inicial del Libro',true);
    insert into public.v2_grade_categories(group_id,teacher_id,name,kind,weight)
    values
      (p_group_id,actor,'Exámenes OMR','omr',40),
      (p_group_id,actor,'Actividades','manual',30),
      (p_group_id,actor,'Prácticas','manual',20),
      (p_group_id,actor,'Asistencia','attendance',10);
  end if;
  select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at,c.name),'[]'::jsonb) into result
  from public.v2_grade_categories c where c.group_id=p_group_id and c.teacher_id=actor;
  return result;
end;
$$;

create or replace function public.v2_gradebook_save_categories(p_group_id uuid,p_categories jsonb,p_reason text default null)
returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  actor uuid:=auth.uid();
  row_value jsonb;
  category_id uuid;
  category_name text;
  category_kind text;
  category_weight numeric;
  existing public.v2_grade_categories%rowtype;
  total_weight numeric;
  special_count integer;
  result jsonb;
begin
  if actor is null then raise exception 'Sesión docente requerida.'; end if;
  if not exists(select 1 from public.v2_groups g where g.id=p_group_id and g.teacher_id=actor) then raise exception 'Grupo no disponible.'; end if;
  if jsonb_typeof(p_categories)<>'array' or jsonb_array_length(p_categories)=0 or jsonb_array_length(p_categories)>12 then raise exception 'La configuración debe contener entre 1 y 12 categorías.'; end if;
  if exists(select 1 from (select lower(btrim(value->>'name')) normalized,count(*) n from jsonb_array_elements(p_categories) group by lower(btrim(value->>'name'))) duplicates where normalized='' or n>1) then raise exception 'Los nombres de categorías deben ser únicos y no pueden estar vacíos.'; end if;
  perform set_config('tedvio.gradebook_reason',coalesce(nullif(btrim(p_reason),''),'Configuración de ponderaciones'),true);
  for row_value in select value from jsonb_array_elements(p_categories)
  loop
    category_id:=nullif(row_value->>'id','')::uuid;
    category_name:=btrim(coalesce(row_value->>'name',''));
    category_kind:=lower(btrim(coalesce(row_value->>'kind','manual')));
    category_weight:=coalesce((row_value->>'weight')::numeric,0);
    if char_length(category_name) not between 1 and 80 then raise exception 'Cada categoría requiere un nombre de hasta 80 caracteres.'; end if;
    if category_kind not in ('manual','omr','attendance','live') then raise exception 'Tipo de categoría no válido.'; end if;
    if category_weight<0 or category_weight>100 then raise exception 'Cada ponderación debe estar entre 0 y 100.'; end if;
    if category_id is null then
      if category_kind<>'manual' and exists(select 1 from public.v2_grade_categories c where c.group_id=p_group_id and c.teacher_id=actor and c.kind=category_kind) then raise exception 'Solo puede existir una categoría % por grupo.',category_kind; end if;
      insert into public.v2_grade_categories(group_id,teacher_id,name,kind,weight) values(p_group_id,actor,category_name,category_kind,category_weight);
    else
      select * into existing from public.v2_grade_categories c where c.id=category_id and c.group_id=p_group_id and c.teacher_id=actor for update;
      if not found then raise exception 'Una categoría no pertenece a este grupo.'; end if;
      if existing.kind<>category_kind then raise exception 'El tipo de una categoría existente no se puede cambiar.'; end if;
      update public.v2_grade_categories set name=category_name,weight=category_weight where id=category_id and teacher_id=actor;
    end if;
  end loop;
  select coalesce(sum(c.weight),0) into total_weight from public.v2_grade_categories c where c.group_id=p_group_id and c.teacher_id=actor;
  if abs(total_weight-100)>.01 then raise exception 'Las ponderaciones del grupo suman % y deben sumar 100.',round(total_weight,2); end if;
  select count(*) into special_count from (select kind from public.v2_grade_categories where group_id=p_group_id and teacher_id=actor and kind in ('omr','attendance','live') group by kind having count(*)>1) duplicates;
  if special_count>0 then raise exception 'OMR, Asistencia y Participación solo pueden aparecer una vez.'; end if;
  select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at,c.name),'[]'::jsonb) into result from public.v2_grade_categories c where c.group_id=p_group_id and c.teacher_id=actor;
  return result;
end;
$$;

create or replace function public.v2_gradebook_save_item(p_item_id uuid,p_group_id uuid,p_category_id uuid,p_period_id uuid,p_title text,p_max_score numeric,p_item_date date,p_reason text default null)
returns public.v2_grade_items
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  actor uuid:=auth.uid();
  category_row public.v2_grade_categories%rowtype;
  existing public.v2_grade_items%rowtype;
  result public.v2_grade_items%rowtype;
  title_value text:=btrim(coalesce(p_title,''));
  max_value numeric:=coalesce(p_max_score,10);
begin
  if actor is null then raise exception 'Sesión docente requerida.'; end if;
  if not exists(select 1 from public.v2_groups g where g.id=p_group_id and g.teacher_id=actor) then raise exception 'Grupo no disponible.'; end if;
  select * into category_row from public.v2_grade_categories c where c.id=p_category_id and c.group_id=p_group_id and c.teacher_id=actor;
  if not found then raise exception 'Categoría no disponible.'; end if;
  if category_row.kind<>'manual' then raise exception 'Solo las categorías manuales admiten actividades capturables.'; end if;
  if char_length(title_value) not between 1 and 120 then raise exception 'La actividad requiere un título de hasta 120 caracteres.'; end if;
  if max_value<=0 or max_value>10000 then raise exception 'El puntaje máximo debe ser mayor que cero.'; end if;
  if p_item_date is null then raise exception 'La actividad requiere fecha.'; end if;
  perform public.v2_assert_period_link_open(p_period_id,actor,p_group_id);
  perform set_config('tedvio.gradebook_reason',coalesce(nullif(btrim(p_reason),''),'Edición de actividad manual'),true);
  if p_item_id is null then
    insert into public.v2_grade_items(group_id,teacher_id,category_id,title,max_score,item_date,period_id,source_type,source_id)
    values(p_group_id,actor,p_category_id,title_value,max_value,p_item_date,p_period_id,'manual',null) returning * into result;
  else
    select * into existing from public.v2_grade_items i where i.id=p_item_id and i.group_id=p_group_id and i.teacher_id=actor for update;
    if not found then raise exception 'Actividad no disponible.'; end if;
    if existing.source_type<>'manual' then raise exception 'Las evidencias sincronizadas no se editan como actividades manuales.'; end if;
    update public.v2_grade_items set category_id=p_category_id,title=title_value,max_score=max_value,item_date=p_item_date,period_id=p_period_id where id=p_item_id and teacher_id=actor returning * into result;
  end if;
  return result;
end;
$$;

create or replace function public.v2_gradebook_save_scores(p_item_id uuid,p_scores jsonb,p_reason text default null)
returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  actor uuid:=auth.uid();
  item_row public.v2_grade_items%rowtype;
  category_row public.v2_grade_categories%rowtype;
  row_value jsonb;
  student_uuid uuid;
  score_value numeric;
  note_value text;
  saved_count integer:=0;
begin
  if actor is null then raise exception 'Sesión docente requerida.'; end if;
  select * into item_row from public.v2_grade_items i where i.id=p_item_id and i.teacher_id=actor for update;
  if not found then raise exception 'Actividad no disponible.'; end if;
  select * into category_row from public.v2_grade_categories c where c.id=item_row.category_id and c.teacher_id=actor;
  if not found or category_row.kind<>'manual' or item_row.source_type<>'manual' then raise exception 'La captura manual no está disponible para esta evidencia.'; end if;
  perform public.v2_assert_period_link_open(item_row.period_id,actor,item_row.group_id);
  if jsonb_typeof(p_scores)<>'array' or jsonb_array_length(p_scores)>1000 then raise exception 'La captura masiva no tiene un formato válido.'; end if;
  if exists(select 1 from (select value->>'student_id' student_id,count(*) n from jsonb_array_elements(p_scores) group by value->>'student_id') duplicate where student_id is null or student_id='' or n>1) then raise exception 'Cada alumno debe aparecer una sola vez en la captura.'; end if;
  perform set_config('tedvio.gradebook_reason',coalesce(nullif(btrim(p_reason),''),'Captura masiva de calificaciones'),true);
  for row_value in select value from jsonb_array_elements(p_scores)
  loop
    student_uuid:=(row_value->>'student_id')::uuid;
    score_value:=case when row_value->'score' is null or row_value->'score'='null'::jsonb or nullif(row_value->>'score','') is null then null else (row_value->>'score')::numeric end;
    note_value:=nullif(left(btrim(coalesce(row_value->>'note','')),1000),'');
    if not exists(select 1 from public.v2_group_students s where s.id=student_uuid and s.group_id=item_row.group_id and s.teacher_id=actor) then raise exception 'Un alumno no pertenece al grupo.'; end if;
    if score_value is not null and (score_value<0 or score_value>item_row.max_score) then raise exception 'La calificación debe estar entre 0 y %.',item_row.max_score; end if;
    insert into public.v2_grade_scores(item_id,student_id,teacher_id,score,note,source_type,source_id,updated_at)
    values(item_row.id,student_uuid,actor,score_value,note_value,'manual',null,now())
    on conflict(item_id,student_id) do update set score=excluded.score,note=excluded.note,source_type='manual',source_id=null,updated_at=now()
    where v2_grade_scores.teacher_id=actor;
    saved_count:=saved_count+1;
  end loop;
  return jsonb_build_object('item_id',item_row.id,'saved',saved_count,'max_score',item_row.max_score);
end;
$$;

create or replace function public.v2_gradebook_link_omr(p_exam_id uuid,p_category_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  actor uuid:=auth.uid();
  exam_row public.v2_paper_exams%rowtype;
  category_row public.v2_grade_categories%rowtype;
  item_row public.v2_grade_items%rowtype;
  student_row public.v2_group_students%rowtype;
  result_row public.v2_paper_exam_results%rowtype;
  linked_count integer:=0;
  pending_count integer:=0;
  unmatched_count integer:=0;
begin
  if actor is null then raise exception 'Sesión docente requerida.'; end if;
  select * into exam_row from public.v2_paper_exams e where e.id=p_exam_id and e.teacher_id=actor for update;
  if not found then raise exception 'Evaluación no disponible.'; end if;
  if exam_row.group_id is null then raise exception 'Asigna la evaluación a un grupo antes de publicarla en el Libro.'; end if;
  if exam_row.status not in ('ready','closed') then raise exception 'La evaluación debe estar Lista o Cerrada.'; end if;
  perform public.v2_assert_period_link_open(exam_row.period_id,actor,exam_row.group_id);
  select * into category_row from public.v2_grade_categories c where c.id=p_category_id and c.group_id=exam_row.group_id and c.teacher_id=actor;
  if not found or category_row.kind<>'omr' then raise exception 'Selecciona la categoría OMR del grupo.'; end if;
  perform set_config('tedvio.gradebook_reason','Sincronización de evaluación OMR',true);
  select * into item_row from public.v2_grade_items i where i.teacher_id=actor and i.source_type='omr' and i.source_id=exam_row.id for update;
  if not found then
    insert into public.v2_grade_items(group_id,teacher_id,category_id,title,max_score,item_date,period_id,source_type,source_id)
    values(exam_row.group_id,actor,category_row.id,exam_row.title,exam_row.max_score,exam_row.exam_date,exam_row.period_id,'omr',exam_row.id) returning * into item_row;
  else
    update public.v2_grade_items set category_id=category_row.id,title=exam_row.title,max_score=exam_row.max_score,item_date=exam_row.exam_date,period_id=exam_row.period_id where id=item_row.id and teacher_id=actor returning * into item_row;
  end if;
  update public.v2_paper_exams set grade_item_id=item_row.id,updated_at=now() where id=exam_row.id and teacher_id=actor;
  for student_row in select * from public.v2_group_students s where s.teacher_id=actor and s.group_id=exam_row.group_id and s.active order by s.full_name
  loop
    select * into result_row from public.v2_paper_exam_results r
    where r.teacher_id=actor and r.exam_id=exam_row.id and r.archived_at is null and (r.reviewed or r.review_status='confirmed')
      and (r.student_id=student_row.id or (r.student_id is null and nullif(btrim(r.enrollment),'')=nullif(btrim(student_row.enrollment),'')))
    order by coalesce(r.reviewed_at,r.updated_at,r.created_at) desc limit 1;
    if found then
      insert into public.v2_grade_scores(item_id,student_id,teacher_id,score,note,source_type,source_id,updated_at)
      values(item_row.id,student_row.id,actor,result_row.score,format('OMR · Versión %s · %s aciertos',result_row.version,result_row.correct_count),'omr',result_row.id,now())
      on conflict(item_id,student_id) do update set score=excluded.score,note=excluded.note,source_type='omr',source_id=excluded.source_id,updated_at=now()
      where v2_grade_scores.teacher_id=actor;
      linked_count:=linked_count+1;
    else
      update public.v2_grade_scores set score=null,note='Sin resultado OMR confirmado',source_type='omr',source_id=null,updated_at=now()
      where item_id=item_row.id and student_id=student_row.id and teacher_id=actor;
    end if;
  end loop;
  select count(*) into pending_count from public.v2_paper_exam_results r where r.teacher_id=actor and r.exam_id=exam_row.id and r.archived_at is null and not (r.reviewed or r.review_status='confirmed');
  select count(*) into unmatched_count from public.v2_paper_exam_results r
  where r.teacher_id=actor and r.exam_id=exam_row.id and r.archived_at is null and (r.reviewed or r.review_status='confirmed')
    and not exists(select 1 from public.v2_group_students s where s.teacher_id=actor and s.group_id=exam_row.group_id and s.active and (r.student_id=s.id or (r.student_id is null and nullif(btrim(r.enrollment),'')=nullif(btrim(s.enrollment),''))));
  return jsonb_build_object('exam_id',exam_row.id,'grade_item_id',item_row.id,'linked',linked_count,'pending',pending_count,'unmatched',unmatched_count,'period_id',exam_row.period_id);
end;
$$;

create or replace function tedvio_private.sync_omr_result_to_gradebook()
returns trigger
language plpgsql
security definer
set search_path=public,tedvio_private,pg_temp
as $$
declare
  exam_row public.v2_paper_exams%rowtype;
  student_uuid uuid;
  previous_student uuid;
begin
  select * into exam_row from public.v2_paper_exams e where e.id=new.exam_id;
  if not found or exam_row.grade_item_id is null then return new; end if;
  if tg_op='UPDATE' then
    previous_student:=old.student_id;
    if previous_student is null and nullif(btrim(old.enrollment),'') is not null then
      select s.id into previous_student from public.v2_group_students s where s.teacher_id=old.teacher_id and s.group_id=exam_row.group_id and nullif(btrim(s.enrollment),'')=nullif(btrim(old.enrollment),'') limit 1;
    end if;
    if previous_student is not null and (new.archived_at is not null or not (new.reviewed or new.review_status='confirmed') or new.student_id is distinct from old.student_id or new.enrollment is distinct from old.enrollment) then
      update public.v2_grade_scores set score=null,note='Resultado OMR pendiente o archivado',source_id=null,updated_at=now()
      where item_id=exam_row.grade_item_id and student_id=previous_student and source_id=old.id;
    end if;
  end if;
  if new.archived_at is not null or not (new.reviewed or new.review_status='confirmed') then return new; end if;
  student_uuid:=new.student_id;
  if student_uuid is null and nullif(btrim(new.enrollment),'') is not null then
    select s.id into student_uuid from public.v2_group_students s where s.teacher_id=new.teacher_id and s.group_id=exam_row.group_id and s.active and nullif(btrim(s.enrollment),'')=nullif(btrim(new.enrollment),'') limit 1;
  end if;
  if student_uuid is null then return new; end if;
  perform set_config('tedvio.gradebook_reason','Actualización automática desde OMR',true);
  insert into public.v2_grade_scores(item_id,student_id,teacher_id,score,note,source_type,source_id,updated_at)
  values(exam_row.grade_item_id,student_uuid,new.teacher_id,new.score,format('OMR · Versión %s · %s aciertos',new.version,new.correct_count),'omr',new.id,now())
  on conflict(item_id,student_id) do update set score=excluded.score,note=excluded.note,source_type='omr',source_id=excluded.source_id,updated_at=now();
  return new;
end;
$$;

revoke all on function tedvio_private.sync_omr_result_to_gradebook() from public,anon,authenticated;
drop trigger if exists trg_v2_paper_result_gradebook_sync on public.v2_paper_exam_results;
create trigger trg_v2_paper_result_gradebook_sync after insert or update on public.v2_paper_exam_results for each row execute function tedvio_private.sync_omr_result_to_gradebook();

do $patchblock$
declare
  ddl text;
  patched text;
begin
  ddl:=pg_get_functiondef('public.v2_teacher_academic_period_summary(uuid)'::regprocedure);
  patched:=ddl;
  patched:=replace(patched,$$when c.kind='omr' then exists(select 1 from public.v2_paper_exams e join public.v2_paper_exam_results r on r.exam_id=e.id and r.teacher_id=p.teacher_id where e.teacher_id=p.teacher_id and e.period_id=p.id)$$,$$when c.kind='omr' then exists(select 1 from public.v2_paper_exams e join public.v2_paper_exam_results r on r.exam_id=e.id and r.teacher_id=p.teacher_id where e.teacher_id=p.teacher_id and e.period_id=p.id and e.status in ('ready','closed') and r.archived_at is null and (r.reviewed or r.review_status='confirmed'))$$);
  patched:=replace(patched,$$select count(*) into exam_count from public.v2_paper_exams e where e.teacher_id=p.teacher_id and e.group_id=p.group_id and e.period_id=p.id;$$,$$select count(*) into exam_count from public.v2_paper_exams e where e.teacher_id=p.teacher_id and e.group_id=p.group_id and e.period_id=p.id and e.status in ('ready','closed');$$);
  patched:=replace(patched,$$    where r.teacher_id=p.teacher_id;

  select count(*) into live_sessions$$,$$    where r.teacher_id=p.teacher_id and r.archived_at is null and (r.reviewed or r.review_status='confirmed');

  select count(*) into live_sessions$$);
  patched:=replace(patched,$$          where r.teacher_id=p.teacher_id and (r.student_id=st.id or (r.student_id is null and nullif(btrim(r.enrollment),'')=nullif(btrim(st.enrollment),'')))$$,$$          where r.teacher_id=p.teacher_id and r.archived_at is null and (r.reviewed or r.review_status='confirmed') and (r.student_id=st.id or (r.student_id is null and nullif(btrim(r.enrollment),'')=nullif(btrim(st.enrollment),'')))$$);
  if patched=ddl then raise exception 'No fue posible actualizar el resumen de periodos para OMR confirmado.'; end if;
  execute patched;
end $patchblock$;

revoke all on function public.v2_gradebook_ensure_defaults(uuid) from public,anon;
revoke all on function public.v2_gradebook_save_categories(uuid,jsonb,text) from public,anon;
revoke all on function public.v2_gradebook_save_item(uuid,uuid,uuid,uuid,text,numeric,date,text) from public,anon;
revoke all on function public.v2_gradebook_save_scores(uuid,jsonb,text) from public,anon;
revoke all on function public.v2_gradebook_link_omr(uuid,uuid) from public,anon;
grant execute on function public.v2_gradebook_ensure_defaults(uuid) to authenticated;
grant execute on function public.v2_gradebook_save_categories(uuid,jsonb,text) to authenticated;
grant execute on function public.v2_gradebook_save_item(uuid,uuid,uuid,uuid,text,numeric,date,text) to authenticated;
grant execute on function public.v2_gradebook_save_scores(uuid,jsonb,text) to authenticated;
grant execute on function public.v2_gradebook_link_omr(uuid,uuid) to authenticated;

comment on table public.v2_gradebook_revisions is 'Immutable audit trail for category, item and score changes in TEDVIO gradebook.';
comment on function public.v2_gradebook_link_omr(uuid,uuid) is 'Creates or refreshes a traceable OMR grade item using confirmed, active results only.';
comment on function public.v2_gradebook_save_scores(uuid,jsonb,text) is 'Atomically validates and saves one manual grade item roster without deleting evidence.';
