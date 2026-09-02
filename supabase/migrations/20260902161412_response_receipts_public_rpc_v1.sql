-- TEDVIO Response Receipts public RPC
-- Kept as a separate idempotent migration so deployed migration history and
-- repository replays both retain the explicit privilege boundary.

revoke all on function tedvio_private.v2_submit_response_receipt_impl_v1(uuid, uuid, jsonb, uuid)
  from public;
grant execute on function tedvio_private.v2_submit_response_receipt_impl_v1(uuid, uuid, jsonb, uuid)
  to anon, authenticated, service_role;

create or replace function public.v2_submit_response_v2(
  p_question_id uuid,
  p_participant_id uuid,
  p_answer jsonb,
  p_request_id uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select tedvio_private.v2_submit_response_receipt_impl_v1(
    p_question_id, p_participant_id, p_answer, p_request_id
  );
$$;

revoke all on function public.v2_submit_response_v2(uuid, uuid, jsonb, uuid) from public;
grant execute on function public.v2_submit_response_v2(uuid, uuid, jsonb, uuid)
  to anon, authenticated, service_role;

comment on function public.v2_submit_response_v2(uuid, uuid, jsonb, uuid) is
  'Idempotent response submission. Returns a redacted durable receipt and never exposes grading before reveal.';
