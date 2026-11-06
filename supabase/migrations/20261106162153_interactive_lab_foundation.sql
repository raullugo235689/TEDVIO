-- Interactive Lab: first incremental backend. Unapplied in production.
-- No legacy assignment dependency and no changes to the academic roster/gradebook.
begin;

create table public.v2_lab_activities (
 id uuid primary key default gen_random_uuid(),
 teacher_id uuid not null references auth.users(id),
 title text not null check (length(btrim(title)) between 1 and 160),
 description text not null default '' check (length(description) <= 4000),
 subject text not null default '' check (length(subject) <= 160),
 tags text[] not null default '{}' check (cardinality(tags) <= 20),
 status text not null default 'draft' check (status in ('draft','published','archived')),
 revision bigint not null default 0,
 created_at timestamptz not null default now(),
 unique (id, teacher_id)
);
create table public.v2_lab_versions (
 id uuid primary key default gen_random_uuid(),
 activity_id uuid not null,
 teacher_id uuid not null,
 version integer not null check (version > 0),
 evaluator text not null check (evaluator in ('answer-key-v1','review-required-v1')),
 manifest jsonb not null check (jsonb_typeof(manifest) = 'object'),
 created_at timestamptz not null default now(),
 foreign key (activity_id,teacher_id) references public.v2_lab_activities(id,teacher_id),
 unique(activity_id,version), unique(id,teacher_id)
);
-- Answer keys must never be returned by a learner RPC or passed to an iframe.
create table tedvio_private.lab_answer_keys (
 version_id uuid primary key references public.v2_lab_versions(id),
 answer_key jsonb not null check (jsonb_typeof(answer_key) = 'object')
);
create table public.v2_lab_resources (
 id uuid primary key default gen_random_uuid(),
 version_id uuid not null,
 teacher_id uuid not null,
 relative_path text not null check (length(relative_path) between 1 and 240 and relative_path ~ '^[A-Za-z0-9_-][A-Za-z0-9_./-]*$' and relative_path !~ '(^|/)\.\.(/|$)' and relative_path !~ '//'),
 sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
 byte_size integer not null check (byte_size between 1 and 10485760),
 mime_type text not null,
 review_status text not null default 'quarantined' check (review_status in ('quarantined','approved','rejected')),
 foreign key(version_id,teacher_id) references public.v2_lab_versions(id,teacher_id),
 unique(version_id,relative_path)
);
-- Resource registration/import and isolated execution are gated in a later increment.
-- This migration deliberately does not grant clients INSERT on resources.
create table public.v2_lab_assignments (
 id uuid primary key default gen_random_uuid(),
 teacher_id uuid not null,
 version_id uuid not null,
 title text not null check (length(btrim(title)) between 1 and 160),
 mode text not null check (mode in ('practice','evaluation')),
 selection_rule text not null check (selection_rule in ('first','last','best')),
 opens_at timestamptz not null,
 closes_at timestamptz not null,
 max_attempts integer not null check(max_attempts between 1 and 20),
 duration_seconds integer check(duration_seconds between 30 and 14400),
 feedback_enabled boolean not null default false,
 status text not null default 'draft' check(status in ('draft','published','withdrawn')),
 created_at timestamptz not null default now(),
 check(closes_at > opens_at and closes_at <= opens_at + interval '366 days'),
 foreign key(version_id,teacher_id) references public.v2_lab_versions(id,teacher_id),
 unique(id,teacher_id)
);
create table public.v2_lab_recipients (
 id uuid primary key default gen_random_uuid(),
 assignment_id uuid not null,
 teacher_id uuid not null,
 group_id uuid not null references public.v2_groups(id),
 student_id uuid not null references public.v2_group_students(id),
 foreign key(assignment_id,teacher_id) references public.v2_lab_assignments(id,teacher_id),
 unique(assignment_id,student_id), unique(id,teacher_id)
);
-- A teacher issues a personal credential after verifying the recipient. The
-- enrollment number is never accepted as proof of identity. Only a hash is kept.
create table tedvio_private.lab_access (
 recipient_id uuid primary key references public.v2_lab_recipients(id),
 token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),
 expires_at timestamptz not null,
 revoked boolean not null default false,
 issued_at timestamptz not null default now()
);
create table public.v2_lab_attempts (
 id uuid primary key default gen_random_uuid(),
 recipient_id uuid not null,
 teacher_id uuid not null,
 attempt_number integer not null check(attempt_number > 0),
 start_request_id uuid not null,
 started_at timestamptz not null default clock_timestamp(),
 deadline_at timestamptz not null,
 submitted_at timestamptz,
 status text not null default 'started' check(status in ('started','verified','provisional')),
 submission_request_id uuid,
 submission_hash text,
 earned numeric, maximum numeric, score_percent numeric,
 foreign key(recipient_id,teacher_id) references public.v2_lab_recipients(id,teacher_id),
 unique(recipient_id,attempt_number), unique(recipient_id,start_request_id),
 unique(id,teacher_id),
 check((status='started' and submitted_at is null and submission_request_id is null and submission_hash is null and earned is null and maximum is null and score_percent is null)
    or (status='provisional' and submitted_at is not null and submission_request_id is not null and submission_hash is not null and earned is null and maximum is null and score_percent is null)
    or (status='verified' and submitted_at is not null and submission_request_id is not null and submission_hash is not null and maximum > 0 and earned between 0 and maximum and score_percent between 0 and 100))
);
create table public.v2_lab_responses (
 attempt_id uuid not null,
 teacher_id uuid not null,
 question_id text not null,
 answer jsonb,
 correct boolean,
 awarded numeric,
 primary key(attempt_id,question_id),
 foreign key(attempt_id,teacher_id) references public.v2_lab_attempts(id,teacher_id)
);
create table public.v2_lab_audit (
 id bigint generated always as identity primary key,
 teacher_id uuid not null references auth.users(id),
 actor_type text not null check(actor_type in ('teacher','learner')),
 entity_id uuid not null,
 action text not null,
 created_at timestamptz not null default clock_timestamp()
);
create index lab_activity_owner_idx on public.v2_lab_activities(teacher_id,created_at desc,id);
create index lab_version_owner_idx on public.v2_lab_versions(teacher_id,activity_id,version desc);
create index lab_assignment_owner_idx on public.v2_lab_assignments(teacher_id,created_at desc,id);
create index lab_recipient_group_idx on public.v2_lab_recipients(teacher_id,group_id,assignment_id);
create index lab_attempt_recipient_idx on public.v2_lab_attempts(recipient_id,attempt_number);
create index lab_audit_owner_idx on public.v2_lab_audit(teacher_id,created_at desc,id);

