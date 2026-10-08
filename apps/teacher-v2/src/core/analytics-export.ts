/**
 * Pure export builder: no Supabase imports, no browser globals, no private data
 * unless the authenticated teacher explicitly chooses an identified report.
 */
import type { AnalyticsData, AnalyticsExportScope } from './analytics';

export function buildAnalyticsCsvRows(
  data: AnalyticsData, scopeLabel: string, scope: AnalyticsExportScope = 'aggregate',
): unknown[][] {
  const groupLabels = new Map(data.groups.map((group) => [group.id, `${group.subject} · ${group.name}`]));
  const lines: unknown[][] = [
    ['TEDVIO ANALYTICS 4.0'], ['Alcance', scopeLabel],
    ['Datos personales', scope === 'identified' ? 'Incluidos por decisión docente' : 'No incluidos'],
    ['Desde', data.meta.from], ['Hasta', data.meta.to],
    ['Umbral de acierto', `${data.meta.accuracy_threshold}%`],
    ['Umbral de participación', `${data.meta.participation_threshold}%`],
    [],['SESIONES'],
    ['Fecha','Grupo','Sesión','Preguntas','Participantes activos','Participantes esperados','Respuestas','Acierto','Participación'],
    ...data.sessions.map((row) => [
      row.created_at.slice(0,10),groupLabels.get(row.group_id) || 'Grupo',row.title,row.questions,
      row.active_participants,row.expected_participants,row.responses,
      row.accuracy == null ? '—' : `${row.accuracy}%`,
      row.participation == null ? '—' : `${row.participation}%`,
    ]),
    [],['REACTIVOS'],
    ['Tema','Sesión','Posición','Reactivo','Tipo','Respuestas','Calificables','Correctas','Acierto'],
    ...data.questions.map((row) => [
      row.topic,row.session_title,row.position,row.prompt,row.question_type,
      row.responses,row.scored_responses,row.correct_responses,
      row.accuracy == null ? 'No calificable' : `${row.accuracy}%`,
    ]),
    [],['DOMINIO POR TEMA'],
    ['Tema','Reactivos','Respuestas','Calificables','Correctas','Acierto'],
    ...data.topics.map((row) => [
      row.topic,row.questions,row.responses,row.scored_responses,row.correct_responses,
      row.accuracy == null ? '—' : `${row.accuracy}%`,
    ]),
    [],['CALIDAD DE LA EVIDENCIA'],
    ['Participantes sin vincular',data.coverage.unmatched_participants],
    ['Sesiones sin respuestas',data.coverage.sessions_without_responses],
    ['Reactivos sin tema',data.coverage.questions_without_topic],
    ['Respuestas no calificables',data.coverage.non_scorable_responses],
  ];
  if (scope === 'identified') {
    lines.push([],['SEGUIMIENTO INDIVIDUAL · DATOS PERSONALES'],
      ['Matrícula','Alumno','Sesiones','Sesiones respondidas','Respuestas','Calificables','Correctas','Acierto','Participación','Alertas'],
      ...data.students.map((row) => [
        row.enrollment,row.full_name,row.sessions_total,row.sessions_answered,
        row.responses,row.scored_responses,row.correct_responses,
        row.accuracy == null ? '—' : `${row.accuracy}%`,
        row.participation == null ? '—' : `${row.participation}%`,
        row.alert_sessions,
      ]));
  }
  return lines;
}
