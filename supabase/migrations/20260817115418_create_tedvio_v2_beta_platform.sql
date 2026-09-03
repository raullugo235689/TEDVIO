-- Recovered from the production migration ledger for deterministic rebuilds.
create extension if not exists pgcrypto;

create table if not exists public.v2_question_bank (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  subject text,
  topic text,
  question_type text not null check (question_type in ('multiple_choice','multiple_select','true_false','open_text','numeric','poll','scale_5','ordering')),
  prompt text not null,
  options jsonb not null default '[]'::jsonb,
  correct_answer jsonb,
  media_url text,
  media_type text check (media_type is null or media_type in ('image','audio','video')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.v2_sessions (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  code text not null unique check (code ~ '^[0-9]{6}$'),
  title text not null default 'Sesión TEDVIO',
  status text not null default 'draft' check (status in ('draft','live','closed')),
  competitive boolean not null default true,
  team_mode boolean not null default false,
  current_question_id uuid,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  closed_at timestamptz
);

create table if not exists public.v2_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.v2_sessions(id) on delete cascade,
  display_name text not null,
  team_name text,
  join_token uuid not null default gen_random_uuid(),
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists public.v2_questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.v2_sessions(id) on delete cascade,
  bank_id uuid references public.v2_question_bank(id) on delete set null,
  position integer not null,
  prompt text not null,
  question_type text not null check (question_type in ('multiple_choice','multiple_select','true_false','open_text','numeric','poll','scale_5','ordering')),
  options jsonb not null default '[]'::jsonb,
  correct_answer jsonb,
  media_url text,
  media_type text check (media_type is null or media_type in ('image','audio','video')),
  timer_seconds integer not null default 30 check (timer_seconds between 5 and 600),
  status text not null default 'queued' check (status in ('queued','live','closed','revealed')),
  launched_at timestamptz,
  closed_at timestamptz,
  unique(session_id, position)
);

alter table public.v2_sessions drop constraint if exists v2_sessions_current_question_id_fkey;
alter table public.v2_sessions add constraint v2_sessions_current_question_id_fkey foreign key (current_question_id) references public.v2_questions(id) on delete set null;

create table if not exists public.v2_responses (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.v2_questions(id) on delete cascade,
  participant_id uuid not null references public.v2_participants(id) on delete cascade,
  answer jsonb not null,
  submitted_at timestamptz not null default now(),
  is_correct boolean,
  points integer not null default 0,
  streak integer not null default 0,
  unique(question_id, participant_id)
);

create table if not exists public.v2_prepared_quizzes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  competitive boolean not null default true,
  team_mode boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.v2_prepared_items (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.v2_prepared_quizzes(id) on delete cascade,
  bank_id uuid not null references public.v2_question_bank(id) on delete cascade,
  position integer not null,
  timer_seconds integer not null default 30 check (timer_seconds between 5 and 600),
  unique(quiz_id, position)
);

create index if not exists v2_question_bank_teacher_idx on public.v2_question_bank(teacher_id, created_at desc);
create index if not exists v2_sessions_teacher_idx on public.v2_sessions(teacher_id, created_at desc);
create index if not exists v2_participants_session_idx on public.v2_participants(session_id);
create index if not exists v2_questions_session_idx on public.v2_questions(session_id, position);
create index if not exists v2_responses_question_idx on public.v2_responses(question_id);
create index if not exists v2_responses_participant_idx on public.v2_responses(participant_id);

alter table public.v2_question_bank enable row level security;
alter table public.v2_sessions enable row level security;
alter table public.v2_participants enable row level security;
alter table public.v2_questions enable row level security;
alter table public.v2_responses enable row level security;
alter table public.v2_prepared_quizzes enable row level security;
alter table public.v2_prepared_items enable row level security;

drop policy if exists v2_bank_owner_all on public.v2_question_bank;
create policy v2_bank_owner_all on public.v2_question_bank for all to authenticated using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

drop policy if exists v2_sessions_owner_all on public.v2_sessions;
create policy v2_sessions_owner_all on public.v2_sessions for all to authenticated using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
drop policy if exists v2_sessions_public_read on public.v2_sessions;
create policy v2_sessions_public_read on public.v2_sessions for select to anon, authenticated using (true);

drop policy if exists v2_participants_public_all on public.v2_participants;
create policy v2_participants_public_all on public.v2_participants for all to anon, authenticated using (true) with check (true);

drop policy if exists v2_questions_public_read on public.v2_questions;
create policy v2_questions_public_read on public.v2_questions for select to anon, authenticated using (true);
drop policy if exists v2_questions_teacher_write on public.v2_questions;
create policy v2_questions_teacher_write on public.v2_questions for all to authenticated using (exists (select 1 from public.v2_sessions s where s.id = session_id and s.teacher_id = auth.uid())) with check (exists (select 1 from public.v2_sessions s where s.id = session_id and s.teacher_id = auth.uid()));

drop policy if exists v2_responses_public_all on public.v2_responses;
create policy v2_responses_public_all on public.v2_responses for all to anon, authenticated using (true) with check (true);

drop policy if exists v2_quizzes_owner_all on public.v2_prepared_quizzes;
create policy v2_quizzes_owner_all on public.v2_prepared_quizzes for all to authenticated using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

drop policy if exists v2_items_owner_all on public.v2_prepared_items;
create policy v2_items_owner_all on public.v2_prepared_items for all to authenticated using (exists (select 1 from public.v2_prepared_quizzes q where q.id = quiz_id and q.teacher_id = auth.uid())) with check (exists (select 1 from public.v2_prepared_quizzes q where q.id = quiz_id and q.teacher_id = auth.uid()));

insert into storage.buckets (id, name, public) values ('tedvio-media-v2','tedvio-media-v2',true) on conflict (id) do update set public = true;

drop policy if exists v2_media_public_read on storage.objects;
create policy v2_media_public_read on storage.objects for select to public using (bucket_id = 'tedvio-media-v2');
drop policy if exists v2_media_owner_insert on storage.objects;
create policy v2_media_owner_insert on storage.objects for insert to authenticated with check (bucket_id = 'tedvio-media-v2' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists v2_media_owner_update on storage.objects;
create policy v2_media_owner_update on storage.objects for update to authenticated using (bucket_id = 'tedvio-media-v2' and owner_id = auth.uid()::text) with check (bucket_id = 'tedvio-media-v2' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists v2_media_owner_delete on storage.objects;
create policy v2_media_owner_delete on storage.objects for delete to authenticated using (bucket_id = 'tedvio-media-v2' and owner_id = auth.uid()::text);

alter publication supabase_realtime add table public.v2_sessions;
alter publication supabase_realtime add table public.v2_participants;
alter publication supabase_realtime add table public.v2_questions;
alter publication supabase_realtime add table public.v2_responses;

