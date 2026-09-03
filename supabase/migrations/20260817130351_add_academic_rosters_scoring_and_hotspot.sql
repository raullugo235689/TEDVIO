-- Recovered from the production migration ledger for deterministic rebuilds.
create table if not exists public.v2_universities (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (teacher_id, name)
);

create table if not exists public.v2_programs (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  university_id uuid not null references public.v2_universities(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (university_id, name)
);

create table if not exists public.v2_groups (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  program_id uuid not null references public.v2_programs(id) on delete cascade,
  name text not null,
  term text,
  subject text,
  created_at timestamptz not null default now(),
  unique (program_id, name)
);

create table if not exists public.v2_roster_students (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.v2_groups(id) on delete cascade,
  matricula text not null,
  display_name text not null,
  email text,
  created_at timestamptz not null default now(),
  unique (group_id, matricula)
);

create table if not exists public.v2_attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.v2_sessions(id) on delete cascade,
  group_id uuid not null references public.v2_groups(id) on delete cascade,
  roster_student_id uuid not null references public.v2_roster_students(id) on delete cascade,
  participant_id uuid references public.v2_participants(id) on delete set null,
  joined_at timestamptz not null default now(),
  status text not null default 'present' check (status in ('present','late','excused','absent')),
  unique (session_id, roster_student_id)
);

alter table public.v2_sessions add column if not exists group_id uuid references public.v2_groups(id) on delete set null;
alter table public.v2_sessions add column if not exists scoring_mode text not null default 'speed' check (scoring_mode in ('speed','accuracy','none'));
alter table public.v2_sessions add column if not exists speed_bonus boolean not null default true;
alter table public.v2_sessions add column if not exists streak_bonus boolean not null default true;
alter table public.v2_sessions add column if not exists randomize_questions boolean not null default false;
alter table public.v2_sessions add column if not exists randomize_options boolean not null default false;
alter table public.v2_sessions add column if not exists roster_required boolean not null default false;

alter table public.v2_participants add column if not exists roster_student_id uuid references public.v2_roster_students(id) on delete set null;
alter table public.v2_participants add column if not exists matricula text;

alter table public.v2_question_bank add column if not exists explanation text;
alter table public.v2_question_bank add column if not exists difficulty text check (difficulty is null or difficulty in ('baja','media','alta'));
alter table public.v2_questions add column if not exists explanation text;
alter table public.v2_questions add column if not exists difficulty text check (difficulty is null or difficulty in ('baja','media','alta'));

alter table public.v2_question_bank drop constraint if exists v2_question_bank_question_type_check;
alter table public.v2_question_bank add constraint v2_question_bank_question_type_check check (question_type = any (array['multiple_choice'::text,'multiple_select'::text,'true_false'::text,'open_text'::text,'numeric'::text,'poll'::text,'scale_5'::text,'ordering'::text,'hotspot'::text]));
alter table public.v2_questions drop constraint if exists v2_questions_question_type_check;
alter table public.v2_questions add constraint v2_questions_question_type_check check (question_type = any (array['multiple_choice'::text,'multiple_select'::text,'true_false'::text,'open_text'::text,'numeric'::text,'poll'::text,'scale_5'::text,'ordering'::text,'hotspot'::text]));

alter table public.v2_universities enable row level security;
alter table public.v2_programs enable row level security;
alter table public.v2_groups enable row level security;
alter table public.v2_roster_students enable row level security;
alter table public.v2_attendance enable row level security;

drop policy if exists v2_universities_owner on public.v2_universities;
create policy v2_universities_owner on public.v2_universities for all to authenticated using (teacher_id = (select auth.uid())) with check (teacher_id = (select auth.uid()));
drop policy if exists v2_programs_owner on public.v2_programs;
create policy v2_programs_owner on public.v2_programs for all to authenticated using (teacher_id = (select auth.uid())) with check (teacher_id = (select auth.uid()));
drop policy if exists v2_groups_owner on public.v2_groups;
create policy v2_groups_owner on public.v2_groups for all to authenticated using (teacher_id = (select auth.uid())) with check (teacher_id = (select auth.uid()));
drop policy if exists v2_roster_owner on public.v2_roster_students;
create policy v2_roster_owner on public.v2_roster_students for all to authenticated using (exists(select 1 from public.v2_groups g where g.id = group_id and g.teacher_id = (select auth.uid()))) with check (exists(select 1 from public.v2_groups g where g.id = group_id and g.teacher_id = (select auth.uid())));
drop policy if exists v2_attendance_owner on public.v2_attendance;
create policy v2_attendance_owner on public.v2_attendance for all to authenticated using (exists(select 1 from public.v2_sessions s where s.id = session_id and s.teacher_id = (select auth.uid()))) with check (exists(select 1 from public.v2_sessions s where s.id = session_id and s.teacher_id = (select auth.uid())));

