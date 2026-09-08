import type { AttendanceSessionOptions } from './attendance';
import type { AttendanceDayData, AttendanceRecordStatus } from './types';

export interface AttendanceValues {
  records: Record<string, { status: AttendanceRecordStatus; note: string }>;
  options: AttendanceSessionOptions;
}

export interface AttendanceSnapshot extends AttendanceValues {
  sessionId: string | null;
  status: string | null;
}

export interface AttendanceDraft {
  base: AttendanceSnapshot;
  values: AttendanceValues;
  revision: number;
}

export function attendanceDraftKey(userId?: string, groupId?: string, date?: string) {
  return ['attendance-draft', userId, groupId, date] as const;
}

export function attendanceWriteKey(userId?: string, groupId?: string, date?: string) {
  return ['attendance-write', userId, groupId, date] as const;
}

export function attendanceSnapshot(day: AttendanceDayData): AttendanceSnapshot {
  const existing = new Map(day.records.map((record) => [record.student_id, record]));
  return {
    sessionId: day.session?.id ?? null,
    status: day.session?.status ?? null,
    records: Object.fromEntries(day.students.map((student) => {
      const record = existing.get(student.id);
      return [student.id, { status: record?.status || 'present', note: record?.observation || record?.note || '' }];
    })),
    options: {
      lateAfterMinutes: Number(day.session?.late_after_minutes ?? 10),
      autoMarkAbsent: day.session?.auto_mark_absent ?? true,
      notes: day.session?.notes || '',
    },
  };
}

/** Compare academic values, not timestamps or the order of API results. */
export function sameAttendanceSnapshot(a: AttendanceSnapshot, b: AttendanceSnapshot): boolean {
  const normalize = (value: AttendanceSnapshot) => JSON.stringify({
    sessionId: value.sessionId,
    status: value.status,
    records: Object.entries(value.records).sort(([aId], [bId]) => aId.localeCompare(bId))
      .map(([id, row]) => [id, row.status, row.note.trim()]),
    options: [value.options.lateAfterMinutes, value.options.autoMarkAbsent, value.options.notes.trim()],
  });
  return normalize(a) === normalize(b);
}

export function missingAttendanceRecords(day: AttendanceDayData): number {
  const saved = new Set(day.records.map((record) => record.student_id));
  return day.students.filter((student) => !saved.has(student.id)).length;
}

export function editAttendanceDraft(
  current: AttendanceDraft | null | undefined,
  remote: AttendanceSnapshot,
  update: (values: AttendanceValues) => AttendanceValues,
): AttendanceDraft {
  return {
    base: current?.base ?? remote,
    values: update(current?.values ?? remote),
    revision: (current?.revision ?? 0) + 1,
  };
}

/** A late save must never clear edits made after its submitted snapshot. */
export function finishAttendanceSave(current: AttendanceDraft | null | undefined, revision: number): AttendanceDraft | null {
  return current && current.revision !== revision ? current : null;
}

export function validAttendanceDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
