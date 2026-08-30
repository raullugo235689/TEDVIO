-- TEDVIO 2.0 · Etapa 4C · Libro de calificaciones
-- Unifica categorías, evidencias, captura masiva y publicación OMR sin eliminar historial.

create table if not exists public.v2_grade_categories (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid not null references public.v2_groups(id) on delete cascade,
  name text not null,
  weight numeric(6,2) not null default 0,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.v2_grade_categories
  add column if not exists teacher_id uuid,
  add column if not exists group_id uuid,
  add column if not exists name text,
  add column if not exists weight numeric(6,2) default 0,
  add column if not exists position integer default 0,
  add column if not exists period_id uuid,
  add column if not exists archived_at timestamptz,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create table if not exists public.v2_grade_items (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid not null references public.v2_groups(id) on delete cascade,
  category_id uuid references public.v2_grade_categories(id) on delete restrict,
  title text not null,
  name text,
  max_points numeric(8,2) not null default 10,
  max_score numeric(8,2),
  date date,
  item_date date,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.v2_grade_items
  add column if not exists teacher_id uuid,
  add column if not exists group_id uuid,
  add column if not exists category_id uuid,
  add column if not exists title text,
  add column if not exists name text,
  add column if not exists max_points numeric(8,2) default 10,
  add column if not exists max_score numeric(8,2),
  add column if not exists date date,
  add column if not exists item_date date,
  add column if not exists position integer default 0,
  add column if not exists period_id uuid,
  add column if not exists item_type text default 'manual',
  add column if not exists source_type text,
  add column if not exists source_id uuid,
  add column if not exists published_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create table if not exists public.v2_grades (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid not null references public.v2_groups(id) on delete cascade,
  item_id uuid not null references public.v2_grade_items(id) on delete restrict,
  student_id uuid not null references public.v2_group_students(id) on delete restrict,
  score numeric(8,2),
  value numeric(8,2),
  status text not null default 'graded',
  note text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.v2_grades
  add column if not exists teacher_id uuid,
  add column if not exists group_id uuid,
  add column if not exists item_id uuid,
  add column if not exists student_id uuid,
  add column if not exists score numeric(8,2),
  add column if not exists value numeric(8,2),
  add column if not exists status text default 'graded',
  add column if not exists note text,
  add column if not exists notes text,
  add column if not exists source_type text,
  add column if not exists source_id uuid,
  add column if not exists archived_at timestamptz,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.v2_grade_categories
set weight=coalesce(weight,0), position=coalesce(position,0), updated_at=coalesce(updated_at,created_at,now())
where weight is null or position is null or updated_at is null;

update public.v2_grade_items
set title=coalesce(nullif(btrim(title),''),nullif(btrim(name),''),'Actividad'),
    name=coalesce(nullif(btrim(name),''),nullif(btrim(title),''),'Actividad'),
    max_points=coalesce(nullif(max_points,0),nullif(max_score,0),10),
    max_score=coalesce(nullif(max_score,0),nullif(max_points,0),10),
    item_date=coalesce(item_date,date,created_at::date),
    date=coalesce(date,item_date,created_at::date),
    position=coalesce(position,0),
    item_type=coalesce(nullif(btrim(item_type),''),'manual'),
    updated_at=coalesce(updated_at,created_at,now())
where title is null or name is null or max_points is null or max_score is null
   or item_date is null or date is null or position is null or item_type is null or updated_at is null;

update public.v2_grades
set score=coalesce(score,value), value=coalesce(value,score),
    status=case when coalesce(status,'') in ('graded','missing','excused') then status when coalesce(score,value) is null then 'missing' else 'graded' end,
    note=coalesce(note,notes), notes=coalesce(notes,note), updated_at=coalesce(updated_at,created_at,now())
where score is null or value is null or status is null or updated_at is null;

update public.v2_grade_items i
set period_id=p.id
from public.v2_academic_periods p
where i.period_id is null and p.teacher_id=i.teacher_id and p.group_id=i.group_id
  and coalesce(i.item_date,i.date) between p.starts_on and p.ends_on
  and not exists (
    select 1 from public.v2_academic_periods other
    where other.teacher_id=i.teacher_id and other.group_id=i.group_id and other.id<>p.id
      and coalesce(i.item_date,i.date) between other.starts_on and other.ends_on
  );

create index if not exists v2_grade_categories_workspace_idx on public.v2_grade_categories(teacher_id,group_id,period_id,position) where archived_at is null;
create index if not exists v2_grade_items_workspace_idx on public.v2_grade_items(teacher_id,group_id,period_id,category_id,position) where archived_at is null;
create index if not exists v2_grades_workspace_idx on public.v2_grades(teacher_id,group_id,item_id,student_id,updated_at desc) where archived_at is null;
create index if not exists v2_grade_items_source_idx on public.v2_grade_items(teacher_id,source_type,source_id) where archived_at is null and source_id is not null;
create index if not exists v2_grades_source_idx on public.v2_grades(teacher_id,source_type,source_id) where archived_at is null and source_id is not null;

create table if not exists public.v2_grade_revisions (
  id uuid primary key default gen_random_uuid(),
  grade_id uuid not null references public.v2_grades(id) on delete restrict,
  item_id uuid not null,
  student_id uuid not null,
  teacher_id uuid not null,
  revision_no integer not null,
  snapshot jsonb not null,
  reason text,
  created_at timestamptz not null default now(),
  constraint v2_grade_revisions_snapshot_check check (jsonb_typeof(snapshot)='object'),
  constraint v2_grade_revisions_number_check check (revision_no>0),
  constraint v2_grade_revisions_unique unique(grade_id,revision_no)
);
create index if not exists v2_grade_revisions_owner_idx on public.v2_grade_revisions(teacher_id,grade_id,revision_no desc);

alter table public.v2_grade_categories enable row level security;
alter table public.v2_grade_items enable row level security;
alter table public.v2_grades enable row level security;
alter table public.v2_grade_revisions enable row level security;

drop policy if exists v2_grade_categories_teacher_v2_select on public.v2_grade_categories;
create policy v2_grade_categories_teacher_v2_select on public.v2_grade_categories for select to authenticated
using (teacher_id=(select auth.uid()) and exists(select 1 from public.v2_groups g where g.id=group_id and g.teacher_id=(select auth.uid())));
drop policy if exists v2_grade_categories_teacher_v2_insert on public.v2_grade_categories;
create policy v2_grade_categories_teacher_v2_insert on public.v2_grade_categories for insert to authenticated
with check (teacher_id=(select auth.uid()) and exists(select 1 from public.v2_groups g where g.id=group_id and g.teacher_id=(select auth.uid())));
drop policy if exists v2_grade_categories_teacher_v2_update on public.v2_grade_categories;
create policy v2_grade_categories_teacher_v2_update on public.v2_grade_categories for update to authenticated
using (teacher_id=(select auth.uid()))
with check (teacher_id=(select auth.uid()) and exists(select 1 from public.v2_groups g where g.id=group_id and g.teacher_id=(select auth.uid())));

drop policy if exists v2_grade_items_teacher_v2_select on public.v2_grade_items;
create policy v2_grade_items_teacher_v2_select on public.v2_grade_items for select to authenticated
using (teacher_id=(select auth.uid()) and exists(select 1 from public.v2_groups g where g.id=group_id and g.teacher_id=(select auth.uid())));
drop policy if exists v2_grade_items_teacher_v2_insert on public.v2_grade_items;
create policy v2_grade_items_teacher_v2_insert on public.v2_grade_items for insert to authenticated
with check (
  teacher_id=(select auth.uid()) and exists(select 1 from public.v2_groups g where g.id=group_id and g.teacher_id=(select auth.uid()))
  and (category_id is null or exists(select 1 from public.v2_grade_categories c where c.id=category_id and c.teacher_id=(select auth.uid()) and c.group_id=group_id))
);
drop policy if exists v2_grade_items_teacher_v2_update on public.v2_grade_items;
create policy v2_grade_items_teacher_v2_update on public.v2_grade_items for update to authenticated
using (teacher_id=(select auth.uid()))
with check (teacher_id=(select auth.uid()) and exists(select 1 from public.v2_groups g where g.id=group_id and g.teacher_id=(select auth.uid())));

drop policy if exists v2_grades_teacher_v2_select on public.v2_grades;
create policy v2_grades_teacher_v2_select on public.v2_grades for select to authenticated
using (teacher_id=(select auth.uid()) and exists(select 1 from public.v2_grade_items i where i.id=item_id and i.teacher_id=(select auth.uid())));
drop policy if exists v2_grades_teacher_v2_insert on public.v2_grades;
create policy v2_grades_teacher_v2_insert on public.v2_grades for insert to authenticated
with check (
  teacher_id=(select auth.uid())
  and exists(select 1 from public.v2_grade_items i where i.id=item_id and i.teacher_id=(select auth.uid()) and i.group_id=group_id)
  and exists(select 1 from public.v2_group_students s where s.id=student_id and s.teacher_id=(select auth.uid()) and s.group_id=group_id)
);
drop policy if exists v2_grades_teacher_v2_update on public.v2_grades;
create policy v2_grades_teacher_v2_update on public.v2_grades for update to authenticated
using (teacher_id=(select auth.uid()))
with check (
  teacher_id=(select auth.uid())
  and exists(select 1 from public.v2_grade_items i where i.id=item_id and i.teacher_id=(select auth.uid()) and i.group_id=group_id)
  and exists(select 1 from public.v2_group_students s where s.id=student_id and s.teacher_id=(select auth.uid()) and s.group_id=group_id)
);

drop policy if exists v2_grade_revisions_teacher_v2_select on public.v2_grade_revisions;
create policy v2_grade_revisions_teacher_v2_select on public.v2_grade_revisions for select to authenticated using (teacher_id=(select auth.uid()));

revoke all on public.v2_grade_categories from anon;
revoke all on public.v2_grade_items from anon;
revoke all on public.v2_grades from anon;
revoke all on public.v2_grade_revisions from public,anon,authenticated;
grant select,insert,update on public.v2_grade_categories to authenticated;
grant select,insert,update on public.v2_grade_items to authenticated;
grant select,insert,update on public.v2_grades to authenticated;
grant select on public.v2_grade_revisions to authenticated;
revoke delete on public.v2_grade_categories from authenticated;
revoke delete on public.v2_grade_items from authenticated;
revoke delete on public.v2_grades from authenticated;

create or replace function tedvio_private.capture_grade_revision()
returns trigger language plpgsql security definer set search_path=public,tedvio_private,pg_temp as $$
declare next_revision integer; revision_reason text;
begin
  if old.score is not distinct from new.score and old.value is not distinct from new.value
     and old.status is not distinct from new.status and old.note is not distinct from new.note
     and old.notes is not distinct from new.notes and old.archived_at is not distinct from new.archived_at
     and old.item_id is not distinct from new.item_id and old.student_id is not distinct from new.student_id then return new; end if;
  select coalesce(max(revision_no),0)+1 into next_revision from public.v2_grade_revisions where grade_id=old.id;
  revision_reason:=nullif(current_setting('tedvio.grade_reason',true),'');
  insert into public.v2_grade_revisions(grade_id,item_id,student_id,teacher_id,revision_no,snapshot,reason)
  values(old.id,old.item_id,old.student_id,old.teacher_id,next_revision,to_jsonb(old),revision_reason);
  return new;
end; $$;
revoke all on function tedvio_private.capture_grade_revision() from public,anon,authenticated;
drop trigger if exists trg_v2_grade_revision on public.v2_grades;
create trigger trg_v2_grade_revision after update on public.v2_grades for each row execute function tedvio_private.capture_grade_revision();

create or replace function tedvio_private.prevent_grade_delete()
returns trigger language plpgsql security definer set search_path=public,tedvio_private,pg_temp as $$
begin raise exception 'Las calificaciones no se eliminan. Archiva la evidencia para conservar su historial.' using errcode='P0001'; end; $$;
revoke all on function tedvio_private.prevent_grade_delete() from public,anon,authenticated;
drop trigger if exists trg_v2_grade_no_delete on public.v2_grades;
create trigger trg_v2_grade_no_delete before delete on public.v2_grades for each row execute function tedvio_private.prevent_grade_delete();

create or replace function public.v2_gradebook_home()
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid();
begin
  if actor is null then raise exception 'Sesión docente requerida.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'group',to_jsonb(g),
      'active_students',(select count(*) from public.v2_group_students s where s.group_id=g.id and s.teacher_id=actor and s.active=true),
      'active_items',(select count(*) from public.v2_grade_items i where i.group_id=g.id and i.teacher_id=actor and i.archived_at is null),
      'captured_grades',(select count(*) from public.v2_grades gr where gr.group_id=g.id and gr.teacher_id=actor and gr.archived_at is null and gr.status='graded'),
      'open_period',(select to_jsonb(p) from public.v2_academic_periods p where p.group_id=g.id and p.teacher_id=actor and p.status='open' order by case when current_date between p.starts_on and p.ends_on then 0 else 1 end,p.order_index limit 1),
      'pending_omr',(select count(*) from public.v2_paper_exam_results r join public.v2_paper_exams e on e.id=r.exam_id where e.group_id=g.id and e.teacher_id=actor and r.teacher_id=actor and r.archived_at is null and not coalesce(r.reviewed,false))
    ) order by g.created_at desc) from public.v2_groups g where g.teacher_id=actor and coalesce(g.is_demo,false)=false
  ),'[]'::jsonb);
