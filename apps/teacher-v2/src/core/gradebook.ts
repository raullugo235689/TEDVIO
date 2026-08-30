import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { AcademicPeriodRecord, PaperExam } from './exams';
import type {
  AttendanceRecordRow,
  AttendanceSessionRecord,
  GroupRecord,
  StudentRecord,
} from './types';

export type GradeCategoryKind = 'manual' | 'omr' | 'attendance' | 'live';
export type GradeItemSource = 'manual' | 'omr' | 'assignment';

export interface GradeCategory {
  id: string;
  group_id: string;
  teacher_id: string;
  name: string;
  kind: GradeCategoryKind;
  weight: number;
  created_at: string;
  updated_at?: string | null;
}

export interface GradeItem {
  id: string;
  group_id: string;
  teacher_id: string;
  category_id: string;
  title: string;
  max_score: number;
  item_date?: string | null;
  period_id?: string | null;
  source_type?: GradeItemSource | null;
  source_id?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface GradeScore {
  id: string;
  item_id: string;
  student_id: string;
  teacher_id: string;
  score?: number | null;
  note?: string | null;
  source_type?: GradeItemSource | null;
  source_id?: string | null;
  updated_at: string;
}

export interface GradebookPeriod extends AcademicPeriodRecord {
  closed_at?: string | null;
  closed_snapshot?: Record<string, unknown> | null;
}

export interface GradebookExam extends PaperExam {
  grade_item_id?: string | null;
}

export interface GradebookOmrResult {
  id: string;
  exam_id: string;
  teacher_id: string;
  student_id?: string | null;
  enrollment?: string | null;
  student_name?: string | null;
  version: string;
  score: number;
  correct_count: number;
  blank_count: number;
  reviewed: boolean;
  review_status?: 'needs_review' | 'confirmed' | 'archived' | null;
  reviewed_at?: string | null;
  archived_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface GradebookSession {
  id: string;
  group_id: string;
  teacher_id: string;
  created_at: string;
  status?: string | null;
}

export interface GradebookParticipant {
  id: string;
  session_id: string;
  roster_student_id?: string | null;
  matricula?: string | null;
}

export interface GradebookRevision {
  id: string;
  teacher_id: string;
  group_id: string;
  period_id?: string | null;
  entity_type: 'category' | 'item' | 'score';
  entity_id: string;
  action: 'insert' | 'update';
  reason?: string | null;
  created_at: string;
}

export interface GroupAlertSettings {
  group_id: string;
  teacher_id: string;
  min_attendance?: number | null;
  min_grade?: number | null;
}

export interface GradebookWorkspace {
  groups: GroupRecord[];
  periods: GradebookPeriod[];
  categories: GradeCategory[];
  items: GradeItem[];
}

export interface GradebookDetail {
  group: GroupRecord;
  periods: GradebookPeriod[];
  students: StudentRecord[];
  categories: GradeCategory[];
  items: GradeItem[];
  scores: GradeScore[];
  exams: GradebookExam[];
  omrResults: GradebookOmrResult[];
  attendanceSessions: AttendanceSessionRecord[];
  attendanceRecords: AttendanceRecordRow[];
  liveSessions: GradebookSession[];
  participants: GradebookParticipant[];
  settings: GroupAlertSettings;
  revisions: GradebookRevision[];
  periodSummary: Record<string, unknown> | null;
}

export interface CategoryCalculation {
  categoryId: string;
  value: number | null;
  evidenceCount: number;
  evidenceTotal: number;
  label: string;
}

export interface StudentGradeCalculation {
  student: StudentRecord;
  itemScores: Record<string, number | null>;
  categoryValues: Record<string, CategoryCalculation>;
  currentGrade: number | null;
  officialGrade: number | null;
  displayedGrade: number | null;
  evidenceWeight: number;
  attendanceRate: number | null;
  omrAverage: number | null;
  status: 'risk' | 'watch' | 'ok' | 'no_evidence';
}

export interface ExamSyncState {
  exam: GradebookExam;
  confirmed: number;
  pending: number;
  unmatched: number;
  linked: boolean;
  item: GradeItem | null;
}

export interface GradebookCalculation {
  period: GradebookPeriod | null;
  items: GradeItem[];
  manualItems: GradeItem[];
  students: StudentGradeCalculation[];
  examSync: ExamSyncState[];
  configuredWeight: number;
  groupAverage: number | null;
  approvalRate: number | null;
  studentsWithoutGrade: number;
  manualExpected: number;
  manualCaptured: number;
  manualPending: number;
  confirmedOmr: number;
  pendingOmr: number;
  attendanceSessions: number;
  liveSessions: number;
  minGrade: number;
  locked: boolean;
  editable: boolean;
}

export interface CategoryDraft {
  id?: string | null;
  name: string;
  kind: GradeCategoryKind;
  weight: number;
}

export interface GradeItemDraft {
  id?: string | null;
  groupId: string;
  categoryId: string;
  periodId?: string | null;
  title: string;
  maxScore: number;
  itemDate: string;
  reason?: string | null;
}

export interface GradeScoreDraft {
  studentId: string;
  score: number | null;
  note?: string | null;
}

export interface OmrLinkResult {
  exam_id: string;
  grade_item_id: string;
  linked: number;
  pending: number;
  unmatched: number;
  period_id?: string | null;
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

function localDate(): string {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function normalizedEnrollment(value?: string | null): string {
  return String(value || '').trim().toLocaleLowerCase('es-MX');
}

function dateInPeriod(value: string | null | undefined, period: GradebookPeriod | null): boolean {
  if (!period) return true;
  if (!value) return false;
  const day = value.slice(0, 10);
  return day >= period.starts_on && day <= period.ends_on;
}

function belongsToPeriod(
  periodId: string | null | undefined,
  date: string | null | undefined,
  period: GradebookPeriod | null,
): boolean {
  if (!period) return true;
  if (periodId) return periodId === period.id;
  return dateInPeriod(date, period);
}

function resultConfirmed(result: GradebookOmrResult): boolean {
  return !result.archived_at && (result.reviewed || result.review_status === 'confirmed');
}

function resultMatchesStudent(result: GradebookOmrResult, student: StudentRecord): boolean {
  if (result.student_id) return result.student_id === student.id;
  const enrollment = normalizedEnrollment(result.enrollment);
  return Boolean(enrollment) && enrollment === normalizedEnrollment(student.enrollment);
}

function snapshotGrade(period: GradebookPeriod | null, studentId: string): number | null {
  if (!period || period.status !== 'closed' || !period.closed_snapshot) return null;
  const rows = period.closed_snapshot.student_rows;
  if (!Array.isArray(rows)) return null;
  const row = rows.find((item) => item && typeof item === 'object' && String((item as Record<string, unknown>).student_id || '') === studentId) as Record<string, unknown> | undefined;
  if (!row) return null;
  const grade = Number(row.grade);
  return Number.isFinite(grade) ? grade : null;
}

export function gradebookWorkspaceKey(userId?: string) {
  return ['teacher-gradebook-workspace', userId || 'anonymous'] as const;
}

export function gradebookDetailKey(userId?: string, groupId?: string, periodId?: string | null) {
  return ['teacher-gradebook-detail', userId || 'anonymous', groupId || 'none', periodId || 'course'] as const;
}

export async function fetchGradebookWorkspace(user: User): Promise<GradebookWorkspace> {
  const [groupsResult, periodsResult, categoriesResult, itemsResult] = await Promise.all([
    supabase.from('v2_groups').select('*').eq('teacher_id', user.id).eq('is_demo', false).order('created_at', { ascending: false }),
    supabase.from('v2_academic_periods').select('*').eq('teacher_id', user.id).order('group_id').order('order_index'),
    supabase.from('v2_grade_categories').select('*').eq('teacher_id', user.id).order('created_at'),
    supabase.from('v2_grade_items').select('*').eq('teacher_id', user.id).order('item_date', { ascending: false }).range(0, 9999),
  ]);
  if (groupsResult.error) throw new Error(`No se pudieron cargar los grupos: ${errorMessage(groupsResult.error)}`);
  if (periodsResult.error) throw new Error(`No se pudieron cargar los periodos: ${errorMessage(periodsResult.error)}`);
  if (categoriesResult.error) throw new Error(`No se pudieron cargar las categorías: ${errorMessage(categoriesResult.error)}`);
  if (itemsResult.error) throw new Error(`No se pudieron cargar las evidencias: ${errorMessage(itemsResult.error)}`);
  return {
    groups: (groupsResult.data || []) as GroupRecord[],
    periods: (periodsResult.data || []) as GradebookPeriod[],
    categories: (categoriesResult.data || []) as GradeCategory[],
    items: (itemsResult.data || []) as GradeItem[],
  };
}

export async function fetchGradebookDetail(user: User, groupId: string, periodId: string | null): Promise<GradebookDetail> {
  const [groupResult, periodsResult, studentsResult, categoriesResult, itemsResult, examsResult, attendanceResult, sessionsResult, settingsResult, revisionsResult] = await Promise.all([
    supabase.from('v2_groups').select('*').eq('id', groupId).eq('teacher_id', user.id).single(),
    supabase.from('v2_academic_periods').select('*').eq('group_id', groupId).eq('teacher_id', user.id).order('order_index'),
    supabase.from('v2_group_students').select('*').eq('group_id', groupId).eq('teacher_id', user.id).eq('active', true).order('full_name'),
    supabase.from('v2_grade_categories').select('*').eq('group_id', groupId).eq('teacher_id', user.id).order('created_at'),
    supabase.from('v2_grade_items').select('*').eq('group_id', groupId).eq('teacher_id', user.id).order('item_date').range(0, 9999),
    supabase.from('v2_paper_exams').select('*').eq('group_id', groupId).eq('teacher_id', user.id).in('status', ['ready', 'closed']).order('exam_date').range(0, 9999),
    supabase.from('v2_attendance_sessions').select('*').eq('group_id', groupId).eq('teacher_id', user.id).order('attendance_date').range(0, 9999),
    supabase.from('v2_sessions').select('id,group_id,teacher_id,created_at,status').eq('group_id', groupId).eq('teacher_id', user.id).order('created_at').range(0, 9999),
    supabase.from('v2_group_alert_settings').select('*').eq('group_id', groupId).eq('teacher_id', user.id).maybeSingle(),
    supabase.from('v2_gradebook_revisions').select('id,teacher_id,group_id,period_id,entity_type,entity_id,action,reason,created_at').eq('group_id', groupId).eq('teacher_id', user.id).order('created_at', { ascending: false }).limit(100),
  ]);

  if (groupResult.error) throw new Error(`No se pudo abrir el grupo: ${errorMessage(groupResult.error)}`);
  if (periodsResult.error) throw new Error(`No se pudieron cargar los periodos: ${errorMessage(periodsResult.error)}`);
  if (studentsResult.error) throw new Error(`No se pudo cargar el padrón: ${errorMessage(studentsResult.error)}`);
  if (categoriesResult.error) throw new Error(`No se pudieron cargar las categorías: ${errorMessage(categoriesResult.error)}`);
  if (itemsResult.error) throw new Error(`No se pudieron cargar las evidencias: ${errorMessage(itemsResult.error)}`);
  if (examsResult.error) throw new Error(`No se pudieron cargar las evaluaciones OMR: ${errorMessage(examsResult.error)}`);
  if (attendanceResult.error) throw new Error(`No se pudo cargar la asistencia: ${errorMessage(attendanceResult.error)}`);
  if (sessionsResult.error) throw new Error(`No se pudieron cargar las sesiones: ${errorMessage(sessionsResult.error)}`);
  if (settingsResult.error) throw new Error(`No se pudieron cargar los umbrales: ${errorMessage(settingsResult.error)}`);
  if (revisionsResult.error) throw new Error(`No se pudo cargar la bitácora: ${errorMessage(revisionsResult.error)}`);

  const items = (itemsResult.data || []) as GradeItem[];
  const exams = (examsResult.data || []) as GradebookExam[];
  const attendanceSessions = (attendanceResult.data || []) as AttendanceSessionRecord[];
  const liveSessions = (sessionsResult.data || []) as GradebookSession[];
  const itemIds = items.map((item) => item.id);
  const examIds = exams.map((exam) => exam.id);
  const attendanceIds = attendanceSessions.map((session) => session.id);
  const sessionIds = liveSessions.map((session) => session.id);

  const [scoresResult, omrResult, attendanceRecordsResult, participantsResult, summaryResult] = await Promise.all([
    itemIds.length ? supabase.from('v2_grade_scores').select('*').eq('teacher_id', user.id).in('item_id', itemIds).range(0, 9999) : Promise.resolve({ data: [], error: null }),
    examIds.length ? supabase.from('v2_paper_exam_results').select('*').eq('teacher_id', user.id).in('exam_id', examIds).range(0, 9999) : Promise.resolve({ data: [], error: null }),
    attendanceIds.length ? supabase.from('v2_attendance_records').select('*').eq('teacher_id', user.id).in('attendance_session_id', attendanceIds).range(0, 9999) : Promise.resolve({ data: [], error: null }),
    sessionIds.length ? supabase.from('v2_participants').select('id,session_id,roster_student_id,matricula').in('session_id', sessionIds).range(0, 9999) : Promise.resolve({ data: [], error: null }),
    periodId ? supabase.rpc('v2_teacher_academic_period_summary', { p_period_id: periodId }) : Promise.resolve({ data: null, error: null }),
  ]);

  if (scoresResult.error) throw new Error(`No se pudieron cargar las calificaciones: ${errorMessage(scoresResult.error)}`);
  if (omrResult.error) throw new Error(`No se pudieron cargar los resultados OMR: ${errorMessage(omrResult.error)}`);
  if (attendanceRecordsResult.error) throw new Error(`No se pudieron cargar los registros de asistencia: ${errorMessage(attendanceRecordsResult.error)}`);
  if (participantsResult.error) throw new Error(`No se pudo cargar la participación: ${errorMessage(participantsResult.error)}`);
  if (summaryResult.error) throw new Error(`No se pudo calcular el periodo: ${errorMessage(summaryResult.error)}`);

  return {
    group: groupResult.data as GroupRecord,
    periods: (periodsResult.data || []) as GradebookPeriod[],
    students: (studentsResult.data || []) as StudentRecord[],
    categories: (categoriesResult.data || []) as GradeCategory[],
    items,
    scores: (scoresResult.data || []) as GradeScore[],
    exams,
    omrResults: (omrResult.data || []) as GradebookOmrResult[],
    attendanceSessions,
    attendanceRecords: (attendanceRecordsResult.data || []) as AttendanceRecordRow[],
    liveSessions,
    participants: (participantsResult.data || []) as GradebookParticipant[],
    settings: (settingsResult.data || { group_id: groupId, teacher_id: user.id, min_attendance: 80, min_grade: 6 }) as GroupAlertSettings,
    revisions: (revisionsResult.data || []) as GradebookRevision[],
    periodSummary: (summaryResult.data || null) as Record<string, unknown> | null,
  };
}

export function calculateGradebook(detail: GradebookDetail, periodId: string | null): GradebookCalculation {
  const period = periodId ? detail.periods.find((item) => item.id === periodId) || null : null;
  const items = detail.items.filter((item) => belongsToPeriod(item.period_id, item.item_date, period));
  const itemIds = new Set(items.map((item) => item.id));
  const scores = detail.scores.filter((score) => itemIds.has(score.item_id));
  const scoreMap = new Map(scores.map((score) => [`${score.item_id}:${score.student_id}`, score]));
  const exams = detail.exams.filter((exam) => belongsToPeriod(exam.period_id, exam.exam_date, period));
  const examIds = new Set(exams.map((exam) => exam.id));
  const omrResults = detail.omrResults.filter((result) => examIds.has(result.exam_id));
  const confirmedOmrResults = omrResults.filter(resultConfirmed);
  const attendanceSessions = detail.attendanceSessions.filter((session) => dateInPeriod(session.attendance_date, period));
  const attendanceIds = new Set(attendanceSessions.map((session) => session.id));
  const attendanceRecords = detail.attendanceRecords.filter((record) => attendanceIds.has(record.attendance_session_id));
  const liveSessions = detail.liveSessions.filter((session) => dateInPeriod(session.created_at, period));
  const liveIds = new Set(liveSessions.map((session) => session.id));
  const participants = detail.participants.filter((participant) => liveIds.has(participant.session_id));
  const manualItems = items.filter((item) => (item.source_type || 'manual') === 'manual');
  const configuredWeight = detail.categories.reduce((sum, category) => sum + numberValue(category.weight), 0);
  const minGrade = numberValue(detail.settings.min_grade, 6);

  const students = detail.students.map<StudentGradeCalculation>((student) => {
    const itemScores: Record<string, number | null> = {};
    for (const item of items) {
      const score = scoreMap.get(`${item.id}:${student.id}`)?.score;
      itemScores[item.id] = score == null ? null : numberValue(score);
    }

    const attendanceForStudent = attendanceRecords.filter((record) => record.student_id === student.id);
    const attendanceRate = attendanceForStudent.length ? 100 * attendanceForStudent.filter((record) => ['present', 'late', 'justified'].includes(record.status)).length / attendanceForStudent.length : null;
    const omrForStudent = confirmedOmrResults.filter((result) => resultMatchesStudent(result, student));
    const omrAverage = mean(omrForStudent.map((result) => numberValue(result.score)));
    const liveParticipation = new Set(participants.filter((participant) => participant.roster_student_id === student.id || (!participant.roster_student_id && normalizedEnrollment(participant.matricula) === normalizedEnrollment(student.enrollment))).map((participant) => participant.session_id)).size;

    const categoryValues: Record<string, CategoryCalculation> = {};
    let weighted = 0;
    let evidenceWeight = 0;

    for (const category of detail.categories) {
      let value: number | null = null;
      let evidenceCount = 0;
      let evidenceTotal = 0;
      let label = 'Sin evidencia';

      if (category.kind === 'omr') {
        value = omrAverage;
        evidenceCount = omrForStudent.length;
        evidenceTotal = exams.length;
        label = evidenceCount ? `${evidenceCount} evaluación${evidenceCount === 1 ? '' : 'es'}` : 'Sin OMR confirmado';
      } else if (category.kind === 'attendance') {
        value = attendanceRate == null ? null : attendanceRate / 10;
        evidenceCount = attendanceForStudent.length;
        evidenceTotal = attendanceSessions.length;
        label = evidenceCount ? `${Math.round(attendanceRate || 0)}% asistencia` : 'Sin listas';
      } else if (category.kind === 'live') {
        value = liveSessions.length ? 10 * liveParticipation / liveSessions.length : null;
        evidenceCount = liveParticipation;
        evidenceTotal = liveSessions.length;
        label = liveSessions.length ? `${liveParticipation}/${liveSessions.length} sesiones` : 'Sin sesiones';
      } else {
        const categoryItems = manualItems.filter((item) => item.category_id === category.id);
        const normalized = categoryItems.flatMap((item) => {
          const score = itemScores[item.id];
          return score == null ? [] : [Math.max(0, Math.min(10, score / Math.max(numberValue(item.max_score, 10), 0.0001) * 10))];
        });
        value = mean(normalized);
        evidenceCount = normalized.length;
        evidenceTotal = categoryItems.length;
        label = categoryItems.length ? `${evidenceCount}/${categoryItems.length} actividades` : 'Sin actividades';
      }

      categoryValues[category.id] = { categoryId: category.id, value, evidenceCount, evidenceTotal, label };
      if (value != null && numberValue(category.weight) > 0) {
        weighted += value * numberValue(category.weight);
        evidenceWeight += numberValue(category.weight);
      }
    }

    const currentGrade = evidenceWeight ? weighted / evidenceWeight : null;
    const officialGrade = snapshotGrade(period, student.id);
    const displayedGrade = officialGrade ?? currentGrade;
    const status: StudentGradeCalculation['status'] = displayedGrade == null ? 'no_evidence' : displayedGrade < minGrade ? 'risk' : displayedGrade < minGrade + 1 ? 'watch' : 'ok';

    return { student, itemScores, categoryValues, currentGrade, officialGrade, displayedGrade, evidenceWeight, attendanceRate, omrAverage, status };
  });

  const displayedGrades = students.map((student) => student.displayedGrade).filter((value): value is number => value != null);
  const manualExpected = manualItems.length * detail.students.length;
  const manualCaptured = detail.students.reduce((total, student) => total + manualItems.filter((item) => scoreMap.get(`${item.id}:${student.id}`)?.score != null).length, 0);

  const examSync = exams.map<ExamSyncState>((exam) => {
    const active = omrResults.filter((result) => result.exam_id === exam.id && !result.archived_at);
    const confirmed = active.filter(resultConfirmed);
    const matched = confirmed.filter((result) => detail.students.some((student) => resultMatchesStudent(result, student)));
    const item = items.find((gradeItem) => gradeItem.id === exam.grade_item_id || (gradeItem.source_type === 'omr' && gradeItem.source_id === exam.id)) || null;
    return { exam, confirmed: confirmed.length, pending: active.length - confirmed.length, unmatched: confirmed.length - matched.length, linked: Boolean(item && exam.grade_item_id === item.id), item };
  });

  const locked = period?.status === 'closed';
  const editable = !locked && (Boolean(period) || detail.periods.length === 0);

  return {
    period,
    items,
    manualItems,
    students,
    examSync,
    configuredWeight,
    groupAverage: mean(displayedGrades),
    approvalRate: displayedGrades.length ? displayedGrades.filter((value) => value >= minGrade).length / displayedGrades.length : null,
    studentsWithoutGrade: students.filter((student) => student.displayedGrade == null).length,
    manualExpected,
    manualCaptured,
    manualPending: Math.max(0, manualExpected - manualCaptured),
    confirmedOmr: confirmedOmrResults.length,
    pendingOmr: omrResults.filter((result) => !result.archived_at && !resultConfirmed(result)).length,
    attendanceSessions: attendanceSessions.length,
    liveSessions: liveSessions.length,
    minGrade,
    locked,
    editable,
  };
}

export function recommendedPeriodId(periods: GradebookPeriod[]): string | null {
  const today = localDate();
  const current = periods.find((period) => period.status === 'open' && today >= period.starts_on && today <= period.ends_on);
  if (current) return current.id;
  const open = periods.find((period) => period.status === 'open');
  return open?.id || periods.at(-1)?.id || null;
}

export async function ensureGradebookDefaults(user: User, groupId: string): Promise<GradeCategory[]> {
  if (!user.id) throw new Error('Tu sesión expiró.');
  const { data, error } = await supabase.rpc('v2_gradebook_ensure_defaults', { p_group_id: groupId });
  if (error) throw new Error(`No se pudo configurar el Libro: ${errorMessage(error)}`);
  return (data || []) as GradeCategory[];
}

export async function saveGradebookCategories(user: User, groupId: string, categories: CategoryDraft[], reason = 'Ajuste de ponderaciones'): Promise<GradeCategory[]> {
  if (!user.id) throw new Error('Tu sesión expiró.');
  const { data, error } = await supabase.rpc('v2_gradebook_save_categories', {
    p_group_id: groupId,
    p_categories: categories.map((category) => ({ id: category.id || null, name: category.name.trim(), kind: category.kind, weight: Number(category.weight) })),
    p_reason: reason,
  });
  if (error) throw new Error(`No se pudieron guardar las ponderaciones: ${errorMessage(error)}`);
  return (data || []) as GradeCategory[];
}

export async function saveGradebookItem(user: User, draft: GradeItemDraft): Promise<GradeItem> {
  if (!user.id) throw new Error('Tu sesión expiró.');
  const { data, error } = await supabase.rpc('v2_gradebook_save_item', {
    p_item_id: draft.id || null,
    p_group_id: draft.groupId,
    p_category_id: draft.categoryId,
    p_period_id: draft.periodId || null,
    p_title: draft.title.trim(),
    p_max_score: Number(draft.maxScore),
    p_item_date: draft.itemDate,
    p_reason: draft.reason?.trim() || null,
  });
  if (error) throw new Error(`No se pudo guardar la actividad: ${errorMessage(error)}`);
  if (!data) throw new Error('TEDVIO no devolvió la actividad guardada.');
  return data as GradeItem;
}

export async function saveGradebookScores(user: User, itemId: string, scores: GradeScoreDraft[], reason = 'Captura de calificaciones'): Promise<{ item_id: string; saved: number; max_score: number }> {
  if (!user.id) throw new Error('Tu sesión expiró.');
  const { data, error } = await supabase.rpc('v2_gradebook_save_scores', {
    p_item_id: itemId,
    p_scores: scores.map((score) => ({ student_id: score.studentId, score: score.score, note: score.note?.trim() || null })),
    p_reason: reason,
  });
  if (error) throw new Error(`No se pudieron guardar las calificaciones: ${errorMessage(error)}`);
  return data as { item_id: string; saved: number; max_score: number };
}

export async function linkOmrExamToGradebook(user: User, examId: string, categoryId: string): Promise<OmrLinkResult> {
  if (!user.id) throw new Error('Tu sesión expiró.');
  const { data, error } = await supabase.rpc('v2_gradebook_link_omr', { p_exam_id: examId, p_category_id: categoryId });
  if (error) throw new Error(`No se pudo sincronizar OMR con el Libro: ${errorMessage(error)}`);
  return data as OmrLinkResult;
}

export function exportGradebookCsv(detail: GradebookDetail, calculation: GradebookCalculation): void {
  const categories = detail.categories;
  const items = calculation.items;
  const header = ['Matrícula', 'Alumno', ...items.map((item) => `${item.title} / ${numberValue(item.max_score)}`), ...categories.map((category) => `${category.name} (${numberValue(category.weight)}%)`), calculation.period?.status === 'closed' ? 'Promedio oficial' : 'Promedio actual', 'Ponderación con evidencia', 'Estado'];
  const rows = calculation.students.map((student) => [
    student.student.enrollment,
    student.student.full_name,
    ...items.map((item) => student.itemScores[item.id] == null ? '' : String(student.itemScores[item.id])),
    ...categories.map((category) => student.categoryValues[category.id]?.value == null ? '' : Number(student.categoryValues[category.id]?.value).toFixed(2)),
    student.displayedGrade == null ? '' : student.displayedGrade.toFixed(2),
    `${student.evidenceWeight.toFixed(1)}%`,
    student.status === 'risk' ? 'En riesgo' : student.status === 'watch' ? 'Atención' : student.status === 'ok' ? 'En orden' : 'Sin evidencia',
  ]);
  const csv = `\uFEFF${[header, ...rows].map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n')}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  const suffix = calculation.period?.name || 'Curso';
  anchor.download = `TEDVIO_${(detail.group.subject || detail.group.name || 'Libro').replace(/[^a-z0-9áéíóúüñ]+/gi, '_')}_${suffix.replace(/[^a-z0-9áéíóúüñ]+/gi, '_')}.csv`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
