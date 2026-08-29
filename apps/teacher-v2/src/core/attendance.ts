import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type {
  AttendanceDayData,
  AttendanceRecordRow,
  AttendanceRecordStatus,
  AttendanceSessionRecord,
  AttendanceSessionState,
  GroupRecord,
  StudentRecord,
} from './types';

export interface AttendanceDraftRecord {
  studentId: string;
  status: AttendanceRecordStatus;
  note: string;
}

export interface AttendanceSessionOptions {
  lateAfterMinutes: number;
  autoMarkAbsent: boolean;
  notes: string;
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message || 'Error desconocido');
  }
  return String(error || 'Error desconocido');
}

export function attendanceDayKey(userId?: string, groupId?: string, date?: string) {
  return ['attendance-day', userId, groupId, date] as const;
}

export function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function fetchAttendanceDay(user: User, groupId: string, date: string): Promise<AttendanceDayData> {
  const [groupResult, studentsResult, sessionResult] = await Promise.all([
    supabase
      .from('v2_groups')
      .select('id,teacher_id,program_id,name,term,subject,created_at,university,program,group_name,school_cycle,is_demo')
      .eq('id', groupId)
      .eq('teacher_id', user.id)
      .single(),
    supabase
      .from('v2_group_students')
      .select('id,group_id,teacher_id,enrollment,full_name,active,created_at')
      .eq('group_id', groupId)
      .eq('teacher_id', user.id)
      .eq('active', true)
      .order('full_name'),
    supabase
      .from('v2_attendance_sessions')
      .select('id,group_id,teacher_id,attendance_date,notes,created_at,status,opened_at,paused_at,closed_at,late_after_minutes,auto_mark_absent,updated_at')
      .eq('group_id', groupId)
      .eq('teacher_id', user.id)
      .eq('attendance_date', date)
      .maybeSingle(),
  ]);

  if (groupResult.error) throw new Error(`Grupo: ${errorMessage(groupResult.error)}`);
  if (studentsResult.error) throw new Error(`Alumnos: ${errorMessage(studentsResult.error)}`);
  if (sessionResult.error) throw new Error(`Lista: ${errorMessage(sessionResult.error)}`);

  const session = (sessionResult.data || null) as AttendanceSessionRecord | null;
  let records: AttendanceRecordRow[] = [];
  if (session) {
    const { data, error } = await supabase
      .from('v2_attendance_records')
      .select('id,attendance_session_id,student_id,teacher_id,status,note,observation,updated_at')
      .eq('attendance_session_id', session.id)
      .eq('teacher_id', user.id);
    if (error) throw new Error(`Registros: ${errorMessage(error)}`);
    records = (data || []) as AttendanceRecordRow[];
  }

  return {
    group: groupResult.data as GroupRecord,
    students: (studentsResult.data || []) as StudentRecord[],
    session,
    records,
    date,
  };
}

export async function createAttendanceSession(
  user: User,
  groupId: string,
  date: string,
  options: AttendanceSessionOptions,
): Promise<AttendanceSessionRecord> {
  const payload = {
    group_id: groupId,
    teacher_id: user.id,
    attendance_date: date,
    status: 'open' as const,
    late_after_minutes: Math.max(0, Math.min(120, Number(options.lateAfterMinutes || 0))),
    auto_mark_absent: Boolean(options.autoMarkAbsent),
    notes: options.notes.trim() || null,
    opened_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('v2_attendance_sessions')
    .insert(payload)
    .select('id,group_id,teacher_id,attendance_date,notes,created_at,status,opened_at,paused_at,closed_at,late_after_minutes,auto_mark_absent,updated_at')
    .single();

  if (!error) return data as AttendanceSessionRecord;
  if (error.code !== '23505') throw new Error(errorMessage(error));

  const existing = await supabase
    .from('v2_attendance_sessions')
    .select('id,group_id,teacher_id,attendance_date,notes,created_at,status,opened_at,paused_at,closed_at,late_after_minutes,auto_mark_absent,updated_at')
    .eq('group_id', groupId)
    .eq('teacher_id', user.id)
    .eq('attendance_date', date)
    .single();
  if (existing.error) throw new Error(errorMessage(existing.error));
  return existing.data as AttendanceSessionRecord;
}

export async function saveAttendanceRecords(
  user: User,
  sessionId: string,
  records: AttendanceDraftRecord[],
): Promise<number> {
  if (!records.length) return 0;
  const updatedAt = new Date().toISOString();
  const rows = records.map((record) => ({
    attendance_session_id: sessionId,
    student_id: record.studentId,
    teacher_id: user.id,
    status: record.status,
    note: record.note.trim() || null,
    observation: record.note.trim() || null,
    updated_at: updatedAt,
  }));
  const { data, error } = await supabase
    .from('v2_attendance_records')
    .upsert(rows, { onConflict: 'attendance_session_id,student_id' })
    .select('id');
  if (error) throw new Error(errorMessage(error));
  return data?.length || rows.length;
}

export async function updateAttendanceOptions(
  user: User,
  sessionId: string,
  options: AttendanceSessionOptions,
): Promise<void> {
  const { error } = await supabase
    .from('v2_attendance_sessions')
    .update({
      late_after_minutes: Math.max(0, Math.min(120, Number(options.lateAfterMinutes || 0))),
      auto_mark_absent: Boolean(options.autoMarkAbsent),
      notes: options.notes.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .eq('teacher_id', user.id);
  if (error) throw new Error(errorMessage(error));
}

export async function updateAttendanceState(
  user: User,
  sessionId: string,
  state: AttendanceSessionState,
): Promise<void> {
  const now = new Date().toISOString();
  const patch: Record<string, string | null> = { status: state, updated_at: now };
  if (state === 'open') {
    patch.paused_at = null;
    patch.closed_at = null;
  }
  if (state === 'paused') {
    patch.paused_at = now;
    patch.closed_at = null;
  }
  if (state === 'closed') {
    patch.paused_at = null;
    patch.closed_at = now;
  }
  const { error } = await supabase
    .from('v2_attendance_sessions')
    .update(patch)
    .eq('id', sessionId)
    .eq('teacher_id', user.id);
  if (error) throw new Error(errorMessage(error));
}
