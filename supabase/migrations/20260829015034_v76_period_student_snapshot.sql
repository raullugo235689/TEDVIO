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
  attendance_weighted boolean:=false; omr_weighted boolean:=false; student_rows jsonb:='[]'::jsonb;
  group_grade numeric; approval_rate numeric; students_without_grade int:=0; min_grade numeric:=6; result jsonb;
begin
  select * into p from public.v2_academic_periods where id=p_period_id and teacher_id=(select auth.uid());
  if not found then raise exception 'Periodo académico no disponible.' using errcode='P0001'; end if;

  select count(*) into student_n from public.v2_group_students s where s.teacher_id=p.teacher_id and s.group_id=p.group_id and s.active;
  select coalesce(sum(c.weight),0), coalesce(bool_or(c.kind='attendance' and c.weight>0),false), coalesce(bool_or(c.kind='omr' and c.weight>0),false)
    into category_weight,attendance_weighted,omr_weighted
    from public.v2_grade_categories c where c.teacher_id=p.teacher_id and c.group_id=p.group_id;
  select coalesce(sum(x.course_weight),0) into course_weight_total from public.v2_academic_periods x where x.teacher_id=p.teacher_id and x.group_id=p.group_id;
  select coalesce(s.min_grade,6) into min_grade from public.v2_group_alert_settings s where s.teacher_id=p.teacher_id and s.group_id=p.group_id;
  min_grade:=coalesce(min_grade,6);

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
  select coalesce(sum(weight) filter(where has_evidence),0),
         coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'kind',kind,'weight',weight)) filter(where weight>0 and not has_evidence),'[]'::jsonb)
    into evidence_weight,missing_categories from ce;

  select count(*) into manual_items
    from public.v2_grade_items i join public.v2_grade_categories c on c.id=i.category_id
    where i.teacher_id=p.teacher_id and i.period_id=p.id and c.weight>0 and c.kind not in ('omr','attendance','live');
  manual_expected:=manual_items*student_n;
  select count(*) into manual_captured from public.v2_grade_scores gs
    join public.v2_grade_items i on i.id=gs.item_id and i.period_id=p.id and i.teacher_id=p.teacher_id
    join public.v2_grade_categories c on c.id=i.category_id and c.weight>0 and c.kind not in ('omr','attendance','live')
    join public.v2_group_students st on st.id=gs.student_id and st.group_id=p.group_id and st.teacher_id=p.teacher_id and st.active
    where gs.teacher_id=p.teacher_id and gs.score is not null;

  select count(*),count(*) filter(where status in ('open','paused')) into attendance_sessions,open_attendance
    from public.v2_attendance_sessions a where a.teacher_id=p.teacher_id and a.group_id=p.group_id and a.attendance_date between p.starts_on and p.ends_on;
  attendance_expected:=attendance_sessions*student_n;
  select count(*) into attendance_records from public.v2_attendance_records r
    join public.v2_attendance_sessions a on a.id=r.attendance_session_id and a.teacher_id=p.teacher_id and a.group_id=p.group_id and a.attendance_date between p.starts_on and p.ends_on
    join public.v2_group_students st on st.id=r.student_id and st.group_id=p.group_id and st.teacher_id=p.teacher_id and st.active
    where r.teacher_id=p.teacher_id;

  select count(*) into exam_count from public.v2_paper_exams e where e.teacher_id=p.teacher_id and e.group_id=p.group_id and e.period_id=p.id;
  omr_expected:=exam_count*student_n;
  select count(distinct (r.exam_id::text||':'||st.id::text)) into exam_results
    from public.v2_paper_exam_results r
    join public.v2_paper_exams e on e.id=r.exam_id and e.teacher_id=p.teacher_id and e.period_id=p.id
    join public.v2_group_students st on st.teacher_id=p.teacher_id and st.group_id=p.group_id and st.active
      and (r.student_id=st.id or (r.student_id is null and nullif(btrim(r.enrollment),'')=nullif(btrim(st.enrollment),'')))
    where r.teacher_id=p.teacher_id;

  select count(*) into live_sessions from public.v2_sessions s where s.teacher_id=p.teacher_id and s.group_id=p.group_id and s.created_at::date between p.starts_on and p.ends_on;

  with student_cat as (
    select st.id student_id,st.full_name,st.enrollment,c.id category_id,c.kind,c.weight,
      case
        when c.kind='omr' then (
          select avg(r.score)::numeric from public.v2_paper_exam_results r
          join public.v2_paper_exams e on e.id=r.exam_id and e.teacher_id=p.teacher_id and e.period_id=p.id
          where r.teacher_id=p.teacher_id and (r.student_id=st.id or (r.student_id is null and nullif(btrim(r.enrollment),'')=nullif(btrim(st.enrollment),'')))
        )
        when c.kind='attendance' then (
          select (10.0*count(*) filter(where r.status in ('present','late','justified'))/nullif(count(r.id),0))::numeric
          from public.v2_attendance_records r join public.v2_attendance_sessions a on a.id=r.attendance_session_id
          where r.teacher_id=p.teacher_id and r.student_id=st.id and a.teacher_id=p.teacher_id and a.group_id=p.group_id and a.attendance_date between p.starts_on and p.ends_on
        )
        when c.kind='live' then (
          select (10.0*count(distinct pr.session_id)/nullif(live_sessions,0))::numeric
          from public.v2_participants pr join public.v2_sessions se on se.id=pr.session_id
          where se.teacher_id=p.teacher_id and se.group_id=p.group_id and se.created_at::date between p.starts_on and p.ends_on
            and (pr.roster_student_id=st.id or (pr.roster_student_id is null and nullif(btrim(pr.matricula),'')=nullif(btrim(st.enrollment),'')))
        )
        else (
          select avg(least(10,greatest(0,(gs.score/nullif(i.max_score,0))*10)))::numeric
          from public.v2_grade_items i join public.v2_grade_scores gs on gs.item_id=i.id and gs.teacher_id=p.teacher_id and gs.student_id=st.id
          where i.teacher_id=p.teacher_id and i.period_id=p.id and i.category_id=c.id and gs.score is not null
        )
      end category_grade
    from public.v2_group_students st
    cross join public.v2_grade_categories c
    where st.teacher_id=p.teacher_id and st.group_id=p.group_id and st.active and c.teacher_id=p.teacher_id and c.group_id=p.group_id and c.weight>0
  ), calc as (
    select student_id,full_name,enrollment,
      round((sum(category_grade*weight) filter(where category_grade is not null))/nullif(sum(weight) filter(where category_grade is not null),0),2) grade,
      coalesce(sum(weight) filter(where category_grade is not null),0) evidence_weight,
      max(category_grade) filter(where kind='attendance') attendance_grade,
      max(category_grade) filter(where kind='omr') omr_grade
    from student_cat group by student_id,full_name,enrollment
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'student_id',student_id,'full_name',full_name,'enrollment',enrollment,'grade',grade,
           'evidence_weight',evidence_weight,'attendance_rate',case when attendance_grade is null then null else round(attendance_grade*10,1) end,
           'omr_avg',case when omr_grade is null then null else round(omr_grade,2) end
         ) order by full_name),'[]'::jsonb),
         round(avg(grade),2),
         round(100.0*count(*) filter(where grade>=min_grade)/nullif(count(grade),0),1),
         count(*) filter(where grade is null)
    into student_rows,group_grade,approval_rate,students_without_grade from calc;

  if student_n=0 then issues:=issues||jsonb_build_array(jsonb_build_object('code','no_students','label','El grupo no tiene alumnos activos.')); end if;
  if abs(category_weight-100)>.01 then issues:=issues||jsonb_build_array(jsonb_build_object('code','category_weights','label',format('Las categorías suman %s%% y deben sumar 100%%.',round(category_weight,1)))); end if;
  if jsonb_array_length(missing_categories)>0 then issues:=issues||jsonb_build_array(jsonb_build_object('code','missing_category_evidence','label','Hay categorías ponderadas sin evidencia en este periodo.')); end if;
  if manual_expected>manual_captured then issues:=issues||jsonb_build_array(jsonb_build_object('code','manual_pending','label',format('Faltan %s calificaciones manuales.',manual_expected-manual_captured))); end if;
  if attendance_weighted and open_attendance>0 then issues:=issues||jsonb_build_array(jsonb_build_object('code','attendance_open','label','Hay listas de asistencia abiertas o pausadas dentro del periodo.')); end if;
  if attendance_weighted and attendance_expected>attendance_records then warnings:=warnings||jsonb_build_array(jsonb_build_object('code','attendance_pending','label',format('Hay %s registros de asistencia sin capturar.',attendance_expected-attendance_records))); end if;
  if omr_weighted and omr_expected>exam_results then warnings:=warnings||jsonb_build_array(jsonb_build_object('code','omr_pending','label',format('Hay %s resultados OMR esperados sin vincular.',omr_expected-exam_results))); end if;
  if students_without_grade>0 then warnings:=warnings||jsonb_build_array(jsonb_build_object('code','students_without_grade','label',format('%s alumnos todavía no tienen promedio del periodo.',students_without_grade))); end if;
  if abs(course_weight_total-100)>.01 then warnings:=warnings||jsonb_build_array(jsonb_build_object('code','course_weights','label',format('Los periodos del curso suman %s%%.',round(course_weight_total,1)))); end if;

  result:=jsonb_build_object(
    'period_id',p.id,'group_id',p.group_id,'name',p.name,'starts_on',p.starts_on,'ends_on',p.ends_on,
    'course_weight',p.course_weight,'course_weight_total',course_weight_total,'status',p.status,'closed_at',p.closed_at,
    'students',student_n,'student_rows',student_rows,'group_grade',group_grade,'approval_rate',approval_rate,'min_grade',min_grade,'students_without_grade',students_without_grade,
    'category_weight',category_weight,'evidence_weight',evidence_weight,'missing_categories',missing_categories,
    'manual_items',manual_items,'manual_expected',manual_expected,'manual_captured',manual_captured,'manual_pending',greatest(0,manual_expected-manual_captured),
    'attendance_sessions',attendance_sessions,'attendance_records',attendance_records,'attendance_expected',attendance_expected,'open_attendance',open_attendance,
    'exam_count',exam_count,'exam_results',exam_results,'omr_expected',omr_expected,'live_sessions',live_sessions,
    'issues',issues,'warnings',warnings,'ready',(jsonb_array_length(issues)=0)
  );
  return result;
end;
$$;

revoke all on function public.v2_teacher_academic_period_summary(uuid) from public,anon;
grant execute on function public.v2_teacher_academic_period_summary(uuid) to authenticated;