-- Recovered from the production migration ledger for deterministic rebuilds.
create table if not exists public.tedvio_client_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  severity text not null default 'error' check (severity in ('info','warning','error')),
  page text,
  app_version text,
  user_agent text,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.tedvio_client_events enable row level security;
drop policy if exists tedvio_client_events_insert_own on public.tedvio_client_events;
create policy tedvio_client_events_insert_own on public.tedvio_client_events
for insert to authenticated
with check (user_id = (select auth.uid()));
create index if not exists tedvio_client_events_user_created_idx on public.tedvio_client_events(user_id,created_at desc);

create or replace function public.v2_teacher_today_dashboard()
returns jsonb
language sql
stable
security definer
set search_path='public'
as $$
with me as (
  select auth.uid() uid
),
g as (
  select g.* from public.v2_groups g, me where g.teacher_id=me.uid
),
stu as (
  select gs.group_id, count(*) filter(where gs.active)::int students
  from public.v2_group_students gs, me
  where gs.teacher_id=me.uid
  group by gs.group_id
),
att as (
  select a.group_id,
         round(100.0 * count(*) filter(where r.status in ('present','late','justified')) / nullif(count(r.id),0),1) attendance_rate,
         max(a.updated_at) last_attendance
  from public.v2_attendance_sessions a
  left join public.v2_attendance_records r on r.attendance_session_id=a.id
  , me
  where a.teacher_id=me.uid
  group by a.group_id
),
today_att as (
  select distinct on (a.group_id) a.group_id,a.status
  from public.v2_attendance_sessions a, me
  where a.teacher_id=me.uid and a.attendance_date=current_date
  order by a.group_id,a.updated_at desc
),
student_att as (
  select gs.group_id,gs.id student_id,
         round(100.0 * count(r.id) filter(where r.status in ('present','late','justified')) / nullif(count(r.id),0),1) attendance_rate
  from public.v2_group_students gs
  left join public.v2_attendance_sessions a on a.group_id=gs.group_id
  left join public.v2_attendance_records r on r.attendance_session_id=a.id and r.student_id=gs.id
  , me
  where gs.teacher_id=me.uid and gs.active
  group by gs.group_id,gs.id
),
omr_student as (
  select e.group_id,r.student_id,avg(r.score)::numeric omr_avg
  from public.v2_paper_exams e
  join public.v2_paper_exam_results r on r.exam_id=e.id
  , me
  where e.teacher_id=me.uid and r.teacher_id=me.uid and e.group_id is not null and r.student_id is not null
  group by e.group_id,r.student_id
),
manual_student as (
  select i.group_id,s.student_id,avg(least(10,greatest(0,(s.score/nullif(i.max_score,0))*10)))::numeric manual_avg
  from public.v2_grade_items i
  join public.v2_grade_categories c on c.id=i.category_id and c.kind='manual'
  join public.v2_grade_scores s on s.item_id=i.id and s.score is not null
  , me
  where i.teacher_id=me.uid and s.teacher_id=me.uid
  group by i.group_id,s.student_id
),
alerts as (
  select g.id group_id,coalesce(a.min_attendance,80)::numeric min_attendance,coalesce(a.min_grade,6)::numeric min_grade
  from g left join public.v2_group_alert_settings a on a.group_id=g.id
),
student_signal as (
  select gs.group_id,gs.id student_id,gs.full_name,gs.enrollment,
         sa.attendance_rate,
         os.omr_avg,
         ms.manual_avg,
         case when os.omr_avg is not null and ms.manual_avg is not null then (os.omr_avg+ms.manual_avg)/2
              else coalesce(os.omr_avg,ms.manual_avg) end grade_signal,
         al.min_attendance,al.min_grade
  from public.v2_group_students gs
  join alerts al on al.group_id=gs.group_id
  left join student_att sa on sa.student_id=gs.id
  left join omr_student os on os.student_id=gs.id and os.group_id=gs.group_id
  left join manual_student ms on ms.student_id=gs.id and ms.group_id=gs.group_id
  , me
  where gs.teacher_id=me.uid and gs.active
),
risk as (
  select group_id,
         count(*) filter(where (attendance_rate is not null and attendance_rate < min_attendance) or (grade_signal is not null and grade_signal < min_grade))::int risk_count
  from student_signal group by group_id
),
grade_group as (
  select group_id,round(avg(grade_signal),1) grade_avg from student_signal where grade_signal is not null group by group_id
),
activity as (
  select g.id group_id,
    greatest(
      coalesce((select max(s.created_at) from public.v2_sessions s, me where s.teacher_id=me.uid and s.group_id=g.id),'epoch'::timestamptz),
      coalesce((select max(a.updated_at) from public.v2_attendance_sessions a, me where a.teacher_id=me.uid and a.group_id=g.id),'epoch'::timestamptz),
      coalesce((select max(e.updated_at) from public.v2_paper_exams e, me where e.teacher_id=me.uid and e.group_id=g.id),'epoch'::timestamptz)
    ) last_activity
  from g
),
latest_eval as (
  select e.id,e.title,e.group_id,avg(r.score)::numeric avg_score,max(r.updated_at) at
  from public.v2_paper_exams e join public.v2_paper_exam_results r on r.exam_id=e.id
  , me
  where e.teacher_id=me.uid and r.teacher_id=me.uid
  group by e.id,e.title,e.group_id
  order by max(r.updated_at) desc
  limit 1
),
pending as (
  select count(*)::int n from public.v2_attendance_sessions a, me where a.teacher_id=me.uid and a.status in ('open','paused')
),
all_risk as (
  select count(*)::int n from student_signal where (attendance_rate is not null and attendance_rate < min_attendance) or (grade_signal is not null and grade_signal < min_grade)
),
groups_json as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',g.id,'name',coalesce(g.name,g.group_name),'subject',g.subject,'term',coalesce(g.term,g.school_cycle),
    'university',g.university,'program',g.program,'students',coalesce(stu.students,0),
    'attendance_rate',att.attendance_rate,'grade_avg',grade_group.grade_avg,'risk_count',coalesce(risk.risk_count,0),
    'today_attendance_status',today_att.status,'last_activity',activity.last_activity
  ) order by activity.last_activity desc nulls last,g.created_at desc),'[]'::jsonb) j
  from g
  left join stu on stu.group_id=g.id
  left join att on att.group_id=g.id
  left join risk on risk.group_id=g.id
  left join grade_group on grade_group.group_id=g.id
  left join today_att on today_att.group_id=g.id
  left join activity on activity.group_id=g.id
),
priority as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'group_id',x.group_id,'student_id',x.student_id,'full_name',x.full_name,'enrollment',x.enrollment,
    'attendance_rate',x.attendance_rate,'grade',round(x.grade_signal,1)
  ) order by coalesce(x.attendance_rate,101),coalesce(x.grade_signal,11)),'[]'::jsonb) j
  from (select * from student_signal where (attendance_rate is not null and attendance_rate < min_attendance) or (grade_signal is not null and grade_signal < min_grade) limit 8) x
)
select jsonb_build_object(
  'date',current_date,
  'groups',groups_json.j,
  'groups_count',(select count(*) from g),
  'pending_attendance',(select n from pending),
  'risk_students',(select n from all_risk),
  'priority_students',(select j from priority),
  'latest_evaluation',(select case when id is null then null else jsonb_build_object('id',id,'title',title,'group_id',group_id,'average',round(avg_score,1),'at',at) end from latest_eval)
)
from groups_json;
$$;

revoke all on function public.v2_teacher_today_dashboard() from public,anon;
grant execute on function public.v2_teacher_today_dashboard() to authenticated;

