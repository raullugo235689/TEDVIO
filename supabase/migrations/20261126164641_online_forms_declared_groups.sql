-- Optional declared group labels, independent of the canonical roster.
-- Old attempts and single-group forms are unchanged. Never infer a group retroactively.
alter table public.v2_online_forms add column group_choices text[] not null default '{}'::text[];
alter table public.v2_online_forms add constraint online_form_group_choices_scope check (cardinality(group_choices)<=20 and (cardinality(group_choices)=0 or (group_id is null and not roster_required)));
alter table public.v2_online_form_attempts add column declared_group text check (declared_group is null or char_length(declared_group) between 1 and 40);
grant select(declared_group) on public.v2_online_form_attempts to authenticated;

create function tedvio_private.online_form_validate_group_choices(p_choices jsonb) returns text[]
language plpgsql immutable set search_path='' as $$
declare v_choices text[];
begin
  if p_choices is null then return '{}'::text[]; end if;
  if jsonb_typeof(p_choices) is distinct from 'array' or jsonb_array_length(p_choices)>20 then raise exception 'Agrega hasta 20 grupos declarados.'; end if;
  if exists(select 1 from jsonb_array_elements(p_choices) e(value) where jsonb_typeof(e.value)<>'string' or char_length(btrim(e.value#>>'{}')) not between 1 and 40 or btrim(e.value#>>'{}') ~ '[[:cntrl:],]') then raise exception 'Los nombres de grupo deben tener de 1 a 40 caracteres, sin comas ni caracteres de control.'; end if;
  select coalesce(array_agg(btrim(e.value) order by e.n),'{}'::text[]) into v_choices from jsonb_array_elements_text(p_choices) with ordinality e(value,n);
  if cardinality(v_choices)<>(select count(distinct lower(g.label)) from unnest(v_choices) g(label)) then raise exception 'Los grupos declarados no pueden repetirse.'; end if;
  return v_choices;
end $$;
revoke all on function tedvio_private.online_form_validate_group_choices(jsonb) from public,anon,authenticated;

create or replace function tedvio_private.online_form_save(p_form jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_owner uuid:=auth.uid(); v_id uuid; v_group uuid; v_group_name text;
  v_old public.v2_online_forms%rowtype; v_bank public.v2_question_bank%rowtype;
  v_section jsonb; v_item jsonb; v_sid uuid; v_bid uuid;
  v_seen uuid[]:='{}'::uuid[]; v_position int:=0; v_item_position int; v_draw int; v_total int:=0;
  v_options jsonb; v_answer text; v_count int; v_unique int; v_choices text[];
begin
  if v_owner is null then raise exception 'Inicia sesión como docente.' using errcode='42501'; end if;
  if jsonb_typeof(p_form) is distinct from 'object' or octet_length(p_form::text)>250000 then raise exception 'Datos de evaluación inválidos o demasiado grandes.'; end if;
  if char_length(btrim(coalesce(p_form->>'title',''))) not between 1 and 200 then raise exception 'Escribe un título de 1 a 200 caracteres.'; end if;
  if jsonb_typeof(p_form->'sections') is distinct from 'array' or jsonb_array_length(p_form->'sections') not between 1 and 20 then raise exception 'Agrega entre 1 y 20 secciones.'; end if;
  v_id:=nullif(p_form->>'id','')::uuid;
  if v_id is not null then
    select * into v_old from public.v2_online_forms f where f.id=v_id and f.teacher_id=v_owner for update;
    if v_old.id is null then raise exception 'La evaluación no está disponible para esta cuenta.' using errcode='42501'; end if;
    if exists(select 1 from public.v2_online_form_attempts a where a.form_id=v_id) then raise exception 'La evaluación ya tiene intentos; sus preguntas y reglas están congeladas.'; end if;
    if p_form ? 'revision' and (p_form->>'revision')::bigint is distinct from v_old.revision then raise exception 'La evaluación cambió. Recarga antes de guardar.'; end if;
  end if;
  v_group:=nullif(p_form->>'group_id','')::uuid;
  v_choices:=case when p_form ? 'group_choices' then tedvio_private.online_form_validate_group_choices(p_form->'group_choices') else coalesce(v_old.group_choices,'{}'::text[]) end;
  if v_group is not null and cardinality(v_choices)>0 then raise exception 'Elige un grupo vinculado o una lista declarada, no ambos.'; end if;
  if v_group is not null then
    select coalesce(to_jsonb(g)->>'group_name',to_jsonb(g)->>'name','Grupo') into v_group_name from public.v2_groups g where g.id=v_group and g.teacher_id=v_owner;
    if not found then raise exception 'Selecciona uno de tus grupos.' using errcode='42501'; end if;
  end if;
  if v_id is null then
    insert into public.v2_online_forms(teacher_id,title) values(v_owner,btrim(p_form->>'title')) returning id into v_id;
  end if;
  update public.v2_online_forms set
    title=btrim(p_form->>'title'),instructions=coalesce(p_form->>'instructions',''),status='draft',
    group_id=v_group,roster_required=(v_group is not null),group_name=v_group_name,group_choices=v_choices,
    opens_at=nullif(p_form->>'opens_at','')::timestamptz,closes_at=nullif(p_form->>'closes_at','')::timestamptz,
    time_limit_minutes=nullif(p_form->>'time_limit_minutes','')::integer,
    max_attempts=coalesce((p_form->>'max_attempts')::integer,1),
    shuffle_questions=coalesce((p_form->>'shuffle_questions')::boolean,true),
    shuffle_options=coalesce((p_form->>'shuffle_options')::boolean,true),
    feedback_mode=coalesce(p_form->>'feedback_mode','after_close'),
    revision=revision+1,updated_at=clock_timestamp()
  where id=v_id;
  delete from public.v2_online_form_sections where form_id=v_id;
  for v_section in select value from jsonb_array_elements(p_form->'sections') loop
    v_position:=v_position+1;
    v_draw:=(v_section->>'draw_count')::integer;
    if v_draw is null or v_draw not between 1 and 200 then raise exception 'La cantidad por sección debe estar entre 1 y 200.'; end if;
    if char_length(btrim(coalesce(v_section->>'title',''))) not between 1 and 200 then raise exception 'Cada sección necesita un título.'; end if;
    if jsonb_typeof(v_section->'items') is distinct from 'array' then raise exception 'Selecciona preguntas del banco para cada sección.'; end if;
    if jsonb_array_length(v_section->'items') < v_draw then raise exception 'No hay suficientes preguntas candidatas en la sección %.',v_section->>'title'; end if;
    v_total:=v_total+v_draw;
    if v_total>200 or cardinality(v_seen)+jsonb_array_length(v_section->'items')>1000 then raise exception 'Máximo 200 preguntas por intento y 1000 candidatas por evaluación.'; end if;
    insert into public.v2_online_form_sections(form_id,title,position,draw_count) values(v_id,btrim(v_section->>'title'),v_position,v_draw) returning id into v_sid;
    v_item_position:=0;
    for v_item in select value from jsonb_array_elements(v_section->'items') loop
      v_item_position:=v_item_position+1;
      v_bid:=(v_item->>'bank_id')::uuid;
      if v_bid is null or v_bid=any(v_seen) then raise exception 'Cada pregunta del banco puede aparecer en una sola sección y sin duplicados.'; end if;
      v_seen:=array_append(v_seen,v_bid);
      select * into v_bank from public.v2_question_bank b where b.id=v_bid and b.teacher_id=v_owner and not b.archived for share;
      if v_bank.id is null then raise exception 'Una pregunta no pertenece a tu banco o está archivada.' using errcode='42501'; end if;
      if v_bank.question_type not in ('multiple_choice','true_false') then raise exception 'Esta evaluación admite opción múltiple única y verdadero/falso.'; end if;
      if char_length(btrim(coalesce(v_bank.prompt,''))) not between 1 and 12000 or char_length(coalesce(v_bank.explanation,''))>20000 or char_length(coalesce(v_bank.media_url,''))>2000 then raise exception 'El enunciado, explicación o recurso de una pregunta excede el tamaño permitido.'; end if;
      if jsonb_typeof(v_bank.options) is distinct from 'array' or jsonb_array_length(v_bank.options) not between 2 and 10 then raise exception 'Una pregunta necesita entre 2 y 10 opciones válidas.'; end if;
      if exists(select 1 from jsonb_array_elements(v_bank.options) e(value) where jsonb_typeof(e.value)<>'string' or char_length(btrim(e.value#>>'{}')) not between 1 and 2000) then raise exception 'Todas las opciones deben ser textos no vacíos.'; end if;
      select jsonb_agg(btrim(e.value) order by e.n),count(*),count(distinct btrim(e.value)) into v_options,v_count,v_unique from jsonb_array_elements_text(v_bank.options) with ordinality e(value,n);
      if v_count<>v_unique then raise exception 'Las opciones de una pregunta no pueden repetirse.'; end if;
      if jsonb_typeof(v_bank.correct_answer) is distinct from 'string' then raise exception 'Una pregunta no tiene una respuesta correcta única.'; end if;
      v_answer:=btrim(v_bank.correct_answer#>>'{}');
      if not (v_options ? v_answer) then raise exception 'La respuesta correcta debe pertenecer a las opciones.'; end if;
      insert into public.v2_online_form_items(form_id,section_id,bank_id,position,title,subject,topic,question_type,prompt,options,correct_answer,explanation,difficulty,media_url,media_type,points)
      values(v_id,v_sid,v_bid,v_item_position,v_bank.title,v_bank.subject,v_bank.topic,v_bank.question_type,v_bank.prompt,v_options,v_answer,v_bank.explanation,v_bank.difficulty,v_bank.media_url,v_bank.media_type,coalesce((v_item->>'points')::numeric,1));
    end loop;
  end loop;
  return tedvio_private.online_form_detail(v_id);
end $$;

create or replace function tedvio_private.online_form_meta(p_code text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_form public.v2_online_forms%rowtype;
begin
  select * into v_form from public.v2_online_forms f where f.code=upper(btrim(p_code)) and f.status<>'draft';
  if v_form.id is null then return null; end if;
  return jsonb_build_object('id',v_form.id,'code',v_form.code,'title',v_form.title,'instructions',v_form.instructions,
    'status',v_form.status,
    'available',v_form.status='published' and (v_form.opens_at is null or now()>=v_form.opens_at) and (v_form.closes_at is null or now()<v_form.closes_at) and (not v_form.roster_required or exists(select 1 from public.v2_groups g where g.id=v_form.group_id and g.teacher_id=v_form.teacher_id)),
    'message',case when v_form.status='closed' or (v_form.closes_at is not null and now()>=v_form.closes_at) then 'La evaluación ya cerró.' when v_form.opens_at is not null and now()<v_form.opens_at then 'La evaluación todavía no abre.' when v_form.roster_required and v_form.group_id is null then 'El grupo ya no está disponible.' else null end,
    'group_name',v_form.group_name,'group_choices',to_jsonb(v_form.group_choices),'roster_required',v_form.roster_required,'opens_at',v_form.opens_at,'closes_at',v_form.closes_at,
    'time_limit_minutes',v_form.time_limit_minutes,'max_attempts',v_form.max_attempts,'feedback_mode',v_form.feedback_mode,
    'question_count',(select coalesce(sum(s.draw_count),0) from public.v2_online_form_sections s where s.form_id=v_form.id),
    'sections',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'title',s.title,'position',s.position,'draw_count',s.draw_count) order by s.position),'[]'::jsonb) from public.v2_online_form_sections s where s.form_id=v_form.id),
    'server_now',clock_timestamp());
end $$;

create or replace function tedvio_private.online_form_state(p_token uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_attempt public.v2_online_form_attempts%rowtype; v_form public.v2_online_forms%rowtype; v_released boolean; v_show boolean; v_items jsonb; v_answers jsonb; v_responses jsonb; v_feedback jsonb:='[]'::jsonb;
begin
  select * into v_attempt from public.v2_online_form_attempts a where a.token_hash=tedvio_private.online_form_token_hash(p_token) for update;
  if v_attempt.id is null then raise exception 'El intento no está disponible. Usa su enlace de reanudación en este dispositivo.' using errcode='42501'; end if;
  select * into v_form from public.v2_online_forms f where f.id=v_attempt.form_id;
  if v_attempt.status='in_progress' and (v_form.status='closed' or (v_attempt.expires_at is not null and now()>=v_attempt.expires_at)) then
    perform tedvio_private.online_form_finalize(v_attempt.id,true);
    select * into v_attempt from public.v2_online_form_attempts a where a.id=v_attempt.id;
  end if;
  v_released:=v_attempt.status='submitted' and (v_form.feedback_mode<>'after_close' or v_form.status='closed' or (v_form.closes_at is not null and now()>=v_form.closes_at));
  v_show:=v_released and v_form.feedback_mode<>'score_only';
  select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'section_id',i.section_id,'section_title',s.title,'position',array_position(v_attempt.item_ids,i.id),'prompt',i.prompt,'question_type',i.question_type,'options',coalesce(v_attempt.option_orders->i.id::text,i.options),'points',i.points,'topic',i.topic,'media_url',i.media_url,'media_type',i.media_type) order by array_position(v_attempt.item_ids,i.id)),'[]'::jsonb)
    into v_items from public.v2_online_form_items i join public.v2_online_form_sections s on s.id=i.section_id where i.form_id=v_form.id and i.id=any(v_attempt.item_ids);
  select coalesce(jsonb_object_agg(r.item_id::text,r.answer),'{}'::jsonb),coalesce(jsonb_agg(jsonb_build_object('item_id',r.item_id,'answer',r.answer) order by array_position(v_attempt.item_ids,r.item_id)),'[]'::jsonb)
    into v_answers,v_responses from public.v2_online_form_responses r where r.attempt_id=v_attempt.id;
  if v_show then
    select coalesce(jsonb_agg(jsonb_build_object('item_id',i.id,'answer',r.answer,'is_correct',coalesce(r.is_correct,false),'points',coalesce(r.points,0),'correct_answer',i.correct_answer,'explanation',i.explanation) order by array_position(v_attempt.item_ids,i.id)),'[]'::jsonb)
      into v_feedback from public.v2_online_form_items i left join public.v2_online_form_responses r on r.item_id=i.id and r.attempt_id=v_attempt.id where i.form_id=v_form.id and i.id=any(v_attempt.item_ids);
  end if;
  return jsonb_build_object(
    'form',jsonb_build_object('id',v_form.id,'code',v_form.code,'title',v_form.title,'instructions',v_form.instructions,'status',v_form.status,'feedback_mode',v_form.feedback_mode,'closes_at',v_form.closes_at,'max_attempts',v_form.max_attempts),
    'attempt',jsonb_build_object('id',v_attempt.id,'display_name',v_attempt.display_name,'enrollment',v_attempt.enrollment,'declared_group',v_attempt.declared_group,'attempt_no',v_attempt.attempt_no,'status',v_attempt.status,'started_at',v_attempt.started_at,'expires_at',v_attempt.expires_at,'submitted_at',v_attempt.submitted_at,'auto_submitted',v_attempt.auto_submitted,'score',case when v_released then v_attempt.score else null end,'max_score',v_attempt.max_score,'percentage',case when v_released then v_attempt.percentage else null end),
    'sections',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'title',s.title,'position',s.position,'draw_count',s.draw_count) order by s.position),'[]'::jsonb) from public.v2_online_form_sections s where s.form_id=v_form.id),
    'items',v_items,'answers',v_answers,'responses',v_responses,'response_count',jsonb_array_length(v_responses),'released',v_released,'show_answers',v_show,'feedback',v_feedback,'server_now',clock_timestamp());
