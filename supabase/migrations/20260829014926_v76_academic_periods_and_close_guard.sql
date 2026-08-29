create table if not exists public.v2_academic_periods (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid not null references public.v2_groups(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  starts_on date not null,
  ends_on date not null,
  course_weight numeric(5,2) not null default 0 check (course_weight >= 0 and course_weight <= 100),
  order_index smallint not null default 1 check (order_index between 1 and 99),
  status text not null default 'open' check (status in ('open','closed')),
  closed_at timestamptz,
  reopened_at timestamptz,
  closed_snapshot jsonb,
  transition_log jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint v2_academic_periods_dates check (ends_on >= starts_on),
  constraint v2_academic_periods_name_unique unique (teacher_id, group_id, name)
);

create index if not exists v2_academic_periods_teacher_group_idx
  on public.v2_academic_periods (teacher_id, group_id, order_index);
create index if not exists v2_academic_periods_group_dates_idx
  on public.v2_academic_periods (group_id, starts_on, ends_on);

alter table public.v2_academic_periods enable row level security;
revoke all on table public.v2_academic_periods from anon, authenticated;
grant select, insert, update, delete on table public.v2_academic_periods to authenticated;

create policy "v2_academic_periods_select_own"
  on public.v2_academic_periods for select to authenticated
  using (
    (select auth.uid()) = teacher_id
    and exists (select 1 from public.v2_groups g where g.id = group_id and g.teacher_id = (select auth.uid()))
  );
create policy "v2_academic_periods_insert_own"
  on public.v2_academic_periods for insert to authenticated
  with check (
    (select auth.uid()) = teacher_id
    and exists (select 1 from public.v2_groups g where g.id = group_id and g.teacher_id = (select auth.uid()))
  );
create policy "v2_academic_periods_update_own"
  on public.v2_academic_periods for update to authenticated
  using ((select auth.uid()) = teacher_id)
  with check (
    (select auth.uid()) = teacher_id
    and exists (select 1 from public.v2_groups g where g.id = group_id and g.teacher_id = (select auth.uid()))
  );
create policy "v2_academic_periods_delete_own"
  on public.v2_academic_periods for delete to authenticated
  using ((select auth.uid()) = teacher_id);

alter table public.v2_grade_items add column if not exists period_id uuid references public.v2_academic_periods(id) on delete set null;
alter table public.v2_paper_exams add column if not exists period_id uuid references public.v2_academic_periods(id) on delete set null;
alter table public.v2_paper_exams add column if not exists exam_date date;
update public.v2_paper_exams set exam_date = created_at::date where exam_date is null;
alter table public.v2_paper_exams alter column exam_date set default current_date;
alter table public.v2_paper_exams alter column exam_date set not null;
alter table public.v2_assignments add column if not exists period_id uuid references public.v2_academic_periods(id) on delete set null;

create index if not exists v2_grade_items_period_idx on public.v2_grade_items(period_id, category_id);
create index if not exists v2_paper_exams_period_idx on public.v2_paper_exams(period_id, exam_date);
create index if not exists v2_assignments_period_idx on public.v2_assignments(period_id);

create or replace function public.v2_academic_period_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  transition text := coalesce(current_setting('tedvio.period_transition', true), '');
begin
  if tg_op = 'INSERT' then
    if new.status <> 'open' then
      raise exception 'Los periodos nuevos deben iniciar abiertos.' using errcode='P0001';
    end if;
    new.updated_at := now();
  elsif tg_op = 'UPDATE' then
    if old.teacher_id <> new.teacher_id or old.group_id <> new.group_id then
      raise exception 'No se puede transferir un periodo a otro docente o grupo.' using errcode='P0001';
    end if;
    if old.transition_log is distinct from new.transition_log and transition not in ('close','reopen') then
      raise exception 'El historial de transiciones es de solo lectura.' using errcode='P0001';
    end if;
    if old.closed_snapshot is distinct from new.closed_snapshot and transition not in ('close','reopen') then
      raise exception 'El snapshot de cierre es de solo lectura.' using errcode='P0001';
    end if;
    if old.status <> new.status then
      if old.status='open' and new.status='closed' and transition <> 'close' then
        raise exception 'Usa el cierre académico de TEDVIO para cerrar el periodo.' using errcode='P0001';
      elsif old.status='closed' and new.status='open' and transition <> 'reopen' then
        raise exception 'Usa la reapertura controlada de TEDVIO.' using errcode='P0001';
      end if;
    elsif old.status='closed' and (
      old.name is distinct from new.name or old.starts_on is distinct from new.starts_on or
      old.ends_on is distinct from new.ends_on or old.course_weight is distinct from new.course_weight or
      old.order_index is distinct from new.order_index
    ) then
      raise exception 'El periodo está cerrado. Reábrelo antes de editarlo.' using errcode='P0001';
    end if;
    new.updated_at := now();
  elsif tg_op = 'DELETE' then
    if old.status='closed' then
      raise exception 'No se puede eliminar un periodo cerrado. Reábrelo primero.' using errcode='P0001';
    end if;
    return old;
  end if;

  if tg_op <> 'DELETE' and exists (
    select 1 from public.v2_academic_periods p
    where p.teacher_id=new.teacher_id and p.group_id=new.group_id and p.id<>new.id
      and p.starts_on <= new.ends_on and p.ends_on >= new.starts_on
  ) then
    raise exception 'Los periodos académicos del mismo grupo no pueden traslaparse.' using errcode='P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_v2_academic_period_guard on public.v2_academic_periods;
create trigger trg_v2_academic_period_guard
before insert or update or delete on public.v2_academic_periods
for each row execute function public.v2_academic_period_guard();

create or replace function public.v2_assert_period_link_open(p_period_id uuid, p_teacher_id uuid, p_group_id uuid)
returns void
language plpgsql
stable
set search_path = public
as $$
declare p record;
begin
  if p_period_id is null then return; end if;
  select id,status,teacher_id,group_id into p from public.v2_academic_periods where id=p_period_id;
  if not found or p.teacher_id<>p_teacher_id or p.group_id<>p_group_id then
    raise exception 'El periodo no pertenece a este grupo docente.' using errcode='P0001';
  end if;
  if p.status='closed' then
    raise exception 'El periodo académico está cerrado. Reábrelo antes de modificar evidencias.' using errcode='P0001';
  end if;
end;
$$;

create or replace function public.v2_assert_group_date_open(p_teacher_id uuid, p_group_id uuid, p_date date)
returns void
language plpgsql
stable
set search_path = public
as $$
begin
  if p_group_id is null or p_date is null then return; end if;
  if exists (
    select 1 from public.v2_academic_periods p
    where p.teacher_id=p_teacher_id and p.group_id=p_group_id and p.status='closed'
      and p_date between p.starts_on and p.ends_on
  ) then
    raise exception 'La fecha pertenece a un periodo académico cerrado. Reábrelo antes de modificar evidencias.' using errcode='P0001';
  end if;
end;
$$;

create or replace function public.v2_grade_item_period_guard()
returns trigger language plpgsql set search_path=public as $$
declare candidate uuid;
begin
  if tg_op='DELETE' then
    perform public.v2_assert_period_link_open(old.period_id,old.teacher_id,old.group_id); return old;
  end if;
  if tg_op='UPDATE' then perform public.v2_assert_period_link_open(old.period_id,old.teacher_id,old.group_id); end if;
  if new.period_id is null and new.item_date is not null then
    select p.id into candidate from public.v2_academic_periods p
      where p.teacher_id=new.teacher_id and p.group_id=new.group_id and new.item_date between p.starts_on and p.ends_on
      order by p.order_index limit 1;
    new.period_id:=candidate;
  end if;
  perform public.v2_assert_period_link_open(new.period_id,new.teacher_id,new.group_id);
  return new;
end; $$;

drop trigger if exists trg_v2_grade_item_period_guard on public.v2_grade_items;
create trigger trg_v2_grade_item_period_guard before insert or update or delete on public.v2_grade_items
for each row execute function public.v2_grade_item_period_guard();

create or replace function public.v2_grade_score_period_guard()
returns trigger language plpgsql set search_path=public as $$
declare i record;
begin
  select period_id,teacher_id,group_id into i from public.v2_grade_items where id=coalesce(new.item_id,old.item_id);
  if found then perform public.v2_assert_period_link_open(i.period_id,i.teacher_id,i.group_id); end if;
  return case when tg_op='DELETE' then old else new end;
end; $$;

drop trigger if exists trg_v2_grade_score_period_guard on public.v2_grade_scores;
create trigger trg_v2_grade_score_period_guard before insert or update or delete on public.v2_grade_scores
for each row execute function public.v2_grade_score_period_guard();

create or replace function public.v2_paper_exam_period_guard()
returns trigger language plpgsql set search_path=public as $$
declare candidate uuid;
begin
  if tg_op='DELETE' then
    if old.period_id is not null then perform public.v2_assert_period_link_open(old.period_id,old.teacher_id,old.group_id); end if; return old;
  end if;
  if tg_op='UPDATE' and old.period_id is not null then perform public.v2_assert_period_link_open(old.period_id,old.teacher_id,old.group_id); end if;
  if new.group_id is null then new.period_id:=null;
  elsif new.period_id is null then
    select p.id into candidate from public.v2_academic_periods p
      where p.teacher_id=new.teacher_id and p.group_id=new.group_id and new.exam_date between p.starts_on and p.ends_on
      order by p.order_index limit 1;
    new.period_id:=candidate;
  end if;
  if new.period_id is not null then perform public.v2_assert_period_link_open(new.period_id,new.teacher_id,new.group_id); end if;
  return new;
end; $$;

drop trigger if exists trg_v2_paper_exam_period_guard on public.v2_paper_exams;
create trigger trg_v2_paper_exam_period_guard before insert or update or delete on public.v2_paper_exams
for each row execute function public.v2_paper_exam_period_guard();

create or replace function public.v2_paper_result_period_guard()
returns trigger language plpgsql set search_path=public as $$
declare e record;
begin
  select period_id,teacher_id,group_id into e from public.v2_paper_exams where id=coalesce(new.exam_id,old.exam_id);
  if found and e.period_id is not null then perform public.v2_assert_period_link_open(e.period_id,e.teacher_id,e.group_id); end if;
  return case when tg_op='DELETE' then old else new end;
end; $$;

drop trigger if exists trg_v2_paper_result_period_guard on public.v2_paper_exam_results;
create trigger trg_v2_paper_result_period_guard before insert or update or delete on public.v2_paper_exam_results
for each row execute function public.v2_paper_result_period_guard();

create or replace function public.v2_assignment_period_guard()
returns trigger language plpgsql set search_path=public as $$
declare candidate uuid; d date;
begin
  if tg_op='DELETE' then
    if old.period_id is not null and old.group_id is not null then perform public.v2_assert_period_link_open(old.period_id,old.teacher_id,old.group_id); end if; return old;
  end if;
  if tg_op='UPDATE' and old.period_id is not null and old.group_id is not null then perform public.v2_assert_period_link_open(old.period_id,old.teacher_id,old.group_id); end if;
  if new.group_id is null then new.period_id:=null;
  elsif new.period_id is null then
    d:=coalesce(new.opens_at::date,new.created_at::date,current_date);
    select p.id into candidate from public.v2_academic_periods p
      where p.teacher_id=new.teacher_id and p.group_id=new.group_id and d between p.starts_on and p.ends_on
      order by p.order_index limit 1;
    new.period_id:=candidate;
  end if;
  if new.period_id is not null then perform public.v2_assert_period_link_open(new.period_id,new.teacher_id,new.group_id); end if;
  return new;
end; $$;

drop trigger if exists trg_v2_assignment_period_guard on public.v2_assignments;
create trigger trg_v2_assignment_period_guard before insert or update or delete on public.v2_assignments
for each row execute function public.v2_assignment_period_guard();

create or replace function public.v2_attendance_session_period_guard()
returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='DELETE' then perform public.v2_assert_group_date_open(old.teacher_id,old.group_id,old.attendance_date); return old; end if;
  if tg_op='UPDATE' then perform public.v2_assert_group_date_open(old.teacher_id,old.group_id,old.attendance_date); end if;
  perform public.v2_assert_group_date_open(new.teacher_id,new.group_id,new.attendance_date);
  return new;
end; $$;

drop trigger if exists trg_v2_attendance_session_period_guard on public.v2_attendance_sessions;
create trigger trg_v2_attendance_session_period_guard before insert or update or delete on public.v2_attendance_sessions
for each row execute function public.v2_attendance_session_period_guard();

create or replace function public.v2_attendance_record_period_guard()
returns trigger language plpgsql set search_path=public as $$
declare s record;
begin
  select teacher_id,group_id,attendance_date into s from public.v2_attendance_sessions where id=coalesce(new.attendance_session_id,old.attendance_session_id);
  if found then perform public.v2_assert_group_date_open(s.teacher_id,s.group_id,s.attendance_date); end if;
  return case when tg_op='DELETE' then old else new end;
end; $$;

drop trigger if exists trg_v2_attendance_record_period_guard on public.v2_attendance_records;
create trigger trg_v2_attendance_record_period_guard before insert or update or delete on public.v2_attendance_records
for each row execute function public.v2_attendance_record_period_guard();

create or replace function public.v2_refresh_period_evidence_links()
returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='UPDATE' then
    update public.v2_grade_items i set period_id=null
      where i.period_id=old.id and (i.group_id<>new.group_id or i.item_date is null or i.item_date not between new.starts_on and new.ends_on);
    update public.v2_paper_exams e set period_id=null
      where e.period_id=old.id and (e.group_id<>new.group_id or e.exam_date not between new.starts_on and new.ends_on);
    update public.v2_assignments a set period_id=null
      where a.period_id=old.id and (a.group_id<>new.group_id or coalesce(a.opens_at::date,a.created_at::date) not between new.starts_on and new.ends_on);
  end if;
  update public.v2_grade_items i set period_id=new.id
    where i.teacher_id=new.teacher_id and i.group_id=new.group_id and i.period_id is null and i.item_date between new.starts_on and new.ends_on;
  update public.v2_paper_exams e set period_id=new.id
    where e.teacher_id=new.teacher_id and e.group_id=new.group_id and e.period_id is null and e.exam_date between new.starts_on and new.ends_on;
  update public.v2_assignments a set period_id=new.id
    where a.teacher_id=new.teacher_id and a.group_id=new.group_id and a.period_id is null
      and coalesce(a.opens_at::date,a.created_at::date) between new.starts_on and new.ends_on;
  return null;
end; $$;

drop trigger if exists trg_v2_refresh_period_evidence_links on public.v2_academic_periods;
create trigger trg_v2_refresh_period_evidence_links
after insert or update of starts_on,ends_on on public.v2_academic_periods
for each row execute function public.v2_refresh_period_evidence_links();

create or replace function public.v2_teacher_academic_period_summary(p_period_id uuid)
returns jsonb
language plpgsql
stable
set search_path=public
as $$
declare
  p public.v2_academic_periods%rowtype;
  student_n int:=0; category_weight numeric:=0; evidence_weight numeric:=0; course_weight_total numeric:=0;
  manual_items int:=0; manual_expected int:=0; manual_captured int:=0;
  attendance_sessions int:=0; attendance_records int:=0; attendance_expected int:=0; open_attendance int:=0;
  exam_count int:=0; exam_results int:=0; omr_expected int:=0;
  live_sessions int:=0; missing_categories jsonb:='[]'::jsonb; issues jsonb:='[]'::jsonb; warnings jsonb:='[]'::jsonb;
  attendance_weighted boolean:=false; omr_weighted boolean:=false; result jsonb;
begin
  select * into p from public.v2_academic_periods where id=p_period_id and teacher_id=(select auth.uid());
  if not found then raise exception 'Periodo académico no disponible.' using errcode='P0001'; end if;
  select count(*) into student_n from public.v2_group_students s where s.teacher_id=p.teacher_id and s.group_id=p.group_id and s.active;
  select coalesce(sum(c.weight),0), bool_or(c.kind='attendance' and c.weight>0), bool_or(c.kind='omr' and c.weight>0)
    into category_weight,attendance_weighted,omr_weighted from public.v2_grade_categories c where c.teacher_id=p.teacher_id and c.group_id=p.group_id;
  select coalesce(sum(x.course_weight),0) into course_weight_total from public.v2_academic_periods x where x.teacher_id=p.teacher_id and x.group_id=p.group_id;
  with ce as (
    select c.id,c.name,c.kind,c.weight,
      case
        when c.kind='omr' then exists(select 1 from public.v2_paper_exams e join public.v2_paper_exam_results r on r.exam_id=e.id and r.teacher_id=p.teacher_id where e.teacher_id=p.teacher_id and e.period_id=p.id)
        when c.kind='attendance' then exists(select 1 from public.v2_attendance_sessions a join public.v2_attendance_records r on r.attendance_session_id=a.id and r.teacher_id=p.teacher_id where a.teacher_id=p.teacher_id and a.group_id=p.group_id and a.attendance_date between p.starts_on and p.ends_on)
        when c.kind='live' then exists(select 1 from public.v2_sessions s where s.teacher_id=p.teacher_id and s.group_id=p.group_id and s.created_at::date between p.starts_on and p.ends_on)
        else exists(select 1 from public.v2_grade_items i join public.v2_grade_scores gs on gs.item_id=i.id and gs.teacher_id=p.teacher_id and gs.score is not null where i.teacher_id=p.teacher_id and i.period_id=p.id and i.category_id=c.id)
      end has_evidence
    from public.v2_grade_categories c where c.teacher_id=p.teacher_id and c.group_id=p.group_id
  )
  select coalesce(sum(weight) filter(where has_evidence),0),coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'kind',kind,'weight',weight)) filter(where weight>0 and not has_evidence),'[]'::jsonb)
    into evidence_weight,missing_categories from ce;
  select count(*) into manual_items from public.v2_grade_items i join public.v2_grade_categories c on c.id=i.category_id where i.teacher_id=p.teacher_id and i.period_id=p.id and c.weight>0 and c.kind not in ('omr','attendance','live');
  manual_expected:=manual_items*student_n;
  select count(*) into manual_captured from public.v2_grade_scores gs join public.v2_grade_items i on i.id=gs.item_id and i.period_id=p.id and i.teacher_id=p.teacher_id join public.v2_grade_categories c on c.id=i.category_id and c.weight>0 and c.kind not in ('omr','attendance','live') join public.v2_group_students st on st.id=gs.student_id and st.group_id=p.group_id and st.teacher_id=p.teacher_id and st.active where gs.teacher_id=p.teacher_id and gs.score is not null;
  select count(*),count(*) filter(where status in ('open','paused')) into attendance_sessions,open_attendance from public.v2_attendance_sessions a where a.teacher_id=p.teacher_id and a.group_id=p.group_id and a.attendance_date between p.starts_on and p.ends_on;
  attendance_expected:=attendance_sessions*student_n;
  select count(*) into attendance_records from public.v2_attendance_records r join public.v2_attendance_sessions a on a.id=r.attendance_session_id and a.teacher_id=p.teacher_id and a.group_id=p.group_id and a.attendance_date between p.starts_on and p.ends_on join public.v2_group_students st on st.id=r.student_id and st.group_id=p.group_id and st.teacher_id=p.teacher_id and st.active where r.teacher_id=p.teacher_id;
  select count(*) into exam_count from public.v2_paper_exams e where e.teacher_id=p.teacher_id and e.group_id=p.group_id and e.period_id=p.id;
  omr_expected:=exam_count*student_n;
  select count(distinct (r.exam_id::text||':'||st.id::text)) into exam_results from public.v2_paper_exam_results r join public.v2_paper_exams e on e.id=r.exam_id and e.teacher_id=p.teacher_id and e.period_id=p.id join public.v2_group_students st on st.teacher_id=p.teacher_id and st.group_id=p.group_id and st.active and (r.student_id=st.id or (r.student_id is null and nullif(btrim(r.enrollment),'')=nullif(btrim(st.enrollment),''))) where r.teacher_id=p.teacher_id;
  select count(*) into live_sessions from public.v2_sessions s where s.teacher_id=p.teacher_id and s.group_id=p.group_id and s.created_at::date between p.starts_on and p.ends_on;
  if student_n=0 then issues:=issues||jsonb_build_array(jsonb_build_object('code','no_students','label','El grupo no tiene alumnos activos.')); end if;
  if abs(category_weight-100)>.01 then issues:=issues||jsonb_build_array(jsonb_build_object('code','category_weights','label',format('Las categorías suman %s%% y deben sumar 100%%.',round(category_weight,1)))); end if;
  if jsonb_array_length(missing_categories)>0 then issues:=issues||jsonb_build_array(jsonb_build_object('code','missing_category_evidence','label','Hay categorías ponderadas sin evidencia en este periodo.')); end if;
  if manual_expected>manual_captured then issues:=issues||jsonb_build_array(jsonb_build_object('code','manual_pending','label',format('Faltan %s calificaciones manuales.',manual_expected-manual_captured))); end if;
  if attendance_weighted and open_attendance>0 then issues:=issues||jsonb_build_array(jsonb_build_object('code','attendance_open','label','Hay listas de asistencia abiertas o pausadas dentro del periodo.')); end if;
  if attendance_weighted and attendance_expected>attendance_records then warnings:=warnings||jsonb_build_array(jsonb_build_object('code','attendance_pending','label',format('Hay %s registros de asistencia sin capturar.',attendance_expected-attendance_records))); end if;
  if omr_weighted and omr_expected>exam_results then warnings:=warnings||jsonb_build_array(jsonb_build_object('code','omr_pending','label',format('Hay %s resultados OMR esperados sin vincular.',omr_expected-exam_results))); end if;
  if abs(course_weight_total-100)>.01 then warnings:=warnings||jsonb_build_array(jsonb_build_object('code','course_weights','label',format('Los periodos del curso suman %s%%.',round(course_weight_total,1)))); end if;
  result:=jsonb_build_object('period_id',p.id,'group_id',p.group_id,'name',p.name,'starts_on',p.starts_on,'ends_on',p.ends_on,'course_weight',p.course_weight,'course_weight_total',course_weight_total,'status',p.status,'closed_at',p.closed_at,'students',student_n,'category_weight',category_weight,'evidence_weight',evidence_weight,'missing_categories',missing_categories,'manual_items',manual_items,'manual_expected',manual_expected,'manual_captured',manual_captured,'manual_pending',greatest(0,manual_expected-manual_captured),'attendance_sessions',attendance_sessions,'attendance_records',attendance_records,'attendance_expected',attendance_expected,'open_attendance',open_attendance,'exam_count',exam_count,'exam_results',exam_results,'omr_expected',omr_expected,'live_sessions',live_sessions,'issues',issues,'warnings',warnings,'ready',(jsonb_array_length(issues)=0));
  return result;
