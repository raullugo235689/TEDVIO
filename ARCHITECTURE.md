# TEDVIO runtime architecture

## Current production entry

`beta.html` is the active teacher/student entry point.

## Core ownership

- `beta.js`: current session/question/report engine. Still monolithic and scheduled for modular split.
- `beta-groups-core-v3.js`: canonical groups, roster and attendance module. It owns group navigation, student roster, date selection, attendance status, observations, saving and history.
- `beta-academics.js`: university/program academic structure.
- `beta-paper-exams-v2.js` + `paper-omr-v1.js`: paper exams and OMR.
- `proyectar-v2.js`: projection runtime.
- `beta-admin-v1.js`: admin shell.
- `beta-ui-v42.js`: commercial workspace/navigation shell.

## Deprecated runtime layers

The following files remain in the repository for history but MUST NOT be loaded by `beta.html`:

- `beta-groups-attendance.js`
- `beta-groups-cascade-v1.js`
- `beta-attendance-date-v1.js`
- `beta-attendance-fast-v1.js`
- `beta-attendance-save-v1.js`
- `beta-paper-exams-v1.js`
- `proyectar.js`
- `beta-login-clean.js`
- `beta-logo-png.js`

## Canonical academic data model

`v2_universities -> v2_programs -> v2_groups -> v2_group_students`

`v2_groups.program_id`, `v2_groups.name` and `v2_groups.term` are canonical. Legacy display columns (`university`, `program`, `group_name`, `school_cycle`) are compatibility-only and should not be used as the source of truth in new code.

## Attendance model

`v2_groups -> v2_attendance_sessions -> v2_attendance_records`

The active attendance session id must always come from `v2_attendance_sessions`. Never infer it from a student's most recent attendance record.

## Refactor roadmap

1. Split `beta.js` into auth, teacher dashboard, live sessions, student runtime and reports.
2. Replace DOM patching with explicit state/render functions.
3. Remove deprecated files after regression coverage exists.
4. Add automated smoke tests for live sessions, attendance and OMR.
5. Add centralized error telemetry before commercial launch.
