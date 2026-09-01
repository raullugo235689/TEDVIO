import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { AcademicPeriod } from './periods';
import type { GroupRecord } from './types';

export interface AnalyticsFilters {
  groupId: string | null;
  periodId: string | null;
  from: string;
  to: string;
  timezone: string;
  accuracyThreshold: number;
  participationThreshold: number;
}

export interface AnalyticsMeta {
  group_id?: string | null;
  period_id?: string | null;
  from: string;
  to: string;
  timezone?: string;
  accuracy_threshold: number;
  participation_threshold: number;
}

export interface AnalyticsOverview {
  sessions: number;
  active_groups: number;
  responses: number;
  participations: number;
  accuracy?: number | null;
  participation?: number | null;
}

export interface AnalyticsGroup {
  id: string;
  name: string;
  subject: string;
  sessions: number;
  responses: number;
  accuracy?: number | null;
  participation?: number | null;
  last_session_at?: string | null;
}

export interface AnalyticsSession {
  id: string;
  group_id: string;
  code: string;
  title: string;
  created_at: string;
  started_at?: string | null;
  closed_at?: string | null;
  questions: number;
  scored_questions: number;
  participants: number;
  linked_participants: number;
  unmatched_participants: number;
  expected_participants: number;
  active_participants: number;
  linked_active_participants: number;
  responses: number;
  scored_responses: number;
  correct_responses: number;
  accuracy?: number | null;
  response_rate?: number | null;
  roster_reach?: number | null;
  participation?: number | null;
}

export interface AnalyticsQuestion {
  id: string;
  session_id: string;
  group_id: string;
  session_title: string;
  session_date: string;
  bank_id?: string | null;
  position: number;
  prompt: string;
  question_type: string;
  difficulty?: string | null;
  topic: string;
  responses: number;
  scored_responses: number;
  correct_responses: number;
  accuracy?: number | null;
}

export interface AnalyticsTopic {
  topic: string;
  questions: number;
  responses: number;
  scored_responses: number;
  correct_responses: number;
  accuracy?: number | null;
}

export interface AnalyticsCoverage {
  unmatched_participants: number;
  sessions_without_responses: number;
  questions_without_topic: number;
  non_scorable_responses: number;
}

export interface AnalyticsStudent {
  student_id: string;
  group_id: string;
  full_name: string;
  enrollment: string;
  sessions_total: number;
  sessions_joined: number;
  sessions_answered: number;
  responses: number;
  scored_responses: number;
  correct_responses: number;
  participation?: number | null;
  accuracy?: number | null;
  alert_sessions: number;
  low_participation_sessions: number;
  low_accuracy_sessions: number;
}

export interface AnalyticsData {
  meta: AnalyticsMeta;
  overview: AnalyticsOverview;
  groups: AnalyticsGroup[];
  sessions: AnalyticsSession[];
  questions: AnalyticsQuestion[];
  topics: AnalyticsTopic[];
  students: AnalyticsStudent[];
  coverage: AnalyticsCoverage;
}

export interface AnalyticsWorkspace {
  groups: GroupRecord[];
  periods: AcademicPeriod[];
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message || 'Error desconocido');
  }
  return String(error || 'Error desconocido');
}

export function analyticsWorkspaceKey(userId?: string) {
  return ['teacher-analytics-workspace', userId || 'anonymous'] as const;
}

export function analyticsDataKey(userId: string | undefined, filters: AnalyticsFilters) {
  return [
    'teacher-analytics-data',
    userId || 'anonymous',
    filters.groupId || 'all',
    filters.periodId || 'custom',
    filters.from,
    filters.to,
    filters.timezone,
    filters.accuracyThreshold,
    filters.participationThreshold,
  ] as const;
}

export async function fetchAnalyticsWorkspace(user: User): Promise<AnalyticsWorkspace> {
  const [groupsResult, periodsResult] = await Promise.all([
    supabase
      .from('v2_groups')
      .select('*')
      .eq('teacher_id', user.id)
      .eq('is_demo', false)
      .order('created_at', { ascending: false }),
    supabase
      .from('v2_academic_periods')
      .select('*')
      .eq('teacher_id', user.id)
      .order('group_id')
      .order('order_index'),
  ]);
  if (groupsResult.error) throw new Error(`No se pudieron cargar los grupos: ${errorMessage(groupsResult.error)}`);
  if (periodsResult.error) throw new Error(`No se pudieron cargar los periodos: ${errorMessage(periodsResult.error)}`);
  return {
    groups: (groupsResult.data || []) as GroupRecord[],
    periods: (periodsResult.data || []) as AcademicPeriod[],
  };
}

