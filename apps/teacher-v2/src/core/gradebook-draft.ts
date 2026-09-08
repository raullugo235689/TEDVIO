import type { CategoryDraft, GradebookDetail, GradeScoreDraft } from './gradebook';

export interface ScoreInput { studentId: string; score: string; note: string }
export interface CaptureSnapshot<T> { context: string; rows: T[] }
export interface GradebookDraft<T> { base: CaptureSnapshot<T>; rows: T[]; revision: number }
export const gradebookDraftKey = (userId: string | undefined, groupId: string, capture: string) => ['gradebook-draft', userId, groupId, capture] as const;
export const gradebookWriteKey = (userId: string | undefined, groupId?: string) => groupId ? ['gradebook-write', userId, groupId] as const : ['gradebook-write', userId] as const;
export const sameCapture = <T>(a: CaptureSnapshot<T>, b: CaptureSnapshot<T>) => JSON.stringify(a) === JSON.stringify(b);
export function editGradebookDraft<T>(current: GradebookDraft<T> | null | undefined, base: CaptureSnapshot<T>, rows: T[]): GradebookDraft<T> {
  return { base: current?.base ?? base, rows, revision: (current?.revision ?? 0) + 1 };
}
export function finishGradebookDraft<T>(current: GradebookDraft<T> | null | undefined, revision: number) {
  return current && current.revision !== revision ? current : null;
}
export function categorySnapshot(detail: GradebookDetail): CaptureSnapshot<CategoryDraft> {
  return { context: detail.group.id, rows: detail.categories.map(row => ({ id: row.id, name: row.name, kind: row.kind, weight: Number(row.weight) })).sort((a, b) => a.id.localeCompare(b.id)) };
}
export function categoryIssue(rows: CategoryDraft[]): string {
  if (!rows.length || rows.length > 12) return 'Configura entre 1 y 12 categorías.';
  if (rows.some(row => !row.name.trim() || row.name.trim().length > 80)) return 'Cada categoría necesita un nombre de 1 a 80 caracteres.';
  if (new Set(rows.map(row => row.name.trim().toLocaleLowerCase('es-MX'))).size !== rows.length) return 'Los nombres de las categorías deben ser diferentes.';
  if (rows.some(row => !Number.isFinite(row.weight) || row.weight < 0 || row.weight > 100)) return 'Cada ponderación debe estar entre 0 y 100%.';
  for (const kind of ['omr', 'attendance', 'live']) if (rows.filter(row => row.kind === kind).length > 1) return 'OMR, Asistencia y Participación solo pueden aparecer una vez.';
  const total = rows.reduce((sum, row) => sum + row.weight, 0);
  if (Math.abs(total - 100) >= 0.01) return total < 100 ? `Falta distribuir ${(100 - total).toFixed(1)}% para completar 100%.` : `Reduce ${(total - 100).toFixed(1)}% para completar 100%.`;
  return '';
}
export function categoriesSaved(expected: CategoryDraft[], actual: CategoryDraft[]): boolean {
  const normalize = (rows: CategoryDraft[]) => rows.map(row => [row.name.trim(), row.kind, Number(row.weight)]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return JSON.stringify(normalize(expected)) === JSON.stringify(normalize(actual));
}
export function scoreSnapshot(detail: GradebookDetail, itemId: string): CaptureSnapshot<ScoreInput> {
  const item = detail.items.find(row => row.id === itemId);
  const period = detail.periods.find(row => row.id === item?.period_id);
  const records = new Map(detail.scores.filter(row => row.item_id === itemId).map(row => [row.student_id, row]));
  return {
    context: JSON.stringify([item?.id, item?.max_score, item?.period_id, period?.status, item?.source_type, item?.category_id, detail.categories.find(row => row.id === item?.category_id)?.kind]),
    rows: detail.students.map(student => { const row = records.get(student.id); return { studentId: student.id, score: row?.score == null ? '' : String(Number(row.score)), note: row?.note || '' }; }).sort((a, b) => a.studentId.localeCompare(b.studentId)),
  };
}
export function scoreIssue(value: string, max: number): string {
  if (!value.trim()) return '';
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value.trim())) return 'Usa un número con hasta dos decimales.';
  const number = Number(value.trim().replace(',', '.'));
  return !Number.isFinite(number) || number < 0 || number > max ? `Debe estar entre 0 y ${max}.` : '';
}
export function scorePayload(rows: ScoreInput[]): GradeScoreDraft[] {
  return rows.map(row => ({ studentId: row.studentId, score: row.score.trim() ? Number(row.score.trim().replace(',', '.')) : null, note: row.note.trim() }));
}
export function scoresSaved(expected: ScoreInput[], actual: ScoreInput[]): boolean {
  return JSON.stringify(scorePayload(expected).sort((a, b) => a.studentId.localeCompare(b.studentId))) === JSON.stringify(scorePayload(actual).sort((a, b) => a.studentId.localeCompare(b.studentId)));
}
