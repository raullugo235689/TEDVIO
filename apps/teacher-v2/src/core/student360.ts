import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import {
  calculateGradebook,
  fetchGradebookDetail,
  recommendedPeriodId,
  type GradebookCalculation,
  type GradebookDetail,
  type GradebookPeriod,
  type GradeItem,
  type GradebookOmrResult,
  type StudentGradeCalculation,
} from './gradebook';
import type {
  AttendanceRecordRow,
  AttendanceSessionRecord,
  GroupRecord,
  StudentRecord,
} from './types';

export interface Student360Directory {
  groups: GroupRecord[];
  students: StudentRecord[];
}

export interface StudentNoteRecord {
  id: string;
  group_id: string;
  student_id: string;
  teacher_id: string;
  note?: string | null;
  updated_at: string;
}

export interface StudentNoteRevision {
  id: string;
  note_id: string;
  group_id: string;
  student_id: string;
  teacher_id: string;
  revision_no: number;
  action: 'created' | 'updated';
  previous_note?: string | null;
  current_note?: string | null;
  reason?: string | null;
  created_at: string;
}

export interface AssignmentRecord {
  id: string;
  teacher_id: string;
  group_id?: string | null;
  period_id?: string | null;
  title: string;
  status: 'draft' | 'published' | 'closed';
  opens_at?: string | null;
  closes_at?: string | null;
  created_at: string;
}

export interface AssignmentAttemptRecord {
  id: string;
  assignment_id: string;
  group_student_id?: string | null;
  display_name: string;
  enrollment: string;
  attempt_no: number;
  status: 'in_progress' | 'submitted';
  started_at: string;
  submitted_at?: string | null;
  late: boolean;
  score?: number | null;
  max_score?: number | null;
  percentage?: number | null;
}

export interface GradeRevisionRecord {
  id: string;
  teacher_id: string;
  group_id: string;
  period_id?: string | null;
  entity_type: string;
  entity_id: string;
  action: string;
  before_state?: Record<string, unknown> | null;
  after_state?: Record<string, unknown> | null;
  reason?: string | null;
  created_at: string;
}

export interface OmrRevisionRecord {
  id: string;
  result_id: string;
  exam_id: string;
  teacher_id: string;
  revision_no: number;
  snapshot: Record<string, unknown>;
  reason?: string | null;
  created_at: string;
}

export interface Student360Data {
  detail: GradebookDetail;
  student: StudentRecord;
  note: StudentNoteRecord | null;
  noteHistory: StudentNoteRevision[];
  assignments: AssignmentRecord[];
  attempts: AssignmentAttemptRecord[];
  gradeRevisions: GradeRevisionRecord[];
  omrRevisions: OmrRevisionRecord[];
}

export interface Student360Alert {
  id: string;
  tone: 'red' | 'amber' | 'green' | 'blue';
  title: string;
  detail: string;
  actionLabel?: string;
  actionTo?: string;
}

export interface StudentPeriodTrajectory {
  period: GradebookPeriod;
  grade: number | null;
  provisionalGrade: number | null;
  officialGrade: number | null;
  evidenceWeight: number;
  attendanceRate: number | null;
  omrAverage: number | null;
  status: StudentGradeCalculation['status'];
  delta: number | null;
  pendingManual: number;
  pendingOmr: number;
}

export interface StudentManualEvidence {
  item: GradeItem;
  categoryName: string;
  rawScore: number | null;
  normalizedScore: number | null;
  note: string;
  status: 'captured' | 'pending';
}

export interface StudentOmrEvidence {
  examId: string;
  title: string;
  examDate: string;
  version: string | null;
  score: number | null;
  correctCount: number | null;
  blankCount: number | null;
  status: 'confirmed' | 'pending' | 'missing' | 'archived';
  updatedAt: string | null;
}

export interface StudentAttendanceEvidence {
  session: AttendanceSessionRecord;
  record: AttendanceRecordRow | null;
}

export interface StudentLiveEvidence {
  sessionId: string;
  date: string;
  participated: boolean;
}

export interface StudentAssignmentEvidence {
  assignment: AssignmentRecord;
  attempt: AssignmentAttemptRecord | null;
  normalizedScore: number | null;
  status: 'submitted' | 'in_progress' | 'missing';
}

