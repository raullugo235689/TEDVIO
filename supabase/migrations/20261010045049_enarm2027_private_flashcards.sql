-- Private study material. No personal content is shipped in this migration.
create table public.tedvio_enarm2027_flashcards (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 source_key text not null check(length(source_key) between 3 and 180),
 source_file text not null, source_page integer not null check(source_page>0),
 source_sha256 text not null check(length(source_sha256)=64),
 area text not null check(area in ('medicina_interna','pediatria','ginecologia_obstetricia','cirugia','urgencias','medicina_familiar','salud_publica')),
 topic text not null, subtopic text not null,
 question text not null check(length(question) between 10 and 1000),
 answer text not null check(length(answer) between 3 and 2000),
 explanation text not null default '',
 references_json jsonb not null default '[]' check(jsonb_typeof(references_json)='array'),
 created_at timestamptz not null default now(),
 unique(user_id,source_key), unique(user_id,id)
);
create table public.tedvio_enarm2027_flashcard_reviews (
 user_id uuid not null, card_id uuid not null,
 stage integer not null default 0 check(stage between 0 and 5),
 tries integer not null default 0 check(tries>=0),
 due_at timestamptz not null default now(), last_reviewed_at timestamptz,
 primary key(user_id,card_id),
 foreign key(user_id,card_id) references public.tedvio_enarm2027_flashcards(user_id,id) on delete cascade
);
create index enarm_flashcards_due on public.tedvio_enarm2027_flashcard_reviews(user_id,due_at);
create table public.tedvio_enarm2027_flashcard_events (
 user_id uuid not null, id uuid not null, card_id uuid not null,
 rating text not null check(rating in ('again','hard','good')),
 stage integer not null check(stage between 0 and 5), due_at timestamptz not null,
 created_at timestamptz not null default now(),
 primary key(user_id,id),
 foreign key(user_id,card_id) references public.tedvio_enarm2027_flashcards(user_id,id) on delete cascade
);
create index enarm_flashcard_events_card on public.tedvio_enarm2027_flashcard_events(user_id,card_id);
alter table public.tedvio_enarm2027_flashcards enable row level security;
alter table public.tedvio_enarm2027_flashcard_reviews enable row level security;
alter table public.tedvio_enarm2027_flashcard_events enable row level security;
revoke all on public.tedvio_enarm2027_flashcards,public.tedvio_enarm2027_flashcard_reviews,public.tedvio_enarm2027_flashcard_events from public,anon,authenticated;
grant select on public.tedvio_enarm2027_flashcards to authenticated;
grant select,insert,update on public.tedvio_enarm2027_flashcard_reviews to authenticated;
grant select,insert on public.tedvio_enarm2027_flashcard_events to authenticated;
create policy private_flashcards on public.tedvio_enarm2027_flashcards for select to authenticated using(user_id=(select auth.uid()));
create policy private_flashcard_reviews on public.tedvio_enarm2027_flashcard_reviews for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy private_flashcard_events on public.tedvio_enarm2027_flashcard_events for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create function public.tedvio_enarm2027_rate_flashcard(p_card_id uuid,p_rating text,p_event_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_user uuid:=auth.uid(); v_stage integer; v_due timestamptz; v_event public.tedvio_enarm2027_flashcard_events%rowtype;
begin
 if v_user is null then raise exception 'Inicia sesión para guardar tu repaso.'; end if;
 if p_rating is null or p_rating not in ('again','hard','good') or p_event_id is null then raise exception 'Valoración inválida.'; end if;
 if not exists(select 1 from public.tedvio_enarm2027_flashcards where id=p_card_id and user_id=v_user) then raise exception 'Tarjeta no disponible.'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text,2027));
 select * into v_event from public.tedvio_enarm2027_flashcard_events where user_id=v_user and id=p_event_id;
 if found then
  if v_event.card_id<>p_card_id or v_event.rating<>p_rating then raise exception 'La solicitud cambió. Vuelve a abrir la tarjeta.'; end if;
  return jsonb_build_object('stage',v_event.stage,'due_at',v_event.due_at);
 end if;
 select stage into v_stage from public.tedvio_enarm2027_flashcard_reviews where user_id=v_user and card_id=p_card_id;
 v_stage:=case p_rating when 'again' then 0 when 'hard' then greatest(0,coalesce(v_stage,0)-1) else least(5,coalesce(v_stage,0)+1) end;
 v_due:=now()+make_interval(days=>case p_rating when 'again' then 1 when 'hard' then 2 else (array[1,4,7,14,30,60])[v_stage+1] end);
 insert into public.tedvio_enarm2027_flashcard_reviews(user_id,card_id,stage,tries,due_at,last_reviewed_at)
 values(v_user,p_card_id,v_stage,1,v_due,now())
 on conflict(user_id,card_id) do update set stage=excluded.stage,tries=public.tedvio_enarm2027_flashcard_reviews.tries+1,due_at=excluded.due_at,last_reviewed_at=excluded.last_reviewed_at;
 insert into public.tedvio_enarm2027_flashcard_events(user_id,id,card_id,rating,stage,due_at) values(v_user,p_event_id,p_card_id,p_rating,v_stage,v_due);
 return jsonb_build_object('stage',v_stage,'due_at',v_due);
end $$;
revoke all on function public.tedvio_enarm2027_rate_flashcard(uuid,text,uuid) from public,anon;
grant execute on function public.tedvio_enarm2027_rate_flashcard(uuid,text,uuid) to authenticated;
