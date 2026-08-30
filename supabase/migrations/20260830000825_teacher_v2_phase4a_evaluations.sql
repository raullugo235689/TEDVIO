-- TEDVIO 2.0 · Fase 4A · Evaluaciones
-- Modelo normalizado para construir evaluaciones desde Question Studio sin alterar resultados OMR existentes.

alter table public.v2_paper_exams
  add column if not exists status text not null default 'draft',
  add column if not exists instructions text,
  add column if not exists passing_score numeric(5,2) not null default 6,
  add column if not exists max_score numeric(7,2) not null default 10,
  add column if not exists version_strategy text not null default 'balanced',
  add column if not exists source_mode text not null default 'key_only',
  add column if not exists ready_at timestamptz,
  add column if not exists closed_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists grade_item_id uuid references public.v2_grade_items(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='v2_paper_exams_status_check'
      and conrelid='public.v2_paper_exams'::regclass
  ) then
    alter table public.v2_paper_exams
      add constraint v2_paper_exams_status_check
      check (status in ('draft','ready','closed','archived'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='v2_paper_exams_score_config_check'
      and conrelid='public.v2_paper_exams'::regclass
  ) then
    alter table public.v2_paper_exams
      add constraint v2_paper_exams_score_config_check
      check (passing_score >= 0 and passing_score <= max_score and max_score > 0 and max_score <= 1000);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='v2_paper_exams_version_strategy_check'
      and conrelid='public.v2_paper_exams'::regclass
  ) then
    alter table public.v2_paper_exams
      add constraint v2_paper_exams_version_strategy_check
      check (version_strategy in ('same','balanced'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='v2_paper_exams_source_mode_check'
      and conrelid='public.v2_paper_exams'::regclass
  ) then
    alter table public.v2_paper_exams
      add constraint v2_paper_exams_source_mode_check
      check (source_mode in ('key_only','bank'));
  end if;
end $$;

create index if not exists v2_paper_exams_teacher_status_idx
  on public.v2_paper_exams(teacher_id,status,exam_date desc);
create index if not exists v2_paper_exams_grade_item_idx
  on public.v2_paper_exams(grade_item_id)
  where grade_item_id is not null;

create table if not exists public.v2_paper_exam_questions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.v2_paper_exams(id) on delete cascade,
  teacher_id uuid not null,
  version text not null,
  position integer not null,
  source_position integer not null,
  bank_question_id uuid references public.v2_question_bank(id) on delete set null,
  prompt text not null,
  question_type text not null,
  options jsonb not null default '[]'::jsonb,
  correct_answer jsonb not null,
  explanation text,
  subject text,
  topic text,
  difficulty text,
  bloom text,
  media_url text,
  media_type text,
  points numeric(8,3) not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint v2_paper_exam_questions_version_check check (version ~ '^[A-C]$'),
  constraint v2_paper_exam_questions_position_check check (position between 1 and 60),
  constraint v2_paper_exam_questions_source_position_check check (source_position between 1 and 60),
  constraint v2_paper_exam_questions_options_array check (jsonb_typeof(options)='array'),
  constraint v2_paper_exam_questions_correct_scalar check (jsonb_typeof(correct_answer)='string'),
  constraint v2_paper_exam_questions_points_check check (points > 0),
  constraint v2_paper_exam_questions_unique_position unique(exam_id,version,position)
);

create index if not exists v2_paper_exam_questions_exam_idx
  on public.v2_paper_exam_questions(exam_id,version,position);
create index if not exists v2_paper_exam_questions_teacher_idx
  on public.v2_paper_exam_questions(teacher_id,exam_id);
create index if not exists v2_paper_exam_questions_bank_idx
  on public.v2_paper_exam_questions(bank_question_id)
  where bank_question_id is not null;

alter table public.v2_paper_exam_questions enable row level security;

drop policy if exists v2_paper_exam_questions_owner on public.v2_paper_exam_questions;
create policy v2_paper_exam_questions_owner
on public.v2_paper_exam_questions
for all
to authenticated
using (
  teacher_id=(select auth.uid())
  and exists (
    select 1 from public.v2_paper_exams e
    where e.id=v2_paper_exam_questions.exam_id
      and e.teacher_id=(select auth.uid())
  )
)
with check (
  teacher_id=(select auth.uid())
  and exists (
    select 1 from public.v2_paper_exams e
    where e.id=v2_paper_exam_questions.exam_id
      and e.teacher_id=(select auth.uid())
  )
);

