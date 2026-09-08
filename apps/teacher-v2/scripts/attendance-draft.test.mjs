import test from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient } from '@tanstack/react-query';
import { attendanceDraftKey, attendanceSnapshot, sameAttendanceSnapshot, missingAttendanceRecords, editAttendanceDraft, finishAttendanceSave, validAttendanceDate } from '../src/core/attendance-draft.ts';
import { hasPendingAttendance } from '../src/core/useAttendanceDraftGuard.ts';

const day = () => ({
  date: '2026-09-08', group: { id: 'group-a' },
  session: { id: 'list-a', status: 'open', late_after_minutes: 10, auto_mark_absent: true, notes: '' },
  students: [{ id: 'student-a' }, { id: 'student-b' }],
  records: [{ student_id: 'student-a', status: 'present', observation: '', updated_at: '2026-09-08T08:00:00Z' }],
});
const absent = (values) => ({ ...values, records: { ...values.records, 'student-a': { status: 'absent', note: 'Avisó al docente' } } });

test('los presentes propuestos no se confunden con registros guardados', () => {
  const data = day();
  assert.equal(attendanceSnapshot(data).records['student-b'].status, 'present');
  assert.equal(missingAttendanceRecords(data), 1);
  data.records.push({ student_id: 'student-b', status: 'present' });
  assert.equal(missingAttendanceRecords(data), 0);
});

test('una actualización remota no reemplaza las ediciones ni su punto de partida', () => {
  const initial = attendanceSnapshot(day());
  const draft = editAttendanceDraft(null, initial, absent);
  const changed = day();
  changed.records[0].status = 'late';
  const next = editAttendanceDraft(draft, attendanceSnapshot(changed), (values) => ({ ...values, options: { ...values.options, notes: 'Clase práctica' } }));
  assert.equal(next.values.records['student-a'].status, 'absent');
  assert.equal(next.base.records['student-a'].status, 'present');
  assert.equal(next.revision, 2);
  assert.equal(sameAttendanceSnapshot(next.base, attendanceSnapshot(changed)), false);
  assert.equal(initial.records['student-a'].status, 'present');
});

test('se conserva la captura al cambiar de fecha y se aísla por docente y grupo', () => {
  const client = new QueryClient();
  const key = attendanceDraftKey('teacher-a', 'group-a', '2026-09-08');
  const draft = editAttendanceDraft(null, attendanceSnapshot(day()), absent);
  client.setQueryDefaults(['attendance-draft'], { gcTime: Infinity });
  client.setQueryData(key, draft);
  client.setQueryData(attendanceDraftKey('teacher-a', 'group-a', '2026-09-09'), null);
  assert.deepEqual(client.getQueryData(key), draft);
  assert.equal(client.getQueryData(attendanceDraftKey('teacher-b', 'group-a', '2026-09-08')), undefined);
  assert.equal(client.getQueryData(attendanceDraftKey('teacher-a', 'group-b', '2026-09-08')), undefined);
  assert.equal(hasPendingAttendance(client, 'teacher-a'), true);
  assert.equal(hasPendingAttendance(client, 'teacher-b'), false);
  client.clear();
  assert.equal(hasPendingAttendance(client, 'teacher-a'), false);
});

test('el final de un guardado anterior no borra cambios más recientes', () => {
  const base = attendanceSnapshot(day());
  const first = editAttendanceDraft(null, base, absent);
  const second = editAttendanceDraft(first, base, (values) => ({ ...values, options: { ...values.options, notes: 'Corrección posterior' } }));
  assert.deepEqual(finishAttendanceSave(second, first.revision), second);
  assert.equal(finishAttendanceSave(second, second.revision), null);
});

test('el orden de las filas y los sellos de actualización no generan conflictos falsos', () => {
  const a = day();
  a.records.push({ student_id: 'student-b', status: 'present' });
  const b = structuredClone(a);
  b.students.reverse(); b.records.reverse();
  b.records[0].updated_at = '2026-09-08T11:00:00Z';
  assert.equal(sameAttendanceSnapshot(attendanceSnapshot(a), attendanceSnapshot(b)), true);
});

test('se detectan cambios de lista, cierre, padrón, observaciones y opciones', () => {
  const original = day();
  const base = attendanceSnapshot(original);
  for (const modify of [
    (value) => { value.session.id = 'list-b'; },
    (value) => { value.session.status = 'closed'; },
    (value) => { value.students.pop(); },
    (value) => { value.records[0].observation = 'Nueva observación'; },
    (value) => { value.session.late_after_minutes = 15; },
  ]) {
    const changed = structuredClone(original); modify(changed);
    assert.equal(sameAttendanceSnapshot(base, attendanceSnapshot(changed)), false);
  }
});

test('el resultado ya guardado se reconoce aunque el servidor normalice espacios', () => {
  const saved = day(); saved.records[0].observation = 'Nota';
  const local = attendanceSnapshot(saved); local.records['student-a'].note = '  Nota  ';
  assert.equal(sameAttendanceSnapshot(local, attendanceSnapshot(saved)), true);
});

test('se rechazan fechas vacías o imposibles sin consultar otra lista', () => {
  for (const invalid of ['', '2026-02-30', '2026-13-08', '08/09/2026', '2026-9-8']) assert.equal(validAttendanceDate(invalid), false);
  assert.equal(validAttendanceDate('2028-02-29'), true);
  assert.equal(validAttendanceDate('2026-09-08'), true);
});
