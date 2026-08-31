import type { User } from '@supabase/supabase-js';
import { calculateGradebook, fetchGradebookDetail, type GradebookCalculation, type GradebookDetail, type GradebookOmrResult } from './gradebook';
import { supabase } from './supabase';
import type { GroupRecord, StudentRecord } from './types';

export type AcademicReportType = 'group' | 'roster' | 'attendance' | 'grades' | 'evaluations' | 'sessions';
export type ReportCell = string | number | null;

export interface ReportWorkspace {
  groups: GroupRecord[];
}

export interface ReportQuestion {
  id: string;
  session_id: string;
  prompt?: string | null;
  status?: string | null;
  question_type?: string | null;
}

export interface ReportResponse {
  question_id: string;
  participant_id: string;
  is_correct?: boolean | null;
  points?: number | null;
}

export interface ReportAssignment {
  id: string;
  teacher_id: string;
  group_id?: string | null;
  period_id?: string | null;
  title: string;
  status: string;
  opens_at?: string | null;
  closes_at?: string | null;
  created_at: string;
}

export interface ReportAttempt {
  id: string;
  assignment_id: string;
  group_student_id?: string | null;
  enrollment?: string | null;
  status: string;
  submitted_at?: string | null;
  score?: number | null;
  max_score?: number | null;
  percentage?: number | null;
  late?: boolean | null;
}

export interface ReportInstitution {
  id: string;
  name: string;
  report_display_name?: string | null;
  report_logo_path?: string | null;
  report_title?: string | null;
  report_approver_name?: string | null;
  report_approver_title?: string | null;
  report_approval_label?: string | null;
  report_document_code?: string | null;
}

export interface ReportProgram {
  id: string;
  name: string;
  university_id?: string | null;
}

export interface ReportData {
  detail: GradebookDetail;
  calculation: GradebookCalculation;
  questions: ReportQuestion[];
  responses: ReportResponse[];
  assignments: ReportAssignment[];
  attempts: ReportAttempt[];
  program: ReportProgram | null;
  institution: ReportInstitution | null;
  branding: ReportInstitution | null;
}

export interface ReportSummaryValue {
  label: string;
  value: string;
}

export interface AcademicReportSpec {
  type: AcademicReportType;
  title: string;
  subtitle: string;
  generatedAt: string;
  institution: string;
  program: string;
  subject: string;
  group: string;
  period: string;
  documentCode: string;
  approverName: string;
  approverTitle: string;
  approvalLabel: string;
  logoUrl: string;
  columns: string[];
  rows: ReportCell[][];
  summary: ReportSummaryValue[];
  note?: string;
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message || 'Error desconocido');
  }
  return String(error || 'Error desconocido');
}

function normalized(value?: string | null): string {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('es-MX');
}