end; $$;

create or replace function public.v2_gradebook_workspace(p_group_id uuid,p_period_id uuid default null)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); selected_period_id uuid:=p_period_id; period_json jsonb; period_start date; period_end date;
begin
  if actor is null then raise exception 'Sesión docente requerida.'; end if;
  if not exists(select 1 from public.v2_groups g where g.id=p_group_id and g.teacher_id=actor) then raise exception 'No se encontró el grupo.'; end if;
  if selected_period_id is null then
    select p.id into selected_period_id from public.v2_academic_periods p
    where p.teacher_id=actor and p.group_id=p_group_id and p.status='open'
    order by case when current_date between p.starts_on and p.ends_on then 0 else 1 end,p.order_index limit 1;
  end if;
  if selected_period_id is not null then
    select to_jsonb(p),p.starts_on,p.ends_on into period_json,period_start,period_end
    from public.v2_academic_periods p where p.id=selected_period_id and p.teacher_id=actor and p.group_id=p_group_id;
    if period_json is null then raise exception 'El periodo no pertenece al grupo.'; end if;
  end if;
  return jsonb_build_object(
    'group',(select to_jsonb(g) from public.v2_groups g where g.id=p_group_id and g.teacher_id=actor),
    'period',period_json,
    'periods',coalesce((select jsonb_agg(to_jsonb(p) order by p.order_index) from public.v2_academic_periods p where p.teacher_id=actor and p.group_id=p_group_id),'[]'::jsonb),
    'students',coalesce((select jsonb_agg(to_jsonb(s) order by s.full_name) from public.v2_group_students s where s.teacher_id=actor and s.group_id=p_group_id and s.active=true),'[]'::jsonb),
    'categories',coalesce((select jsonb_agg(to_jsonb(c) order by c.position,c.created_at) from public.v2_grade_categories c
      where c.teacher_id=actor and c.group_id=p_group_id and c.archived_at is null
        and (selected_period_id is null and c.period_id is null or selected_period_id is not null and (c.period_id=selected_period_id or c.period_id is null))),'[]'::jsonb),
    'items',coalesce((select jsonb_agg(to_jsonb(i) order by i.position,coalesce(i.item_date,i.date),i.created_at) from public.v2_grade_items i
      where i.teacher_id=actor and i.group_id=p_group_id and i.archived_at is null
        and (selected_period_id is null and i.period_id is null or selected_period_id is not null and (i.period_id=selected_period_id or i.period_id is null and coalesce(i.item_date,i.date) between period_start and period_end))),'[]'::jsonb),
    'grades',coalesce((select jsonb_agg(to_jsonb(gr) order by gr.updated_at) from public.v2_grades gr join public.v2_grade_items i on i.id=gr.item_id
      where gr.teacher_id=actor and gr.group_id=p_group_id and gr.archived_at is null and i.teacher_id=actor and i.archived_at is null
        and (selected_period_id is null and i.period_id is null or selected_period_id is not null and (i.period_id=selected_period_id or i.period_id is null and coalesce(i.item_date,i.date) between period_start and period_end))),'[]'::jsonb),
    'revisions',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc) from public.v2_grade_revisions r join public.v2_grade_items i on i.id=r.item_id where r.teacher_id=actor and i.group_id=p_group_id),'[]'::jsonb),
    'omr_exams',coalesce((select jsonb_agg(jsonb_build_object(
      'id',e.id,'title',e.title,'subject',e.subject,'exam_date',e.exam_date,'status',e.status,'period_id',e.period_id,'grade_item_id',e.grade_item_id,
      'confirmed',(select count(*) from public.v2_paper_exam_results r where r.exam_id=e.id and r.teacher_id=actor and r.archived_at is null and (r.review_status='confirmed' or r.reviewed=true) and r.student_id is not null),
      'pending',(select count(*) from public.v2_paper_exam_results r where r.exam_id=e.id and r.teacher_id=actor and r.archived_at is null and not (r.review_status='confirmed' or r.reviewed=true)),
      'unidentified',(select count(*) from public.v2_paper_exam_results r where r.exam_id=e.id and r.teacher_id=actor and r.archived_at is null and (r.review_status='confirmed' or r.reviewed=true) and r.student_id is null)
    ) order by e.exam_date desc,e.updated_at desc) from public.v2_paper_exams e
      where e.teacher_id=actor and e.group_id=p_group_id and e.status in ('ready','closed') and e.archived_at is null
        and (selected_period_id is null or e.period_id=selected_period_id or e.period_id is null and e.exam_date between period_start and period_end)),'[]'::jsonb)
  );
