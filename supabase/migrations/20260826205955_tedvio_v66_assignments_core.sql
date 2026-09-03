-- Recovered from the production migration ledger for deterministic rebuilds.
create table public.v2_assignments (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid null references public.v2_groups(id) on delete set null,
  code text not null default upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)) unique,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  instructions text null,
  status text not null default 'draft' check (status in ('draft','published','closed')),
  opens_at timestamptz null,
  closes_at timestamptz null,
  max_attempts integer not null default 1 check (max_attempts between 1 and 5),
  time_limit_minutes integer null check (time_limit_minutes is null or time_limit_minutes between 1 and 300),
  random_question_count integer null check (random_question_count is null or random_question_count > 0),
  shuffle_questions boolean not null default false,
  shuffle_options boolean not null default false,
  feedback_mode text not null default 'after_close' check (feedback_mode in ('score_only','after_submit','after_close')),
  allow_late boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (closes_at is null or opens_at is null or closes_at > opens_at)
);

create table public.v2_assignment_items (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.v2_assignments(id) on delete cascade,
  bank_id uuid null references public.v2_question_bank(id) on delete set null,
  position integer not null check (position > 0),
  points numeric(8,2) not null default 1 check (points > 0 and points <= 100),
  prompt text not null default '',
  question_type text not null default 'multiple_choice' check (question_type in ('multiple_choice','multiple_select','true_false','open_text','numeric','poll','scale_5','ordering','hotspot')),
  options jsonb not null default '[]'::jsonb,
  correct_answer jsonb null,
  explanation text null,
  difficulty text null check (difficulty is null or difficulty in ('baja','media','alta')),
  media_url text null,
  media_type text null check (media_type is null or media_type in ('image','audio','video')),
  created_at timestamptz not null default now(),
  unique(assignment_id,position)
);

create table public.v2_assignment_attempts (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.v2_assignments(id) on delete cascade,
  group_student_id uuid null references public.v2_group_students(id) on delete set null,
  access_token uuid not null default gen_random_uuid() unique,
  display_name text not null,
  enrollment text not null,
  enrollment_key text generated always as (lower(btrim(enrollment))) stored,
  attempt_no integer not null check (attempt_no > 0),
  item_ids uuid[] not null default '{}'::uuid[],
  option_orders jsonb not null default '{}'::jsonb,
  status text not null default 'in_progress' check (status in ('in_progress','submitted')),
  started_at timestamptz not null default now(),
  expires_at timestamptz null,
  submitted_at timestamptz null,
  auto_submitted boolean not null default false,
  late boolean not null default false,
  score numeric(10,2) null,
  max_score numeric(10,2) null,
  percentage numeric(6,2) null,
  unique(assignment_id,enrollment_key,attempt_no)
);

create table public.v2_assignment_responses (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.v2_assignment_attempts(id) on delete cascade,
  assignment_item_id uuid not null references public.v2_assignment_items(id) on delete cascade,
  answer jsonb null,
  is_correct boolean null,
  points numeric(8,2) not null default 0,
  answered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(attempt_id,assignment_item_id)
);

create index v2_assignments_teacher_status_idx on public.v2_assignments(teacher_id,status,created_at desc);
create index v2_assignments_group_idx on public.v2_assignments(group_id) where group_id is not null;
create index v2_assignment_items_assignment_idx on public.v2_assignment_items(assignment_id,position);
create index v2_assignment_items_bank_idx on public.v2_assignment_items(bank_id) where bank_id is not null;
create index v2_assignment_attempts_assignment_idx on public.v2_assignment_attempts(assignment_id,started_at desc);
create index v2_assignment_attempts_lookup_idx on public.v2_assignment_attempts(assignment_id,enrollment_key,status);
create index v2_assignment_responses_attempt_idx on public.v2_assignment_responses(attempt_id);
create index v2_assignment_responses_item_idx on public.v2_assignment_responses(assignment_item_id);

alter table public.v2_assignments enable row level security;
alter table public.v2_assignment_items enable row level security;
alter table public.v2_assignment_attempts enable row level security;
alter table public.v2_assignment_responses enable row level security;

create policy v2_assignments_owner_select on public.v2_assignments for select to authenticated using ((select auth.uid()) = teacher_id);
create policy v2_assignments_owner_insert on public.v2_assignments for insert to authenticated with check ((select auth.uid()) = teacher_id and (group_id is null or group_id in (select g.id from public.v2_groups g where g.teacher_id=(select auth.uid()))));
create policy v2_assignments_owner_update on public.v2_assignments for update to authenticated using ((select auth.uid()) = teacher_id) with check ((select auth.uid()) = teacher_id and (group_id is null or group_id in (select g.id from public.v2_groups g where g.teacher_id=(select auth.uid()))));
create policy v2_assignments_owner_delete on public.v2_assignments for delete to authenticated using ((select auth.uid()) = teacher_id);

