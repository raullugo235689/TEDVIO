# TEDVIO v64 · Reliability & Performance

v64 introduces a Realtime-first session wake bus while preserving all audited v56–v63 product runtimes.

- Database changes on `v2_sessions`, `v2_questions`, `v2_participants`, and `v2_responses` emit a minimal `state_changed` Broadcast to `tedvio:session:<uuid>`.
- Broadcast payloads contain only table kind, operation, and timestamp; no student answer or correct-answer data is broadcast.
- `runtime-core-v64.js` subscribes per active session and wakes the existing teacher/student/control/projection runtime.
- Aggressive 850–1200 ms data polls become 12–15 second recovery polls. 250 ms visual countdown timers remain unchanged.
- The global `Element.prototype.innerHTML` stabilization patch is retired when v64 is active; QR stabilization remains. Legacy behavior is preserved when v64 is absent for rollback.
- Runtime errors and unhandled promise rejections are deduplicated and sent to existing `tedvio_client_events` telemetry for authenticated teachers.
- Realtime channels are removed when changing session/leaving the page.

The existing audited session/action engines remain authoritative. v64 coordinates and wakes them; it does not duplicate scoring, join, response, OMR, attendance, or entitlement business logic.