end; $$;

create or replace function public.v2_upsert_grade_category(p_category_id uuid,p_group_id uuid,p_period_id uuid,p_name text,p_weight numeric,p_position integer,p_archived boolean default false)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); category_row public.v2_grade_categories%rowtype; period_status text; other_weight numeric;
begin
  if actor is null then raise exception 'Sesión docente requerida.'; end if;
  if not exists(select 1 from public.v2_groups g where g.id=p_group_id and g.teacher_id=actor) then raise exception 'No se encontró el grupo.'; end if;
  if p_period_id is not null then
    select status into period_status from public.v2_academic_periods where id=p_period_id and teacher_id=actor and group_id=p_group_id;
    if period_status is null then raise exception 'El periodo no pertenece al grupo.'; end if;
    if period_status='closed' then raise exception 'El periodo está cerrado. Reábrelo antes de modificar el Libro.'; end if;
  end if;
  if nullif(btrim(p_name),'') is null then raise exception 'Escribe el nombre de la categoría.'; end if;
  if coalesce(p_weight,0)<0 or coalesce(p_weight,0)>100 then raise exception 'La ponderación debe estar entre 0 y 100.'; end if;
  select coalesce(sum(coalesce(weight,0)),0) into other_weight from public.v2_grade_categories c
  where c.teacher_id=actor and c.group_id=p_group_id and c.archived_at is null and c.id is distinct from p_category_id and c.period_id is not distinct from p_period_id;
  if other_weight+coalesce(p_weight,0)>100.001 then raise exception 'Las categorías excederían el 100%% del periodo.'; end if;
  if p_category_id is null then
    insert into public.v2_grade_categories(teacher_id,group_id,period_id,name,weight,position,archived_at,created_at,updated_at)
    values(actor,p_group_id,p_period_id,btrim(p_name),round(coalesce(p_weight,0),2),greatest(0,coalesce(p_position,0)),case when p_archived then now() else null end,now(),now()) returning * into category_row;
  else
    update public.v2_grade_categories set name=btrim(p_name),weight=round(coalesce(p_weight,0),2),position=greatest(0,coalesce(p_position,0)),archived_at=case when p_archived then coalesce(archived_at,now()) else null end,updated_at=now()
    where id=p_category_id and teacher_id=actor and group_id=p_group_id returning * into category_row;
    if category_row.id is null then raise exception 'No se encontró la categoría.'; end if;
  end if;
  return to_jsonb(category_row);
