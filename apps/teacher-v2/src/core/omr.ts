import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { PaperExam, PaperExamResult } from './exams';
import { normalizeAnswer, summarizeOmrQuality, type OmrAnalysis, type OmrMarkQuality } from './omr-engine';

export type OmrCaptureSource = 'camera' | 'upload' | 'manual';
export type OmrCaptureStatus = 'pending_review' | 'confirmed';

export interface OmrResultRecord extends PaperExamResult {
  capture_source?: OmrCaptureSource | 'legacy' | null;
  capture_status?: OmrCaptureStatus | null;
  scan_quality?: Record<string, unknown> | null;
  scan_metadata?: Record<string, unknown> | null;
  confirmed_at?: string | null;
  revision_log?: unknown[] | null;
}

export interface ConfirmOmrInput {
  examId: string;
  studentId: string;
  version: string;
  answers: Array<string | null>;
  quality: OmrMarkQuality[];
  analysis?: Pick<OmrAnalysis, 'width' | 'height' | 'rotation' | 'cornerConfidence'> | null;
  captureSource: OmrCaptureSource;
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message || 'Error desconocido');
  }
  return String(error || 'Error desconocido');
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item ?? ''));
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort((a, b) => Number(a) - Number(b))
      .map((key) => String((value as Record<string, unknown>)[key] ?? ''));
  }
  return [];
}

export function answerKeyFor(exam: PaperExam, version: string): string[] {
  const normalizedVersion = String(version || 'A').trim().toUpperCase();
  const keys = exam.answer_keys;
  if (Array.isArray(keys)) return keys.map((answer) => normalizeAnswer(answer) || '');
  if (!keys || typeof keys !== 'object') return [];
  const root = keys as Record<string, unknown>;
  const value = root[normalizedVersion] ?? root[normalizedVersion.toLowerCase()] ?? root.A ?? root.a ?? root.default;
  return stringArray(value).map((answer) => normalizeAnswer(answer) || '');
}

export function omrResultKey(userId?: string, examId?: string) {
  return ['teacher-omr', userId || 'anonymous', examId || 'none'] as const;
}

export async function confirmOmrResult(user: User, input: ConfirmOmrInput): Promise<OmrResultRecord> {
  if (!user.id) throw new Error('Tu sesión expiró.');
  if (!input.studentId) throw new Error('Selecciona al alumno antes de confirmar.');
  const qualitySummary = summarizeOmrQuality(input.quality);
  if (qualitySummary.ambiguous > 0) {
    throw new Error('Todavía existen marcas ambiguas. Revísalas antes de confirmar el resultado.');
  }

  const scanQuality = {
    schema: 1,
    summary: qualitySummary,
    items: input.quality.map((item, index) => ({
      question: index + 1,
      status: item.status,
      best: Number(item.best || 0),
      gap: Number(item.gap || 0),
      scores: Array.isArray(item.scores) ? item.scores.map((score) => Number(score || 0)) : [],
    })),
  };
  const scanMetadata = {
    schema: 1,
    image_width: input.analysis?.width || null,
    image_height: input.analysis?.height || null,
    rotation: input.analysis?.rotation ?? null,
    corner_confidence: input.analysis?.cornerConfidence ?? null,
    browser_confirmed: true,
    captured_at: new Date().toISOString(),
  };

  const { data, error } = await supabase.rpc('v2_confirm_paper_omr_result', {
    p_exam_id: input.examId,
    p_student_id: input.studentId,
    p_version: String(input.version || 'A').toUpperCase(),
    p_answers: input.answers.map((answer) => normalizeAnswer(answer)),
    p_scan_quality: scanQuality,
    p_scan_metadata: scanMetadata,
    p_capture_source: input.captureSource,
  });
  if (error) throw new Error(`No se pudo confirmar la hoja: ${errorMessage(error)}`);
  if (!data) throw new Error('TEDVIO no devolvió el resultado confirmado.');
  return data as OmrResultRecord;
}

export function printRoute(examId: string, options: { mode: 'generic' | 'roster'; version: string; alternate: boolean }): string {
  const params = new URLSearchParams({
    mode: options.mode,
    version: options.version,
    alternate: options.alternate ? '1' : '0',
  });
  const path = window.location.pathname;
  const basePath = path.endsWith('/') ? path : path.slice(0, path.lastIndexOf('/') + 1);
  return `${window.location.origin}${basePath}#/omr/${encodeURIComponent(examId)}/print?${params.toString()}`;
}

export function captureSourceLabel(value?: string | null): string {
  if (value === 'camera') return 'Cámara';
  if (value === 'upload') return 'Archivo';
  if (value === 'manual') return 'Manual';
  return 'Heredada';
}

export function resultConfirmedLabel(value?: OmrResultRecord): string {
  const timestamp = value?.confirmed_at || value?.updated_at || value?.created_at;
  if (!timestamp) return 'Sin fecha';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  return date.toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function downloadOmrCsv(exam: PaperExam, results: OmrResultRecord[]) {
  const rows = [
    ['Matrícula', 'Alumno', 'Versión', 'Aciertos', 'Reactivos', 'Blancos', 'Calificación', 'Origen', 'Confirmado'],
    ...results.map((result) => [
      result.enrollment || '',
      result.student_name || '',
      result.version,
      result.correct_count,
      exam.question_count,
      result.blank_count,
      Number(result.score || 0).toFixed(2),
      captureSourceLabel(result.capture_source),
      resultConfirmedLabel(result),
    ]),
  ];
  const csv = `\ufeff${rows
    .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','))
    .join('\n')}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  const href = URL.createObjectURL(blob);
  link.href = href;
  link.download = `TEDVIO_${exam.title.replace(/[^a-z0-9]+/gi, '_')}_OMR.csv`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(href), 1200);
}