create index if not exists v2_programs_university_idx on public.v2_programs(university_id);
create index if not exists v2_groups_program_idx on public.v2_groups(program_id);
create index if not exists v2_roster_group_idx on public.v2_roster_students(group_id);
create index if not exists v2_attendance_session_idx on public.v2_attendance(session_id);
create index if not exists v2_sessions_group_idx on public.v2_sessions(group_id);
create index if not exists v2_participants_roster_idx on public.v2_participants(roster_student_id);

create or replace function public.v2_shuffle_jsonb_array(p_arr jsonb)
returns jsonb language sql volatile as $$
  select coalesce(jsonb_agg(value order by random()), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_arr,'[]'::jsonb));
$$;

create or replace function public.v2_fill_question_metadata()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.bank_id is not null then
    select coalesce(new.explanation,b.explanation), coalesce(new.difficulty,b.difficulty)
      into new.explanation,new.difficulty
    from public.v2_question_bank b where b.id=new.bank_id;
  end if;
  return new;
end;$$;
drop trigger if exists v2_questions_fill_metadata on public.v2_questions;
create trigger v2_questions_fill_metadata before insert or update of bank_id on public.v2_questions for each row execute function public.v2_fill_question_metadata();

create or replace function public.v2_fill_structured_session_context()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.group_id is not null then
    select u.name,p.name,g.name into new.university,new.educational_program,new.group_name
    from public.v2_groups g
    join public.v2_programs p on p.id=g.program_id
    join public.v2_universities u on u.id=p.university_id
    where g.id=new.group_id;
  end if;
  return new;
end;$$;
drop trigger if exists v2_sessions_structured_context on public.v2_sessions;
create trigger v2_sessions_structured_context before insert or update of group_id on public.v2_sessions for each row execute function public.v2_fill_structured_session_context();

create or replace function public.v2_randomize_live_options()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_randomize boolean;
begin
  if new.status='live' and old.status is distinct from 'live' and new.question_type in ('multiple_choice','multiple_select','true_false','poll') then
    select randomize_options into v_randomize from public.v2_sessions where id=new.session_id;
    if coalesce(v_randomize,false) then new.options=public.v2_shuffle_jsonb_array(new.options); end if;
  end if;
  return new;
end;$$;
drop trigger if exists v2_questions_randomize_options on public.v2_questions;
create trigger v2_questions_randomize_options before update of status on public.v2_questions for each row execute function public.v2_randomize_live_options();

create or replace function public.v2_attendance_from_participant()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_group uuid;
begin
  if new.roster_student_id is not null then
    select group_id into v_group from public.v2_sessions where id=new.session_id;
    if v_group is not null then
      insert into public.v2_attendance(session_id,group_id,roster_student_id,participant_id,joined_at,status)
      values(new.session_id,v_group,new.roster_student_id,new.id,new.joined_at,'present')
      on conflict(session_id,roster_student_id) do update set participant_id=excluded.participant_id, joined_at=least(public.v2_attendance.joined_at,excluded.joined_at), status='present';
    end if;
  end if;
  return new;
end;$$;
drop trigger if exists v2_participants_attendance on public.v2_participants;
create trigger v2_participants_attendance after insert or update of roster_student_id on public.v2_participants for each row execute function public.v2_attendance_from_participant();

create or replace function public.v2_public_session_meta(p_code text)
returns table(session_id uuid,title text,group_id uuid,university text,educational_program text,group_name text,team_mode boolean,competitive boolean,roster_required boolean,status text)
language sql security definer set search_path=public as $$
 select s.id,s.title,s.group_id,s.university,s.educational_program,s.group_name,s.team_mode,s.competitive,s.roster_required,s.status
 from public.v2_sessions s where s.code=p_code limit 1;
$$;
grant execute on function public.v2_public_session_meta(text) to anon,authenticated;

create or replace function public.v2_join_session_v3(p_code text,p_name text,p_matricula text default null,p_team text default null)
returns table(session_id uuid,participant_id uuid,display_name text,team_name text,roster_student_id uuid,group_name text)
language plpgsql security definer set search_path=public as $$
declare s public.v2_sessions%rowtype; rs public.v2_roster_students%rowtype; p public.v2_participants%rowtype;
begin
  select * into s from public.v2_sessions where code=p_code and status<>'closed' limit 1;
  if s.id is null then raise exception 'SESSION_NOT_FOUND'; end if;
  if s.team_mode and nullif(trim(coalesce(p_team,'')),'') is null then raise exception 'TEAM_REQUIRED'; end if;
  if s.group_id is not null then
    if nullif(trim(coalesce(p_matricula,'')),'') is not null then
      select * into rs from public.v2_roster_students where group_id=s.group_id and lower(matricula)=lower(trim(p_matricula)) limit 1;
    end if;
    if rs.id is null then
      select * into rs from public.v2_roster_students where group_id=s.group_id and lower(regexp_replace(display_name,'\s+','','g'))=lower(regexp_replace(trim(p_name),'\s+','','g')) limit 1;
    end if;
    if s.roster_required and rs.id is null then raise exception 'ROSTER_NOT_FOUND'; end if;
  end if;
  insert into public.v2_participants(session_id,display_name,team_name,roster_student_id,matricula)
  values(s.id,coalesce(nullif(trim(p_name),''),rs.display_name),nullif(trim(coalesce(p_team,'')),''),rs.id,coalesce(nullif(trim(coalesce(p_matricula,'')),''),rs.matricula)) returning * into p;
  return query select s.id,p.id,p.display_name,p.team_name,p.roster_student_id,s.group_name;