end; $$;

create or replace function public.v2_upsert_grade_item(p_item_id uuid,p_group_id uuid,p_period_id uuid,p_category_id uuid,p_title text,p_max_score numeric,p_item_date date,p_item_type text,p_position integer,p_archived boolean default false)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); item_row public.v2_grade_items%rowtype; period_status text; category_period uuid; type_value text:=lower(btrim(coalesce(p_item_type,'manual')));
begin
  if actor is null then raise exception 'Sesión docente requerida.'; end if;
  if not exists(select 1 from public.v2_groups g where g.id=p_group_id and g.teacher_id=actor) then raise exception 'No se encontró el grupo.'; end if;
  if p_period_id is not null then
    select status into period_status from public.v2_academic_periods where id=p_period_id and teacher_id=actor and group_id=p_group_id;
    if period_status is null then raise exception 'El periodo no pertenece al grupo.'; end if;
    if period_status='closed' then raise exception 'El periodo está cerrado. Reábrelo antes de modificar evidencias.'; end if;
  end if;
  if p_category_id is null then raise exception 'Selecciona una categoría.'; end if;
  select period_id into category_period from public.v2_grade_categories where id=p_category_id and teacher_id=actor and group_id=p_group_id and archived_at is null;
  if not found then raise exception 'La categoría no está disponible.'; end if;
  if category_period is not null and category_period is distinct from p_period_id then raise exception 'La categoría pertenece a otro periodo.'; end if;
  if nullif(btrim(p_title),'') is null then raise exception 'Escribe el nombre de la evidencia.'; end if;
  if coalesce(p_max_score,0)<=0 or coalesce(p_max_score,0)>1000 then raise exception 'El puntaje máximo no es válido.'; end if;
  if type_value not in ('manual','omr','assignment','attendance') then raise exception 'Tipo de evidencia no válido.'; end if;
  if p_item_id is null then
    insert into public.v2_grade_items(teacher_id,group_id,period_id,category_id,title,name,max_points,max_score,date,item_date,item_type,position,archived_at,created_at,updated_at)
    values(actor,p_group_id,p_period_id,p_category_id,btrim(p_title),btrim(p_title),round(p_max_score,2),round(p_max_score,2),coalesce(p_item_date,current_date),coalesce(p_item_date,current_date),type_value,greatest(0,coalesce(p_position,0)),case when p_archived then now() else null end,now(),now()) returning * into item_row;
  else
    update public.v2_grade_items set category_id=p_category_id,period_id=p_period_id,title=btrim(p_title),name=btrim(p_title),max_points=round(p_max_score,2),max_score=round(p_max_score,2),date=coalesce(p_item_date,date,current_date),item_date=coalesce(p_item_date,item_date,current_date),item_type=type_value,position=greatest(0,coalesce(p_position,0)),archived_at=case when p_archived then coalesce(archived_at,now()) else null end,updated_at=now()
    where id=p_item_id and teacher_id=actor and group_id=p_group_id and source_type is distinct from 'paper_exam' returning * into item_row;
    if item_row.id is null then raise exception 'No se encontró la evidencia o está administrada por OMR.'; end if;
  end if;
  return to_jsonb(item_row);
