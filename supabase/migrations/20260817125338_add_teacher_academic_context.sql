-- Recovered from the production migration ledger for deterministic rebuilds.
alter table public.profiles add column if not exists educational_program text;
alter table public.profiles add column if not exists default_group text;

alter table public.v2_sessions add column if not exists university text;
alter table public.v2_sessions add column if not exists educational_program text;
alter table public.v2_sessions add column if not exists group_name text;

create or replace function public.v2_fill_academic_context()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare p public.profiles%rowtype;
begin
  select * into p from public.profiles where id = new.teacher_id;
  if new.university is null then new.university := p.institution; end if;
  if new.educational_program is null then new.educational_program := p.educational_program; end if;
  if new.group_name is null then new.group_name := p.default_group; end if;
  return new;
end;
$$;

drop trigger if exists v2_sessions_academic_context on public.v2_sessions;
create trigger v2_sessions_academic_context
before insert on public.v2_sessions
for each row execute function public.v2_fill_academic_context();

