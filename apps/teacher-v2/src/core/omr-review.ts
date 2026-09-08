import type { OmrExamDetail, OmrResult, OmrCaptureMethod } from './omr';
import type { OmrAnswer, OmrMarkQuality } from './omr-engine';
export interface OmrReviewDraft {
  captureMethod: OmrCaptureMethod; studentId: string; enrollment: string; studentName: string; version: string;
  answers: OmrAnswer[]; originalAnswers: OmrAnswer[]; quality: OmrMarkQuality[];
  warningIndexes: number[]; reviewedWarnings: number[]; previewDataUrl: string; qrValue: string;
  sourceFingerprint: string; analysisSize: { width: number; height: number } | null; reviewNote: string; processing: boolean;
  baseExam: string; baseResults: Record<string, string>;
}
export function omrExamSignature(detail: OmrExamDetail) {
  return JSON.stringify([detail.exam.id, detail.exam.question_count, detail.exam.option_count, detail.exam.versions, detail.exam.answer_keys, detail.exam.status, detail.period?.status]);
}
export function omrResultSignature(result: OmrResult) {
  return JSON.stringify([result.id, result.updated_at, result.student_id, result.enrollment, result.version, result.answers, result.review_status, result.reviewed, result.archived_at]);
}
export function createOmrReview(detail: OmrExamDetail, result?: OmrResult | null): OmrReviewDraft {
  const raw = Array.isArray(result?.answers) ? result.answers : result?.answers && typeof result.answers === 'object' ? Object.entries(result.answers).sort(([a], [b]) => Number(a) - Number(b)).map(([, value]) => value) : [];
  const answers: OmrAnswer[] = Array.from({ length: detail.exam.question_count }, (_, index) => { const letter = String(raw[index] || '').toUpperCase(); return /^[A-E]$/.test(letter) ? letter as OmrAnswer : null; });
  const marks = Array.isArray(result?.scan_quality?.marks) ? result.scan_quality.marks as Array<Record<string, unknown>> : [];
  const fallbackWarnings = !result || Boolean(!result.reviewed && result.review_status !== 'confirmed' && result.scan_warnings > 0);
  const quality: OmrMarkQuality[] = Array.from({ length: detail.exam.question_count }, (_, index) => ({ status: marks[index]?.status === 'ok' ? 'ok' : marks[index]?.status === 'blank' ? 'blank' : 'ambiguous', scores: Array.isArray(marks[index]?.scores) ? marks[index].scores as number[] : [], best: Number(marks[index]?.best || 0), gap: Number(marks[index]?.gap || 0) }));
  return {
    captureMethod: result ? 'manual' : 'camera', studentId: result?.student_id || '', enrollment: result?.enrollment || '', studentName: result?.student_name || '', version: result?.version || detail.exam.versions[0] || 'A', answers, originalAnswers: [...answers], quality,
    warningIndexes: marks.length ? quality.flatMap((mark, index) => mark.status !== 'ok' ? [index] : []) : fallbackWarnings ? answers.map((_, index) => index) : [],
    reviewedWarnings: marks.flatMap((mark, index) => mark.reviewed ? [index] : []), previewDataUrl: '', qrValue: '', sourceFingerprint: result?.source_fingerprint || '', analysisSize: null, reviewNote: result?.review_note || '', processing: false,
    baseExam: omrExamSignature(detail), baseResults: Object.fromEntries(detail.results.map(row => [row.id, omrResultSignature(row)])),
  };
}