end; $$;

create or replace function public.v2_save_grade_batch(p_item_id uuid,p_entries jsonb,p_reason text default null)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); item_row public.v2_grade_items%rowtype; entry jsonb; student_value uuid; score_value numeric; status_value text; note_value text; grade_row public.v2_grades%rowtype; changed integer:=0; period_status text;
begin
  if actor is null then raise exception 'Sesión docente requerida.'; end if;
  if jsonb_typeof(p_entries)<>'array' then raise exception 'Las calificaciones deben enviarse como una lista.'; end if;
  if jsonb_array_length(p_entries)>500 then raise exception 'La captura excede 500 alumnos.'; end if;
  select * into item_row from public.v2_grade_items where id=p_item_id and teacher_id=actor and archived_at is null for update;
  if not found then raise exception 'No se encontró la evidencia.'; end if;
  if item_row.period_id is not null then
    select status into period_status from public.v2_academic_periods where id=item_row.period_id and teacher_id=actor and group_id=item_row.group_id;
    if period_status='closed' then raise exception 'El periodo está cerrado. Reábrelo antes de modificar calificaciones.'; end if;
  end if;
  perform set_config('tedvio.grade_reason',coalesce(nullif(btrim(p_reason),''),'Captura manual del Libro'),true);
  for entry in select value from jsonb_array_elements(p_entries) loop
    student_value:=nullif(entry->>'student_id','')::uuid;
    status_value:=lower(coalesce(nullif(btrim(entry->>'status'),''),'graded'));
    note_value:=nullif(btrim(coalesce(entry->>'note','')),'');
    if status_value not in ('graded','missing','excused') then raise exception 'Estado de calificación no válido.'; end if;
    if not exists(select 1 from public.v2_group_students s where s.id=student_value and s.teacher_id=actor and s.group_id=item_row.group_id) then raise exception 'Uno de los alumnos no pertenece al grupo.'; end if;
    if status_value='graded' then
      if entry->>'score' is null or btrim(entry->>'score')='' then raise exception 'Falta una calificación marcada como capturada.'; end if;
      score_value:=(entry->>'score')::numeric;
      if score_value<0 or score_value>coalesce(item_row.max_score,item_row.max_points,10) then raise exception 'Una calificación está fuera del rango permitido.'; end if;
    else score_value:=null; end if;
    perform pg_advisory_xact_lock(hashtextextended(item_row.id::text||':'||student_value::text,0));
    select * into grade_row from public.v2_grades g where g.teacher_id=actor and g.item_id=item_row.id and g.student_id=student_value and g.archived_at is null order by g.updated_at desc limit 1 for update;
    if grade_row.id is null then
      insert into public.v2_grades(teacher_id,group_id,item_id,student_id,score,value,status,note,notes,source_type,source_id,archived_at,created_at,updated_at)
      values(actor,item_row.group_id,item_row.id,student_value,score_value,score_value,status_value,note_value,note_value,'manual',null,null,now(),now()) returning * into grade_row;
    else
      update public.v2_grades set score=score_value,value=score_value,status=status_value,note=note_value,notes=note_value,source_type=coalesce(source_type,'manual'),archived_at=null,updated_at=now()
      where id=grade_row.id and teacher_id=actor returning * into grade_row;
    end if;
    changed:=changed+1;
  end loop;
  return jsonb_build_object('item_id',item_row.id,'changed',changed,'saved_at',now());