grant select,insert,update,delete on public.v2_paper_exam_questions to authenticated;
revoke all on public.v2_paper_exam_questions from anon;

create or replace function public.v2_paper_exam_question_guard()
returns trigger
language plpgsql
set search_path=public
as $$
declare
  e record;
  candidate_exam uuid:=coalesce(new.exam_id,old.exam_id);
  candidate_teacher uuid:=coalesce(new.teacher_id,old.teacher_id);
begin
  select id,teacher_id,status,period_id,group_id
    into e
  from public.v2_paper_exams
  where id=candidate_exam;

  if not found then
    raise exception 'La evaluación no existe.';
  end if;
  if candidate_teacher is distinct from e.teacher_id then
    raise exception 'La pregunta no pertenece al docente de la evaluación.';
  end if;
  if e.status <> 'draft' then
    raise exception 'La composición solo puede modificarse mientras la evaluación está en borrador.';
  end if;
  if e.period_id is not null then
    perform public.v2_assert_period_link_open(e.period_id,e.teacher_id,e.group_id);
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_v2_paper_exam_question_guard on public.v2_paper_exam_questions;
create trigger trg_v2_paper_exam_question_guard
before insert or update or delete on public.v2_paper_exam_questions
for each row execute function public.v2_paper_exam_question_guard();

create or replace function public.v2_save_paper_exam_v2(
  p_exam_id uuid,
  p_group_id uuid,
  p_period_id uuid,
  p_title text,
  p_subject text,
  p_exam_date date,
  p_instructions text,
  p_passing_score numeric,
  p_max_score numeric,
  p_versions text[],
  p_version_strategy text,
  p_blueprint jsonb
)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  actor uuid:=auth.uid();
  exam_row public.v2_paper_exams%rowtype;
  exam_id uuid;
  normalized_versions text[];
  version_name text;
  version_items jsonb;
  item jsonb;
  item_position integer;
  expected_count integer:=null;
  current_count integer;
  options_value jsonb;
  option_count integer;
  max_options integer:=2;
  correct_value jsonb;
  correct_text text;
  answer_letter text;
  answer_key jsonb;
  answer_keys jsonb:='{}'::jsonb;
  bank_id uuid;
  points_value numeric;
  strategy_value text:=coalesce(nullif(trim(p_version_strategy),''),'balanced');
  topics_value jsonb;
  items_value jsonb;
  existing_metadata jsonb:='{}'::jsonb;