export async function fetchAnalyticsData(user: User, filters: AnalyticsFilters): Promise<AnalyticsData> {
  if (!user.id) throw new Error('Tu sesión expiró.');
  const { data, error } = await supabase.rpc('v2_teacher_classroom_analytics', {
    p_group_id: filters.groupId,
    p_period_id: filters.periodId,
    p_from: filters.periodId ? null : filters.from,
    p_to: filters.periodId ? null : filters.to,
    p_timezone: filters.timezone,
    p_accuracy_threshold: filters.accuracyThreshold,
    p_participation_threshold: filters.participationThreshold,
  });
  if (error) throw new Error(`No se pudo preparar la analítica: ${errorMessage(error)}`);
  const result = (data || {}) as Partial<AnalyticsData>;
  return {
    meta: result.meta || {
      from: filters.from,
      to: filters.to,
      accuracy_threshold: filters.accuracyThreshold,
      participation_threshold: filters.participationThreshold,
    },
    overview: result.overview || { sessions: 0, active_groups: 0, responses: 0, participations: 0 },
    groups: Array.isArray(result.groups) ? result.groups : [],
    sessions: Array.isArray(result.sessions) ? result.sessions : [],
    questions: Array.isArray(result.questions) ? result.questions : [],
    topics: Array.isArray(result.topics) ? result.topics : [],
    students: Array.isArray(result.students) ? result.students : [],
    coverage: result.coverage || { unmatched_participants: 0, sessions_without_responses: 0, questions_without_topic: 0, non_scorable_responses: 0 },
  };
}

function csvCell(value: unknown): string {
  const raw = String(value ?? '');
  const safe = /^[\t\r\n ]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

function safeName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 70) || 'Analytics';
}

export function downloadAnalyticsCsv(data: AnalyticsData, scopeLabel: string): void {
  const groupLabels = new Map(data.groups.map((group) => [group.id, `${group.subject} · ${group.name}`]));
  const lines: unknown[][] = [
    ['TEDVIO ANALYTICS 2.x'],
    ['Alcance', scopeLabel],
    ['Desde', data.meta.from],
    ['Hasta', data.meta.to],
    ['Umbral de acierto', `${data.meta.accuracy_threshold}%`],
    ['Umbral de participación', `${data.meta.participation_threshold}%`],
    [],
    ['SESIONES'],
    ['Fecha', 'Grupo', 'Sesión', 'Código', 'Preguntas', 'Participantes activos', 'Participantes esperados', 'Respuestas', 'Acierto', 'Participación'],
    ...data.sessions.map((row) => [row.created_at.slice(0, 10), groupLabels.get(row.group_id) || row.group_id, row.title, row.code, row.questions, row.active_participants, row.expected_participants, row.responses, row.accuracy == null ? '—' : `${row.accuracy}%`, row.participation == null ? '—' : `${row.participation}%`]),
  ];
  if (data.questions.length) {
    lines.push([], ['REACTIVOS'], ['Fecha', 'Sesión', 'Posición', 'Reactivo', 'Tipo', 'Respuestas', 'Correctas', 'Acierto']);
    lines.push(...data.questions.map((row) => [row.session_date.slice(0, 10), row.session_title, row.position, row.prompt, row.question_type, row.responses, row.correct_responses, row.accuracy == null ? 'No calificable' : `${row.accuracy}%`]));
  }
  if (data.students.length) {
    lines.push([], ['SEGUIMIENTO POR ALUMNO'], ['Matrícula', 'Alumno', 'Sesiones', 'Sesiones respondidas', 'Respuestas', 'Acierto', 'Participación', 'Alertas', 'Baja participación', 'Bajo acierto']);
    lines.push(...data.students.map((row) => [row.enrollment, row.full_name, row.sessions_total, row.sessions_answered, row.responses, row.accuracy == null ? '—' : `${row.accuracy}%`, row.participation == null ? '—' : `${row.participation}%`, row.alert_sessions, row.low_participation_sessions, row.low_accuracy_sessions]));
  }
  if (data.topics.length) {
    lines.push([], ['DOMINIO POR TEMA'], ['Tema', 'Reactivos', 'Respuestas', 'Correctas', 'Acierto']);
    lines.push(...data.topics.map((row) => [row.topic, row.questions, row.responses, row.correct_responses, row.accuracy == null ? '—' : `${row.accuracy}%`]));
  }
  const blob = new Blob([`\ufeff${lines.map((row) => row.map(csvCell).join(',')).join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `TEDVIO_Analytics_${safeName(scopeLabel)}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function htmlEscape(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character] || character));
}