end; $$;

create or replace function public.v2_publish_omr_exam_to_gradebook(p_exam_id uuid,p_category_id uuid,p_item_title text default null)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); exam_row public.v2_paper_exams%rowtype; item_row public.v2_grade_items%rowtype; result_row public.v2_paper_exam_results%rowtype; grade_row public.v2_grades%rowtype; period_status text; category_period uuid; published integer:=0; pending integer:=0; unidentified integer:=0;
begin
  if actor is null then raise exception 'Sesión docente requerida.'; end if;
  select * into exam_row from public.v2_paper_exams where id=p_exam_id and teacher_id=actor for update;
  if not found then raise exception 'No se encontró la evaluación.'; end if;
  if exam_row.group_id is null then raise exception 'La evaluación debe pertenecer a un grupo.'; end if;
  if exam_row.status not in ('ready','closed') then raise exception 'La evaluación debe estar Lista o Cerrada.'; end if;
  if exam_row.period_id is not null then
    select status into period_status from public.v2_academic_periods where id=exam_row.period_id and teacher_id=actor and group_id=exam_row.group_id;
    if period_status='closed' then raise exception 'El periodo está cerrado. Reábrelo antes de publicar resultados.'; end if;
  end if;
  select period_id into category_period from public.v2_grade_categories where id=p_category_id and teacher_id=actor and group_id=exam_row.group_id and archived_at is null;
  if not found then raise exception 'Selecciona una categoría disponible.'; end if;
  if category_period is not null and category_period is distinct from exam_row.period_id then raise exception 'La categoría pertenece a otro periodo.'; end if;
  if exam_row.grade_item_id is not null then select * into item_row from public.v2_grade_items where id=exam_row.grade_item_id and teacher_id=actor; end if;
  if item_row.id is null then
    insert into public.v2_grade_items(teacher_id,group_id,period_id,category_id,title,name,max_points,max_score,date,item_date,item_type,source_type,source_id,position,published_at,created_at,updated_at)
    values(actor,exam_row.group_id,exam_row.period_id,p_category_id,coalesce(nullif(btrim(p_item_title),''),exam_row.title),coalesce(nullif(btrim(p_item_title),''),exam_row.title),10,10,exam_row.exam_date,exam_row.exam_date,'omr','paper_exam',exam_row.id,999,now(),now(),now()) returning * into item_row;
    update public.v2_paper_exams set grade_item_id=item_row.id,updated_at=now() where id=exam_row.id and teacher_id=actor;
  else
    update public.v2_grade_items set category_id=p_category_id,period_id=exam_row.period_id,title=coalesce(nullif(btrim(p_item_title),''),title,exam_row.title),name=coalesce(nullif(btrim(p_item_title),''),name,exam_row.title),archived_at=null,published_at=now(),updated_at=now()
    where id=item_row.id and teacher_id=actor returning * into item_row;
  end if;
  perform set_config('tedvio.grade_reason','Publicación o sincronización OMR',true);
  for result_row in select * from public.v2_paper_exam_results r where r.exam_id=exam_row.id and r.teacher_id=actor and r.archived_at is null and (r.review_status='confirmed' or r.reviewed=true) and r.student_id is not null order by r.updated_at loop
    perform pg_advisory_xact_lock(hashtextextended(item_row.id::text||':'||result_row.student_id::text,0));
    select * into grade_row from public.v2_grades g where g.teacher_id=actor and g.item_id=item_row.id and g.student_id=result_row.student_id and g.archived_at is null order by g.updated_at desc limit 1 for update;
    if grade_row.id is null then
      insert into public.v2_grades(teacher_id,group_id,item_id,student_id,score,value,status,note,notes,source_type,source_id,created_at,updated_at)
      values(actor,exam_row.group_id,item_row.id,result_row.student_id,result_row.score,result_row.score,'graded','Resultado OMR confirmado','Resultado OMR confirmado','omr_result',result_row.id,now(),now()) returning * into grade_row;
    else
      update public.v2_grades set score=result_row.score,value=result_row.score,status='graded',note='Resultado OMR confirmado',notes='Resultado OMR confirmado',source_type='omr_result',source_id=result_row.id,archived_at=null,updated_at=now()
      where id=grade_row.id and teacher_id=actor returning * into grade_row;
    end if;
    published:=published+1;
  end loop;
  select count(*) into pending from public.v2_paper_exam_results r where r.exam_id=exam_row.id and r.teacher_id=actor and r.archived_at is null and not (r.review_status='confirmed' or r.reviewed=true);
  select count(*) into unidentified from public.v2_paper_exam_results r where r.exam_id=exam_row.id and r.teacher_id=actor and r.archived_at is null and (r.review_status='confirmed' or r.reviewed=true) and r.student_id is null;
  return jsonb_build_object('exam_id',exam_row.id,'item_id',item_row.id,'published',published,'pending',pending,'unidentified',unidentified,'published_at',now());