end $$;

create or replace function tedvio_private.online_form_results(p_form_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_form public.v2_online_forms%rowtype; v_attempt record; v_attempts jsonb; v_detail jsonb;
begin
  if auth.uid() is null then raise exception 'Inicia sesión como docente.' using errcode='42501'; end if;
  select * into v_form from public.v2_online_forms f where f.id=p_form_id and f.teacher_id=auth.uid();
  if v_form.id is null then raise exception 'La evaluación no está disponible para esta cuenta.' using errcode='42501'; end if;
  for v_attempt in select a.id from public.v2_online_form_attempts a where a.form_id=p_form_id and a.status='in_progress' and (v_form.status='closed' or (a.expires_at is not null and now()>=a.expires_at)) order by a.id loop
    perform tedvio_private.online_form_finalize(v_attempt.id,true);
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,'form_id',a.form_id,'group_student_id',a.group_student_id,'display_name',a.display_name,'enrollment',a.enrollment,'declared_group',a.declared_group,'attempt_no',a.attempt_no,
    'item_ids',a.item_ids,'status',a.status,'started_at',a.started_at,'expires_at',a.expires_at,'submitted_at',a.submitted_at,'auto_submitted',a.auto_submitted,
    'score',a.score,'max_score',a.max_score,'percentage',a.percentage,
    'response_count',(select count(*) from public.v2_online_form_responses r where r.attempt_id=a.id),
    'responses',(select coalesce(jsonb_agg(jsonb_build_object('item_id',r.item_id,'answer',r.answer,'is_correct',r.is_correct,'points',r.points) order by array_position(a.item_ids,r.item_id)),'[]'::jsonb) from public.v2_online_form_responses r where r.attempt_id=a.id)
  ) order by a.started_at,a.id),'[]'::jsonb) into v_attempts from public.v2_online_form_attempts a where a.form_id=p_form_id;
  v_detail:=tedvio_private.online_form_detail(p_form_id);
  return jsonb_build_object('form',v_detail,
    'sections',v_detail->'sections',
    'items',(select coalesce(jsonb_agg(to_jsonb(i)||jsonb_build_object('section_title',s.title) order by s.position,i.position),'[]'::jsonb) from public.v2_online_form_items i join public.v2_online_form_sections s on s.id=i.section_id where i.form_id=p_form_id),
    'attempts',v_attempts,'response_count',(select count(*) from public.v2_online_form_responses r join public.v2_online_form_attempts a on a.id=r.attempt_id where a.form_id=p_form_id),'server_now',clock_timestamp());