function dateText(value?: string | null): string {
  if (!value) return '—';
  const normalizedValue = value.length === 10 ? `${value}T12:00:00` : value;
  const date = new Date(normalizedValue);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function dateInPeriod(value: string | null | undefined, data: ReportData): boolean {
  const period = data.calculation.period;
  if (!period) return true;
  if (!value) return false;
  const day = value.slice(0, 10);
  return day >= period.starts_on && day <= period.ends_on;
}

function monthMatches(value: string | null | undefined, month: string): boolean {
  return !month || Boolean(value && value.slice(0, 7) === month);
}

function resultMatchesStudent(result: GradebookOmrResult, student: StudentRecord): boolean {
  if (result.student_id) return result.student_id === student.id;
  return Boolean(result.enrollment && normalized(result.enrollment) === normalized(student.enrollment));
}

function confirmedResult(result: GradebookOmrResult): boolean {
  return !result.archived_at && (result.reviewed || result.review_status === 'confirmed');
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function grade(value?: number | null): string {
  return value == null || !Number.isFinite(Number(value)) ? '—' : Number(value).toFixed(1);
}

function percent(value?: number | null): string {
  return value == null || !Number.isFinite(Number(value)) ? '—' : `${Number(value).toFixed(0)}%`;
}

function statusLabel(status: string): string {
  if (status === 'risk') return 'En riesgo';
  if (status === 'watch') return 'Atención';
  if (status === 'ok') return 'En orden';
  return 'Sin evidencia';
}

function groupName(group: GroupRecord): string {
  return group.group_name || group.name || 'Grupo';
}

function reportBase(data: ReportData, type: AcademicReportType): Omit<AcademicReportSpec, 'title' | 'subtitle' | 'columns' | 'rows' | 'summary'> {
  const group = data.detail.group;
  const institution = data.branding?.report_display_name || data.institution?.name || group.university_name || group.university || 'INSTITUCIÓN ACADÉMICA';
  const logoPath = data.branding?.report_logo_path || '';
  const logoUrl = logoPath ? supabase.storage.from('tedvio-media-v2').getPublicUrl(logoPath).data.publicUrl || '' : '';
  return {
    type,
    generatedAt: new Date().toISOString(),
    institution,
    program: data.program?.name || group.program_name || group.program || '—',
    subject: group.subject || groupName(group),
    group: groupName(group),
    period: data.calculation.period?.name || 'Curso completo',
    documentCode: data.branding?.report_document_code || '',
    approverName: data.branding?.report_approver_name || '',
    approverTitle: data.branding?.report_approver_title || '',
    approvalLabel: data.branding?.report_approval_label || 'Vo. Bo.',
    logoUrl,
  };
}

export function reportWorkspaceKey(userId?: string) {
  return ['teacher-report-workspace', userId || 'anonymous'] as const;
}

export function reportDataKey(userId?: string, groupId?: string, periodId?: string | null) {
  return ['teacher-report-data', userId || 'anonymous', groupId || 'none', periodId || 'course'] as const;
}

export async function fetchReportWorkspace(user: User): Promise<ReportWorkspace> {
  const { data, error } = await supabase
    .from('v2_groups')
    .select('*')
    .eq('teacher_id', user.id)
    .eq('is_demo', false)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`No se pudieron cargar los grupos: ${errorMessage(error)}`);
  return { groups: (data || []) as GroupRecord[] };
}

export async function fetchReportData(user: User, groupId: string, periodId: string | null): Promise<ReportData> {
  const detail = await fetchGradebookDetail(user, groupId, periodId);
  const calculation = calculateGradebook(detail, periodId);
  const sessionIds = detail.liveSessions.map((session) => session.id);

  const [questionsResult, assignmentsResult, programResult, membershipsResult] = await Promise.all([
    sessionIds.length
      ? supabase.from('v2_questions').select('id,session_id,prompt,status,question_type').in('session_id', sessionIds).range(0, 9999)
      : Promise.resolve({ data: [], error: null }),
    supabase.from('v2_assignments').select('id,teacher_id,group_id,period_id,title,status,opens_at,closes_at,created_at').eq('group_id', groupId).eq('teacher_id', user.id).order('created_at').range(0, 9999),
    detail.group.program_id
      ? supabase.from('v2_programs').select('id,name,university_id').eq('id', detail.group.program_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from('tedvio_institution_memberships').select('institution_id,member_role,status').eq('user_id', user.id).eq('status', 'active'),
  ]);

  if (questionsResult.error) throw new Error(`No se pudieron cargar las preguntas de clase: ${errorMessage(questionsResult.error)}`);
  if (assignmentsResult.error) throw new Error(`No se pudieron cargar las tareas: ${errorMessage(assignmentsResult.error)}`);
  if (programResult.error) throw new Error(`No se pudo cargar el programa académico: ${errorMessage(programResult.error)}`);
  if (membershipsResult.error) throw new Error(`No se pudo cargar la vinculación institucional: ${errorMessage(membershipsResult.error)}`);

  const questions = (questionsResult.data || []) as ReportQuestion[];
  const assignments = (assignmentsResult.data || []) as ReportAssignment[];
  const questionIds = questions.map((question) => question.id);
  const assignmentIds = assignments.map((assignment) => assignment.id);
  const institutionIds = (membershipsResult.data || []).map((membership) => membership.institution_id);
  const program = (programResult.data || null) as ReportProgram | null;

  const [responsesResult, attemptsResult, institutionResult, institutionsResult] = await Promise.all([
    questionIds.length
      ? supabase.from('v2_responses').select('question_id,participant_id,is_correct,points').in('question_id', questionIds).range(0, 9999)
      : Promise.resolve({ data: [], error: null }),
    assignmentIds.length
      ? supabase.from('v2_assignment_attempts').select('id,assignment_id,group_student_id,enrollment,status,submitted_at,score,max_score,percentage,late').in('assignment_id', assignmentIds).range(0, 9999)
      : Promise.resolve({ data: [], error: null }),
    program?.university_id
      ? supabase.from('v2_universities').select('id,name').eq('id', program.university_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    institutionIds.length
      ? supabase.from('tedvio_institutions').select('id,name,report_display_name,report_logo_path,report_title,report_approver_name,report_approver_title,report_approval_label,report_document_code').in('id', institutionIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (responsesResult.error) throw new Error(`No se pudieron cargar las respuestas de clase: ${errorMessage(responsesResult.error)}`);
  if (attemptsResult.error) throw new Error(`No se pudieron cargar las entregas: ${errorMessage(attemptsResult.error)}`);
  if (institutionResult.error) throw new Error(`No se pudo cargar la universidad: ${errorMessage(institutionResult.error)}`);
  if (institutionsResult.error) throw new Error(`No se pudo cargar la identidad institucional: ${errorMessage(institutionsResult.error)}`);

  const institution = (institutionResult.data || null) as ReportInstitution | null;
  const institutions = (institutionsResult.data || []) as ReportInstitution[];
  const targetName = normalized(institution?.name || detail.group.university_name || detail.group.university);
  const branding = institutions.find((row) => normalized(row.name) === targetName) || institutions[0] || null;

  return {
    detail,
    calculation,
    questions,
    responses: (responsesResult.data || []) as ReportResponse[],
    assignments,
    attempts: (attemptsResult.data || []) as ReportAttempt[],
    program,
    institution,
    branding,
  };
}

function filteredAttendanceSessions(data: ReportData, month: string) {
  return data.detail.attendanceSessions.filter((session) => dateInPeriod(session.attendance_date, data) && monthMatches(session.attendance_date, month));
}

function filteredLiveSessions(data: ReportData, month: string) {
  return data.detail.liveSessions.filter((session) => dateInPeriod(session.created_at, data) && monthMatches(session.created_at, month));
}

function filteredAssignments(data: ReportData, month: string) {
  return data.assignments.filter((assignment) => {
    const date = assignment.opens_at || assignment.created_at;
    return dateInPeriod(date, data) && monthMatches(date, month);
  });
}

export function buildAcademicReport(data: ReportData, type: AcademicReportType, month = ''): AcademicReportSpec {
  const base = reportBase(data, type);
  const students = data.detail.students;
  const calculationByStudent = new Map(data.calculation.students.map((row) => [row.student.id, row]));
  const monthLabel = month ? new Date(`${month}-01T12:00:00`).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }) : data.calculation.period?.name || 'curso completo';

  if (type === 'roster') {
    return {
      ...base,
      title: 'LISTA OFICIAL DE ALUMNOS',
      subtitle: `Padrón activo · ${base.period}`,
      columns: ['N.º', 'Matrícula', 'Nombre del alumno'],
      rows: students.map((student, index) => [index + 1, student.enrollment, student.full_name]),
      summary: [{ label: 'Alumnos activos', value: String(students.length) }],
    };
  }

  if (type === 'attendance') {
    const sessions = filteredAttendanceSessions(data, month);
    const sessionIds = new Set(sessions.map((session) => session.id));
    const records = data.detail.attendanceRecords.filter((record) => sessionIds.has(record.attendance_session_id));
    const code: Record<string, string> = { present: 'P', late: 'R', absent: 'F', justified: 'J' };
    const rows = students.map((student) => {
      const studentRecords = sessions.map((session) => records.find((record) => record.attendance_session_id === session.id && record.student_id === student.id));
      const attended = studentRecords.filter((record) => record && ['present', 'late', 'justified'].includes(record.status)).length;
      const rate = sessions.length ? Math.round(100 * attended / sessions.length) : null;
      return [student.enrollment, student.full_name, ...studentRecords.map((record) => record ? code[record.status] || '—' : '—'), rate == null ? '—' : `${rate}%`];
    });
    const recordCount = records.length;
    const attendanceRate = sessions.length && students.length ? Math.round(100 * records.filter((record) => ['present', 'late', 'justified'].includes(record.status)).length / Math.max(recordCount, 1)) : null;
    return {
      ...base,
      title: 'REGISTRO DE ASISTENCIA',
      subtitle: `Corte: ${monthLabel}`,
      columns: ['Matrícula', 'Alumno', ...sessions.map((session) => dateText(session.attendance_date)), 'Asistencia'],
      rows,
      summary: [
        { label: 'Listas incluidas', value: String(sessions.length) },
        { label: 'Registros', value: String(recordCount) },
        { label: 'Asistencia global', value: attendanceRate == null ? '—' : `${attendanceRate}%` },
      ],
      note: 'P = Presente · R = Retardo · F = Falta · J = Justificada',
    };
  }

  if (type === 'grades') {
    const categories = data.detail.categories;
    return {
      ...base,
      title: 'CONCENTRADO DE CALIFICACIONES',
      subtitle: `${base.period} · cálculo trazable por categoría`,
      columns: ['Matrícula', 'Alumno', ...categories.map((category) => `${category.name} ${Number(category.weight).toFixed(0)}%`), 'Promedio', 'Evidencia', 'Estado'],
      rows: students.map((student) => {
        const row = calculationByStudent.get(student.id);
        return [student.enrollment, student.full_name, ...categories.map((category) => grade(row?.categoryValues[category.id]?.value)), grade(row?.displayedGrade), row ? `${row.evidenceWeight.toFixed(0)}%` : '—', statusLabel(row?.status || 'no_evidence')];
      }),
      summary: [
        { label: 'Promedio del grupo', value: grade(data.calculation.groupAverage) },
        { label: 'Aprobación', value: data.calculation.approvalRate == null ? '—' : percent(data.calculation.approvalRate * 100) },
        { label: 'Sin promedio', value: String(data.calculation.studentsWithoutGrade) },
      ],
    };
  }

  if (type === 'evaluations') {
    const exams = data.calculation.examSync.map((state) => state.exam);
    const examIds = new Set(exams.map((exam) => exam.id));
    const results = data.detail.omrResults.filter((result) => examIds.has(result.exam_id) && confirmedResult(result));
    const assignments = filteredAssignments(data, month);
    const rows: ReportCell[][] = [];
    for (const student of students) {
      for (const exam of exams) {
        const result = results.find((row) => row.exam_id === exam.id && resultMatchesStudent(row, student));
        rows.push([student.enrollment, student.full_name, 'OMR', exam.title, dateText(exam.exam_date), result?.version || '—', result ? grade(result.score) : '—', result ? `${result.correct_count}/${exam.question_count}` : 'Sin resultado']);
      }
      for (const assignment of assignments) {
        const attempts = data.attempts.filter((attempt) => attempt.assignment_id === assignment.id && (attempt.group_student_id === student.id || normalized(attempt.enrollment) === normalized(student.enrollment)) && attempt.status === 'submitted');
        const attempt = [...attempts].sort((a, b) => numberValue(b.percentage) - numberValue(a.percentage))[0];
        const score = attempt?.percentage != null ? numberValue(attempt.percentage) / 10 : attempt?.score != null && attempt?.max_score ? 10 * numberValue(attempt.score) / Math.max(numberValue(attempt.max_score), 0.0001) : null;
        rows.push([student.enrollment, student.full_name, 'Tarea', assignment.title, dateText(assignment.opens_at || assignment.created_at), '—', grade(score), attempt ? (attempt.late ? 'Entregada tarde' : 'Entregada') : 'Sin entrega']);
      }
    }
    return {
      ...base,
      title: 'RESULTADOS DE EVALUACIONES',
      subtitle: `${base.period} · OMR confirmado y tareas digitales`,
      columns: ['Matrícula', 'Alumno', 'Fuente', 'Evaluación', 'Fecha', 'Versión', 'Calificación', 'Detalle'],
      rows,
      summary: [
        { label: 'Evaluaciones OMR', value: String(exams.length) },
        { label: 'Resultados confirmados', value: String(results.length) },
        { label: 'Tareas incluidas', value: String(assignments.length) },
      ],
    };
  }

  if (type === 'sessions') {
    const sessions = filteredLiveSessions(data, month);
    const rows = sessions.map((session) => {
      const participants = data.detail.participants.filter((participant) => participant.session_id === session.id);
      const questions = data.questions.filter((question) => question.session_id === session.id);
      const questionIds = new Set(questions.map((question) => question.id));
      const responses = data.responses.filter((response) => questionIds.has(response.question_id));
      const valid = responses.filter((response) => response.is_correct != null);
      const accuracy = valid.length ? Math.round(100 * valid.filter((response) => response.is_correct).length / valid.length) : null;
      return [dateText(session.created_at), session.id.slice(0, 8), session.status || '—', participants.length, questions.length, responses.length, accuracy == null ? '—' : `${accuracy}%`];
    });
    return {
      ...base,
      title: 'HISTORIAL DE SESIONES TEDVIO',
      subtitle: `Corte: ${monthLabel}`,
      columns: ['Fecha', 'Sesión', 'Estado', 'Participantes', 'Preguntas', 'Respuestas', 'Acierto'],
      rows,
      summary: [
        { label: 'Sesiones', value: String(sessions.length) },
        { label: 'Participaciones', value: String(sessions.reduce((sum, session) => sum + data.detail.participants.filter((participant) => participant.session_id === session.id).length, 0)) },
        { label: 'Respuestas', value: String(rows.reduce((sum, row) => sum + numberValue(row[5]), 0)) },
      ],
    };
  }

  const risk = data.calculation.students.filter((student) => student.status === 'risk').length;
  const watch = data.calculation.students.filter((student) => student.status === 'watch').length;
  return {
    ...base,
    title: 'REPORTE ACADÉMICO DEL GRUPO',
    subtitle: `${base.period} · resumen ejecutivo`,
    columns: ['Matrícula', 'Alumno', 'Promedio', 'Asistencia', 'OMR', 'Evidencia', 'Pendientes', 'Estado'],
    rows: data.calculation.students.map((student) => [student.student.enrollment, student.student.full_name, grade(student.displayedGrade), percent(student.attendanceRate), grade(student.omrAverage), `${student.evidenceWeight.toFixed(0)}%`, data.calculation.manualItems.filter((item) => student.itemScores[item.id] == null).length, statusLabel(student.status)]),
    summary: [
      { label: 'Alumnos', value: String(students.length) },
      { label: 'Promedio del grupo', value: grade(data.calculation.groupAverage) },
      { label: 'Aprobación', value: data.calculation.approvalRate == null ? '—' : percent(data.calculation.approvalRate * 100) },
      { label: 'En riesgo', value: String(risk) },
      { label: 'Atención', value: String(watch) },
    ],
  };
}

function csvCell(value: ReportCell): string {
  const text = value == null ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function safeName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'Reporte';
}

export function downloadAcademicReportCsv(spec: AcademicReportSpec): void {
  const metadata = [
    ['Institución', spec.institution],
    ['Programa', spec.program],
    ['Asignatura', spec.subject],
    ['Grupo', spec.group],
    ['Periodo', spec.period],
    ['Reporte', spec.title],
    ['Generado', new Date(spec.generatedAt).toLocaleString('es-MX')],
  ];
  const lines = [
    ...metadata.map((row) => row.map(csvCell).join(',')),
    '',
    spec.columns.map(csvCell).join(','),
    ...spec.rows.map((row) => row.map(csvCell).join(',')),
    '',
    ...spec.summary.map((row) => [row.label, row.value].map(csvCell).join(',')),
  ];
  const blob = new Blob([`\ufeff${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${safeName(spec.title)}_${safeName(spec.group)}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function htmlEscape(value: ReportCell): string {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character] || character));
}

export function printAcademicReport(spec: AcademicReportSpec): void {
  const logo = spec.logoUrl ? `<img src="${htmlEscape(spec.logoUrl)}" alt="Logotipo">` : '<div class="logo-fallback">TEDVIO</div>';
  const summary = spec.summary.map((item) => `<div><span>${htmlEscape(item.label)}</span><b>${htmlEscape(item.value)}</b></div>`).join('');
  const headers = spec.columns.map((column) => `<th>${htmlEscape(column)}</th>`).join('');
  const rows = spec.rows.map((row) => `<tr>${row.map((cell) => `<td>${htmlEscape(cell)}</td>`).join('')}</tr>`).join('');
  const approval = spec.approverName ? `<footer><div><span>${htmlEscape(spec.approvalLabel)}</span><b>${htmlEscape(spec.approverName)}</b><small>${htmlEscape(spec.approverTitle)}</small></div></footer>` : '';
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${htmlEscape(spec.title)}</title><style>@page{size:landscape;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#142b4c;margin:0;font-size:10px}header{display:grid;grid-template-columns:100px 1fr auto;gap:18px;align-items:center;border-bottom:2px solid #17365e;padding-bottom:12px;margin-bottom:14px}header img{max-width:100px;max-height:60px}.logo-fallback{font-weight:900;font-size:20px;color:#2f69db}h1{font-size:17px;margin:3px 0}h2{font-size:12px;margin:0;color:#526985}.meta{text-align:right}.meta b,.meta span{display:block}.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin:10px 0}.summary div{border:1px solid #d8e1ed;border-radius:7px;padding:7px}.summary span,.summary b{display:block}.summary span{color:#667891;font-size:8px}.summary b{font-size:13px;margin-top:2px}table{width:100%;border-collapse:collapse;table-layout:auto}th,td{border:1px solid #cfd9e7;padding:5px;vertical-align:top}th{background:#eef4fb;font-size:8px;text-align:left}tbody tr:nth-child(even){background:#f8fafd}.note{margin-top:8px;color:#667891}footer{display:flex;justify-content:flex-end;margin-top:30px}footer div{min-width:220px;text-align:center;border-top:1px solid #17365e;padding-top:6px}footer span,footer b,footer small{display:block}footer small{color:#667891}@media print{button{display:none}}</style></head><body><header>${logo}<div><small>${htmlEscape(spec.institution)}</small><h1>${htmlEscape(spec.title)}</h1><h2>${htmlEscape(spec.subtitle)}</h2></div><div class="meta"><b>${htmlEscape(spec.subject)} · ${htmlEscape(spec.group)}</b><span>${htmlEscape(spec.program)}</span><span>${htmlEscape(spec.period)}</span>${spec.documentCode ? `<span>${htmlEscape(spec.documentCode)}</span>` : ''}</div></header><section class="summary">${summary}</section><table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>${spec.note ? `<p class="note">${htmlEscape(spec.note)}</p>` : ''}${approval}<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250));<\/script></body></html>`;
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) {
    URL.revokeObjectURL(url);
    throw new Error('El navegador bloqueó la vista de impresión. Permite ventanas emergentes para TEDVIO.');
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
