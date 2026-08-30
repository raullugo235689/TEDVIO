import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type {
  AcademicPeriodRecord,
  ExamResultSummary,
  PaperExam,
  PaperExamQuestion,
  PaperExamResult,
} from './exams';
import type { GroupRecord, StudentRecord } from './types';
import { OMR_LETTERS, type OmrAnswer } from './omr-engine';

export type OmrCaptureMethod = 'camera' | 'upload' | 'manual' | 'legacy';
export type OmrReviewStatus = 'needs_review' | 'confirmed' | 'archived';

export interface OmrResult extends PaperExamResult {
  capture_method: OmrCaptureMethod;
  review_status: OmrReviewStatus;
  scan_warnings: number;
  manual_corrections: number;
  scan_quality: Record<string, unknown>;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  review_note?: string | null;
  source_fingerprint?: string | null;
  archived_at?: string | null;
}

export interface OmrRevision {
  id: string;
  result_id: string;
  exam_id: string;
  teacher_id: string;
  revision_no: number;
  snapshot: Record<string, unknown>;
  reason?: string | null;
  created_at: string;
}

export interface OmrWorkspace {
  exams: PaperExam[];
  groups: GroupRecord[];
  summaries: Record<string, ExamResultSummary>;
  pendingByExam: Record<string, number>;
}

export interface OmrExamDetail {
  exam: PaperExam;
  questions: PaperExamQuestion[];
  results: OmrResult[];
  group: GroupRecord | null;
  period: AcademicPeriodRecord | null;
  roster: StudentRecord[];
  revisions: OmrRevision[];
}

export interface OmrSaveInput {
  resultId?: string | null;
  examId: string;
  studentId?: string | null;
  enrollment?: string | null;
  studentName?: string | null;
  version: string;
  answers: OmrAnswer[];
  captureMethod: OmrCaptureMethod;
  quality: Record<string, unknown>;
  scanWarnings: number;
  manualCorrections: number;
  confirmed: boolean;
  reviewNote?: string | null;
  sourceFingerprint?: string | null;
}

export interface OmrGrade {
  answers: OmrAnswer[];
  correct: number;
  blanks: number;
  score: number;
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message || 'Error desconocido');
  }
  return String(error || 'Error desconocido');
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function normalizedLetter(value: unknown): OmrAnswer {
  const letter = String(value ?? '').trim().toUpperCase();
  return OMR_LETTERS.includes(letter as (typeof OMR_LETTERS)[number])
    ? letter as (typeof OMR_LETTERS)[number]
    : null;
}

function answerKey(exam: PaperExam, version: string): OmrAnswer[] {
  const raw = exam.answer_keys?.[version];
  const values = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object'
      ? Object.keys(raw as Record<string, unknown>)
          .sort((left, right) => Number(left) - Number(right))
          .map((key) => (raw as Record<string, unknown>)[key])
      : [];
  const key = values.map(normalizedLetter);
  if (key.length !== exam.question_count || key.some((answer) => !answer)) {
    throw new Error(`La clave de la versión ${version} está incompleta.`);
  }
  return key;
}

export function normalizeAnswers(value: unknown, questionCount: number): OmrAnswer[] {
  const source = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? Object.keys(value as Record<string, unknown>)
          .sort((left, right) => Number(left) - Number(right))
          .map((key) => (value as Record<string, unknown>)[key])
      : [];
  return Array.from({ length: questionCount }, (_, index) => normalizedLetter(source[index]));
}

export function gradeAnswers(exam: PaperExam, version: string, answers: OmrAnswer[]): OmrGrade {
  if (!exam.versions.includes(version)) throw new Error('La versión no pertenece a la evaluación.');
  const key = answerKey(exam, version);
  const normalized = normalizeAnswers(answers, exam.question_count);
  let correct = 0;
  let blanks = 0;
  normalized.forEach((answer, index) => {
    if (!answer) blanks += 1;
    else if (answer === key[index]) correct += 1;
  });
  return {
    answers: normalized,
    correct,
    blanks,
    score: exam.question_count ? Number(((correct / exam.question_count) * 10).toFixed(2)) : 0,
  };
}

export function omrWorkspaceKey(userId?: string) {
  return ['teacher-omr-workspace', userId || 'anonymous'] as const;
}

export function omrExamKey(userId?: string, examId?: string) {
  return ['teacher-omr-exam', userId || 'anonymous', examId || 'none'] as const;
}

