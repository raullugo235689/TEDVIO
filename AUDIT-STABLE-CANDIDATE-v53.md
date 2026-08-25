# TEDVIO v53 — Stable Candidate Audit

Date: 2026-08-25

## Scope

Full technical audit of the current TEDVIO teacher/student runtime, Group Center 360, academic hierarchy, Attendance Pro + QR, gradebook/student profiles, live sessions, projection, OMR, Supabase RLS/RPC boundaries, storage limits, deployment wiring and CI regression coverage.

## Corrected critical/high findings

### Participant / roster bypass — FIXED
Anonymous direct CRUD on `v2_participants` allowed roster-required sessions to be bypassed. Public join is now forced through `v2_join_session_v3`, which validates the canonical `v2_group_students` roster. Projection reads display-safe participant data through `v2_public_session_people`.

### Legacy roster mismatch — FIXED
`v2_join_session_v3` depended on `v2_roster_students`, while the current platform uses `v2_group_students`. The join RPC now uses the canonical group roster.

### Pre-reveal explanation leak — FIXED
`v2_submit_response` no longer returns the teacher explanation during a live question. `v2_student_answer_feedback` releases it only after reveal/session close. Student results runtime was updated accordingly.

### QR rescan attendance downgrade — FIXED
Repeated QR scans could change an earlier `present` record to `late` and could overwrite justified/manual states. Check-in is now idempotent and preserves existing `present`, `late` and `justified` records.

### Cross-tenant parent/child references — FIXED
RLS write checks now validate ownership/relationship across academic hierarchy, sessions, attendance, gradebook, student notes, prepared content and OMR tables.

### Legacy MVP public surface — QUARANTINED
The old root app is no longer served as the production surface. `/` redirects to `/teacher`. Anonymous MVP CRUD policies and obsolete legacy RPC grants were removed. Legacy data/files remain preserved.

### Private SECURITY DEFINER RPC exposure — HARDENED
Teacher/admin/attendance RPCs are no longer executable anonymously. Trigger/helper functions and obsolete demo RPCs were removed from the client RPC surface.

### Media upload envelope — HARDENED
`tedvio-media-v2` now enforces a 25 MB server-side size limit and an explicit image/audio/video MIME allowlist. Owner-scoped write policies remain in force; public read is intentional for classroom media.

## Regression tests executed against Supabase

Transactional tests (rolled back after execution) passed for:

- canonical roster join through `v2_join_session_v3`;
- anonymous direct participant read blocked;
- anonymous direct participant insert blocked;
- anonymous direct participant update blocked;
- projection-safe participant RPC;
- submit response explanation hidden while live;
- explanation unavailable before reveal;
- explanation available after reveal;
- first QR scan records present;
- late rescan preserves the original present state;
- QR rescan preserves teacher justification;
- Attendance Pro open;
- QR issue;
- pause;
- resume;
- close;
- automatic absent completion;
- reopen;
- grade category/item/score writes under relational RLS;
- student note write;
- paper exam/result writes under relational RLS.

## CI / deployment

`tests/stable-candidate-audit.mjs` is now executed by GitHub Actions on push and pull request. It validates stable runtime wiring, deprecated-layer exclusion, secure join guard, Attendance Pro, OMR v2, projection privacy, reveal-gated student results and absence of frontend service-role secrets.

The v53 deployment reached Vercel with SUCCESS and the expanded GitHub Actions audit passed on the audited commit chain.

## Current verdict

**Stable Candidate for a controlled pilot:** YES.

**Ready for mass commercial production:** NOT YET.

## Remaining non-blocking / pre-commercial work

1. `beta.js` is still monolithic and contains an old direct-join fallback; `beta-stability.js` intercepts production join securely, but the fallback should be removed during the core split.
2. `beta-session-stability-v1.js` still monkeypatches `Element.prototype.innerHTML` to prevent session/QR flicker. Replace with incremental rendering before scale-up.
3. Several enhancement modules run periodic DOM/poll loops. The fastest student results loop was reduced to 800 ms, but full event/state consolidation remains desirable.
4. OMR database/security flow is sound, but physical scanning needs calibration with printed sheets, real lighting, perspective and writing instruments before official-grade use.
5. Admin user/plan management remains incomplete.
6. Supabase Auth leaked-password protection remains disabled and should be enabled before production onboarding.
7. Repository is still public; make it private before commercial launch.
8. Legacy tables/files are quarantined, not deleted. Remove them only after a deliberate retention/migration decision.
9. Centralized client/runtime error telemetry is still pending.
10. Load testing with dozens of simultaneous real devices remains required before hundreds of concurrent users.

## Stable-candidate rule

Do not add a new large feature until the audited v53 pilot paths are manually validated on iPad/iPhone/desktop: login, group open, Attendance Pro, QR check-in, student join/live answer/reveal, projection, gradebook and OMR scan/import flow.