export interface Student360AuditEvent {
  id: string;
  kind: 'note' | 'grade' | 'omr';
  title: string;
  detail: string;
  reason: string;
  createdAt: string;
}

export interface Student360Calculation {
  selectedPeriodId: string | null;
  selectedPeriod: GradebookPeriod | null;
  current: StudentGradeCalculation;
  course: StudentGradeCalculation;
  periodCalculation: GradebookCalculation;
  trajectory: StudentPeriodTrajectory[];
  alerts: Student360Alert[];
  nextAction: Student360Alert;
  manualEvidence: StudentManualEvidence[];
  omrEvidence: StudentOmrEvidence[];
  attendanceEvidence: StudentAttendanceEvidence[];
  liveEvidence: StudentLiveEvidence[];
  assignmentEvidence: StudentAssignmentEvidence[];
  audit: Student360AuditEvent[];
  pendingCount: number;
  minGrade: number;
  minAttendance: number;
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

function normalizedEnrollment(value?: string | null): string {
  return String(value || '').trim().toLocaleLowerCase('es-MX');
}

function resultMatchesStudent(result: GradebookOmrResult, student: StudentRecord): boolean {
  if (result.student_id) return result.student_id === student.id;
  const enrollment = normalizedEnrollment(result.enrollment);
  return Boolean(enrollment) && enrollment === normalizedEnrollment(student.enrollment);
}

function resultConfirmed(result: GradebookOmrResult): boolean {
  return !result.archived_at && (result.reviewed || result.review_status === 'confirmed');
}

function dateInPeriod(value: string | null | undefined, period: GradebookPeriod | null): boolean {
  if (!period) return true;
  if (!value) return false;
  const date = value.slice(0, 10);
  return date >= period.starts_on && date <= period.ends_on;
}

function belongsToPeriod(periodId: string | null | undefined, date: string | null | undefined, period: GradebookPeriod | null): boolean {
  if (!period) return true;
  if (periodId) return periodId === period.id;
  return dateInPeriod(date, period);
}

function stateStudentId(value?: Record<string, unknown> | null): string {
  if (!value) return '';
  return String(value.student_id || value.studentId || '');
}

function latestResult(results: GradebookOmrResult[]): GradebookOmrResult | null {
  return [...results].sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime())[0] || null;
}

function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function student360DirectoryKey(userId?: string) {
  return ['teacher-student360-directory', userId || 'anonymous'] as const;
}

export function student360Key(userId?: string, groupId?: string, studentId?: string) {
  return ['teacher-student360', userId || 'anonymous', groupId || 'none', studentId || 'none'] as const;
}

export async function fetchStudent360Directory(user: User): Promise<Student360Directory> {
  const [groupsResult, studentsResult] = await Promise.all([
    supabase
      .from('v2_groups')
      .select('*')
      .eq('teacher_id', user.id)
      .eq('is_demo', false)
      .order('created_at', { ascending: false }),
    supabase
      .from('v2_group_students')
      .select('*')
      .eq('teacher_id', user.id)
      .eq('active', true)
      .order('group_id')
      .order('full_name')
      .range(0, 9999),
  ]);

  if (groupsResult.error) throw new Error(`No se pudieron cargar los grupos: ${errorMessage(groupsResult.error)}`);
  if (studentsResult.error) throw new Error(`No se pudo cargar el directorio de alumnos: ${errorMessage(studentsResult.error)}`);

  return {
    groups: (groupsResult.data || []) as GroupRecord[],
    students: (studentsResult.data || []) as StudentRecord[],
  };
}

