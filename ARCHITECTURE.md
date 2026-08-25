# TEDVIO runtime architecture

## Stable candidate entry points

- `/teacher` -> `teacher.html`: stable teacher entry.
- `beta.html`: shared beta teacher/student entry and current student join/runtime.
- `proyectar.html`: classroom projection.
- `asistencia.html`: public Attendance Pro check-in.
- `/`: redirects to `/teacher`; the pre-v2 MVP root runtime is quarantined.

The teacher login screen remains owned by the existing `beta.js` auth renderer and must not be redesigned accidentally by interior workspace changes.

## Core ownership

- `beta.js`: session/question/report engine plus legacy student/auth code. Still monolithic and the main refactor target.
- `beta-stability.js`: secure public join guard using `v2_join_session_v3`; currently also carries session creation/recovery enhancements.
- `beta-student-live-v1.js`: revealed aggregate results and reveal-gated student explanation.
- `beta-groups-core-v3.js`: canonical groups and student roster; manual attendance compatibility flow.
- `beta-group-center-v2.js`: Group Center 360, gradebook, profiles, risk analytics and group integrations.
- `beta-attendance-pro-v1.js`: canonical Attendance Pro UI/lifecycle, QR, correction, reports and exports.
- `beta-academics.js`: university/program academic structure.
- `beta-paper-exams-v2.js` + `paper-omr-v1.js`: paper exams and OMR.
- `proyectar-v2.js`: projection runtime; public participant display is obtained only through `v2_public_session_people`.
- `beta-admin-v1.js`: admin shell.
- `beta-ui-v44.js`: persistent commercial workspace navigation.

## Deprecated / quarantined runtime layers

The following files remain in the repository for history but MUST NOT be loaded by `teacher.html` or `beta.html`:

- `beta-groups-attendance.js`
- `beta-groups-cascade-v1.js`
- `beta-attendance-date-v1.js`
- `beta-attendance-fast-v1.js`
- `beta-attendance-save-v1.js`
- `beta-paper-exams-v1.js`
- `beta-qr-attendance-v3.js`
- `beta-group-center-v1.js`
- `proyectar.js`
- `beta-login-clean.js`
- `beta-logo-png.js`

The pre-v2 root app (`app.js` and legacy tables such as `sessions`, `questions`, `participants`, `responses`) is not part of the stable candidate. Its anonymous MVP RLS policies and obsolete RPC grants are disabled; data remains preserved for migration/history.

## Canonical academic data model

`v2_universities -> v2_programs -> v2_groups -> v2_group_students`

`v2_groups.program_id`, `v2_groups.name` and `v2_groups.term` are canonical. Compatibility columns (`university`, `program`, `group_name`, `school_cycle`) are display-only.

Database triggers keep compatibility names synchronized. RLS write policies also validate parent ownership, so a teacher cannot create cross-tenant program/group/student references by manually crafting API requests.

## Public session join model

Students join through `v2_join_session_v3`, not by inserting directly into `v2_participants`.

`v2_join_session_v3` validates the active session, team requirement and canonical `v2_group_students` roster when required. Participant table INSERT/UPDATE/SELECT is not exposed anonymously. Projection receives display-safe names/team only through `v2_public_session_people`.

The legacy `v2_roster_students` table remains for migration compatibility but is no longer the canonical roster for new joins.

## Question secrecy / feedback model

Correct answers are held in `v2_question_secrets` while a question is live. `v2_submit_response` performs server-side grading but does not return the explanation during the live phase. Student explanations are released through `v2_student_answer_feedback` only after the teacher reveals the question (or closes the session).

## Attendance Pro model

`v2_groups -> v2_attendance_sessions -> v2_attendance_records`

Lifecycle:

`open -> paused -> open -> closed -> reopened`

Attendance Pro owns punctuality thresholds, server-issued rotating QR tokens, pause/resume/close, automatic absences, manual corrections, monthly analytics, Excel/PDF exports and student attendance summaries.

QR check-in is idempotent: rescanning does not downgrade an existing on-time attendance to late and cannot overwrite a teacher's justified/manual record.

## Gradebook model

`v2_groups -> v2_grade_categories -> v2_grade_items -> v2_grade_scores`

OMR, attendance and manual categories feed the Group Center gradebook. Parent/child RLS guards ensure category/item/score/student references stay within the authenticated teacher's own group.

## Security boundary

- Frontend contains a Supabase publishable key only; no service-role secret is shipped.
- Teacher/private RPCs require `authenticated` and verify ownership internally.
- Public SECURITY DEFINER RPCs are intentionally limited to student/live operations that require anonymous classroom access.
- Media bucket writes are owner-scoped; public reads are intentional for classroom media. Server-side MIME and 25 MB limits are enforced.
- Legacy MVP anonymous CRUD is quarantined.

## Regression coverage

`.github/workflows/core-smoke.yml` runs `tests/stable-candidate-audit.mjs` on every push/PR. It checks active runtime wiring, deprecated-layer exclusion, secure join guard, Attendance Pro, OMR v2, projection privacy, reveal-gated student results and frontend secret hygiene.

Database security/integrity smoke tests were also run transactionally during the v53 audit for roster join, participant RLS, explanation gating, QR idempotency, Attendance Pro lifecycle, gradebook writes, notes and OMR writes.

## Remaining refactor roadmap

1. Split `beta.js` into auth, teacher dashboard, live sessions, student runtime and reports.
2. Replace the global `innerHTML` stabilization monkeypatch with incremental session rendering.
3. Consolidate DOM enhancement timers/listeners into an explicit app state/action registry.
4. Physically calibrate OMR with real printed sheets, camera angles, shadows and writing instruments before official-grade use.
5. Complete admin user/plan management and centralized error telemetry.
6. Remove quarantined legacy files/tables after a retention/migration decision.
7. Make the repository private and move to production-grade paid infrastructure before commercial launch.