export function printAnalyticsReport(data: AnalyticsData, scopeLabel: string): void {
  const metric = (label: string, value: unknown) => `<div><span>${htmlEscape(label)}</span><b>${htmlEscape(value)}</b></div>`;
  const groupLabels = new Map(data.groups.map((group) => [group.id, `${group.subject} · ${group.name}`]));
  const sessionRows = data.sessions.map((row) => `<tr><td>${htmlEscape(row.created_at.slice(0, 10))}</td><td>${htmlEscape(groupLabels.get(row.group_id) || row.group_id)}</td><td>${htmlEscape(row.title)}</td><td>${htmlEscape(row.questions)}</td><td>${htmlEscape(row.responses)}</td><td>${htmlEscape(row.accuracy == null ? '—' : `${row.accuracy}%`)}</td><td>${htmlEscape(row.participation == null ? '—' : `${row.participation}%`)}</td></tr>`).join('');
  const questionRows = data.questions.slice(0, 20).map((row) => `<tr><td>${htmlEscape(row.topic)}</td><td>${htmlEscape(row.prompt)}</td><td>${htmlEscape(row.responses)}</td><td>${htmlEscape(row.accuracy == null ? 'No calificable' : `${row.accuracy}%`)}</td></tr>`).join('');
  const studentRows = data.students.filter((row) => row.alert_sessions > 0).slice(0, 30).map((row) => `<tr><td>${htmlEscape(row.enrollment)}</td><td>${htmlEscape(row.full_name)}</td><td>${htmlEscape(row.participation == null ? '—' : `${row.participation}%`)}</td><td>${htmlEscape(row.accuracy == null ? '—' : `${row.accuracy}%`)}</td><td>${htmlEscape(row.alert_sessions)}</td></tr>`).join('');
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>TEDVIO Analytics</title><style>@page{size:landscape;margin:12mm}*{box-sizing:border-box}body{margin:0;color:#142b4c;font:10px Arial,sans-serif}header{display:flex;justify-content:space-between;gap:20px;padding-bottom:12px;border-bottom:2px solid #17365e}h1{margin:4px 0;font-size:20px}header p{margin:0;color:#60738d}.brand{color:#2f69db;font-size:20px;font-weight:900}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:14px 0}.summary div{padding:9px;border:1px solid #d8e1ed;border-radius:8px}.summary span,.summary b{display:block}.summary span{color:#667891;font-size:8px}.summary b{margin-top:3px;font-size:15px}h2{margin:18px 0 7px;font-size:13px}table{width:100%;border-collapse:collapse}th,td{padding:5px;border:1px solid #d2dce9;text-align:left;vertical-align:top}th{background:#edf3fb;font-size:8px}tbody tr:nth-child(even){background:#f8fafd}.meta{text-align:right}.meta span{display:block}.note{margin-top:14px;color:#667891;font-size:8px}</style></head><body><header><div><div class="brand">TEDVIO</div><h1>ANALÍTICA ACADÉMICA</h1><p>${htmlEscape(scopeLabel)}</p></div><div class="meta"><span>${htmlEscape(data.meta.from)} — ${htmlEscape(data.meta.to)}</span><span>Umbrales: acierto ${htmlEscape(data.meta.accuracy_threshold)}% · participación ${htmlEscape(data.meta.participation_threshold)}%</span><span>Generado ${htmlEscape(new Date().toLocaleString('es-MX'))}</span></div></header><section class="summary">${metric('Sesiones', data.overview.sessions)}${metric('Participación', data.overview.participation == null ? '—' : `${data.overview.participation}%`)}${metric('Acierto', data.overview.accuracy == null ? '—' : `${data.overview.accuracy}%`)}${metric('Respuestas', data.overview.responses)}</section><h2>Sesiones incluidas</h2><table><thead><tr><th>Fecha</th><th>Grupo</th><th>Sesión</th><th>Preguntas</th><th>Respuestas</th><th>Acierto</th><th>Participación</th></tr></thead><tbody>${sessionRows}</tbody></table>${questionRows ? `<h2>Reactivos con menor dominio</h2><table><thead><tr><th>Tema</th><th>Reactivo</th><th>Respuestas</th><th>Acierto</th></tr></thead><tbody>${questionRows}</tbody></table>` : ''}${studentRows ? `<h2>Seguimiento sugerido</h2><table><thead><tr><th>Matrícula</th><th>Alumno</th><th>Participación</th><th>Acierto</th><th>Alertas</th></tr></thead><tbody>${studentRows}</tbody></table>` : ''}<p class="note">Las alertas son descriptivas y deben interpretarse junto con el contexto académico del estudiante.</p></body></html>`;
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, '_blank');
  if (!opened) {
    URL.revokeObjectURL(url);
    throw new Error('El navegador bloqueó la vista de impresión. Permite ventanas emergentes para TEDVIO.');
  }
  const triggerPrint = () => window.setTimeout(() => {
    try {
      opened.focus();
      opened.print();
    } catch {
      // La pestaña permanece disponible aunque el navegador bloquee la impresión automática.
    }
  }, 250);
  if (opened.document.readyState === 'complete') triggerPrint();
  else opened.addEventListener('load', triggerPrint, { once: true });
  try { opened.opener = null; } catch { /* Navegadores con aislamiento estricto. */ }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
