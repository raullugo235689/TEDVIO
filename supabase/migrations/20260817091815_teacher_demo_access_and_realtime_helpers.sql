-- Recovered from the production migration ledger for deterministic rebuilds.
create table if not exists public.teacher_access_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  label text not null default 'TEDVIO Demo',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.teacher_access_codes enable row level security;

create or replace function public.demo_teacher_login(p_code text) returns text language plpgsql security definer set search_path=public as $$ declare v_ok boolean; v_token text; begin select exists(select 1 from public.teacher_access_codes where is_active and code_hash=encode(digest(p_code,'sha256'),'hex')) into v_ok; if not v_ok then raise exception 'Código de profesor inválido'; end if; v_token:=encode(gen_random_bytes(24),'hex'); return v_token; end; $$;
revoke all on function public.demo_teacher_login(text) from public; grant execute on function public.demo_teacher_login(text) to anon,authenticated;

create table if not exists public.demo_teacher_tokens (
 token_hash text primary key,
 expires_at timestamptz not null,
 created_at timestamptz not null default now()
);
alter table public.demo_teacher_tokens enable row level security;

create or replace function public.demo_teacher_login(p_code text) returns text language plpgsql security definer set search_path=public as $$ declare v_ok boolean; v_token text; begin select exists(select 1 from public.teacher_access_codes where is_active and code_hash=encode(digest(p_code,'sha256'),'hex')) into v_ok; if not v_ok then raise exception 'Código de profesor inválido'; end if; delete from public.demo_teacher_tokens where expires_at<now(); v_token:=encode(gen_random_bytes(24),'hex'); insert into public.demo_teacher_tokens(token_hash,expires_at) values(encode(digest(v_token,'sha256'),'hex'),now()+interval '12 hours'); return v_token; end; $$;

create or replace function public.demo_create_session(p_teacher_token text,p_title text) returns jsonb language plpgsql security definer set search_path=public as $$ declare v_code text; v_id uuid; begin if not exists(select 1 from public.demo_teacher_tokens where token_hash=encode(digest(p_teacher_token,'sha256'),'hex') and expires_at>now()) then raise exception 'Sesión de profesor inválida'; end if; loop v_code:=lpad((floor(random()*1000000))::int::text,6,'0'); exit when not exists(select 1 from public.sessions where code=v_code and status<>'closed'); end loop; insert into public.sessions(teacher_id,code,title,status,started_at) values('00000000-0000-0000-0000-000000000001',v_code,trim(p_title),'live',now()) returning id into v_id; return jsonb_build_object('id',v_id,'code',v_code,'title',trim(p_title)); end; $$;

-- Demo teacher row is represented by a protected auth-compatible placeholder via nullable teacher migration.
alter table public.sessions alter column teacher_id drop not null;
create or replace function public.demo_create_session(p_teacher_token text,p_title text) returns jsonb language plpgsql security definer set search_path=public as $$ declare v_code text; v_id uuid; begin if not exists(select 1 from public.demo_teacher_tokens where token_hash=encode(digest(p_teacher_token,'sha256'),'hex') and expires_at>now()) then raise exception 'Sesión de profesor inválida'; end if; loop v_code:=lpad((floor(random()*1000000))::int::text,6,'0'); exit when not exists(select 1 from public.sessions where code=v_code and status<>'closed'); end loop; insert into public.sessions(teacher_id,code,title,status,started_at) values(null,v_code,trim(p_title),'live',now()) returning id into v_id; return jsonb_build_object('id',v_id,'code',v_code,'title',trim(p_title)); end; $$;

create or replace function public.demo_launch_question(p_teacher_token text,p_session_id uuid,p_prompt text,p_options jsonb,p_correct_answer text default null) returns uuid language plpgsql security definer set search_path=public as $$ declare v_pos int; v_qid uuid; begin if not exists(select 1 from public.demo_teacher_tokens where token_hash=encode(digest(p_teacher_token,'sha256'),'hex') and expires_at>now()) then raise exception 'Sesión de profesor inválida'; end if; if not exists(select 1 from public.sessions where id=p_session_id and teacher_id is null) then raise exception 'Sesión no válida'; end if; update public.questions set status='closed',closed_at=now() where session_id=p_session_id and status='live'; select coalesce(max(position),0)+1 into v_pos from public.questions where session_id=p_session_id; insert into public.questions(session_id,position,prompt,options,correct_answer,status,launched_at) values(p_session_id,v_pos,trim(p_prompt),p_options,p_correct_answer,'live',now()) returning id into v_qid; update public.sessions set current_question_id=v_qid,status='live' where id=p_session_id; return v_qid; end; $$;

create or replace function public.demo_get_results(p_teacher_token text,p_question_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$ declare v_total int; begin if not exists(select 1 from public.demo_teacher_tokens where token_hash=encode(digest(p_teacher_token,'sha256'),'hex') and expires_at>now()) then raise exception 'Sesión de profesor inválida'; end if; if not exists(select 1 from public.questions q join public.sessions s on s.id=q.session_id where q.id=p_question_id and s.teacher_id is null) then raise exception 'Pregunta no válida'; end if; select count(*) into v_total from public.responses where question_id=p_question_id; return jsonb_build_object('total',v_total,'answers',(select coalesce(jsonb_object_agg(answer,cnt),'{}'::jsonb) from(select answer,count(*) cnt from public.responses where question_id=p_question_id group by answer)x)); end; $$;

create or replace function public.demo_session_state(p_teacher_token text,p_session_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$ declare s public.sessions%rowtype; q public.questions%rowtype; pc int; begin if not exists(select 1 from public.demo_teacher_tokens where token_hash=encode(digest(p_teacher_token,'sha256'),'hex') and expires_at>now()) then raise exception 'Sesión de profesor inválida'; end if; select * into s from public.sessions where id=p_session_id and teacher_id is null; if not found then raise exception 'Sesión no válida'; end if; select count(*) into pc from public.participants where session_id=s.id; if s.current_question_id is not null then select * into q from public.questions where id=s.current_question_id; end if; return jsonb_build_object('session',jsonb_build_object('id',s.id,'code',s.code,'title',s.title,'status',s.status),'participants',pc,'question',case when q.id is null then null else jsonb_build_object('id',q.id,'prompt',q.prompt,'options',q.options,'correct_answer',q.correct_answer,'status',q.status) end); end; $$;

revoke all on function public.demo_create_session(text,text) from public; grant execute on function public.demo_create_session(text,text) to anon,authenticated;
revoke all on function public.demo_launch_question(text,uuid,text,jsonb,text) from public; grant execute on function public.demo_launch_question(text,uuid,text,jsonb,text) to anon,authenticated;
revoke all on function public.demo_get_results(text,uuid) from public; grant execute on function public.demo_get_results(text,uuid) to anon,authenticated;
revoke all on function public.demo_session_state(text,uuid) from public; grant execute on function public.demo_session_state(text,uuid) to anon,authenticated;

-- Recovery baseline intentionally omits the historical static demo access-code seed.
