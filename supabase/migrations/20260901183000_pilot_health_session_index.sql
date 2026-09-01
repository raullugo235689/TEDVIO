-- Cover the session foreign key for cascade deletes and session-scoped health lookups.

create index if not exists v2_session_health_events_session_created_idx
  on public.v2_session_health_events(session_id, created_at desc);
