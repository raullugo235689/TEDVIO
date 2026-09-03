-- Recovered from the production migration ledger for deterministic rebuilds.
create or replace function public.v2_randomize_live_options()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_randomize boolean;
begin
  if new.status='live' and (tg_op='INSERT' or old.status is distinct from 'live') and new.question_type in ('multiple_choice','multiple_select','true_false','poll') then
    select randomize_options into v_randomize from public.v2_sessions where id=new.session_id;
    if coalesce(v_randomize,false) then new.options=public.v2_shuffle_jsonb_array(new.options); end if;
  end if;
  return new;
end;$$;
drop trigger if exists v2_questions_randomize_options on public.v2_questions;
drop trigger if exists v2_questions_randomize_options_insert on public.v2_questions;
create trigger v2_questions_randomize_options before update of status on public.v2_questions for each row execute function public.v2_randomize_live_options();
create trigger v2_questions_randomize_options_insert before insert on public.v2_questions for each row execute function public.v2_randomize_live_options();

create index if not exists v2_prepared_items_bank_idx on public.v2_prepared_items(bank_id);
create index if not exists v2_prepared_quizzes_teacher_idx on public.v2_prepared_quizzes(teacher_id);
create index if not exists v2_questions_bank_idx on public.v2_questions(bank_id);
create index if not exists v2_sessions_current_question_idx on public.v2_sessions(current_question_id);

revoke execute on function public.v2_fill_question_metadata() from public,anon,authenticated;
revoke execute on function public.v2_fill_structured_session_context() from public,anon,authenticated;
revoke execute on function public.v2_randomize_live_options() from public,anon,authenticated;
revoke execute on function public.v2_attendance_from_participant() from public,anon,authenticated;
do $$ begin
  if to_regprocedure('public.v2_fill_academic_context()') is not null then
    revoke execute on function public.v2_fill_academic_context() from public,anon,authenticated;
  end if;
end $$;

