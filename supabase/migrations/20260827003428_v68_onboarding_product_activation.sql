-- Recovered from the production migration ledger for deterministic rebuilds.
alter table public.v2_groups add column if not exists is_demo boolean not null default false;
alter table public.v2_sessions add column if not exists is_demo boolean not null default false;

create table if not exists public.tedvio_onboarding_progress(
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_step text not null default 'welcome',
  completed_steps text[] not null default '{}'::text[],
  dismissed boolean not null default false,
  demo_group_id uuid references public.v2_groups(id) on delete set null,
  demo_session_id uuid references public.v2_sessions(id) on delete set null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.tedvio_onboarding_progress enable row level security;
drop policy if exists onboarding_owner_select on public.tedvio_onboarding_progress;
create policy onboarding_owner_select on public.tedvio_onboarding_progress for select to authenticated using ((select auth.uid())=user_id);
drop policy if exists onboarding_owner_insert on public.tedvio_onboarding_progress;
create policy onboarding_owner_insert on public.tedvio_onboarding_progress for insert to authenticated with check ((select auth.uid())=user_id);
drop policy if exists onboarding_owner_update on public.tedvio_onboarding_progress;
create policy onboarding_owner_update on public.tedvio_onboarding_progress for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
revoke all on public.tedvio_onboarding_progress from anon;
grant select,insert,update on public.tedvio_onboarding_progress to authenticated,service_role;

create table if not exists public.tedvio_activation_events(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 event_type text not null,
 context jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index if not exists tedvio_activation_user_created_idx on public.tedvio_activation_events(user_id,created_at desc);
create index if not exists tedvio_activation_type_created_idx on public.tedvio_activation_events(event_type,created_at desc);
alter table public.tedvio_activation_events enable row level security;
drop policy if exists activation_owner_insert on public.tedvio_activation_events;
create policy activation_owner_insert on public.tedvio_activation_events for insert to authenticated with check ((select auth.uid())=user_id);
drop policy if exists activation_owner_select on public.tedvio_activation_events;
create policy activation_owner_select on public.tedvio_activation_events for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.tedvio_activation_events from anon;
grant select,insert on public.tedvio_activation_events to authenticated,service_role;

create or replace function tedvio_private.enforce_group_limit_v63()
returns trigger language plpgsql security definer set search_path='public' as $$
declare v_plan text; v_limit int; v_count int;
begin
  if coalesce(new.is_demo,false) then return new; end if;
  select coalesce(p.plan,'free') into v_plan from public.tedvio_user_profiles p where p.user_id=new.teacher_id;
  v_plan:=coalesce(v_plan,'free');
  select max_groups into v_limit from public.tedvio_plan_limits where plan=v_plan;
  if v_limit is not null then
    select count(*) into v_count from public.v2_groups where teacher_id=new.teacher_id and coalesce(is_demo,false)=false;
    if v_count >= v_limit then raise exception 'Tu plan % permite hasta % grupos. Cambia de plan para crear otro grupo.', upper(v_plan), v_limit; end if;
  end if;
  return new;
end$$;

create or replace function tedvio_private.enforce_session_limit_v63()
returns trigger language plpgsql security definer set search_path='public' as $$
declare v_plan text; v_limit int; v_count int;
begin
  if coalesce(new.is_demo,false) then return new; end if;
  select coalesce(p.plan,'free') into v_plan from public.tedvio_user_profiles p where p.user_id=new.teacher_id;
  v_plan:=coalesce(v_plan,'free');
  select max_live_sessions_month into v_limit from public.tedvio_plan_limits where plan=v_plan;
  if v_limit is not null then
    select count(*) into v_count from public.v2_sessions where teacher_id=new.teacher_id and coalesce(is_demo,false)=false and created_at>=date_trunc('month',now());
    if v_count >= v_limit then raise exception 'Tu plan % permite hasta % sesiones nuevas por mes. Cambia de plan para continuar.', upper(v_plan), v_limit; end if;
  end if;
  return new;
end$$;

create or replace function public.tedvio_current_entitlements()
returns jsonb language sql stable set search_path='public','storage' as $$
with me as (
  select p.user_id,coalesce(p.plan,'free') plan,p.role,p.status from public.tedvio_user_profiles p where p.user_id=(select auth.uid())
),lim as (select l.* from public.tedvio_plan_limits l join me on me.plan=l.plan),usage as(
  select
   (select count(*) from public.v2_groups g where g.teacher_id=(select auth.uid()) and coalesce(g.is_demo,false)=false)::int groups_used,
   (select count(*) from public.v2_sessions s where s.teacher_id=(select auth.uid()) and coalesce(s.is_demo,false)=false and s.created_at>=date_trunc('month',now()))::int sessions_month_used,
   coalesce((select sum(case when coalesce(o.metadata->>'size','')~'^[0-9]+$' then (o.metadata->>'size')::bigint else 0 end) from storage.objects o where o.bucket_id='tedvio-media-v2' and o.owner_id=(select auth.uid())::text),0)::bigint storage_bytes_used
)
select jsonb_build_object('version','2026.08.26.68','plan',coalesce(me.plan,'free'),'display_name',coalesce(lim.display_name,'Free'),'role',coalesce(me.role,'teacher'),'status',coalesce(me.status,'active'),'limits',jsonb_build_object('max_groups',lim.max_groups,'max_students_per_group',lim.max_students_per_group,'max_live_sessions_month',lim.max_live_sessions_month,'max_storage_mb',lim.max_storage_mb),'features',jsonb_build_object('omr',coalesce(lim.feature_omr,false),'analytics_pro',coalesce(lim.feature_analytics_pro,false),'exports',coalesce(lim.feature_exports,false),'qr_attendance',true,'live_sessions',true,'live_ranking',true,'institutional_admin',coalesce(lim.institutional_admin,false)),'usage',jsonb_build_object('groups',coalesce(usage.groups_used,0),'sessions_month',coalesce(usage.sessions_month_used,0),'storage_bytes',coalesce(usage.storage_bytes_used,0)),'analytics_level',coalesce(lim.analytics_level,'basic')) from me left join lim on true cross join usage;
$$;
revoke execute on function public.tedvio_current_entitlements() from public,anon;
grant execute on function public.tedvio_current_entitlements() to authenticated,service_role;

create or replace function public.tedvio_activation_snapshot_v68()
returns jsonb language sql stable security invoker set search_path='public' as $$
with uid as(select auth.uid() id),
prog as(select * from public.tedvio_onboarding_progress where user_id=(select id from uid)),
counts as(select
 (select count(*) from public.v2_universities where teacher_id=(select id from uid))::int universities,
 (select count(*) from public.v2_programs where teacher_id=(select id from uid))::int programs,
 (select count(*) from public.v2_groups where teacher_id=(select id from uid) and coalesce(is_demo,false)=false)::int groups,
 (select count(*) from public.v2_group_students gs join public.v2_groups g on g.id=gs.group_id where gs.teacher_id=(select id from uid) and gs.active=true and coalesce(g.is_demo,false)=false)::int students,
 (select count(*) from public.v2_question_bank where teacher_id=(select id from uid) and coalesce(archived,false)=false and coalesce(folder,'')<>'TEDVIO Demo')::int questions,
 (select count(*) from public.v2_sessions where teacher_id=(select id from uid) and coalesce(is_demo,false)=false)::int sessions,
 (select count(*) from public.v2_assignments where teacher_id=(select id from uid))::int assignments,
 (select count(*) from public.v2_groups where teacher_id=(select id from uid) and coalesce(is_demo,false)=true)::int demo_groups
)
select jsonb_build_object('version','2026.08.26.68','universities',c.universities,'programs',c.programs,'groups',c.groups,'students',c.students,'questions',c.questions,'sessions',c.sessions,'assignments',c.assignments,'demo_ready',c.demo_groups>0,'dismissed',coalesce(p.dismissed,false),'last_step',coalesce(p.last_step,'welcome'),'completed_steps',coalesce(p.completed_steps,'{}'::text[]),'completed',c.programs>0 and c.groups>0 and c.students>0 and c.questions>0 and c.sessions>0,'score',(case when c.programs>0 then 1 else 0 end)+(case when c.groups>0 then 1 else 0 end)+(case when c.students>0 then 1 else 0 end)+(case when c.questions>0 then 1 else 0 end)+(case when c.sessions>0 then 1 else 0 end)) from counts c left join prog p on true;
$$;
revoke execute on function public.tedvio_activation_snapshot_v68() from public,anon;
grant execute on function public.tedvio_activation_snapshot_v68() to authenticated,service_role;

create or replace function tedvio_private.create_demo_workspace_v68()
returns jsonb language plpgsql security definer set search_path='public' as $$
declare uid uuid:=auth.uid(); v_uni uuid; v_prog uuid; v_group uuid; v_session uuid; v_code text; i int; qcount int;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 insert into public.v2_universities(teacher_id,name) values(uid,'TEDVIO Demo') on conflict(teacher_id,name) do update set name=excluded.name returning id into v_uni;
 insert into public.v2_programs(teacher_id,university_id,name) values(uid,v_uni,'Experiencia TEDVIO') on conflict(university_id,name) do update set teacher_id=excluded.teacher_id returning id into v_prog;
 insert into public.v2_groups(teacher_id,program_id,name,term,subject,university,program,group_name,school_cycle,is_demo) values(uid,v_prog,'DEMO-01','Demo','TEDVIO Demo','TEDVIO Demo','Experiencia TEDVIO','DEMO-01','Demo',true) on conflict(program_id,name) do update set is_demo=true,subject=excluded.subject returning id into v_group;
 for i in 1..10 loop
   insert into public.v2_group_students(group_id,teacher_id,enrollment,full_name,active) values(v_group,uid,'DEMO'||lpad(i::text,3,'0'),'Alumno Demo '||i,true) on conflict(group_id,enrollment) do update set full_name=excluded.full_name,active=true;
 end loop;
 select count(*) into qcount from public.v2_question_bank where teacher_id=uid and folder='TEDVIO Demo';
 if qcount<5 then
   delete from public.v2_question_bank where teacher_id=uid and folder='TEDVIO Demo';
   insert into public.v2_question_bank(teacher_id,title,subject,topic,question_type,prompt,options,correct_answer,explanation,difficulty,folder,tags,bloom) values
   (uid,'Demo 1','TEDVIO Demo','Conociendo TEDVIO','multiple_choice','¿Qué reúne TEDVIO en un solo espacio?','["Interacción, evaluación y seguimiento","Solo videollamadas","Solo archivos","Solo mensajería"]'::jsonb,'"Interacción, evaluación y seguimiento"'::jsonb,'TEDVIO integra distintos flujos docentes en una sola experiencia.','baja','TEDVIO Demo',array['demo','inicio'],'comprender'),
   (uid,'Demo 2','TEDVIO Demo','Conociendo TEDVIO','true_false','TEDVIO puede registrar participación en tiempo real.','["Verdadero","Falso"]'::jsonb,'"Verdadero"'::jsonb,'Las sesiones Live registran participación y respuestas en tiempo real.','baja','TEDVIO Demo',array['demo','live'],'recordar'),
   (uid,'Demo 3','TEDVIO Demo','Preferencias','poll','¿Qué te gustaría probar primero?','["Sesión en vivo","Asistencia QR","Tareas","Analítica"]'::jsonb,null,null,'baja','TEDVIO Demo',array['demo','encuesta'],'comprender'),
   (uid,'Demo 4','TEDVIO Demo','Experiencia','scale_5','¿Qué tan clara te parece esta experiencia inicial?','["1","2","3","4","5"]'::jsonb,null,null,'baja','TEDVIO Demo',array['demo','escala'],'evaluar'),
   (uid,'Demo 5','TEDVIO Demo','Funciones','multiple_select','Selecciona funciones disponibles en TEDVIO.','["Sesiones en vivo","Tareas asincrónicas","Asistencia QR","Control de tráfico aéreo"]'::jsonb,'["Asistencia QR","Sesiones en vivo","Tareas asincrónicas"]'::jsonb,'TEDVIO integra Live, Assignments y asistencia QR, entre otros módulos.','baja','TEDVIO Demo',array['demo','funciones'],'comprender');
 end if;
 update public.v2_sessions set status='closed',closed_at=now() where teacher_id=uid and coalesce(is_demo,false)=true and status<>'closed';
 for i in 1..20 loop
   v_code:=(floor(random()*900000)+100000)::int::text;
   begin
     insert into public.v2_sessions(teacher_id,code,title,status,competitive,team_mode,group_id,roster_required,is_demo) values(uid,v_code,'Clase Demo TEDVIO','draft',true,false,v_group,false,true) returning id into v_session;
     exit;
   exception when unique_violation then null;
   end;
 end loop;
 if v_session is null then raise exception 'No pude generar un código demo'; end if;
 insert into public.v2_questions(session_id,bank_id,position,prompt,question_type,options,correct_answer,media_url,media_type,timer_seconds,status,explanation,difficulty)
 select v_session,b.id,row_number() over(order by b.title),b.prompt,b.question_type,b.options,b.correct_answer,b.media_url,b.media_type,30,'queued',b.explanation,b.difficulty from public.v2_question_bank b where b.teacher_id=uid and b.folder='TEDVIO Demo' order by b.title limit 5;
 insert into public.tedvio_onboarding_progress(user_id,last_step,completed_steps,dismissed,demo_group_id,demo_session_id,updated_at) values(uid,'demo',array['demo'],false,v_group,v_session,now()) on conflict(user_id) do update set last_step='demo',completed_steps=(select array_agg(distinct x) from unnest(public.tedvio_onboarding_progress.completed_steps||array['demo']) x),dismissed=false,demo_group_id=v_group,demo_session_id=v_session,updated_at=now();
 insert into public.tedvio_activation_events(user_id,event_type,context) values(uid,'demo_workspace_created',jsonb_build_object('group_id',v_group,'session_id',v_session));
 return jsonb_build_object('ok',true,'group_id',v_group,'session_id',v_session,'code',v_code,'students',10,'questions',5);
end$$;
revoke all on function tedvio_private.create_demo_workspace_v68() from public,anon;
grant execute on function tedvio_private.create_demo_workspace_v68() to authenticated,service_role;
create or replace function public.tedvio_create_demo_v68() returns jsonb language sql security invoker set search_path='' as $$select tedvio_private.create_demo_workspace_v68()$$;
revoke execute on function public.tedvio_create_demo_v68() from public,anon;
grant execute on function public.tedvio_create_demo_v68() to authenticated,service_role;

create or replace function tedvio_private.launch_first_session_v68(p_group_id uuid,p_bank_ids uuid[])
returns jsonb language plpgsql security definer set search_path='public' as $$
declare uid uuid:=auth.uid(); v_session uuid; v_code text; i int; n int;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 if not exists(select 1 from public.v2_groups where id=p_group_id and teacher_id=uid and coalesce(is_demo,false)=false) then raise exception 'Grupo no válido'; end if;
 n:=coalesce(array_length(p_bank_ids,1),0); if n<1 then raise exception 'Selecciona al menos una pregunta'; end if;
 if (select count(*) from public.v2_question_bank where teacher_id=uid and id=any(p_bank_ids))<>n then raise exception 'Banco no válido'; end if;
 for i in 1..20 loop
   v_code:=(floor(random()*900000)+100000)::int::text;
   begin
    insert into public.v2_sessions(teacher_id,code,title,status,competitive,team_mode,group_id,roster_required,is_demo) select uid,v_code,coalesce(nullif(subject,''),'Mi primera clase TEDVIO'),'draft',true,false,id,false,false from public.v2_groups where id=p_group_id returning id into v_session;
    exit;
   exception when unique_violation then null;
   end;
 end loop;
 if v_session is null then raise exception 'No pude generar un código de sesión'; end if;
 insert into public.v2_questions(session_id,bank_id,position,prompt,question_type,options,correct_answer,media_url,media_type,timer_seconds,status,explanation,difficulty)
 select v_session,b.id,u.ord::int,b.prompt,b.question_type,b.options,b.correct_answer,b.media_url,b.media_type,30,'queued',b.explanation,b.difficulty from unnest(p_bank_ids) with ordinality u(id,ord) join public.v2_question_bank b on b.id=u.id where b.teacher_id=uid order by u.ord;
 insert into public.tedvio_activation_events(user_id,event_type,context) values(uid,'first_session_created',jsonb_build_object('group_id',p_group_id,'session_id',v_session,'question_count',n));
 insert into public.tedvio_onboarding_progress(user_id,last_step,completed_steps,dismissed,completed_at,updated_at) values(uid,'complete',array['course','students','question','session'],false,now(),now()) on conflict(user_id) do update set last_step='complete',completed_steps=(select array_agg(distinct x) from unnest(public.tedvio_onboarding_progress.completed_steps||array['course','students','question','session']) x),dismissed=false,completed_at=coalesce(public.tedvio_onboarding_progress.completed_at,now()),updated_at=now();
 return jsonb_build_object('ok',true,'session_id',v_session,'code',v_code,'questions',n);
end$$;
revoke all on function tedvio_private.launch_first_session_v68(uuid,uuid[]) from public,anon;
grant execute on function tedvio_private.launch_first_session_v68(uuid,uuid[]) to authenticated,service_role;
create or replace function public.tedvio_launch_first_session_v68(p_group_id uuid,p_bank_ids uuid[]) returns jsonb language sql security invoker set search_path='' as $$select tedvio_private.launch_first_session_v68(p_group_id,p_bank_ids)$$;
revoke execute on function public.tedvio_launch_first_session_v68(uuid,uuid[]) from public,anon;
grant execute on function public.tedvio_launch_first_session_v68(uuid,uuid[]) to authenticated,service_role;