export async function fetchOmrWorkspace(user: User): Promise<OmrWorkspace> {
  const [examsResult, groupsResult, resultsResult] = await Promise.all([
    supabase
      .from('v2_paper_exams')
      .select('*')
      .eq('teacher_id', user.id)
      .in('status', ['ready', 'closed'])
      .order('exam_date', { ascending: false })
      .order('updated_at', { ascending: false }),
    supabase
      .from('v2_groups')
      .select('*')
      .eq('teacher_id', user.id)
      .eq('is_demo', false)
      .order('created_at', { ascending: false }),
    supabase
      .from('v2_paper_exam_results')
      .select('exam_id,score,reviewed,review_status,archived_at')
      .eq('teacher_id', user.id)
      .is('archived_at', null)
      .range(0, 9999),
  ]);

  if (examsResult.error) throw new Error(`No se pudieron cargar las evaluaciones OMR: ${errorMessage(examsResult.error)}`);
  if (groupsResult.error) throw new Error(`No se pudieron cargar los grupos: ${errorMessage(groupsResult.error)}`);
  if (resultsResult.error) throw new Error(`No se pudieron resumir las capturas: ${errorMessage(resultsResult.error)}`);

  const exams = (examsResult.data || []) as PaperExam[];
  const grouped = new Map<string, { scores: number[]; confirmed: number; pending: number }>();
  for (const row of (resultsResult.data || []) as Array<{
    exam_id: string;
    score: number;
    reviewed: boolean;
    review_status?: OmrReviewStatus | null;
  }>) {
    const current = grouped.get(row.exam_id) || { scores: [], confirmed: 0, pending: 0 };
    const score = Number(row.score);
    if (Number.isFinite(score)) current.scores.push(score);
    if (row.reviewed || row.review_status === 'confirmed') current.confirmed += 1;
    else current.pending += 1;
    grouped.set(row.exam_id, current);
  }

  const summaries: Record<string, ExamResultSummary> = {};
  const pendingByExam: Record<string, number> = {};
  for (const exam of exams) {
    const values = grouped.get(exam.id) || { scores: [], confirmed: 0, pending: 0 };
    const passing = numberValue(exam.passing_score, 6);
    summaries[exam.id] = {
      examId: exam.id,
      results: values.scores.length,
      reviewed: values.confirmed,
      average: mean(values.scores),
      passRate: values.scores.length
        ? values.scores.filter((score) => score >= passing).length / values.scores.length
        : null,
    };
    pendingByExam[exam.id] = values.pending;
  }

  return {
    exams,
    groups: (groupsResult.data || []) as GroupRecord[],
    summaries,
    pendingByExam,
  };
}