-- Account status is read from the protected server profile, never user_metadata.
create function tedvio_private.lab_active_owner()
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.tedvio_user_profiles p where p.user_id=auth.uid()
 and p.status='active' and p.role in ('teacher','institution_admin','admin'))
$$;
revoke all on function tedvio_private.lab_active_owner() from public,anon,authenticated;
grant usage on schema tedvio_private to authenticated;
grant execute on function tedvio_private.lab_active_owner() to authenticated;

-- Deny raw writes, including from the owner. All writes use validated RPCs.
do $$declare t text; begin
 foreach t in array array['v2_lab_activities','v2_lab_versions','v2_lab_resources','v2_lab_assignments','v2_lab_recipients','v2_lab_attempts','v2_lab_responses','v2_lab_audit'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public, anon, authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy lab_owner_read on public.%I for select to authenticated using (teacher_id=(select auth.uid()) and tedvio_private.lab_active_owner())',t);
 end loop;
end $$;
alter table tedvio_private.lab_answer_keys enable row level security;
alter table tedvio_private.lab_access enable row level security;
revoke all on tedvio_private.lab_answer_keys,tedvio_private.lab_access from public,anon,authenticated;
revoke all on sequence public.v2_lab_audit_id_seq from public,anon,authenticated;

-- Full qualification and a fixed empty search_path for all privileged functions.
create function tedvio_private.lab_assert_group(p_teacher uuid,p_group uuid)
returns void language plpgsql stable set search_path='' as $$
declare institution uuid;
begin
 if not exists(select 1 from public.tedvio_user_profiles p where p.user_id=p_teacher and p.status='active' and p.role in ('teacher','institution_admin','admin')) then raise exception 'Cuenta docente no disponible.' using errcode='42501'; end if;
 if not exists(select 1 from public.v2_groups g join public.v2_programs p on p.id=g.program_id
  join public.v2_universities u on u.id=p.university_id
  where g.id=p_group and g.teacher_id=p_teacher and p.teacher_id=p_teacher and u.teacher_id=p_teacher and not g.is_demo)
 then raise exception 'Grupo no disponible.' using errcode='42501'; end if;
 select u.institution_id into institution from public.v2_groups g
 join public.v2_programs p on p.id=g.program_id join public.v2_universities u on u.id=p.university_id where g.id=p_group;
 if institution is not null and not exists(select 1 from public.tedvio_institution_memberships m
 join public.tedvio_institutions i on i.id=m.institution_id
 where m.institution_id=institution and m.user_id=p_teacher and m.status='active' and i.status='active')
 then raise exception 'Acceso institucional no disponible.' using errcode='42501'; end if;
end $$;
revoke all on function tedvio_private.lab_assert_group(uuid,uuid) from public,anon,authenticated;

-- Direct SELECT must honor institutional revocation too, not just the RPCs.
create function tedvio_private.lab_can_read_group(p_group uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.v2_groups g join public.v2_programs p on p.id=g.program_id
 join public.v2_universities u on u.id=p.university_id
 where tedvio_private.lab_active_owner() and g.id=p_group and g.teacher_id=auth.uid() and p.teacher_id=auth.uid() and u.teacher_id=auth.uid()
 and not g.is_demo and (u.institution_id is null or exists(select 1 from public.tedvio_institution_memberships m
 join public.tedvio_institutions i on i.id=m.institution_id
 where m.institution_id=u.institution_id and m.user_id=auth.uid() and m.status='active' and i.status='active')))
$$;
create function tedvio_private.lab_can_read_recipient(p_recipient uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.v2_lab_recipients r where r.id=p_recipient and r.teacher_id=auth.uid()
 and tedvio_private.lab_can_read_group(r.group_id))
$$;
create function tedvio_private.lab_can_read_assignment(p_assignment uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.v2_lab_assignments a where a.id=p_assignment and a.teacher_id=auth.uid())
 and not exists(select 1 from public.v2_lab_recipients r where r.assignment_id=p_assignment and not tedvio_private.lab_can_read_group(r.group_id))
$$;
revoke all on function tedvio_private.lab_can_read_group(uuid),tedvio_private.lab_can_read_recipient(uuid),tedvio_private.lab_can_read_assignment(uuid) from public,anon,authenticated;
grant usage on schema tedvio_private to authenticated;
grant execute on function tedvio_private.lab_can_read_group(uuid),tedvio_private.lab_can_read_recipient(uuid),tedvio_private.lab_can_read_assignment(uuid) to authenticated;
alter policy lab_owner_read on public.v2_lab_assignments using(teacher_id=(select auth.uid()) and tedvio_private.lab_can_read_assignment(id));
alter policy lab_owner_read on public.v2_lab_recipients using(teacher_id=(select auth.uid()) and tedvio_private.lab_can_read_group(group_id));
alter policy lab_owner_read on public.v2_lab_attempts using(teacher_id=(select auth.uid()) and tedvio_private.lab_can_read_recipient(recipient_id));
alter policy lab_owner_read on public.v2_lab_responses using(teacher_id=(select auth.uid()) and exists(select 1 from public.v2_lab_attempts a where a.id=attempt_id));

-- The manifest is public data, NEVER a general executable scoring program.
-- Unknown keys are rejected, rather than silently persisting private answer keys.
create function tedvio_private.lab_validate_version(p_manifest jsonb,p_key jsonb,p_evaluator text)
returns void language plpgsql immutable set search_path='' as $$
declare q jsonb; k jsonb; ids text[]:='{}'; qid text; option_id text; choices text[]; weight numeric;
begin
 if p_manifest is null or p_key is null or p_evaluator is null or p_evaluator not in ('answer-key-v1','review-required-v1')
  or jsonb_typeof(p_manifest)<>'object' or jsonb_typeof(p_key)<>'object'
  or octet_length(p_manifest::text)>262144 or octet_length(p_key::text)>65536
 then raise exception 'Versión inválida.' using errcode='22023'; end if;
 if (p_manifest - array['protocol','title','instructions','questions']) <> '{}'::jsonb
  or p_manifest->>'protocol' is distinct from 'tedvio.lab/1'
  or jsonb_typeof(p_manifest->'questions') is distinct from 'array'
  or jsonb_typeof(p_manifest->'title') is distinct from 'string'
  or length(p_manifest->>'title') not between 1 and 160
  or (p_manifest ? 'instructions' and (jsonb_typeof(p_manifest->'instructions')<>'string' or length(p_manifest->>'instructions')>4000))
 then raise exception 'Manifiesto público inválido.' using errcode='22023'; end if;
 if jsonb_array_length(p_manifest->'questions') not between 1 and 100 then raise exception 'Usa de 1 a 100 preguntas.' using errcode='22023'; end if;
 for q in select value from jsonb_array_elements(p_manifest->'questions') loop
  qid:=q->>'id'; choices:='{}';
  if jsonb_typeof(q)<>'object' or (q-array['id','type','prompt','options'])<>'{}'::jsonb
   or jsonb_typeof(q->'id') is distinct from 'string' or qid is null or qid !~ '^[A-Za-z0-9_-]{1,64}$' or qid=any(ids)
   or jsonb_typeof(q->'prompt') is distinct from 'string' or length(q->>'prompt') not between 1 and 2000
   or q->>'type' is null or q->>'type' not in ('choice','numeric','text')
  then raise exception 'Pregunta inválida o repetida.' using errcode='22023'; end if;
  ids:=array_append(ids,qid);
  if q->>'type'='choice' then
   if jsonb_typeof(q->'options') is distinct from 'array' then raise exception 'Opciones inválidas.' using errcode='22023'; end if;
   if jsonb_array_length(q->'options') not between 2 and 12 then raise exception 'Opciones inválidas.' using errcode='22023'; end if;
   for k in select value from jsonb_array_elements(q->'options') loop
    option_id:=k->>'id';
    if jsonb_typeof(k)<>'object' or (k-array['id','label'])<>'{}'::jsonb or jsonb_typeof(k->'id') is distinct from 'string' or option_id is null or option_id !~ '^[A-Za-z0-9_-]{1,64}$'
      or option_id=any(choices) or jsonb_typeof(k->'label') is distinct from 'string' or length(k->>'label') not between 1 and 1000
    then raise exception 'Opción inválida o repetida.' using errcode='22023'; end if;
    choices:=array_append(choices,option_id);
   end loop;
  elsif q ? 'options' then raise exception 'Este tipo no usa opciones.' using errcode='22023'; end if;
  if p_evaluator='answer-key-v1' then
   k:=p_key->qid;
   if k is null or jsonb_typeof(k)<>'object' or (k-array['answer','weight','tolerance'])<>'{}'::jsonb
    or jsonb_typeof(k->'weight') is distinct from 'number' then raise exception 'Clave incompleta.' using errcode='22023'; end if;
   weight:=(k->>'weight')::numeric;
   if weight<=0 or weight>1000 then raise exception 'Ponderación inválida.' using errcode='22023'; end if;
   if q->>'type'='choice' then
    if jsonb_typeof(k->'answer') is distinct from 'string' or not ((k->>'answer')=any(choices)) or k ? 'tolerance'
    then raise exception 'Clave fuera de opciones.' using errcode='22023'; end if;
   elsif q->>'type'='numeric' then
    if jsonb_typeof(k->'answer') is distinct from 'number' or jsonb_typeof(k->'tolerance') is distinct from 'number'
     or abs((k->>'answer')::numeric)>1e12 or (k->>'tolerance')::numeric<0 or (k->>'tolerance')::numeric>1e12
    then raise exception 'Clave numérica inválida.' using errcode='22023'; end if;
   else raise exception 'Respuesta abierta: requiere revisión docente.' using errcode='22023'; end if;
  end if;
 end loop;
 if p_evaluator='answer-key-v1' and (p_key-ids)<>'{}'::jsonb then raise exception 'Claves desconocidas.' using errcode='22023'; end if;
 if p_evaluator='review-required-v1' and p_key<>'{}'::jsonb then raise exception 'Revisión manual no admite clave automática.' using errcode='22023'; end if;
end $$;
revoke all on function tedvio_private.lab_validate_version(jsonb,jsonb,text) from public,anon,authenticated;

create function public.v2_lab_save_version(p_activity_id uuid,p_expected_revision bigint,p_manifest jsonb,p_answer_key jsonb,p_evaluator text,p_subject text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); a public.v2_lab_activities%rowtype; v public.v2_lab_versions%rowtype; n integer;
begin
 if uid is null or not tedvio_private.lab_active_owner() then raise exception 'Inicia sesión con una cuenta docente activa.' using errcode='42501'; end if;
 perform tedvio_private.lab_validate_version(p_manifest,p_answer_key,p_evaluator);
 if p_subject is null or length(p_subject)>160 then raise exception 'Materia inválida.' using errcode='22023'; end if;
 if p_activity_id is null then
  insert into public.v2_lab_activities(teacher_id,title,subject) values(uid,p_manifest->>'title',p_subject) returning * into a;
 else
  select * into a from public.v2_lab_activities where id=p_activity_id and teacher_id=uid for update;
  if not found then raise exception 'Actividad no disponible.' using errcode='42501'; end if;
  if p_expected_revision is distinct from a.revision then raise exception 'La actividad cambió; vuelve a cargarla.' using errcode='PT409'; end if;
  if a.status='archived' then raise exception 'Actividad archivada.' using errcode='22023'; end if;
 end if;
 select coalesce(max(version),0)+1 into n from public.v2_lab_versions where activity_id=a.id;
 insert into public.v2_lab_versions(activity_id,teacher_id,version,evaluator,manifest) values(a.id,uid,n,p_evaluator,p_manifest) returning * into v;
 insert into tedvio_private.lab_answer_keys values(v.id,p_answer_key);
 update public.v2_lab_activities set revision=revision+1,title=p_manifest->>'title',subject=p_subject where id=a.id;
 insert into public.v2_lab_audit(teacher_id,actor_type,entity_id,action) values(uid,'teacher',v.id,'version_created');
 return jsonb_build_object('activity_id',a.id,'version_id',v.id,'version',n,'revision',a.revision+1);
end $$;

create function public.v2_lab_set_activity_state(p_activity_id uuid,p_expected_revision bigint,p_status text)
returns bigint language plpgsql security definer set search_path='' as $$
declare a public.v2_lab_activities%rowtype;
begin
 if not tedvio_private.lab_active_owner() then raise exception 'Cuenta docente no disponible.' using errcode='42501'; end if;
 select * into a from public.v2_lab_activities where id=p_activity_id and teacher_id=auth.uid() for update;
 if not found then raise exception 'Actividad no disponible.' using errcode='42501'; end if;
 if p_expected_revision is distinct from a.revision then raise exception 'La actividad cambió.' using errcode='PT409'; end if;
 if p_status is null or p_status not in ('draft','published','archived') then raise exception 'Estado inválido.' using errcode='22023'; end if;
 update public.v2_lab_activities set status=p_status,revision=revision+1 where id=a.id;
 insert into public.v2_lab_audit(teacher_id,actor_type,entity_id,action) values(a.teacher_id,'teacher',a.id,'activity_'||p_status);
 -- Existing assignments retain their immutable version. Withdraw them explicitly.
 return a.revision+1;
end $$;

create function public.v2_lab_assign(p_version_id uuid,p_group_ids uuid[],p_title text,p_opens_at timestamptz,p_closes_at timestamptz,p_max_attempts integer default 1,p_mode text default 'practice',p_selection_rule text default 'best',p_duration_seconds integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); a public.v2_lab_assignments%rowtype; gid uuid; total integer;
begin
 if uid is null or not tedvio_private.lab_active_owner() then raise exception 'Inicia sesión con una cuenta docente activa.' using errcode='42501'; end if;
 if p_group_ids is null or cardinality(p_group_ids) not between 1 and 50 or array_position(p_group_ids,null) is not null
  or cardinality(p_group_ids)<>(select count(distinct x) from unnest(p_group_ids) x)
 then raise exception 'Selecciona grupos sin duplicados.' using errcode='22023'; end if;
 if not exists(select 1 from public.v2_lab_versions v join public.v2_lab_activities x on x.id=v.activity_id
  where v.id=p_version_id and v.teacher_id=uid and x.status='published') then raise exception 'Publica una actividad propia.' using errcode='42501'; end if;
 foreach gid in array p_group_ids loop perform tedvio_private.lab_assert_group(uid,gid); end loop;
 insert into public.v2_lab_assignments(teacher_id,version_id,title,opens_at,closes_at,max_attempts,mode,selection_rule,duration_seconds)
 values(uid,p_version_id,p_title,p_opens_at,p_closes_at,p_max_attempts,p_mode,p_selection_rule,p_duration_seconds) returning * into a;
 insert into public.v2_lab_recipients(assignment_id,teacher_id,group_id,student_id)
 select a.id,uid,s.group_id,s.id from public.v2_group_students s
 where s.group_id=any(p_group_ids) and s.teacher_id=uid and s.active;
 get diagnostics total = row_count;
 if total=0 or total>5000 then raise exception 'La selección debe contener entre 1 y 5000 alumnos activos.' using errcode='22023'; end if;
 insert into public.v2_lab_audit(teacher_id,actor_type,entity_id,action) values(uid,'teacher',a.id,'assignment_created');
 return jsonb_build_object('assignment_id',a.id,'recipients',total);
end $$;

create function public.v2_lab_set_assignment_state(p_assignment_id uuid,p_status text,p_feedback_enabled boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare a public.v2_lab_assignments%rowtype; gid uuid;
begin
 select * into a from public.v2_lab_assignments where id=p_assignment_id and teacher_id=auth.uid() for update;
 if not found then raise exception 'Asignación no disponible.' using errcode='42501'; end if;
 if p_status is null or p_status not in ('draft','published','withdrawn') or p_feedback_enabled is null then raise exception 'Estado inválido.' using errcode='22023'; end if;
 for gid in select distinct group_id from public.v2_lab_recipients where assignment_id=a.id loop
  perform tedvio_private.lab_assert_group(a.teacher_id,gid);
 end loop;
 update public.v2_lab_assignments set status=p_status,feedback_enabled=p_feedback_enabled where id=a.id;
 insert into public.v2_lab_audit(teacher_id,actor_type,entity_id,action) values(a.teacher_id,'teacher',a.id,'assignment_'||p_status);
end $$;

create function public.v2_lab_issue_access(p_recipient_id uuid,p_identity_verified boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.v2_lab_recipients%rowtype; expires timestamptz; token text;
begin
 if p_identity_verified is distinct from true then raise exception 'Verifica al destinatario antes de entregar su acceso personal.' using errcode='22023'; end if;
 select * into r from public.v2_lab_recipients where id=p_recipient_id and teacher_id=auth.uid() for update;
 if not found then raise exception 'Destinatario no disponible.' using errcode='42501'; end if;
 perform tedvio_private.lab_assert_group(r.teacher_id,r.group_id);
 if not exists(select 1 from public.v2_group_students where id=r.student_id and group_id=r.group_id and teacher_id=r.teacher_id and active)
 then raise exception 'Destinatario inactivo.' using errcode='42501'; end if;
 -- Separate receipt access from the hard submission deadline. No late writes.
 select closes_at+interval '30 days' into expires from public.v2_lab_assignments where id=r.assignment_id;
 if expires<=clock_timestamp() then raise exception 'Asignación vencida.' using errcode='22023'; end if;
 token:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
 insert into tedvio_private.lab_access(recipient_id,token_hash,expires_at) values(r.id,encode(sha256(convert_to(token,'UTF8')),'hex'),expires)
 on conflict(recipient_id) do update set token_hash=excluded.token_hash,expires_at=excluded.expires_at,revoked=false,issued_at=clock_timestamp();
 insert into public.v2_lab_audit(teacher_id,actor_type,entity_id,action) values(r.teacher_id,'teacher',r.id,'personal_access_issued');
 return jsonb_build_object('token',token,'expires_at',expires,'recipient_id',r.id);
end $$;

create function public.v2_lab_revoke_access(p_recipient_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare r public.v2_lab_recipients%rowtype;
begin
 select * into r from public.v2_lab_recipients where id=p_recipient_id and teacher_id=auth.uid() for update;
 if not found then raise exception 'Destinatario no disponible.' using errcode='42501'; end if;
 perform tedvio_private.lab_assert_group(r.teacher_id,r.group_id);
 update tedvio_private.lab_access set revoked=true where recipient_id=r.id;
 insert into public.v2_lab_audit(teacher_id,actor_type,entity_id,action) values(r.teacher_id,'teacher',r.id,'personal_access_revoked');
end $$;

-- Private helper also serializes all mutations for one recipient (attempt quota,
-- access rotation/revocation and submission). It is not exposed through PostgREST.
create function tedvio_private.lab_recipient(p_token text)
returns public.v2_lab_recipients language plpgsql set search_path='' as $$
declare r public.v2_lab_recipients%rowtype;
begin
 if p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'Acceso no válido o vencido.' using errcode='42501'; end if;
 select r0.* into r from public.v2_lab_recipients r0 join tedvio_private.lab_access t on t.recipient_id=r0.id
 where t.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') for update of r0;
 -- Recheck after taking the recipient lock, including concurrent revocation.
 if not found or not exists(select 1 from tedvio_private.lab_access where recipient_id=r.id
  and token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and not revoked and expires_at>clock_timestamp())
 then raise exception 'Acceso no válido o vencido.' using errcode='42501'; end if;
 perform tedvio_private.lab_assert_group(r.teacher_id,r.group_id);
 if not exists(select 1 from public.v2_group_students s where s.id=r.student_id and s.teacher_id=r.teacher_id and s.group_id=r.group_id and s.active)
 then raise exception 'Acceso no válido o vencido.' using errcode='42501'; end if;
 return r;
end $$;
revoke all on function tedvio_private.lab_recipient(text) from public,anon,authenticated;

create function tedvio_private.lab_attempt_payload(p_attempt public.v2_lab_attempts,p_assignment public.v2_lab_assignments)
returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('protocol','tedvio.lab/1','assignment_id',p_assignment.id,'version_id',p_assignment.version_id,
 'attempt_id',p_attempt.id,'attempt_number',p_attempt.attempt_number,'status',p_attempt.status,
 'started_at',p_attempt.started_at,'deadline_at',p_attempt.deadline_at,'submitted_at',p_attempt.submitted_at,
 'receipt_id',p_attempt.submission_request_id,'server_time',clock_timestamp(),
 'score_percent',case when p_assignment.feedback_enabled then p_attempt.score_percent else null end,
 'official_grade',false)
$$;
revoke all on function tedvio_private.lab_attempt_payload(public.v2_lab_attempts,public.v2_lab_assignments) from public,anon,authenticated;

create function public.v2_lab_begin(p_token text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.v2_lab_recipients%rowtype; a public.v2_lab_assignments%rowtype; t public.v2_lab_attempts%rowtype; n integer; start_time timestamptz; v public.v2_lab_versions%rowtype;
begin
 if p_request_id is null then raise exception 'Falta identificador de solicitud.' using errcode='22023'; end if;
 r:=tedvio_private.lab_recipient(p_token);
 select * into a from public.v2_lab_assignments where id=r.assignment_id for share;
 if a.status<>'published' then raise exception 'Actividad no disponible.' using errcode='42501'; end if;
 select * into t from public.v2_lab_attempts where recipient_id=r.id and start_request_id=p_request_id;
 if not found then
  start_time:=clock_timestamp();
  if start_time<a.opens_at or start_time>=a.closes_at then raise exception 'Fuera del horario de realización.' using errcode='22023'; end if;
  -- Reuse an active attempt instead of consuming quota after a browser reload.
  select * into t from public.v2_lab_attempts where recipient_id=r.id and status='started' and deadline_at>start_time order by attempt_number desc limit 1;
  if not found then
   select coalesce(max(attempt_number),0)+1 into n from public.v2_lab_attempts where recipient_id=r.id;
   if n>a.max_attempts then raise exception 'Se agotaron los intentos permitidos.' using errcode='22023'; end if;
   insert into public.v2_lab_attempts(recipient_id,teacher_id,attempt_number,start_request_id,started_at,deadline_at)
   values(r.id,r.teacher_id,n,p_request_id,start_time,least(a.closes_at,coalesce(start_time+make_interval(secs=>a.duration_seconds),a.closes_at))) returning * into t;
   insert into public.v2_lab_audit(teacher_id,actor_type,entity_id,action) values(r.teacher_id,'learner',t.id,'attempt_started');
  end if;
 end if;
 select * into v from public.v2_lab_versions where id=a.version_id;
 return tedvio_private.lab_attempt_payload(t,a)||jsonb_build_object('activity_id',v.activity_id,'version',v.version,'manifest',v.manifest);
end $$;

create function public.v2_lab_submit(p_token text,p_attempt_id uuid,p_request_id uuid,p_answers jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.v2_lab_recipients%rowtype; a public.v2_lab_assignments%rowtype; t public.v2_lab_attempts%rowtype; v public.v2_lab_versions%rowtype;
 key jsonb; q jsonb; answer jsonb; k jsonb; correct boolean; weight numeric; points numeric:=0; max_points numeric:=0; ids text[]; fingerprint text;
begin
 if p_request_id is null or p_answers is null or jsonb_typeof(p_answers)<>'object' or octet_length(p_answers::text)>65536
 then raise exception 'Entrega inválida.' using errcode='22023'; end if;
 r:=tedvio_private.lab_recipient(p_token);
 select * into a from public.v2_lab_assignments where id=r.assignment_id for share;
 select * into t from public.v2_lab_attempts where id=p_attempt_id and recipient_id=r.id for update;
 if not found then raise exception 'Intento no disponible.' using errcode='42501'; end if;
 fingerprint:=encode(sha256(convert_to(p_answers::text,'UTF8')),'hex');
 if t.status<>'started' then
  if t.submission_request_id=p_request_id and t.submission_hash=fingerprint then return tedvio_private.lab_attempt_payload(t,a); end if;
  raise exception 'El intento ya fue entregado; no se puede sobrescribir.' using errcode='PT409';
 end if;
 if a.status<>'published' or clock_timestamp()<a.opens_at or clock_timestamp()>=t.deadline_at
 then raise exception 'Asignación retirada o tiempo agotado.' using errcode='22023'; end if;
 select * into v from public.v2_lab_versions where id=a.version_id;
 select answer_key into key from tedvio_private.lab_answer_keys where version_id=v.id;
 select array_agg(value->>'id') into ids from jsonb_array_elements(v.manifest->'questions');
 if (p_answers-ids)<>'{}'::jsonb then raise exception 'No se admiten preguntas desconocidas ni calificaciones enviadas por el cliente.' using errcode='22023'; end if;
 for q in select value from jsonb_array_elements(v.manifest->'questions') loop
  answer:=p_answers->(q->>'id'); correct:=null; weight:=null;
  if answer is not null and answer<>'null'::jsonb then
   if q->>'type'='choice' and (jsonb_typeof(answer)<>'string' or not exists(select 1 from jsonb_array_elements(q->'options') o where o->'id'=answer))
   then raise exception 'Respuesta fuera de opciones.' using errcode='22023'; end if;
   if q->>'type'='numeric' and (jsonb_typeof(answer)<>'number' or length(answer::text)>64)
   then raise exception 'Respuesta numérica inválida.' using errcode='22023'; end if;
   if q->>'type'='text' and (jsonb_typeof(answer)<>'string' or length(answer#>>'{}')>4000)
   then raise exception 'Respuesta abierta inválida.' using errcode='22023'; end if;
  end if;
  if v.evaluator='answer-key-v1' then
   k:=key->(q->>'id'); weight:=(k->>'weight')::numeric;
   correct:=case when answer is null or answer='null'::jsonb then false
     when q->>'type'='choice' then answer=k->'answer'
     else abs((answer#>>'{}')::numeric-(k->>'answer')::numeric)<=(k->>'tolerance')::numeric end;
   max_points:=max_points+weight; points:=points+case when correct then weight else 0 end;
  end if;
  insert into public.v2_lab_responses(attempt_id,teacher_id,question_id,answer,correct,awarded)
  values(t.id,r.teacher_id,q->>'id',answer,correct,case when correct then weight when correct=false then 0 else null end);
 end loop;
 update public.v2_lab_attempts set submitted_at=clock_timestamp(),submission_request_id=p_request_id,submission_hash=fingerprint,
 status=case when v.evaluator='answer-key-v1' then 'verified' else 'provisional' end,
 earned=case when v.evaluator='answer-key-v1' then points else null end,
 maximum=case when v.evaluator='answer-key-v1' then max_points else null end,
 score_percent=case when v.evaluator='answer-key-v1' then round(100*points/max_points,2) else null end
 where id=t.id returning * into t;
 insert into public.v2_lab_audit(teacher_id,actor_type,entity_id,action) values(r.teacher_id,'learner',t.id,'attempt_submitted');
 return tedvio_private.lab_attempt_payload(t,a);
end $$;

create function public.v2_lab_receipt(p_token text,p_attempt_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.v2_lab_recipients%rowtype; a public.v2_lab_assignments%rowtype; t public.v2_lab_attempts%rowtype;
begin
 r:=tedvio_private.lab_recipient(p_token);
 select * into t from public.v2_lab_attempts where id=p_attempt_id and recipient_id=r.id;
 if not found then raise exception 'Intento no disponible.' using errcode='42501'; end if;
 select * into a from public.v2_lab_assignments where id=r.assignment_id;
 return tedvio_private.lab_attempt_payload(t,a);
end $$;

create function public.v2_lab_results(p_assignment_id uuid,p_offset integer default 0,p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.v2_lab_assignments%rowtype; gid uuid; result jsonb; summary jsonb;
begin
 select * into a from public.v2_lab_assignments where id=p_assignment_id and teacher_id=auth.uid();
 if not found then raise exception 'Asignación no disponible.' using errcode='42501'; end if;
 if p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 500 then raise exception 'Paginación inválida.' using errcode='22023'; end if;
 for gid in select distinct group_id from public.v2_lab_recipients where assignment_id=a.id loop perform tedvio_private.lab_assert_group(a.teacher_id,gid); end loop;
 select jsonb_agg(x order by x.recipient_id) into result from (
  select r.id recipient_id,r.student_id,r.group_id,s.full_name,s.enrollment,
   (select count(*) from public.v2_lab_attempts t where t.recipient_id=r.id) attempts,
   (select count(*) from public.v2_lab_attempts t where t.recipient_id=r.id and t.submitted_at is not null) finished_attempts,
   (select jsonb_build_object('attempt_id',t.id,'status',t.status,'score_percent',t.score_percent,'attempt_number',t.attempt_number,
    'started_at',t.started_at,'submitted_at',t.submitted_at,'elapsed_seconds',extract(epoch from t.submitted_at-t.started_at),'official_grade',false)
    from public.v2_lab_attempts t where t.recipient_id=r.id and t.submitted_at is not null
    order by case when a.selection_rule='best' then t.score_percent end desc nulls last,
     case when a.selection_rule='first' then t.attempt_number end asc,
     case when a.selection_rule in ('last','best') then t.attempt_number end desc limit 1) selected_result
  from public.v2_lab_recipients r join public.v2_group_students s on s.id=r.student_id
  where r.assignment_id=a.id order by r.id offset p_offset limit p_limit
 )x;
 select jsonb_build_object('assigned',count(*),'started',count(*) filter(where exists(select 1 from public.v2_lab_attempts t where t.recipient_id=r.id)),
  'finished',count(*) filter(where exists(select 1 from public.v2_lab_attempts t where t.recipient_id=r.id and t.submitted_at is not null))) into summary
 from public.v2_lab_recipients r where r.assignment_id=a.id;
 return jsonb_build_object('assignment_id',a.id,'summary',summary,'rows',coalesce(result,'[]'::jsonb),'offset',p_offset,'limit',p_limit,
  'has_more',p_offset+p_limit<(summary->>'assigned')::integer);
end $$;

-- Explicit grants; no PUBLIC EXECUTE inheritance for a SECURITY DEFINER RPC.
do $$declare p record; begin
 for p in select f.oid::regprocedure sig,f.proname from pg_proc f join pg_namespace n on n.oid=f.pronamespace
  where n.nspname='public' and f.proname=any(array['v2_lab_save_version','v2_lab_set_activity_state','v2_lab_assign','v2_lab_set_assignment_state','v2_lab_issue_access','v2_lab_revoke_access','v2_lab_begin','v2_lab_submit','v2_lab_receipt','v2_lab_results']) loop
  execute format('revoke all on function %s from public, anon, authenticated',p.sig);
  execute format('grant execute on function %s to authenticated',p.sig);
  if p.proname in ('v2_lab_begin','v2_lab_submit','v2_lab_receipt') then execute format('grant execute on function %s to anon',p.sig); end if;
 end loop;
end $$;
commit;
