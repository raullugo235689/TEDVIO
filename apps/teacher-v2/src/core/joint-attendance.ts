import { supabase } from './supabase';
export interface JointAttendanceDraft {
  requestId: string; title: string; date: string; groupIds: string[];
  duration: number; lateAfter: number; autoAbsent: boolean;
}
export interface AttendanceEvent {
  verification_mode?: 'static' | 'rotating';
  id: string; title: string; attendance_date: string; status: 'open' | 'closed'; token: string;
  created_at: string; expires_at: string; closed_at: string | null; late_after_minutes: number; auto_mark_absent: boolean;
}
export interface EventGroup {
  group_id: string; name: string; subject: string | null; university: string | null;
  session_id: string; session_status: string; total: number; registered: number;
  present: number; late: number; absent: number; justified: number;
}
export interface EventSummary {
  event: AttendanceEvent; groups: EventGroup[]; server_now: string;
  recent: { full_name: string; group_name: string; registered_at: string }[];
}
export interface PublicEventMeta {
  verification_mode?: 'static' | 'rotating';
  ok: boolean; message?: string; title: string; attendance_date: string; expires_at: string; server_now: string;
  groups: { id: string; name: string; subject: string | null; university: string | null }[];
}
export interface CheckinResult {
  error_code?: string;
  ok: boolean; message: string; student_name?: string; group_name?: string;
  attendance_date?: string; status?: string; registered_at?: string;
}
export const jointEventKey = (userId?: string, eventId?: string) => ['joint-attendance', userId, eventId] as const;
export function jointAttendanceUrl(token: string, proof?: string): string {
  return `${window.location.origin}/teacher#/attendance-join?t=${encodeURIComponent(token)}${proof ? `&q=${encodeURIComponent(proof)}` : ''}`;
}
export async function createJointAttendance(draft: JointAttendanceDraft): Promise<string> {
  const { data, error } = await supabase.rpc('v2_create_attendance_event', { p_request_id: draft.requestId, p_payload: {
    title: draft.title.trim(), attendance_date: draft.date, group_ids: [...draft.groupIds].sort(),
    duration_minutes: draft.duration, late_after_minutes: draft.lateAfter, auto_mark_absent: draft.autoAbsent,
    verification_mode: 'rotating',
  } });
  if (error) throw new Error(error.message);
  if (typeof data !== 'string') throw new Error('No se confirmó el registro. Reintenta sin cambiar los datos.');
  return data;
}
export async function fetchJointAttendance(eventId: string): Promise<EventSummary> {
  const { data, error } = await supabase.rpc('v2_attendance_event_summary', { p_event_id: eventId });
  if (error) throw new Error(error.message);
  if (!data?.event) throw new Error('Esta asistencia no está disponible para tu cuenta.');
  return data as EventSummary;
}
export async function closeJointAttendance(eventId: string): Promise<void> {
  const { error } = await supabase.rpc('v2_close_attendance_event', { p_event_id: eventId });
  if (error) throw new Error(error.message);
}
export async function recentJointAttendance(userId: string): Promise<AttendanceEvent[]> {
  const { data, error } = await supabase.from('v2_attendance_events').select('id,title,attendance_date,status,created_at,expires_at,closed_at,late_after_minutes,auto_mark_absent').eq('teacher_id', userId).order('created_at', { ascending: false }).limit(30);
  if (error) throw new Error(error.message);
  return (data || []) as AttendanceEvent[];
}
export async function getPublicAttendance(token: string): Promise<PublicEventMeta> {
  const { data, error } = await supabase.rpc('v2_attendance_event_meta', { p_token: token });
  if (error) throw new Error(error.message);
  return data as PublicEventMeta;
}
export async function registerJointAttendance(token: string, groupId: string, enrollment: string, proof = ''): Promise<CheckinResult> {
  const { data, error } = await supabase.rpc('v2_attendance_event_checkin_secure', { p_token: token, p_group_id: groupId, p_enrollment: enrollment.trim(), p_proof: proof });
  if (error) throw new Error(error.message);
  return data as CheckinResult;
}
export interface AttendanceChallenge {
  available: boolean; qr_proof?: string; code?: string; expires_at?: string; server_now: string;
}
export async function fetchAttendanceChallenge(eventId: string): Promise<AttendanceChallenge> {
  const { data, error } = await supabase.rpc('v2_attendance_event_challenge', { p_event_id: eventId });
  if (error) throw new Error(error.message);
  if (!data || typeof data.available !== 'boolean') throw new Error('No se pudo renovar el código.');
  return data as AttendanceChallenge;
}
export async function enableAttendanceRotation(eventId: string): Promise<void> {
  const { error } = await supabase.rpc('v2_enable_attendance_rotation', { p_event_id: eventId });
  if (error) throw new Error(error.message);
}
export function subscribeJointAttendance(eventId: string, onChange: () => void, onStatus: (connected: boolean) => void): () => void {
  let timer: number | undefined;
  const changed = () => { if (timer !== undefined) return; timer = window.setTimeout(() => { timer = undefined; onChange(); }, 200); };
  const channel = supabase.channel(`joint-attendance-${eventId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'v2_attendance_event_checkins', filter: `event_id=eq.${eventId}` }, changed)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'v2_attendance_events', filter: `id=eq.${eventId}` }, changed)
    .subscribe(status => { onStatus(status === 'SUBSCRIBED'); if (status === 'SUBSCRIBED') changed(); });
  return () => { window.clearTimeout(timer); void supabase.removeChannel(channel); };
}