begin
  if actor is null then raise exception 'Sesión docente requerida.'; end if;
  if nullif(trim(p_title),'') is null then raise exception 'Escribe el título de la evaluación.'; end if;
  if strategy_value not in ('same','balanced') then raise exception 'Estrategia de versiones no válida.'; end if;
  if coalesce(p_passing_score,6) < 0 or coalesce(p_max_score,10) <= 0 or coalesce(p_passing_score,6) > coalesce(p_max_score,10) then
    raise exception 'La configuración de calificación no es válida.';
  end if;
  if jsonb_typeof(p_blueprint) <> 'object' then raise exception 'La composición de la evaluación no es válida.'; end if;

  select array_agg(version_code order by first_position)
    into normalized_versions
  from (
    select upper(trim(value)) as version_code,min(ordinality) as first_position
    from unnest(coalesce(p_versions,array['A']::text[])) with ordinality as u(value,ordinality)
    where upper(trim(value)) ~ '^[A-C]$'
    group by upper(trim(value))
  ) versions_normalized;

  if coalesce(array_length(normalized_versions,1),0) not between 1 and 3 then
    raise exception 'Selecciona entre una y tres versiones.';
  end if;

  if p_group_id is not null and not exists (
    select 1 from public.v2_groups g where g.id=p_group_id and g.teacher_id=actor
  ) then
    raise exception 'El grupo seleccionado no pertenece al docente.';
  end if;

  if p_period_id is not null then
    if p_group_id is null then raise exception 'Un periodo académico requiere un grupo.'; end if;
    perform public.v2_assert_period_link_open(p_period_id,actor,p_group_id);
  end if;

  foreach version_name in array normalized_versions loop
    version_items:=p_blueprint->version_name;
    if jsonb_typeof(version_items) <> 'array' then
      raise exception 'Falta la composición de la versión %.',version_name;
    end if;
    current_count:=jsonb_array_length(version_items);
    if current_count not between 1 and 60 then
      raise exception 'Cada versión debe contener entre 1 y 60 reactivos.';
    end if;
    if expected_count is null then expected_count:=current_count;
    elsif current_count<>expected_count then raise exception 'Todas las versiones deben contener el mismo número de reactivos.';
    end if;
  end loop;

  if p_exam_id is null then
    insert into public.v2_paper_exams(
      teacher_id,group_id,title,subject,question_count,option_count,versions,answer_keys,
      question_metadata,period_id,exam_date,status,instructions,passing_score,max_score,
      version_strategy,source_mode,updated_at
    ) values (
      actor,p_group_id,trim(p_title),nullif(trim(p_subject),''),expected_count,2,normalized_versions,'{}'::jsonb,
      '{}'::jsonb,p_period_id,coalesce(p_exam_date,current_date),'draft',nullif(trim(p_instructions),''),
      coalesce(p_passing_score,6),coalesce(p_max_score,10),strategy_value,'bank',now()
    ) returning id into exam_id;
  else
    select * into exam_row
    from public.v2_paper_exams
    where id=p_exam_id and teacher_id=actor
    for update;
    if not found then raise exception 'No se encontró la evaluación.'; end if;
    if exam_row.status<>'draft' then raise exception 'Solo una evaluación en borrador puede editarse.'; end if;
    if exists(select 1 from public.v2_paper_exam_results r where r.exam_id=p_exam_id) then
      raise exception 'La evaluación ya tiene resultados y su composición no puede reemplazarse.';
    end if;
    existing_metadata:=coalesce(exam_row.question_metadata,'{}'::jsonb);
    exam_id:=p_exam_id;
    update public.v2_paper_exams set
      group_id=p_group_id,
      period_id=p_period_id,
      title=trim(p_title),
      subject=nullif(trim(p_subject),''),
      exam_date=coalesce(p_exam_date,current_date),
      question_count=expected_count,
      versions=normalized_versions,
      instructions=nullif(trim(p_instructions),''),
      passing_score=coalesce(p_passing_score,6),
      max_score=coalesce(p_max_score,10),
      version_strategy=strategy_value,
      source_mode='bank',
      ready_at=null,
      closed_at=null,
      archived_at=null,
      updated_at=now()
    where id=exam_id and teacher_id=actor;
  end if;

  delete from public.v2_paper_exam_questions q
  where q.exam_id=exam_id and q.teacher_id=actor;

  foreach version_name in array normalized_versions loop
    version_items:=p_blueprint->version_name;
    answer_key:='[]'::jsonb;

    for item,item_position in
      select value,ordinality::integer
      from jsonb_array_elements(version_items) with ordinality as rows(value,ordinality)
    loop
      if nullif(trim(item->>'prompt'),'') is null then raise exception 'El reactivo % de la versión % no tiene enunciado.',item_position,version_name; end if;
      if coalesce(item->>'question_type','') not in ('multiple_choice','true_false') then
        raise exception 'El reactivo % de la versión % no es compatible con evaluación objetiva.',item_position,version_name;
      end if;

      options_value:=coalesce(item->'options','[]'::jsonb);
      if jsonb_typeof(options_value)<>'array' then raise exception 'Las opciones del reactivo % no son válidas.',item_position; end if;
      option_count:=jsonb_array_length(options_value);
      if option_count not between 2 and 5 then raise exception 'Cada reactivo debe tener entre 2 y 5 opciones.'; end if;
      max_options:=greatest(max_options,option_count);

      correct_value:=item->'correct_answer';
      if jsonb_typeof(correct_value)<>'string' then raise exception 'El reactivo % no tiene una respuesta correcta única.',item_position; end if;
      correct_text:=correct_value#>>'{}';
      select chr(64+ordinality::integer)
        into answer_letter
      from jsonb_array_elements_text(options_value) with ordinality as option_rows(value,ordinality)
      where value=correct_text
      limit 1;
      if answer_letter is null then raise exception 'La respuesta correcta del reactivo % no coincide con sus opciones.',item_position; end if;

      bank_id:=nullif(item->>'bank_question_id','')::uuid;
      if bank_id is null or not exists (
        select 1 from public.v2_question_bank b
        where b.id=bank_id and b.teacher_id=actor and b.archived=false
      ) then
        raise exception 'Uno de los reactivos no pertenece al Banco activo del docente.';
      end if;

      points_value:=coalesce(nullif(item->>'points','')::numeric,1);
      if points_value<=0 then raise exception 'El puntaje de cada reactivo debe ser mayor que cero.'; end if;

      insert into public.v2_paper_exam_questions(
        exam_id,teacher_id,version,position,source_position,bank_question_id,prompt,question_type,
        options,correct_answer,explanation,subject,topic,difficulty,bloom,media_url,media_type,points,updated_at
      ) values (
        exam_id,actor,version_name,item_position,coalesce(nullif(item->>'source_position','')::integer,item_position),bank_id,
        trim(item->>'prompt'),item->>'question_type',options_value,correct_value,nullif(trim(item->>'explanation'),''),
        nullif(trim(item->>'subject'),''),nullif(trim(item->>'topic'),''),nullif(trim(item->>'difficulty'),''),
        nullif(trim(item->>'bloom'),''),nullif(trim(item->>'media_url'),''),nullif(trim(item->>'media_type'),''),points_value,now()
      );

      answer_key:=answer_key||to_jsonb(answer_letter);
      answer_letter:=null;
    end loop;

    answer_keys:=jsonb_set(answer_keys,array[version_name],answer_key,true);
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object('from',position,'to',position,'topic',topic) order by position)
                    filter(where nullif(topic,'') is not null),'[]'::jsonb),
         coalesce(jsonb_object_agg(position::text,jsonb_build_object(
           'bank_question_id',bank_question_id,
           'topic',topic,
           'difficulty',difficulty,
           'bloom',bloom
         ) order by position),'{}'::jsonb)
    into topics_value,items_value
  from public.v2_paper_exam_questions
  where exam_id=v2_save_paper_exam_v2.exam_id
    and teacher_id=actor
    and version=normalized_versions[1];

  update public.v2_paper_exams set
    option_count=max_options,
    answer_keys=answer_keys,
    question_metadata=(existing_metadata-'topics'-'items'-'blueprint')||jsonb_build_object(
      'topics',topics_value,
      'items',items_value,
      'blueprint',jsonb_build_object(
        'schema',1,
        'strategy',strategy_value,
        'versions',to_jsonb(normalized_versions),
        'source','v2_question_bank'
      )
    ),
    updated_at=now()
  where id=exam_id and teacher_id=actor;

  return exam_id;