end $$;

create or replace function tedvio_private.online_form_start_grouped(p_code text,p_name text,p_enrollment text,p_token uuid,p_group text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_form public.v2_online_forms%rowtype; v_existing public.v2_online_form_attempts%rowtype; v_student public.v2_group_students%rowtype; v_section record; v_item record; v_old record;
  v_hash text; v_name text:=btrim(coalesce(p_name,'')); v_enrollment text:=btrim(coalesce(p_enrollment,'')); v_count int;
  v_declared text:=nullif(btrim(coalesce(p_group,'')),'');
  v_ids uuid[]:='{}'::uuid[]; v_section_ids uuid[]; v_orders jsonb:='{}'::jsonb; v_options jsonb; v_expires timestamptz; v_max numeric;
begin
  if p_token is null then raise exception 'Se necesita un token seguro para iniciar el intento.'; end if;
  if char_length(v_enrollment) not between 1 and 100 then raise exception 'Escribe una matrícula válida.'; end if;
  v_hash:=tedvio_private.online_form_token_hash(p_token);
  select * into v_form from public.v2_online_forms f where f.code=upper(btrim(p_code)) for update;
  if v_form.id is null then raise exception 'La evaluación no está disponible.'; end if;
  select * into v_existing from public.v2_online_form_attempts a where a.token_hash=v_hash;
  if v_existing.id is not null then
    if v_existing.form_id<>v_form.id or v_existing.enrollment_key<>lower(v_enrollment) then raise exception 'El token no corresponde a este intento.' using errcode='42501'; end if;
    if v_declared is not null and v_existing.declared_group is distinct from v_declared then raise exception 'El grupo no corresponde al intento registrado.' using errcode='42501'; end if;
    return tedvio_private.online_form_state(p_token);
  end if;
  if cardinality(v_form.group_choices)>0 and (v_declared is null or not (v_declared=any(v_form.group_choices))) then raise exception 'Selecciona un grupo válido y actualiza la página si no aparece la lista.'; end if;
  if cardinality(v_form.group_choices)=0 and v_declared is not null then raise exception 'Este formulario no admite un grupo declarado.'; end if;
  if v_form.status<>'published' then raise exception 'La evaluación no está abierta.'; end if;
  if v_form.opens_at is not null and now()<v_form.opens_at then raise exception 'La evaluación todavía no abre.'; end if;
  if v_form.closes_at is not null and now()>=v_form.closes_at then raise exception 'La evaluación ya cerró.'; end if;
  if (select count(*) from public.v2_online_form_attempts a where a.form_id=v_form.id)>=1000 then raise exception 'Esta evaluación alcanzó el límite de 1000 intentos registrados.'; end if;
  if v_form.roster_required then
    if v_form.group_id is null or not exists(select 1 from public.v2_groups g where g.id=v_form.group_id and g.teacher_id=v_form.teacher_id) then raise exception 'El grupo de esta evaluación ya no está disponible.'; end if;
    select count(*) into v_count from public.v2_group_students s where s.group_id=v_form.group_id and s.teacher_id=v_form.teacher_id and s.active and lower(btrim(s.enrollment))=lower(v_enrollment);
    if v_count<>1 then raise exception 'La matrícula no identifica a un alumno activo de este grupo.'; end if;
    select * into v_student from public.v2_group_students s where s.group_id=v_form.group_id and s.teacher_id=v_form.teacher_id and s.active and lower(btrim(s.enrollment))=lower(v_enrollment);
    v_name:=btrim(v_student.full_name); v_enrollment:=btrim(v_student.enrollment);
  end if;
  if char_length(v_name) not between 1 and 200 then raise exception 'Escribe tu nombre completo.'; end if;
  for v_old in select a.id from public.v2_online_form_attempts a where a.form_id=v_form.id and a.enrollment_key=lower(v_enrollment) and a.status='in_progress' and a.expires_at is not null and now()>=a.expires_at loop
    perform tedvio_private.online_form_finalize(v_old.id,true);
  end loop;
  if exists(select 1 from public.v2_online_form_attempts a where a.form_id=v_form.id and a.enrollment_key=lower(v_enrollment) and a.status='in_progress') then raise exception 'Ya existe un intento activo. Reanúdalo con el token guardado en el dispositivo original.'; end if;
  select count(*) into v_count from public.v2_online_form_attempts a where a.form_id=v_form.id and a.enrollment_key=lower(v_enrollment);
  if v_count>=v_form.max_attempts then raise exception 'Ya utilizaste los intentos permitidos.'; end if;
  for v_section in select s.* from public.v2_online_form_sections s where s.form_id=v_form.id order by s.position loop
    -- Sampling and display order are independent. Even with shuffle disabled,
    -- a fresh subset is drawn; sections keep their teacher-defined order.
    select array_agg(q.id order by case when v_form.shuffle_questions then q.r else q.position::float8 end) into v_section_ids
      from (select i.id,i.position,random() r from public.v2_online_form_items i where i.section_id=v_section.id order by r limit v_section.draw_count) q;
    if coalesce(cardinality(v_section_ids),0)<>v_section.draw_count then raise exception 'No hay suficientes preguntas en una sección.'; end if;
    v_ids:=v_ids||v_section_ids;
  end loop;
  if cardinality(v_ids)=0 then raise exception 'La evaluación no contiene preguntas.'; end if;
  for v_item in select i.* from public.v2_online_form_items i where i.form_id=v_form.id and i.id=any(v_ids) loop
    if v_form.shuffle_options then select jsonb_agg(e.value order by random()) into v_options from jsonb_array_elements(v_item.options) e(value); else v_options:=v_item.options; end if;
    v_orders:=v_orders||jsonb_build_object(v_item.id::text,v_options);
  end loop;
  if v_form.time_limit_minutes is not null then v_expires:=now()+make_interval(mins=>v_form.time_limit_minutes); end if;
  if v_form.closes_at is not null then v_expires:=case when v_expires is null then v_form.closes_at else least(v_expires,v_form.closes_at) end; end if;
  select sum(i.points) into v_max from public.v2_online_form_items i where i.form_id=v_form.id and i.id=any(v_ids);
  insert into public.v2_online_form_attempts(form_id,group_student_id,token_hash,display_name,enrollment,attempt_no,item_ids,option_orders,expires_at,max_score,declared_group)
    values(v_form.id,v_student.id,v_hash,v_name,v_enrollment,v_count+1,v_ids,v_orders,v_expires,v_max,v_declared);
  return tedvio_private.online_form_state(p_token);
end $$;

-- Old clients can resume a previously started attempt, but cannot start a
-- group-enabled form without choosing an allowed label.
create or replace function tedvio_private.online_form_start(p_code text,p_name text,p_enrollment text,p_token uuid)
returns jsonb language sql security invoker set search_path='' as $$
 select tedvio_private.online_form_start_grouped(p_code,p_name,p_enrollment,p_token,null)
$$;
create function public.v2_online_form_start_grouped(p_code text,p_name text,p_enrollment text,p_token uuid,p_group text)
returns jsonb language sql security invoker set search_path='' as $$
 select tedvio_private.online_form_start_grouped(p_code,p_name,p_enrollment,p_token,p_group)
$$;
revoke all on function tedvio_private.online_form_start_grouped(text,text,text,uuid,text),public.v2_online_form_start_grouped(text,text,text,uuid,text) from public,anon,authenticated;
grant execute on function tedvio_private.online_form_start_grouped(text,text,text,uuid,text),public.v2_online_form_start_grouped(text,text,text,uuid,text) to anon,authenticated;

-- Initial configuration of a previously published unbound form is deliberately
-- separate from editing its frozen content. It only affects future attempts.
create function tedvio_private.online_form_set_group_choices(p_form_id uuid,p_choices jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_form public.v2_online_forms%rowtype; v_choices text[];
begin
  if auth.uid() is null then raise exception 'Inicia sesión como docente.' using errcode='42501'; end if;
  select * into v_form from public.v2_online_forms f where f.id=p_form_id and f.teacher_id=auth.uid() for update;
  if v_form.id is null then raise exception 'La evaluación no está disponible para esta cuenta.' using errcode='42501'; end if;
  if v_form.group_id is not null or v_form.roster_required or v_form.status='closed' then raise exception 'No se pueden configurar grupos declarados en este formulario.'; end if;
  v_choices:=tedvio_private.online_form_validate_group_choices(p_choices);
  if cardinality(v_choices)=0 then raise exception 'Agrega al menos un grupo.'; end if;
  if v_form.group_choices=v_choices then return tedvio_private.online_form_detail(p_form_id); end if;
  if v_form.status<>'draft' and cardinality(v_form.group_choices)>0 then raise exception 'La lista de grupos publicada queda congelada.'; end if;
  update public.v2_online_forms set group_choices=v_choices,revision=revision+1,updated_at=clock_timestamp() where id=p_form_id;
  return tedvio_private.online_form_detail(p_form_id);
end $$;
create function public.v2_online_form_set_group_choices(p_form_id uuid,p_choices jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select tedvio_private.online_form_set_group_choices(p_form_id,p_choices)
$$;
revoke all on function tedvio_private.online_form_set_group_choices(uuid,jsonb),public.v2_online_form_set_group_choices(uuid,jsonb) from public,anon,authenticated;
grant execute on function tedvio_private.online_form_set_group_choices(uuid,jsonb),public.v2_online_form_set_group_choices(uuid,jsonb) to authenticated;