create policy v2_assignment_items_owner_select on public.v2_assignment_items for select to authenticated using (assignment_id in (select a.id from public.v2_assignments a where a.teacher_id=(select auth.uid())));
create policy v2_assignment_items_owner_insert on public.v2_assignment_items for insert to authenticated with check (assignment_id in (select a.id from public.v2_assignments a where a.teacher_id=(select auth.uid())));
create policy v2_assignment_items_owner_update on public.v2_assignment_items for update to authenticated using (assignment_id in (select a.id from public.v2_assignments a where a.teacher_id=(select auth.uid()))) with check (assignment_id in (select a.id from public.v2_assignments a where a.teacher_id=(select auth.uid())));
create policy v2_assignment_items_owner_delete on public.v2_assignment_items for delete to authenticated using (assignment_id in (select a.id from public.v2_assignments a where a.teacher_id=(select auth.uid())));

create policy v2_assignment_attempts_teacher_select on public.v2_assignment_attempts for select to authenticated using (assignment_id in (select a.id from public.v2_assignments a where a.teacher_id=(select auth.uid())));
create policy v2_assignment_responses_teacher_select on public.v2_assignment_responses for select to authenticated using (attempt_id in (select at.id from public.v2_assignment_attempts at join public.v2_assignments a on a.id=at.assignment_id where a.teacher_id=(select auth.uid())));

revoke all on public.v2_assignments, public.v2_assignment_items, public.v2_assignment_attempts, public.v2_assignment_responses from anon;
grant select,insert,update,delete on public.v2_assignments, public.v2_assignment_items to authenticated;
grant select on public.v2_assignment_attempts, public.v2_assignment_responses to authenticated;
grant all on public.v2_assignments, public.v2_assignment_items, public.v2_assignment_attempts, public.v2_assignment_responses to service_role;

create schema if not exists tedvio_private;

create or replace function tedvio_private.assignment_item_snapshot_v66()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_teacher uuid; b public.v2_question_bank%rowtype;
begin
  if new.bank_id is null then raise exception 'BANK_QUESTION_REQUIRED'; end if;
  select teacher_id into v_teacher from public.v2_assignments where id=new.assignment_id;
  if v_teacher is null then raise exception 'ASSIGNMENT_NOT_FOUND'; end if;
  select * into b from public.v2_question_bank where id=new.bank_id and teacher_id=v_teacher;
  if b.id is null then raise exception 'BANK_QUESTION_NOT_OWNED'; end if;
  new.prompt:=b.prompt; new.question_type:=b.question_type; new.options:=coalesce(b.options,'[]'::jsonb);
  new.correct_answer:=b.correct_answer; new.explanation:=b.explanation; new.difficulty:=b.difficulty;
  new.media_url:=b.media_url; new.media_type:=b.media_type;
  return new;
end $$;
revoke all on function tedvio_private.assignment_item_snapshot_v66() from public,anon,authenticated;

create or replace function tedvio_private.assignment_items_freeze_v66()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_assignment uuid;
begin
  v_assignment:=coalesce(new.assignment_id,old.assignment_id);
  if exists(select 1 from public.v2_assignment_attempts where assignment_id=v_assignment) then raise exception 'ASSIGNMENT_HAS_ATTEMPTS'; end if;
  return coalesce(new,old);
end $$;
revoke all on function tedvio_private.assignment_items_freeze_v66() from public,anon,authenticated;

create or replace function tedvio_private.assignment_freeze_v66()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='DELETE' then
    if exists(select 1 from public.v2_assignment_attempts where assignment_id=old.id) then raise exception 'ASSIGNMENT_HAS_ATTEMPTS'; end if;
    return old;
  end if;
  if new.teacher_id is distinct from old.teacher_id or new.code is distinct from old.code then raise exception 'ASSIGNMENT_IDENTITY_IMMUTABLE'; end if;
  if exists(select 1 from public.v2_assignment_attempts where assignment_id=old.id) and (
    new.group_id is distinct from old.group_id or new.opens_at is distinct from old.opens_at or new.max_attempts is distinct from old.max_attempts or
    new.time_limit_minutes is distinct from old.time_limit_minutes or new.random_question_count is distinct from old.random_question_count or
    new.shuffle_questions is distinct from old.shuffle_questions or new.shuffle_options is distinct from old.shuffle_options or
    new.feedback_mode is distinct from old.feedback_mode or new.allow_late is distinct from old.allow_late
  ) then raise exception 'ASSIGNMENT_RULES_FROZEN'; end if;
  new.updated_at:=now(); return new;