end;
$$;

create or replace function public.v2_set_paper_exam_status(p_exam_id uuid,p_status text)
returns public.v2_paper_exams
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  actor uuid:=auth.uid();
  e public.v2_paper_exams%rowtype;
  target text:=lower(trim(p_status));
  version_name text;
  row_count integer;
begin
  if actor is null then raise exception 'Sesión docente requerida.'; end if;
  if target not in ('draft','ready','closed','archived') then raise exception 'Estado de evaluación no válido.'; end if;

  select * into e from public.v2_paper_exams
  where id=p_exam_id and teacher_id=actor
  for update;
  if not found then raise exception 'No se encontró la evaluación.'; end if;

  if target='ready' then
    if e.status not in ('draft','ready') then raise exception 'La evaluación no puede pasar a lista desde su estado actual.'; end if;
    if e.source_mode='bank' then
      foreach version_name in array e.versions loop
        select count(*) into row_count from public.v2_paper_exam_questions q
        where q.exam_id=e.id and q.teacher_id=actor and q.version=version_name;
        if row_count<>e.question_count then raise exception 'La versión % está incompleta.',version_name; end if;
      end loop;
    end if;
    if jsonb_typeof(e.answer_keys)<>'object' or e.answer_keys='{}'::jsonb then raise exception 'La evaluación no tiene claves completas.'; end if;
    update public.v2_paper_exams set status='ready',ready_at=coalesce(ready_at,now()),closed_at=null,archived_at=null,updated_at=now()
    where id=e.id returning * into e;
  elsif target='draft' then
    if exists(select 1 from public.v2_paper_exam_results r where r.exam_id=e.id) then
      raise exception 'Una evaluación con resultados no puede volver a borrador.';
    end if;
    update public.v2_paper_exams set status='draft',ready_at=null,closed_at=null,archived_at=null,updated_at=now()
    where id=e.id returning * into e;
  elsif target='closed' then
    if e.status not in ('ready','closed') then raise exception 'Primero marca la evaluación como lista.'; end if;
    update public.v2_paper_exams set status='closed',closed_at=coalesce(closed_at,now()),archived_at=null,updated_at=now()
    where id=e.id returning * into e;
  else
    update public.v2_paper_exams set status='archived',archived_at=coalesce(archived_at,now()),updated_at=now()
    where id=e.id returning * into e;
  end if;

  return e;
