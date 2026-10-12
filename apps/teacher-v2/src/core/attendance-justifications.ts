import { supabase } from './supabase';
import type { AttendanceSessionOptions, AttendanceDraftRecord } from './attendance';

export interface AttendanceCommitInput {
  requestId: string;
  sessionId: string;
  expectedRevision: number;
  action: 'save' | 'open' | 'paused' | 'closed';
  records: AttendanceDraftRecord[];
  options: AttendanceSessionOptions;
}
export async function commitAttendance(input: AttendanceCommitInput): Promise<void> {
  const { data, error } = await supabase.rpc('v2_commit_attendance', {
    p_request_id: input.requestId, p_session_id: input.sessionId,
    p_expected_revision: input.expectedRevision, p_action: input.action,
    p_records: input.records, p_options: input.options,
  });
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  if (!data || data.request_id !== input.requestId || data.session_id !== input.sessionId) {
    throw new Error('No se recibió la confirmación del guardado. Reintenta sin cambiar la captura.');
  }
}

export interface JustificationRow {
  id: string; revision: number; student_id: string; session_id: string;
  full_name: string; enrollment: string; group_id: string; group_name: string;
  subject: string; attendance_date: string; session_status: string;
  status: 'absent' | 'justified'; note: string; period_closed: boolean; qr_active: boolean;
}
export interface JustificationFilters {
  groupIds: string[]; from: string; to: string; search: string; status: 'absent' | 'justified';
}
export async function previewJustifications(filters: JustificationFilters): Promise<{ rows: JustificationRow[]; truncated: boolean }> {
  const { data, error } = await supabase.rpc('v2_preview_attendance_justifications', {
    p_group_ids: filters.groupIds, p_from: filters.from, p_to: filters.to,
    p_search: filters.search.trim(), p_status: filters.status,
  });
  if (error) throw new Error(error.message);
  if (!data || !Array.isArray(data.rows)) throw new Error('No se pudo comprobar el listado de faltas.');
  return data;
}
export async function changeJustifications(input: {
  requestId: string; action: 'justify' | 'revoke'; rows: Pick<JustificationRow, 'id' | 'revision'>[];
  reason: string; allowClosed: boolean;
}): Promise<{ changed: number; request_id: string }> {
  const { data, error } = await supabase.rpc('v2_change_attendance_justifications', {
    p_request_id: input.requestId, p_action: input.action, p_records: input.rows,
    p_reason: input.reason.trim(), p_allow_closed: input.allowClosed,
  });
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  if (!data || data.request_id !== input.requestId || data.changed !== input.rows.length) throw new Error('No se recibió la confirmación completa. Reintenta la misma operación.');
  return data;
}