export async function fetchStudent360(user: User, groupId: string, studentId: string): Promise<Student360Data> {
  let detail = await fetchGradebookDetail(user, groupId, null);
  let student = detail.students.find((row) => row.id === studentId) || null;

  if (!student) {
    const fallback = await supabase
      .from('v2_group_students')
      .select('*')
      .eq('id', studentId)
      .eq('group_id', groupId)
      .eq('teacher_id', user.id)
      .maybeSingle();
    if (fallback.error) throw new Error(`No se pudo abrir el alumno: ${errorMessage(fallback.error)}`);
    student = (fallback.data || null) as StudentRecord | null;
    if (student) detail = { ...detail, students: [...detail.students, student] };
  }

  if (!student) throw new Error('El alumno no pertenece a este grupo docente.');

  const studentResults = detail.omrResults.filter((result) => resultMatchesStudent(result, student!));
  const resultIds = studentResults.map((result) => result.id);

  const [noteResult, noteHistoryResult, assignmentsResult, attemptsResult, revisionsResult, omrRevisionsResult] = await Promise.all([
    supabase
      .from('v2_student_notes')
      .select('*')
      .eq('group_id', groupId)
      .eq('student_id', studentId)
      .eq('teacher_id', user.id)
      .maybeSingle(),
    supabase
      .from('v2_student_note_revisions')
      .select('*')
      .eq('group_id', groupId)
      .eq('student_id', studentId)
      .eq('teacher_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('v2_assignments')
      .select('id,teacher_id,group_id,period_id,title,status,opens_at,closes_at,created_at')
      .eq('group_id', groupId)
      .eq('teacher_id', user.id)
      .order('created_at', { ascending: false })
      .range(0, 9999),
    supabase
      .from('v2_assignment_attempts')
      .select('id,assignment_id,group_student_id,display_name,enrollment,attempt_no,status,started_at,submitted_at,late,score,max_score,percentage')
      .eq('group_student_id', studentId)
      .order('started_at', { ascending: false })
      .range(0, 9999),
    supabase
      .from('v2_gradebook_revisions')
      .select('id,teacher_id,group_id,period_id,entity_type,entity_id,action,before_state,after_state,reason,created_at')
      .eq('group_id', groupId)
      .eq('teacher_id', user.id)
      .order('created_at', { ascending: false })
      .limit(300),
    resultIds.length
      ? supabase
          .from('v2_paper_exam_result_revisions')
          .select('id,result_id,exam_id,teacher_id,revision_no,snapshot,reason,created_at')
          .eq('teacher_id', user.id)
          .in('result_id', resultIds)
          .order('created_at', { ascending: false })
          .limit(200)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (noteResult.error) throw new Error(`No se pudo cargar la observación: ${errorMessage(noteResult.error)}`);
  if (noteHistoryResult.error) throw new Error(`No se pudo cargar el historial de observaciones: ${errorMessage(noteHistoryResult.error)}`);
  if (assignmentsResult.error) throw new Error(`No se pudieron cargar las tareas: ${errorMessage(assignmentsResult.error)}`);
  if (attemptsResult.error) throw new Error(`No se pudieron cargar los intentos: ${errorMessage(attemptsResult.error)}`);
  if (revisionsResult.error) throw new Error(`No se pudo cargar la trazabilidad académica: ${errorMessage(revisionsResult.error)}`);
  if (omrRevisionsResult.error) throw new Error(`No se pudo cargar el historial OMR: ${errorMessage(omrRevisionsResult.error)}`);

  const gradeRevisions = ((revisionsResult.data || []) as GradeRevisionRecord[]).filter((revision) => (
    revision.entity_type === 'score'
    && (stateStudentId(revision.before_state) === studentId || stateStudentId(revision.after_state) === studentId)
  ));

  return {
    detail,
    student,
    note: (noteResult.data || null) as StudentNoteRecord | null,
    noteHistory: (noteHistoryResult.data || []) as StudentNoteRevision[],
    assignments: (assignmentsResult.data || []) as AssignmentRecord[],
    attempts: (attemptsResult.data || []) as AssignmentAttemptRecord[],
    gradeRevisions,
    omrRevisions: (omrRevisionsResult.data || []) as OmrRevisionRecord[],
  };
}

export async function saveStudent360Note(
  user: User,
  groupId: string,
  studentId: string,
  note: string,
  reason: string,
): Promise<StudentNoteRecord> {
  if (!user.id) throw new Error('Tu sesión expiró.');
  const { data, error } = await supabase.rpc('v2_save_student_note_v2', {
    p_group_id: groupId,
    p_student_id: studentId,
    p_note: note,
    p_reason: reason || null,
  });
  if (error) throw new Error(`No se pudo guardar la observación: ${errorMessage(error)}`);
  return data as StudentNoteRecord;
}

export function calculateStudent360(data: Student360Data): Student360Calculation {
  const selectedPeriodId = recommendedPeriodId(data.detail.periods);
  const periodCalculation = calculateGradebook(data.detail, selectedPeriodId);
  const courseCalculation = calculateGradebook(data.detail, null);
  const current = periodCalculation.students.find((row) => row.student.id === data.student.id)
    || courseCalculation.students.find((row) => row.student.id === data.student.id);
  const course = courseCalculation.students.find((row) => row.student.id === data.student.id);

  if (!current || !course) throw new Error('TEDVIO no pudo calcular el expediente del alumno.');

  const trajectory: StudentPeriodTrajectory[] = [];
  let previousGrade: number | null = null;
  for (const period of [...data.detail.periods].sort((a, b) => a.order_index - b.order_index)) {
    const calculation = calculateGradebook(data.detail, period.id);
    const student = calculation.students.find((row) => row.student.id === data.student.id);
    if (!student) continue;
    const grade = student.displayedGrade;
    const delta = grade != null && previousGrade != null ? grade - previousGrade : null;
    if (grade != null) previousGrade = grade;

    const periodExamIds = new Set(calculation.examSync.map((state) => state.exam.id));
    const studentExamIds = new Set(
      data.detail.omrResults
        .filter((result) => periodExamIds.has(result.exam_id) && resultMatchesStudent(result, data.student) && resultConfirmed(result))
        .map((result) => result.exam_id),
    );

    trajectory.push({
      period,
      grade,
      provisionalGrade: student.currentGrade,
      officialGrade: student.officialGrade,
      evidenceWeight: student.evidenceWeight,
      attendanceRate: student.attendanceRate,
      omrAverage: student.omrAverage,
      status: student.status,
      delta,
      pendingManual: calculation.manualItems.filter((item) => student.itemScores[item.id] == null).length,
      pendingOmr: calculation.examSync.filter((state) => !studentExamIds.has(state.exam.id)).length,
    });
  }

  const selectedPeriod = selectedPeriodId
    ? data.detail.periods.find((period) => period.id === selectedPeriodId) || null
    : null;

  const manualEvidence: StudentManualEvidence[] = periodCalculation.manualItems.map((item) => {
    const scoreRow = data.detail.scores.find((score) => score.item_id === item.id && score.student_id === data.student.id);
    const rawScore = scoreRow?.score == null ? null : numberValue(scoreRow.score);
    const normalizedScore = rawScore == null ? null : Math.max(0, Math.min(10, rawScore / Math.max(numberValue(item.max_score, 10), 0.0001) * 10));
    return {
      item,
      categoryName: data.detail.categories.find((category) => category.id === item.category_id)?.name || 'Evidencia',
      rawScore,
      normalizedScore,
      note: scoreRow?.note || '',
      status: rawScore == null ? 'pending' : 'captured',
    };
  });

  const omrEvidence: StudentOmrEvidence[] = periodCalculation.examSync.map((state) => {
    const matches = data.detail.omrResults.filter((result) => result.exam_id === state.exam.id && resultMatchesStudent(result, data.student));
    const active = latestResult(matches.filter((result) => !result.archived_at));
    const archived = latestResult(matches.filter((result) => Boolean(result.archived_at)));
    const result = active || archived;
    let status: StudentOmrEvidence['status'] = 'missing';
    if (result?.archived_at) status = 'archived';
    else if (result && resultConfirmed(result)) status = 'confirmed';
    else if (result) status = 'pending';
    return {
      examId: state.exam.id,
      title: state.exam.title,
      examDate: state.exam.exam_date,
      version: result?.version || null,
      score: result?.score == null ? null : numberValue(result.score),
      correctCount: result?.correct_count == null ? null : numberValue(result.correct_count),
      blankCount: result?.blank_count == null ? null : numberValue(result.blank_count),
      status,
      updatedAt: result?.updated_at || result?.created_at || null,
    };
  });

  const attendanceEvidence: StudentAttendanceEvidence[] = data.detail.attendanceSessions
    .filter((session) => dateInPeriod(session.attendance_date, selectedPeriod))
    .sort((a, b) => b.attendance_date.localeCompare(a.attendance_date))
    .map((session) => ({
      session,
      record: data.detail.attendanceRecords.find((record) => record.attendance_session_id === session.id && record.student_id === data.student.id) || null,
    }));

  const liveEvidence: StudentLiveEvidence[] = data.detail.liveSessions
    .filter((session) => dateInPeriod(session.created_at, selectedPeriod))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((session) => ({
      sessionId: session.id,
      date: session.created_at,
      participated: data.detail.participants.some((participant) => (
        participant.session_id === session.id
        && (
          participant.roster_student_id === data.student.id
          || (!participant.roster_student_id && normalizedEnrollment(participant.matricula) === normalizedEnrollment(data.student.enrollment))
        )
      )),
    }));

  const assignmentEvidence: StudentAssignmentEvidence[] = data.assignments
    .filter((assignment) => belongsToPeriod(assignment.period_id, assignment.opens_at || assignment.created_at, selectedPeriod))
    .map((assignment) => {
      const attempt = [...data.attempts]
        .filter((row) => row.assignment_id === assignment.id)
        .sort((a, b) => b.attempt_no - a.attempt_no)[0] || null;
      const normalizedScore = attempt?.percentage != null
        ? numberValue(attempt.percentage) / 10
        : attempt?.score != null && attempt?.max_score
          ? 10 * numberValue(attempt.score) / Math.max(numberValue(attempt.max_score), 0.0001)
          : null;
      return {
        assignment,
        attempt,
        normalizedScore,
        status: attempt?.status === 'submitted' ? 'submitted' : attempt ? 'in_progress' : 'missing',
      };
    });

  const minAttendance = numberValue(data.detail.settings.min_attendance, 80);
  const minGrade = numberValue(data.detail.settings.min_grade, 6);
  const pendingManual = manualEvidence.filter((item) => item.status === 'pending').length;
  const pendingOmr = omrEvidence.filter((item) => item.status === 'missing' || item.status === 'pending').length;
  const pendingAssignments = assignmentEvidence.filter((item) => item.assignment.status !== 'draft' && item.status !== 'submitted').length;
  const pendingCount = pendingManual + pendingOmr + pendingAssignments;

  const alerts: Student360Alert[] = [];
  if (current.displayedGrade == null) {
    alerts.push({ id: 'no-grade', tone: 'amber', title: 'Promedio todavía no disponible', detail: 'El periodo aún no contiene evidencia suficiente para calcular una calificación.', actionLabel: 'Abrir Libro', actionTo: `/gradebook/${data.detail.group.id}${selectedPeriodId ? `?period=${selectedPeriodId}` : ''}` });
  } else if (current.displayedGrade < minGrade) {
    alerts.push({ id: 'grade-risk', tone: 'red', title: 'Promedio debajo del umbral', detail: `Registra ${current.displayedGrade.toFixed(1)} y el umbral del grupo es ${minGrade.toFixed(1)}.`, actionLabel: 'Revisar evidencias', actionTo: `/gradebook/${data.detail.group.id}${selectedPeriodId ? `?period=${selectedPeriodId}` : ''}` });
  } else if (current.displayedGrade < minGrade + 1) {
    alerts.push({ id: 'grade-watch', tone: 'amber', title: 'Promedio en zona de atención', detail: `El promedio actual es ${current.displayedGrade.toFixed(1)}; conviene revisar las siguientes evidencias.` });
  }

  if (current.attendanceRate != null && current.attendanceRate < minAttendance) {
    alerts.push({ id: 'attendance-risk', tone: 'red', title: 'Asistencia debajo del mínimo', detail: `Registra ${current.attendanceRate.toFixed(0)}% y el umbral configurado es ${minAttendance.toFixed(0)}%.`, actionLabel: 'Abrir asistencia', actionTo: `/attendance/${data.detail.group.id}` });
  }

  if (pendingCount > 0) {
    alerts.push({ id: 'pending-evidence', tone: 'amber', title: `${pendingCount} evidencia${pendingCount === 1 ? '' : 's'} pendiente${pendingCount === 1 ? '' : 's'}`, detail: `${pendingManual} manuales · ${pendingOmr} OMR · ${pendingAssignments} tareas.` });
  }

  const latestDelta = [...trajectory].reverse().find((row) => row.delta != null)?.delta ?? null;
  if (latestDelta != null && latestDelta <= -0.5) {
    alerts.push({ id: 'downward-trend', tone: 'amber', title: 'Descenso entre periodos', detail: `La trayectoria más reciente bajó ${Math.abs(latestDelta).toFixed(1)} puntos.` });
  }

  if (!alerts.length) {
    alerts.push({ id: 'on-track', tone: 'green', title: 'Trayectoria en orden', detail: 'No hay alertas activas con los umbrales y la evidencia disponible.' });
  }

  const audit: Student360AuditEvent[] = [
    ...data.noteHistory.map((revision) => ({
      id: `note-${revision.id}`,
      kind: 'note' as const,
      title: revision.action === 'created' ? 'Observación creada' : 'Observación actualizada',
      detail: revision.current_note || 'Observación sin contenido.',
      reason: revision.reason || 'Sin motivo registrado',
      createdAt: revision.created_at,
    })),
    ...data.gradeRevisions.map((revision) => ({
      id: `grade-${revision.id}`,
      kind: 'grade' as const,
      title: 'Calificación modificada',
      detail: `Evidencia ${revision.entity_id}`,
      reason: revision.reason || 'Actualización académica',
      createdAt: revision.created_at,
    })),
    ...data.omrRevisions.map((revision) => ({
      id: `omr-${revision.id}`,
      kind: 'omr' as const,
      title: 'Resultado OMR corregido',
      detail: `Revisión ${revision.revision_no}`,
      reason: revision.reason || 'Corrección de lectura OMR',
      createdAt: revision.created_at,
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return {
    selectedPeriodId,
    selectedPeriod,
    current,
    course,
    periodCalculation,
    trajectory,
    alerts,
    nextAction: alerts.find((alert) => alert.tone === 'red') || alerts.find((alert) => alert.tone === 'amber') || alerts[0]!,
    manualEvidence,
    omrEvidence,
    attendanceEvidence,
    liveEvidence,
    assignmentEvidence,
    audit,
    pendingCount,
    minGrade,
    minAttendance,
  };
}

export function exportStudent360Csv(data: Student360Data, calculation: Student360Calculation): void {
  const rows: unknown[][] = [
    ['TEDVIO · Alumno 360°'],
    ['Alumno', data.student.full_name],
    ['Matrícula', data.student.enrollment],
    ['Grupo', data.detail.group.group_name || data.detail.group.name],
    [],
    ['Trayectoria por periodo'],
    ['Periodo', 'Estado', 'Promedio', 'Oficial', 'Asistencia', 'OMR', 'Peso con evidencia', 'Cambio'],
    ...calculation.trajectory.map((row) => [
      row.period.name,
      row.period.status,
      row.grade == null ? '' : row.grade.toFixed(2),
      row.officialGrade == null ? '' : row.officialGrade.toFixed(2),
      row.attendanceRate == null ? '' : `${row.attendanceRate.toFixed(1)}%`,
      row.omrAverage == null ? '' : row.omrAverage.toFixed(2),
      `${row.evidenceWeight.toFixed(1)}%`,
      row.delta == null ? '' : row.delta.toFixed(2),
    ]),
    [],
    ['Evidencias manuales'],
    ['Evidencia', 'Categoría', 'Fecha', 'Puntaje', 'Máximo', 'Normalizada', 'Estado'],
    ...calculation.manualEvidence.map((row) => [
      row.item.title,
      row.categoryName,
      row.item.item_date || '',
      row.rawScore ?? '',
      row.item.max_score,
      row.normalizedScore == null ? '' : row.normalizedScore.toFixed(2),
      row.status,
    ]),
    [],
    ['Evaluaciones OMR'],
    ['Evaluación', 'Fecha', 'Versión', 'Calificación', 'Estado'],
    ...calculation.omrEvidence.map((row) => [row.title, row.examDate, row.version || '', row.score ?? '', row.status]),
  ];

  const csv = `\ufeff${rows.map((row) => row.map(csvCell).join(',')).join('\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `TEDVIO_Alumno360_${data.student.enrollment || data.student.id}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
