import type { OmrExamDetail, OmrResult } from './omr';
import type { OmrPhotoIssue, OmrPhotoQuality } from './omr-engine';

export interface OmrBatchProgress {
  total: number;
  captured: number;
  confirmed: number;
  pending: number;
  remaining: number;
  percent: number;
  duplicates: number;
  nextStudentId: string | null;
}

export interface OmrOperationalMetrics {
  measuredScans: number;
  photoAcceptance: number | null;
  verifiedIdentity: number | null;
  qrRecognition: number | null;
  correctionRate: number | null;
  medianDurationMs: number | null;
}

export interface OmrValidationAttempt {
  id: string;
  accepted: boolean;
  qrRead: boolean;
  correct: number;
  questions: number;
  durationMs: number;
  issues: OmrPhotoIssue[];
  quality: OmrPhotoQuality | null;
  message: string;
}

export interface OmrValidationSummary {
  sheets: number;
  acceptedSheets: number;
  photoAcceptance: number | null;
  bubbleAccuracy: number | null;
  qrRecognition: number | null;
  medianDurationMs: number | null;
}

function activeResults(detail: OmrExamDetail): OmrResult[] {
  return detail.results.filter((result) => !result.archived_at && result.review_status !== 'archived');
}

function normalizedEnrollment(value?: string | null): string {
  return String(value || '').trim().toLocaleLowerCase('es-MX');
}

function resultIdentity(result: OmrResult): string {
  if (result.student_id) return `id:${result.student_id}`;
  const enrollment = normalizedEnrollment(result.enrollment);
  return enrollment ? `enrollment:${enrollment}` : `result:${result.id}`;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function finiteNumber(value: unknown): number | null {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[middle] ?? null;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

export function omrBatchProgress(detail: OmrExamDetail): OmrBatchProgress {
  const active = activeResults(detail);
  const states = new Map<string, { confirmed: boolean; pending: boolean; count: number }>();
  active.forEach((result) => {
    const key = resultIdentity(result);
    const current = states.get(key) || { confirmed: false, pending: false, count: 0 };
    current.count += 1;
    if (result.reviewed || result.review_status === 'confirmed') current.confirmed = true;
    else current.pending = true;
    states.set(key, current);
  });

  const capturedRoster = new Set<string>();
  detail.roster.forEach((student) => {
    const byId = states.has(`id:${student.id}`);
    const enrollment = normalizedEnrollment(student.enrollment);
    if (byId || (enrollment && states.has(`enrollment:${enrollment}`))) capturedRoster.add(student.id);
  });
  const total = detail.roster.length;
  const captured = total ? capturedRoster.size : states.size;
  const confirmed = [...states.values()].filter((state) => state.confirmed).length;
  const pending = [...states.values()].filter((state) => state.pending && !state.confirmed).length;
  return {
    total,
    captured,
    confirmed,
    pending,
    remaining: total ? Math.max(0, total - captured) : 0,
    percent: total ? captured / total : 0,
    duplicates: [...states.values()].reduce((sum, state) => sum + Math.max(0, state.count - 1), 0),
    nextStudentId: detail.roster.find((student) => !capturedRoster.has(student.id))?.id || null,
  };
}

export function omrOperationalMetrics(results: OmrResult[], questionCount: number): OmrOperationalMetrics {
  const scans = results.filter((result) => !result.archived_at && ['camera', 'upload'].includes(result.capture_method));
  const measured = scans.flatMap((result) => {
    const quality = record(result.scan_quality);
    const photo = record(quality?.photo);
    if (!photo || typeof photo.accepted !== 'boolean') return [];
    const identity = record(quality?.identity);
    const duration = finiteNumber(quality?.duration_ms ?? quality?.durationMs);
    return [{
      accepted: photo.accepted,
      identity: identity?.confirmed === true,
      qr: typeof quality?.qr === 'string' && Boolean(quality.qr),
      duration,
      corrections: finiteNumber(result.manual_corrections) ?? 0,
    }];
  });
  const durations = measured.flatMap((item) => item.duration == null ? [] : [item.duration]);
  const denominator = measured.length * Math.max(1, questionCount);
  return {
    measuredScans: measured.length,
    photoAcceptance: measured.length ? measured.filter((item) => item.accepted).length / measured.length : null,
    verifiedIdentity: measured.length ? measured.filter((item) => item.identity).length / measured.length : null,
    qrRecognition: measured.length ? measured.filter((item) => item.qr).length / measured.length : null,
    correctionRate: measured.length ? measured.reduce((sum, item) => sum + item.corrections, 0) / denominator : null,
    medianDurationMs: median(durations),
  };
}

export function summarizeOmrValidation(attempts: OmrValidationAttempt[]): OmrValidationSummary {
  const accepted = attempts.filter((attempt) => attempt.accepted);
  const comparedQuestions = accepted.reduce((sum, attempt) => sum + Math.max(0, attempt.questions), 0);
  return {
    sheets: attempts.length,
    acceptedSheets: accepted.length,
    photoAcceptance: attempts.length ? accepted.length / attempts.length : null,
    bubbleAccuracy: comparedQuestions ? accepted.reduce((sum, attempt) => sum + Math.max(0, attempt.correct), 0) / comparedQuestions : null,
    qrRecognition: attempts.length ? attempts.filter((attempt) => attempt.qrRead).length / attempts.length : null,
    medianDurationMs: median(attempts.map((attempt) => attempt.durationMs).filter(Number.isFinite)),
  };
}