end; $$;

create or replace function tedvio_private.sync_omr_gradebook_result()
returns trigger language plpgsql security definer set search_path=public,tedvio_private,pg_temp as $$
declare exam_row public.v2_paper_exams%rowtype; item_row public.v2_grade_items%rowtype; grade_row public.v2_grades%rowtype;
begin
  select * into exam_row from public.v2_paper_exams where id=new.exam_id;
  if not found or exam_row.grade_item_id is null or new.student_id is null then return new; end if;
  select * into item_row from public.v2_grade_items where id=exam_row.grade_item_id and teacher_id=exam_row.teacher_id;
  if not found then return new; end if;
  perform set_config('tedvio.grade_reason','Sincronización automática desde OMR',true);
  select * into grade_row from public.v2_grades g where g.teacher_id=exam_row.teacher_id and g.item_id=item_row.id and g.student_id=new.student_id and g.archived_at is null order by g.updated_at desc limit 1 for update;
  if new.archived_at is not null or not (new.review_status='confirmed' or new.reviewed=true) then
    if grade_row.id is not null and grade_row.source_type='omr_result' then
      update public.v2_grades set score=null,value=null,status='missing',note='Resultado OMR pendiente o archivado',notes='Resultado OMR pendiente o archivado',updated_at=now() where id=grade_row.id;
    end if;
    return new;
  end if;
  if grade_row.id is null then
    insert into public.v2_grades(teacher_id,group_id,item_id,student_id,score,value,status,note,notes,source_type,source_id,created_at,updated_at)
    values(exam_row.teacher_id,exam_row.group_id,item_row.id,new.student_id,new.score,new.score,'graded','Resultado OMR confirmado','Resultado OMR confirmado','omr_result',new.id,now(),now());
  else
    update public.v2_grades set score=new.score,value=new.score,status='graded',note='Resultado OMR confirmado',notes='Resultado OMR confirmado',source_type='omr_result',source_id=new.id,archived_at=null,updated_at=now() where id=grade_row.id;
  end if;
  return new;
