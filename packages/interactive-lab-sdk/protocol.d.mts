export interface LabContext { activityId: string; versionId: string; assignmentId: string; attemptId: string; version: number }
export const PROTOCOL: 'tedvio.lab/1';
export function contextFromAttempt(attempt: { activity_id: string; version_id: string; assignment_id: string; attempt_id: string; version: number }): LabContext;
export function validateAnswers(answers: unknown): Record<string, unknown>;
export function validateReceipt(receipt: unknown, context: LabContext, requestId: string): { attempt_id: string; assignment_id: string; version_id: string; receipt_id: string; submitted_at: string; status: 'verified' | 'provisional'; score_percent: number | null; official_grade: false };