end;
$$;

create or replace function public.v2_teacher_close_academic_period(p_period_id uuid)
returns jsonb language plpgsql set search_path=public as $$
declare p public.v2_academic_periods%rowtype; summary jsonb; event jsonb;
begin
  select * into p from public.v2_academic_periods where id=p_period_id and teacher_id=(select auth.uid()) for update;
  if not found then raise exception 'Periodo académico no disponible.' using errcode='P0001'; end if;
  if p.status='closed' then return coalesce(p.closed_snapshot,public.v2_teacher_academic_period_summary(p.id))||jsonb_build_object('status','closed'); end if;
  summary:=public.v2_teacher_academic_period_summary(p.id);
  if coalesce((summary->>'ready')::boolean,false)=false then raise exception 'El periodo todavía tiene pendientes de cierre.' using errcode='P0001'; end if;
  event:=jsonb_build_object('event','closed','at',now(),'by',(select auth.uid()));
  perform set_config('tedvio.period_transition','close',true);
  update public.v2_academic_periods set status='closed',closed_at=now(),closed_snapshot=summary,transition_log=transition_log||jsonb_build_array(event) where id=p.id;
  return summary||jsonb_build_object('status','closed','closed_at',now());
end;
$$;

create or replace function public.v2_teacher_reopen_academic_period(p_period_id uuid,p_reason text)
returns jsonb language plpgsql set search_path=public as $$
declare p public.v2_academic_periods%rowtype; event jsonb;
begin
  if char_length(btrim(coalesce(p_reason,'')))<3 then raise exception 'Escribe un motivo breve para reabrir el periodo.' using errcode='P0001'; end if;
  select * into p from public.v2_academic_periods where id=p_period_id and teacher_id=(select auth.uid()) for update;
  if not found then raise exception 'Periodo académico no disponible.' using errcode='P0001'; end if;
  if p.status='open' then return public.v2_teacher_academic_period_summary(p.id)||jsonb_build_object('status','open'); end if;
  event:=jsonb_build_object('event','reopened','at',now(),'by',(select auth.uid()),'reason',left(btrim(p_reason),300));
  perform set_config('tedvio.period_transition','reopen',true);
  update public.v2_academic_periods set status='open',reopened_at=now(),transition_log=transition_log||jsonb_build_array(event) where id=p.id;
  return public.v2_teacher_academic_period_summary(p.id)||jsonb_build_object('status','open','reopened_at',now());
end;
$$;

revoke all on function public.v2_teacher_academic_period_summary(uuid) from public,anon;
revoke all on function public.v2_teacher_close_academic_period(uuid) from public,anon;
revoke all on function public.v2_teacher_reopen_academic_period(uuid,text) from public,anon;
grant execute on function public.v2_teacher_academic_period_summary(uuid) to authenticated;
grant execute on function public.v2_teacher_close_academic_period(uuid) to authenticated;
grant execute on function public.v2_teacher_reopen_academic_period(uuid,text) to authenticated;
grant execute on function public.v2_assert_period_link_open(uuid,uuid,uuid) to authenticated;
grant execute on function public.v2_assert_group_date_open(uuid,uuid,date) to authenticated;