end;$$;
grant execute on function public.v2_join_session_v3(text,text,text,text) to anon,authenticated;

create unique index if not exists v2_responses_one_per_student on public.v2_responses(question_id,participant_id);

drop function if exists public.v2_submit_response(uuid,uuid,jsonb);
create function public.v2_submit_response(p_question_id uuid,p_participant_id uuid,p_answer jsonb)
returns table(is_correct boolean,points integer,streak integer,explanation text)
language plpgsql security definer set search_path=public as $$
declare q public.v2_questions%rowtype; s public.v2_sessions%rowtype; p public.v2_participants%rowtype; v_correct boolean; v_points integer:=0; v_streak integer:=0; v_prev_streak integer:=0; v_prev_correct boolean:=false; v_elapsed numeric:=0; v_bonus integer:=0; dx numeric; dy numeric; radius numeric;
begin
  select * into q from public.v2_questions where id=p_question_id;
  if q.id is null or q.status<>'live' then raise exception 'QUESTION_NOT_LIVE'; end if;
  select * into s from public.v2_sessions where id=q.session_id;
  select * into p from public.v2_participants where id=p_participant_id and session_id=s.id;
  if p.id is null then raise exception 'PARTICIPANT_NOT_IN_SESSION'; end if;
  if exists(select 1 from public.v2_responses where question_id=q.id and participant_id=p.id) then raise exception 'duplicate response'; end if;
  if q.question_type in ('multiple_choice','multiple_select','true_false','numeric','ordering') then
    v_correct := p_answer = q.correct_answer;
  elsif q.question_type='hotspot' then
    if q.correct_answer ? 'x' and q.correct_answer ? 'y' and q.correct_answer ? 'radius' and p_answer ? 'x' and p_answer ? 'y' then
      dx := (p_answer->>'x')::numeric-(q.correct_answer->>'x')::numeric;
      dy := (p_answer->>'y')::numeric-(q.correct_answer->>'y')::numeric;
      radius := (q.correct_answer->>'radius')::numeric;
      v_correct := sqrt(dx*dx+dy*dy) <= radius;
    else v_correct:=false; end if;
  else v_correct:=null; end if;
  if v_correct is true then
    select coalesce(r.streak,0),coalesce(r.is_correct,false) into v_prev_streak,v_prev_correct
    from public.v2_responses r join public.v2_questions pq on pq.id=r.question_id
    where r.participant_id=p.id and pq.session_id=s.id order by r.submitted_at desc limit 1;
    v_streak := case when v_prev_correct then v_prev_streak+1 else 1 end;
    if s.competitive and s.scoring_mode<>'none' then
      v_points:=1000;
      if s.scoring_mode='speed' or s.speed_bonus then
        v_elapsed:=greatest(0,extract(epoch from (now()-q.launched_at)));
        v_bonus:=greatest(0,round(500*(1-least(v_elapsed/greatest(q.timer_seconds,1),1)))::int);
        v_points:=v_points+v_bonus;
      end if;
      if s.streak_bonus and v_streak>=3 then v_points:=v_points+least(500,(v_streak-2)*100); end if;
    end if;
  elsif v_correct is false then v_streak:=0; end if;
  insert into public.v2_responses(question_id,participant_id,answer,is_correct,points,streak)
  values(q.id,p.id,p_answer,v_correct,v_points,v_streak);
  return query select v_correct,v_points,v_streak,q.explanation;
end;$$;
grant execute on function public.v2_submit_response(uuid,uuid,jsonb) to anon,authenticated;

create or replace function public.v2_public_ranking(p_code text)
returns table(name text,team text,points bigint,correct bigint,answered bigint,max_streak integer)
language sql security definer set search_path=public as $$
  select p.display_name,p.team_name,coalesce(sum(r.points),0)::bigint,count(*) filter(where r.is_correct is true)::bigint,count(r.id)::bigint,coalesce(max(r.streak),0)::int
  from public.v2_sessions s join public.v2_participants p on p.session_id=s.id left join public.v2_responses r on r.participant_id=p.id
  where s.code=p_code group by p.id,p.display_name,p.team_name order by coalesce(sum(r.points),0) desc,p.display_name;
$$;
grant execute on function public.v2_public_ranking(text) to anon,authenticated;