end; $$;
revoke all on function tedvio_private.sync_omr_gradebook_result() from public,anon,authenticated;
drop trigger if exists trg_v2_omr_sync_gradebook on public.v2_paper_exam_results;
create trigger trg_v2_omr_sync_gradebook after insert or update of score,reviewed,review_status,archived_at,student_id on public.v2_paper_exam_results for each row execute function tedvio_private.sync_omr_gradebook_result();

revoke all on function public.v2_gradebook_home() from public,anon;
revoke all on function public.v2_gradebook_workspace(uuid,uuid) from public,anon;
revoke all on function public.v2_upsert_grade_category(uuid,uuid,uuid,text,numeric,integer,boolean) from public,anon;
revoke all on function public.v2_upsert_grade_item(uuid,uuid,uuid,uuid,text,numeric,date,text,integer,boolean) from public,anon;
revoke all on function public.v2_save_grade_batch(uuid,jsonb,text) from public,anon;
revoke all on function public.v2_publish_omr_exam_to_gradebook(uuid,uuid,text) from public,anon;
grant execute on function public.v2_gradebook_home() to authenticated;
grant execute on function public.v2_gradebook_workspace(uuid,uuid) to authenticated;
grant execute on function public.v2_upsert_grade_category(uuid,uuid,uuid,text,numeric,integer,boolean) to authenticated;
grant execute on function public.v2_upsert_grade_item(uuid,uuid,uuid,uuid,text,numeric,date,text,integer,boolean) to authenticated;
grant execute on function public.v2_save_grade_batch(uuid,jsonb,text) to authenticated;
grant execute on function public.v2_publish_omr_exam_to_gradebook(uuid,uuid,text) to authenticated;

comment on function public.v2_gradebook_workspace(uuid,uuid) is 'Returns one teacher-owned gradebook workspace with traceable raw evidence, periods and OMR publication state.';
comment on function public.v2_save_grade_batch(uuid,jsonb,text) is 'Atomically saves a manual grade batch while preserving prior values in v2_grade_revisions.';
comment on function public.v2_publish_omr_exam_to_gradebook(uuid,uuid,text) is 'Creates or reuses an OMR grade item and publishes only confirmed identified results.';