end $$;
revoke all on function tedvio_private.assignment_freeze_v66() from public,anon,authenticated;

create trigger tedvio_v66_assignment_item_snapshot before insert or update of bank_id on public.v2_assignment_items for each row execute function tedvio_private.assignment_item_snapshot_v66();
create trigger tedvio_v66_assignment_items_freeze before insert or update or delete on public.v2_assignment_items for each row execute function tedvio_private.assignment_items_freeze_v66();
create trigger tedvio_v66_assignment_freeze before update or delete on public.v2_assignments for each row execute function tedvio_private.assignment_freeze_v66();

create or replace function tedvio_private.finalize_assignment_attempt_v66(p_attempt_id uuid,p_auto boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare at public.v2_assignment_attempts%rowtype; a public.v2_assignments%rowtype; v_max numeric:=0; v_score numeric:=0;
begin
  select * into at from public.v2_assignment_attempts where id=p_attempt_id for update;
  if at.id is null or at.status='submitted' then return; end if;
  select * into a from public.v2_assignments where id=at.assignment_id;
  select coalesce(sum(i.points),0) into v_max from public.v2_assignment_items i where i.id=any(at.item_ids) and i.question_type in ('multiple_choice','multiple_select','true_false','numeric','ordering','hotspot');
  select coalesce(sum(r.points),0) into v_score from public.v2_assignment_responses r where r.attempt_id=at.id;
  update public.v2_assignment_attempts set status='submitted',submitted_at=now(),auto_submitted=p_auto,late=(a.closes_at is not null and now()>a.closes_at),score=v_score,max_score=v_max,percentage=case when v_max>0 then round((v_score/v_max)*100,2) else null end where id=at.id;
end $$;
revoke all on function tedvio_private.finalize_assignment_attempt_v66(uuid,boolean) from public,anon,authenticated;

create or replace function tedvio_private.assignment_meta_v66(p_code text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.v2_assignments%rowtype; gname text; eff text;
begin
  select * into a from public.v2_assignments where upper(code)=upper(btrim(p_code));
  if a.id is null or a.status='draft' then return null; end if;
  select coalesce(group_name,name) into gname from public.v2_groups where id=a.group_id;
  eff:=case when a.status='closed' then 'closed' when a.opens_at is not null and now()<a.opens_at then 'scheduled' when a.closes_at is not null and now()>a.closes_at and not a.allow_late then 'closed' else 'open' end;
  return jsonb_build_object('id',a.id,'code',a.code,'title',a.title,'instructions',a.instructions,'status',eff,'group_name',gname,'roster_required',a.group_id is not null,'opens_at',a.opens_at,'closes_at',a.closes_at,'max_attempts',a.max_attempts,'time_limit_minutes',a.time_limit_minutes,'feedback_mode',a.feedback_mode,'allow_late',a.allow_late);
end $$;
revoke all on function tedvio_private.assignment_meta_v66(text) from public;
grant execute on function tedvio_private.assignment_meta_v66(text) to anon,authenticated,service_role;

create or replace function tedvio_private.start_assignment_attempt_v66(p_code text,p_name text,p_enrollment text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.v2_assignments%rowtype; gs public.v2_group_students%rowtype; active public.v2_assignment_attempts%rowtype; oldat record; v_name text; v_enroll text; v_count int; v_ids uuid[]; v_orders jsonb:='{}'::jsonb; r record; shuffled jsonb; v_exp timestamptz; newat public.v2_assignment_attempts%rowtype;
begin
  select * into a from public.v2_assignments where upper(code)=upper(btrim(p_code)) for update;
  if a.id is null or a.status<>'published' then raise exception 'ASSIGNMENT_UNAVAILABLE'; end if;
  if a.opens_at is not null and now()<a.opens_at then raise exception 'ASSIGNMENT_NOT_OPEN'; end if;
  if a.closes_at is not null and now()>a.closes_at and not a.allow_late then raise exception 'ASSIGNMENT_CLOSED'; end if;
  v_enroll:=btrim(coalesce(p_enrollment,'')); if v_enroll='' then raise exception 'ENROLLMENT_REQUIRED'; end if;
  if a.group_id is not null then
    select * into gs from public.v2_group_students where group_id=a.group_id and active and lower(btrim(enrollment))=lower(v_enroll) limit 1;
    if gs.id is null then raise exception 'STUDENT_NOT_IN_GROUP'; end if;
    v_name:=gs.full_name; v_enroll:=gs.enrollment;
  else
    v_name:=btrim(coalesce(p_name,'')); if v_name='' then raise exception 'NAME_REQUIRED'; end if;
  end if;
  for oldat in select id from public.v2_assignment_attempts where assignment_id=a.id and enrollment_key=lower(v_enroll) and status='in_progress' and expires_at is not null and now()>=expires_at loop perform tedvio_private.finalize_assignment_attempt_v66(oldat.id,true); end loop;
  select * into active from public.v2_assignment_attempts where assignment_id=a.id and enrollment_key=lower(v_enroll) and status='in_progress' order by started_at desc limit 1;
  if active.id is not null then return jsonb_build_object('attempt_id',active.id,'token',active.access_token,'attempt_no',active.attempt_no,'started_at',active.started_at,'expires_at',active.expires_at,'late',active.late,'resumed',true); end if;
  select count(*) into v_count from public.v2_assignment_attempts where assignment_id=a.id and enrollment_key=lower(v_enroll);
  if v_count>=a.max_attempts then raise exception 'ATTEMPTS_EXHAUSTED'; end if;
  if a.shuffle_questions then
    select array_agg(x.id) into v_ids from (select i.id from public.v2_assignment_items i where i.assignment_id=a.id order by random() limit coalesce(a.random_question_count,2147483647)) x;
  else
    select array_agg(x.id order by x.position) into v_ids from (select i.id,i.position from public.v2_assignment_items i where i.assignment_id=a.id order by i.position limit coalesce(a.random_question_count,2147483647)) x;
  end if;
  if coalesce(array_length(v_ids,1),0)=0 then raise exception 'ASSIGNMENT_HAS_NO_QUESTIONS'; end if;
  for r in select i.id,i.question_type,i.options from public.v2_assignment_items i where i.id=any(v_ids) loop
    if r.question_type='ordering' or (a.shuffle_options and r.question_type in ('multiple_choice','multiple_select','true_false','poll')) then
      select coalesce(jsonb_agg(e.value order by random()),'[]'::jsonb) into shuffled from jsonb_array_elements(r.options) e(value);
      v_orders:=v_orders||jsonb_build_object(r.id::text,shuffled);
    end if;
  end loop;
  if a.time_limit_minutes is not null then v_exp:=now()+(a.time_limit_minutes*interval '1 minute'); end if;
  if a.closes_at is not null and not a.allow_late then v_exp:=case when v_exp is null then a.closes_at else least(v_exp,a.closes_at) end; end if;
  insert into public.v2_assignment_attempts(assignment_id,group_student_id,display_name,enrollment,attempt_no,item_ids,option_orders,expires_at,late)
  values(a.id,gs.id,v_name,v_enroll,v_count+1,v_ids,v_orders,v_exp,(a.closes_at is not null and now()>a.closes_at)) returning * into newat;
  return jsonb_build_object('attempt_id',newat.id,'token',newat.access_token,'attempt_no',newat.attempt_no,'started_at',newat.started_at,'expires_at',newat.expires_at,'late',newat.late,'resumed',false,'display_name',newat.display_name);
end $$;
revoke all on function tedvio_private.start_assignment_attempt_v66(text,text,text) from public;
grant execute on function tedvio_private.start_assignment_attempt_v66(text,text,text) to anon,authenticated,service_role;

create or replace function tedvio_private.assignment_attempt_state_v66(p_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare at public.v2_assignment_attempts%rowtype; a public.v2_assignments%rowtype; items jsonb; answers jsonb;
begin
  select * into at from public.v2_assignment_attempts where access_token=p_token;
  if at.id is null then return null; end if;
  if at.status='in_progress' and at.expires_at is not null and now()>=at.expires_at then perform tedvio_private.finalize_assignment_attempt_v66(at.id,true); select * into at from public.v2_assignment_attempts where id=at.id; end if;
  select * into a from public.v2_assignments where id=at.assignment_id;
  select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'position',array_position(at.item_ids,i.id),'prompt',i.prompt,'question_type',i.question_type,'options',coalesce(at.option_orders->i.id::text,i.options),'media_url',i.media_url,'media_type',i.media_type,'points',i.points) order by array_position(at.item_ids,i.id)),'[]'::jsonb) into items from public.v2_assignment_items i where i.id=any(at.item_ids);
  select coalesce(jsonb_object_agg(r.assignment_item_id::text,r.answer),'{}'::jsonb) into answers from public.v2_assignment_responses r where r.attempt_id=at.id;
  return jsonb_build_object('assignment',jsonb_build_object('id',a.id,'code',a.code,'title',a.title,'instructions',a.instructions,'closes_at',a.closes_at,'feedback_mode',a.feedback_mode),'attempt',jsonb_build_object('id',at.id,'display_name',at.display_name,'enrollment',at.enrollment,'attempt_no',at.attempt_no,'status',at.status,'started_at',at.started_at,'expires_at',at.expires_at,'submitted_at',at.submitted_at,'auto_submitted',at.auto_submitted,'late',at.late),'items',items,'answers',answers);
end $$;
revoke all on function tedvio_private.assignment_attempt_state_v66(uuid) from public;
grant execute on function tedvio_private.assignment_attempt_state_v66(uuid) to anon,authenticated,service_role;

create or replace function tedvio_private.submit_assignment_answer_v66(p_token uuid,p_item_id uuid,p_answer jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare at public.v2_assignment_attempts%rowtype; i public.v2_assignment_items%rowtype; ok boolean; pts numeric:=0; dx numeric;dy numeric;radius numeric;
begin
  select * into at from public.v2_assignment_attempts where access_token=p_token for update;
  if at.id is null then raise exception 'ATTEMPT_NOT_FOUND'; end if;
  if at.status<>'in_progress' then return jsonb_build_object('saved',false,'submitted',true); end if;
  if at.expires_at is not null and now()>=at.expires_at then perform tedvio_private.finalize_assignment_attempt_v66(at.id,true); return jsonb_build_object('saved',false,'expired',true); end if;
  if not (p_item_id=any(at.item_ids)) then raise exception 'ITEM_NOT_IN_ATTEMPT'; end if;
  select * into i from public.v2_assignment_items where id=p_item_id and assignment_id=at.assignment_id;
  if i.id is null then raise exception 'ITEM_NOT_FOUND'; end if;
  if i.question_type in ('multiple_choice','multiple_select','true_false','numeric','ordering') then ok:=p_answer=i.correct_answer;
  elsif i.question_type='hotspot' then
    if i.correct_answer ? 'x' and i.correct_answer ? 'y' and i.correct_answer ? 'radius' and p_answer ? 'x' and p_answer ? 'y' then
      dx:=(p_answer->>'x')::numeric-(i.correct_answer->>'x')::numeric; dy:=(p_answer->>'y')::numeric-(i.correct_answer->>'y')::numeric; radius:=(i.correct_answer->>'radius')::numeric; ok:=sqrt(dx*dx+dy*dy)<=radius;
    else ok:=false; end if;
  else ok:=null; end if;
  if ok is true then pts:=i.points; end if;
  insert into public.v2_assignment_responses(attempt_id,assignment_item_id,answer,is_correct,points,answered_at,updated_at)
  values(at.id,i.id,p_answer,ok,pts,now(),now()) on conflict(attempt_id,assignment_item_id) do update set answer=excluded.answer,is_correct=excluded.is_correct,points=excluded.points,updated_at=now();
  return jsonb_build_object('saved',true);
end $$;
revoke all on function tedvio_private.submit_assignment_answer_v66(uuid,uuid,jsonb) from public;
grant execute on function tedvio_private.submit_assignment_answer_v66(uuid,uuid,jsonb) to anon,authenticated,service_role;

create or replace function tedvio_private.assignment_feedback_v66(p_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare at public.v2_assignment_attempts%rowtype; a public.v2_assignments%rowtype; released boolean:=false; show_answers boolean:=false; details jsonb:='[]'::jsonb;
begin
  select * into at from public.v2_assignment_attempts where access_token=p_token;
  if at.id is null then return null; end if;
  if at.status='in_progress' and at.expires_at is not null and now()>=at.expires_at then perform tedvio_private.finalize_assignment_attempt_v66(at.id,true); select * into at from public.v2_assignment_attempts where id=at.id; end if;
  select * into a from public.v2_assignments where id=at.assignment_id;
  if at.status<>'submitted' then return jsonb_build_object('submitted',false); end if;
  if a.feedback_mode='after_submit' then released:=true;show_answers:=true;
  elsif a.feedback_mode='score_only' then released:=true;show_answers:=false;
  elsif a.feedback_mode='after_close' then released:=(a.status='closed' or (not a.allow_late and a.closes_at is not null and now()>=a.closes_at));show_answers:=released; end if;
  if show_answers then
    select coalesce(jsonb_agg(jsonb_build_object('item_id',i.id,'correct_answer',i.correct_answer,'explanation',i.explanation,'is_correct',r.is_correct,'answer',r.answer) order by array_position(at.item_ids,i.id)),'[]'::jsonb) into details from public.v2_assignment_items i left join public.v2_assignment_responses r on r.assignment_item_id=i.id and r.attempt_id=at.id where i.id=any(at.item_ids);
  end if;
  return jsonb_build_object('submitted',true,'released',released,'show_answers',show_answers,'score',case when released then at.score else null end,'max_score',case when released then at.max_score else null end,'percentage',case when released then at.percentage else null end,'submitted_at',at.submitted_at,'auto_submitted',at.auto_submitted,'late',at.late,'release_at',case when a.feedback_mode='after_close' then a.closes_at else null end,'details',details);
end $$;
revoke all on function tedvio_private.assignment_feedback_v66(uuid) from public;
grant execute on function tedvio_private.assignment_feedback_v66(uuid) to anon,authenticated,service_role;

create or replace function tedvio_private.submit_assignment_attempt_v66(p_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare at public.v2_assignment_attempts%rowtype;
begin
  select * into at from public.v2_assignment_attempts where access_token=p_token;
  if at.id is null then raise exception 'ATTEMPT_NOT_FOUND'; end if;
  if at.status='in_progress' then perform tedvio_private.finalize_assignment_attempt_v66(at.id,false); end if;
  return tedvio_private.assignment_feedback_v66(p_token);
end $$;
revoke all on function tedvio_private.submit_assignment_attempt_v66(uuid) from public;
grant execute on function tedvio_private.submit_assignment_attempt_v66(uuid) to anon,authenticated,service_role;

grant usage on schema tedvio_private to anon,authenticated,service_role;

create or replace function public.v2_public_assignment_meta(p_code text) returns jsonb language sql security invoker set search_path='' as $$select tedvio_private.assignment_meta_v66(p_code)$$;
create or replace function public.v2_assignment_start_attempt(p_code text,p_name text,p_enrollment text) returns jsonb language sql security invoker set search_path='' as $$select tedvio_private.start_assignment_attempt_v66(p_code,p_name,p_enrollment)$$;
create or replace function public.v2_assignment_attempt_state(p_token uuid) returns jsonb language sql security invoker set search_path='' as $$select tedvio_private.assignment_attempt_state_v66(p_token)$$;
create or replace function public.v2_assignment_submit_answer(p_token uuid,p_item_id uuid,p_answer jsonb) returns jsonb language sql security invoker set search_path='' as $$select tedvio_private.submit_assignment_answer_v66(p_token,p_item_id,p_answer)$$;
create or replace function public.v2_assignment_submit_attempt(p_token uuid) returns jsonb language sql security invoker set search_path='' as $$select tedvio_private.submit_assignment_attempt_v66(p_token)$$;
create or replace function public.v2_assignment_feedback(p_token uuid) returns jsonb language sql security invoker set search_path='' as $$select tedvio_private.assignment_feedback_v66(p_token)$$;

revoke all on function public.v2_public_assignment_meta(text),public.v2_assignment_start_attempt(text,text,text),public.v2_assignment_attempt_state(uuid),public.v2_assignment_submit_answer(uuid,uuid,jsonb),public.v2_assignment_submit_attempt(uuid),public.v2_assignment_feedback(uuid) from public;
grant execute on function public.v2_public_assignment_meta(text),public.v2_assignment_start_attempt(text,text,text),public.v2_assignment_attempt_state(uuid),public.v2_assignment_submit_answer(uuid,uuid,jsonb),public.v2_assignment_submit_attempt(uuid),public.v2_assignment_feedback(uuid) to anon,authenticated,service_role;

revoke execute on function tedvio_private.enforce_group_limit_v63() from public,anon,authenticated;
revoke execute on function tedvio_private.enforce_student_limit_v63() from public,anon,authenticated;
revoke execute on function tedvio_private.enforce_session_limit_v63() from public,anon,authenticated;
revoke execute on function tedvio_private.enforce_storage_limit_v63() from public,anon,authenticated;
revoke execute on function tedvio_private.enforce_omr_entitlement_v63() from public,anon,authenticated;