end;
$$;

create or replace function public.v2_duplicate_paper_exam(p_exam_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  actor uuid:=auth.uid();
  source_exam public.v2_paper_exams%rowtype;
  new_exam_id uuid;
begin
  if actor is null then raise exception 'Sesión docente requerida.'; end if;
  select * into source_exam from public.v2_paper_exams
  where id=p_exam_id and teacher_id=actor;
  if not found then raise exception 'No se encontró la evaluación.'; end if;

  insert into public.v2_paper_exams(
    teacher_id,group_id,title,subject,question_count,option_count,versions,answer_keys,question_metadata,
    period_id,exam_date,status,instructions,passing_score,max_score,version_strategy,source_mode,
    ready_at,closed_at,archived_at,grade_item_id,updated_at
  ) values (
    actor,source_exam.group_id,source_exam.title||' · copia',source_exam.subject,source_exam.question_count,
    source_exam.option_count,source_exam.versions,source_exam.answer_keys,source_exam.question_metadata,
    null,current_date,'draft',source_exam.instructions,source_exam.passing_score,source_exam.max_score,
    source_exam.version_strategy,source_exam.source_mode,null,null,null,null,now()
  ) returning id into new_exam_id;

  insert into public.v2_paper_exam_questions(
    exam_id,teacher_id,version,position,source_position,bank_question_id,prompt,question_type,options,
    correct_answer,explanation,subject,topic,difficulty,bloom,media_url,media_type,points,updated_at
  )
  select new_exam_id,actor,version,position,source_position,bank_question_id,prompt,question_type,options,
         correct_answer,explanation,subject,topic,difficulty,bloom,media_url,media_type,points,now()
  from public.v2_paper_exam_questions
  where exam_id=source_exam.id and teacher_id=actor;

  return new_exam_id;
end;
$$;

revoke all on function public.v2_save_paper_exam_v2(uuid,uuid,uuid,text,text,date,text,numeric,numeric,text[],text,jsonb) from public;
revoke all on function public.v2_set_paper_exam_status(uuid,text) from public;
revoke all on function public.v2_duplicate_paper_exam(uuid) from public;
grant execute on function public.v2_save_paper_exam_v2(uuid,uuid,uuid,text,text,date,text,numeric,numeric,text[],text,jsonb) to authenticated;
grant execute on function public.v2_set_paper_exam_status(uuid,text) to authenticated;
grant execute on function public.v2_duplicate_paper_exam(uuid) to authenticated;

comment on table public.v2_paper_exam_questions is 'TEDVIO 2.0 normalized immutable snapshots for each evaluation version.';
comment on function public.v2_save_paper_exam_v2(uuid,uuid,uuid,text,text,date,text,numeric,numeric,text[],text,jsonb) is 'Creates or replaces a draft evaluation blueprint atomically from the teacher question bank.';
comment on function public.v2_set_paper_exam_status(uuid,text) is 'Applies guarded draft, ready, closed and archived transitions to teacher evaluations.';
comment on function public.v2_duplicate_paper_exam(uuid) is 'Duplicates an evaluation blueprint without copying student results.';
