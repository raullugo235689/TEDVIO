-- Recovered from the production migration ledger for deterministic rebuilds.
create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  institution text,
  created_at timestamptz not null default now()
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  code text not null unique check (code ~ '^[0-9]{6}$'),
  title text not null,
  status text not null default 'draft' check (status in ('draft','live','closed')),
  current_question_id uuid,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  closed_at timestamptz
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  position integer not null,
  prompt text not null,
  question_type text not null default 'multiple_choice' check (question_type in ('multiple_choice','true_false','open_text')),
  options jsonb not null default '[]'::jsonb,
  correct_answer text,
  status text not null default 'queued' check (status in ('queued','live','closed','revealed')),
  launched_at timestamptz,
  closed_at timestamptz,
  unique(session_id, position)
);

alter table public.sessions add constraint sessions_current_question_fk foreign key (current_question_id) references public.questions(id) on delete set null;

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  display_name text not null,
  join_token uuid not null default gen_random_uuid() unique,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table public.responses (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  answer text not null,
  submitted_at timestamptz not null default now(),
  unique(question_id, participant_id)
);

create index sessions_teacher_idx on public.sessions(teacher_id, created_at desc);
create index questions_session_idx on public.questions(session_id, position);
create index participants_session_idx on public.participants(session_id);
create index responses_question_idx on public.responses(question_id);

alter table public.profiles enable row level security;
alter table public.sessions enable row level security;
alter table public.questions enable row level security;
alter table public.participants enable row level security;
alter table public.responses enable row level security;

create policy profiles_self_select on public.profiles for select to authenticated using (id=auth.uid());
create policy profiles_self_update on public.profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid());
create policy sessions_teacher_all on public.sessions for all to authenticated using (teacher_id=auth.uid()) with check (teacher_id=auth.uid());
create policy questions_teacher_all on public.questions for all to authenticated using (exists(select 1 from public.sessions s where s.id=session_id and s.teacher_id=auth.uid())) with check (exists(select 1 from public.sessions s where s.id=session_id and s.teacher_id=auth.uid()));
create policy participants_teacher_select on public.participants for select to authenticated using (exists(select 1 from public.sessions s where s.id=session_id and s.teacher_id=auth.uid()));
create policy responses_teacher_select on public.responses for select to authenticated using (exists(select 1 from public.questions q join public.sessions s on s.id=q.session_id where q.id=question_id and s.teacher_id=auth.uid()));

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$ begin insert into public.profiles(id,display_name) values(new.id,coalesce(new.raw_user_meta_data->>'display_name',split_part(new.email,'@',1))) on conflict do nothing; return new; end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.create_live_session(p_title text) returns jsonb language plpgsql security definer set search_path=public as $$ declare v_id uuid; v_code text; begin if auth.uid() is null then raise exception 'Autenticación requerida'; end if; loop v_code:=lpad((floor(random()*1000000))::int::text,6,'0'); exit when not exists(select 1 from public.sessions where code=v_code and status<>'closed'); end loop; insert into public.sessions(teacher_id,code,title,status,started_at) values(auth.uid(),v_code,trim(p_title),'live',now()) returning id into v_id; return jsonb_build_object('id',v_id,'code',v_code,'title',trim(p_title)); end; $$;
revoke all on function public.create_live_session(text) from public; grant execute on function public.create_live_session(text) to authenticated;

create or replace function public.join_session(p_code text,p_display_name text) returns jsonb language plpgsql security definer set search_path=public as $$ declare v_session public.sessions%rowtype; v_pid uuid; v_token uuid; begin select * into v_session from public.sessions where code=p_code and status='live' limit 1; if not found then raise exception 'Sesión no encontrada o cerrada'; end if; if char_length(trim(p_display_name)) not between 1 and 80 then raise exception 'Nombre inválido'; end if; insert into public.participants(session_id,display_name) values(v_session.id,trim(p_display_name)) returning id,join_token into v_pid,v_token; return jsonb_build_object('participant_id',v_pid,'join_token',v_token,'session_id',v_session.id,'title',v_session.title,'current_question_id',v_session.current_question_id); end; $$;
revoke all on function public.join_session(text,text) from public; grant execute on function public.join_session(text,text) to anon,authenticated;

