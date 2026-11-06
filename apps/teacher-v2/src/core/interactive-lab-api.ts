/** Native adapter for the unapplied Interactive Lab migration. No route is enabled yet.
 * Never pass this client, its credential or a teacher session into imported HTML.
 */
import { supabase, createIsolatedSupabaseClient } from './supabase';
export type LabEvaluator = 'answer-key-v1' | 'review-required-v1';
export interface LabQuestion { id: string; type: 'choice' | 'numeric' | 'text'; prompt: string; options?: Array<{ id: string; label: string }> }
export interface LabManifest { protocol: 'tedvio.lab/1'; title: string; instructions?: string; questions: LabQuestion[] }
export interface LabVersion { activity_id: string; version_id: string; version: number; revision: number }
export interface LabReceipt {
  protocol: 'tedvio.lab/1'; assignment_id: string; version_id: string; attempt_id: string; attempt_number: number;
  status: 'started' | 'verified' | 'provisional'; started_at: string; deadline_at: string; submitted_at: string | null;
  receipt_id: string | null; server_time: string; score_percent: number | null; official_grade: false;
}
export interface LabAttempt extends LabReceipt { activity_id: string; version: number; manifest: LabManifest }
export interface LabResultRow {
  recipient_id: string; student_id: string; group_id: string; full_name: string; enrollment: string;
  attempts: number; finished_attempts: number;
  selected_result: { attempt_id: string; status: 'verified' | 'provisional'; score_percent: number | null;
    attempt_number: number; started_at: string; submitted_at: string; elapsed_seconds: number; official_grade: false } | null;
}
export interface LabResults {
  assignment_id: string; summary: { assigned: number; started: number; finished: number };
  rows: LabResultRow[]; offset: number; limit: number; has_more: boolean;
}
function failure(error: { code?: string; message: string }): never {
  // A missing migration must not fall back to localStorage or simulated success.
  if (error.code === 'PGRST202' || error.code === '42P01') throw new Error('Interactive Lab todavía no está habilitado en este entorno.');
  throw Object.assign(new Error(error.message), { code: error.code });
}
export async function saveLabVersion(input: { activityId?: string; expectedRevision?: number; manifest: LabManifest;
  answerKey: Record<string, { answer: string | number; weight: number; tolerance?: number }>; evaluator: LabEvaluator; subject: string }): Promise<LabVersion> {
  const { data, error } = await supabase.rpc('v2_lab_save_version', { p_activity_id: input.activityId ?? null,
    p_expected_revision: input.expectedRevision ?? null, p_manifest: input.manifest, p_answer_key: input.answerKey,
    p_evaluator: input.evaluator, p_subject: input.subject });
  if (error) failure(error);
  if (!data?.activity_id || !data?.version_id || !Number.isInteger(data.version)) throw new Error('No se confirmó la versión.');
  return data as LabVersion;
}
export async function setLabActivityState(activityId: string, expectedRevision: number, state: 'draft' | 'published' | 'archived'): Promise<number> {
  const { data, error } = await supabase.rpc('v2_lab_set_activity_state', { p_activity_id: activityId, p_expected_revision: expectedRevision, p_status: state });
  if (error) failure(error);
  if (!Number.isSafeInteger(data)) throw new Error('No se confirmó la revisión.');
  return data as number;
}
export async function assignLabActivity(input: { versionId: string; groupIds: string[]; title: string; opensAt: string; closesAt: string;
  maxAttempts: number; mode: 'practice' | 'evaluation'; selectionRule: 'first' | 'last' | 'best'; durationSeconds?: number }): Promise<{ assignment_id: string; recipients: number }> {
  const { data, error } = await supabase.rpc('v2_lab_assign', { p_version_id: input.versionId, p_group_ids: input.groupIds,
    p_title: input.title, p_opens_at: input.opensAt, p_closes_at: input.closesAt, p_max_attempts: input.maxAttempts,
    p_mode: input.mode, p_selection_rule: input.selectionRule, p_duration_seconds: input.durationSeconds ?? null });
  if (error) failure(error);
  if (!data?.assignment_id || !Number.isInteger(data.recipients)) throw new Error('No se confirmó la asignación.');
  return data;
}
export async function setLabAssignmentState(assignmentId: string, state: 'draft' | 'published' | 'withdrawn', feedbackEnabled: boolean): Promise<void> {
  const { error } = await supabase.rpc('v2_lab_set_assignment_state', { p_assignment_id: assignmentId, p_status: state, p_feedback_enabled: feedbackEnabled });
  if (error) failure(error);
}
export async function issueLabAccess(recipientId: string, identityVerified: boolean): Promise<{ recipient_id: string; token: string; expires_at: string }> {
  const { data, error } = await supabase.rpc('v2_lab_issue_access', { p_recipient_id: recipientId, p_identity_verified: identityVerified });
  if (error) failure(error);
  if (data?.recipient_id !== recipientId || !/^[a-f0-9]{64}$/.test(data?.token ?? '')) throw new Error('No se confirmó el acceso personal.');
  return data;
}
export async function revokeLabAccess(recipientId: string): Promise<void> {
  const { error } = await supabase.rpc('v2_lab_revoke_access', { p_recipient_id: recipientId });
  if (error) failure(error);
}
export async function fetchLabResults(assignmentId: string, offset = 0, limit = 100): Promise<LabResults> {
  const { data, error } = await supabase.rpc('v2_lab_results', { p_assignment_id: assignmentId, p_offset: offset, p_limit: limit });
  if (error) failure(error);
  if (data?.assignment_id !== assignmentId || !Array.isArray(data.rows) || typeof data.has_more !== 'boolean') throw new Error('No se confirmó el listado de resultados.');
  return data as LabResults;
}
/** Keep the credential in the TRUSTED learner host only, not URL query, logs or iframe.
 * This is a capability after individual delivery, not proof derived from enrollment.
 */
export function createLabLearnerAccess(credential: string) {
  if (!/^[a-f0-9]{64}$/.test(credential)) throw new Error('Acceso personal inválido.');
  const client = createIsolatedSupabaseClient('interactive-lab-learner');
  let token = credential;
  async function call(name: string, args: Record<string, unknown>): Promise<LabReceipt | LabAttempt> {
    if (!token) throw new Error('El acceso está cerrado.');
    const { data, error } = await client.rpc(name, { ...args, p_token: token });
    if (error) failure(error);
    if (!data?.attempt_id || data.protocol !== 'tedvio.lab/1' || data.official_grade !== false) throw new Error('El servidor no confirmó el intento.');
    return data;
  }
  return Object.freeze({
    begin: (requestId: string) => call('v2_lab_begin', { p_request_id: requestId }) as Promise<LabAttempt>,
    submit: (attemptId: string, requestId: string, answers: Record<string, unknown>) => call('v2_lab_submit', {
      p_attempt_id: attemptId, p_request_id: requestId, p_answers: answers,
    }) as Promise<LabReceipt>,
    receipt: (attemptId: string) => call('v2_lab_receipt', { p_attempt_id: attemptId }) as Promise<LabReceipt>,
    close: () => { token = ''; },
  });
}