export async function fetchOmrExam(user: User, examId: string): Promise<OmrExamDetail> {
  const examResult = await supabase
    .from('v2_paper_exams')
    .select('*')
    .eq('id', examId)
    .eq('teacher_id', user.id)
    .single();
  if (examResult.error) throw new Error(`No se pudo abrir la evaluación: ${errorMessage(examResult.error)}`);
  const exam = examResult.data as PaperExam;
  if (!['ready', 'closed'].includes(exam.status)) {
    throw new Error('La evaluación debe estar marcada como Lista antes de utilizar OMR.');
  }

  const [questionsResult, resultsResult, groupResult, periodResult, rosterResult, revisionsResult] = await Promise.all([
    supabase
      .from('v2_paper_exam_questions')
      .select('*')
      .eq('exam_id', exam.id)
      .eq('teacher_id', user.id)
      .order('version')
      .order('position'),
    supabase
      .from('v2_paper_exam_results')
      .select('*')
      .eq('exam_id', exam.id)
      .eq('teacher_id', user.id)
      .order('updated_at', { ascending: false })
      .range(0, 9999),
    exam.group_id
      ? supabase.from('v2_groups').select('*').eq('id', exam.group_id).eq('teacher_id', user.id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    exam.period_id
      ? supabase
          .from('v2_academic_periods')
          .select('id,teacher_id,group_id,name,starts_on,ends_on,course_weight,order_index,status')
          .eq('id', exam.period_id)
          .eq('teacher_id', user.id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    exam.group_id
      ? supabase
          .from('v2_group_students')
          .select('*')
          .eq('group_id', exam.group_id)
          .eq('teacher_id', user.id)
          .eq('active', true)
          .order('full_name')
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from('v2_paper_exam_result_revisions')
      .select('*')
      .eq('exam_id', exam.id)
      .eq('teacher_id', user.id)
      .order('created_at', { ascending: false })
      .range(0, 9999),
  ]);

  if (questionsResult.error) throw new Error(`No se pudo cargar la composición: ${errorMessage(questionsResult.error)}`);
  if (resultsResult.error) throw new Error(`No se pudieron cargar los resultados: ${errorMessage(resultsResult.error)}`);
  if (groupResult.error) throw new Error(`No se pudo cargar el grupo: ${errorMessage(groupResult.error)}`);
  if (periodResult.error) throw new Error(`No se pudo cargar el periodo: ${errorMessage(periodResult.error)}`);
  if (rosterResult.error) throw new Error(`No se pudo cargar el padrón: ${errorMessage(rosterResult.error)}`);
  if (revisionsResult.error) throw new Error(`No se pudo cargar el historial de correcciones: ${errorMessage(revisionsResult.error)}`);

  return {
    exam,
    questions: (questionsResult.data || []) as PaperExamQuestion[],
    results: (resultsResult.data || []) as OmrResult[],
    group: (groupResult.data || null) as GroupRecord | null,
    period: (periodResult.data || null) as AcademicPeriodRecord | null,
    roster: (rosterResult.data || []) as StudentRecord[],
    revisions: (revisionsResult.data || []) as OmrRevision[],
  };
}

export function findExistingResult(
  detail: OmrExamDetail,
  studentId: string,
  enrollment: string,
  version: string,
): OmrResult | null {
  const normalizedEnrollment = enrollment.trim().toLocaleLowerCase('es-MX');
  return detail.results.find((result) => {
    if (result.archived_at) return false;
    if (result.version !== version) return false;
    if (studentId) return result.student_id === studentId;
    return !result.student_id && Boolean(normalizedEnrollment) &&
      String(result.enrollment || '').trim().toLocaleLowerCase('es-MX') === normalizedEnrollment;
  }) || null;
}

export async function saveOmrResult(user: User, input: OmrSaveInput): Promise<OmrResult> {
  if (!user.id) throw new Error('Tu sesión expiró.');
  const normalizedAnswers = input.answers.map((answer) => answer || null);
  const { data, error } = await supabase.rpc('v2_save_omr_result', {
    p_result_id: input.resultId || null,
    p_exam_id: input.examId,
    p_student_id: input.studentId || null,
    p_enrollment: input.enrollment?.trim() || null,
    p_student_name: input.studentName?.trim() || null,
    p_version: input.version,
    p_answers: normalizedAnswers,
    p_capture_method: input.captureMethod,
    p_scan_quality: input.quality || {},
    p_scan_warnings: Math.max(0, Math.round(input.scanWarnings || 0)),
    p_manual_corrections: Math.max(0, Math.round(input.manualCorrections || 0)),
    p_review_confirmed: Boolean(input.confirmed),
    p_review_note: input.reviewNote?.trim() || null,
    p_source_fingerprint: input.sourceFingerprint?.trim() || null,
  });
  if (error) throw new Error(`No se pudo guardar el resultado OMR: ${errorMessage(error)}`);
  if (!data) throw new Error('TEDVIO no devolvió el resultado guardado.');
  return data as OmrResult;
}

export async function setOmrResultArchived(
  user: User,
  resultId: string,
  archived: boolean,
  reason: string,
): Promise<OmrResult> {
  if (!user.id) throw new Error('Tu sesión expiró.');
  const { data, error } = await supabase.rpc('v2_set_omr_result_archived', {
    p_result_id: resultId,
    p_archived: archived,
    p_reason: reason.trim() || null,
  });
  if (error) throw new Error(`No se pudo ${archived ? 'archivar' : 'restaurar'} el resultado: ${errorMessage(error)}`);
  if (!data) throw new Error('TEDVIO no devolvió el resultado actualizado.');
  return data as OmrResult;
}

export function exportOmrResultsCsv(exam: PaperExam, results: OmrResult[]) {
  const active = results.filter((result) => !result.archived_at);
  const rows = [
    ['Matrícula', 'Alumno', 'Versión', 'Aciertos', 'Reactivos', 'Blancos', 'Calificación', 'Estado', 'Método', 'Advertencias', 'Correcciones', 'Actualizada'],
    ...active.map((result) => [
      result.enrollment || '',
      result.student_name || '',
      result.version,
      String(result.correct_count),
      String(exam.question_count),
      String(result.blank_count),
      Number(result.score).toFixed(2),
      result.review_status === 'confirmed' ? 'Confirmada' : 'Pendiente',
      result.capture_method,
      String(result.scan_warnings || 0),
      String(result.manual_corrections || 0),
      result.updated_at || result.created_at,
    ]),
  ];
  const csv = `\uFEFF${rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n')}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `TEDVIO_${exam.title.replace(/[^a-z0-9áéíóúüñ]+/gi, '_').replace(/^_+|_+$/g, '') || 'OMR'}_resultados.csv`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}