create or replace function public.get_student_session(p_code text,p_join_token uuid) returns jsonb language plpgsql security definer set search_path=public as $$ declare v_session public.sessions%rowtype; v_participant public.participants%rowtype; v_q public.questions%rowtype; begin select * into v_session from public.sessions where code=p_code limit 1; if not found then raise exception 'Sesión no encontrada'; end if; select * into v_participant from public.participants where session_id=v_session.id and join_token=p_join_token limit 1; if not found then raise exception 'Acceso inválido'; end if; update public.participants set last_seen_at=now() where id=v_participant.id; if v_session.current_question_id is not null then select * into v_q from public.questions where id=v_session.current_question_id; end if; return jsonb_build_object('session',jsonb_build_object('id',v_session.id,'title',v_session.title,'status',v_session.status),'participant',jsonb_build_object('id',v_participant.id,'display_name',v_participant.display_name),'question',case when v_q.id is null then null else jsonb_build_object('id',v_q.id,'prompt',v_q.prompt,'question_type',v_q.question_type,'options',v_q.options,'status',v_q.status) end); end; $$;
revoke all on function public.get_student_session(text,uuid) from public; grant execute on function public.get_student_session(text,uuid) to anon,authenticated;

create or replace function public.submit_response(p_question_id uuid,p_join_token uuid,p_answer text) returns boolean language plpgsql security definer set search_path=public as $$ declare v_pid uuid; v_status text; begin select p.id,q.status into v_pid,v_status from public.participants p join public.questions q on q.session_id=p.session_id where p.join_token=p_join_token and q.id=p_question_id limit 1; if v_pid is null then raise exception 'Acceso inválido'; end if; if v_status<>'live' then raise exception 'La pregunta no está aceptando respuestas'; end if; insert into public.responses(question_id,participant_id,answer) values(p_question_id,v_pid,p_answer) on conflict(question_id,participant_id) do update set answer=excluded.answer,submitted_at=now(); return true; end; $$;
revoke all on function public.submit_response(uuid,uuid,text) from public; grant execute on function public.submit_response(uuid,uuid,text) to anon,authenticated;

create or replace function public.teacher_launch_question(p_session_id uuid,p_prompt text,p_options jsonb,p_correct_answer text default null) returns uuid language plpgsql security definer set search_path=public as $$ declare v_pos int; v_qid uuid; begin if not exists(select 1 from public.sessions where id=p_session_id and teacher_id=auth.uid()) then raise exception 'No autorizado'; end if; update public.questions set status='closed',closed_at=now() where session_id=p_session_id and status='live'; select coalesce(max(position),0)+1 into v_pos from public.questions where session_id=p_session_id; insert into public.questions(session_id,position,prompt,options,correct_answer,status,launched_at) values(p_session_id,v_pos,trim(p_prompt),p_options,p_correct_answer,'live',now()) returning id into v_qid; update public.sessions set current_question_id=v_qid,status='live',started_at=coalesce(started_at,now()) where id=p_session_id; return v_qid; end; $$;
revoke all on function public.teacher_launch_question(uuid,text,jsonb,text) from public; grant execute on function public.teacher_launch_question(uuid,text,jsonb,text) to authenticated;

create or replace function public.get_live_results(p_question_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$ declare v_total int; begin if not exists(select 1 from public.questions q join public.sessions s on s.id=q.session_id where q.id=p_question_id and s.teacher_id=auth.uid()) then raise exception 'No autorizado'; end if; select count(*) into v_total from public.responses where question_id=p_question_id; return jsonb_build_object('total',v_total,'answers',(select coalesce(jsonb_object_agg(answer,cnt),'{}'::jsonb) from(select answer,count(*) cnt from public.responses where question_id=p_question_id group by answer)x)); end; $$;
revoke all on function public.get_live_results(uuid) from public; grant execute on function public.get_live_results(uuid) to authenticated;

alter publication supabase_realtime add table public.sessions;
alter publication supabase_realtime add table public.questions;
alter publication supabase_realtime add table public.participants;
alter publication supabase_realtime add table public.responses;

