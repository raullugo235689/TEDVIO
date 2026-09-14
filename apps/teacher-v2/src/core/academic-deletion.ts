import { supabase } from './supabase';

export type AcademicDeleteKind = 'question' | 'group' | 'session' | 'program' | 'university';
export interface AcademicDeleteTarget { kind: AcademicDeleteKind; id: string; label: string }
export interface AcademicDeletePreview {
  id: string;
  kind: AcademicDeleteKind;
  label: string;
  version: string;
  can_delete: boolean;
  blockers: { resource: string; count: number }[];
  question_count: number;
  deleted: boolean;
}

export const academicDeleteLabels: Record<AcademicDeleteKind, string> = {
  question: 'pregunta', group: 'grupo', session: 'sesión', program: 'programa', university: 'institución',
};

const resourceLabels: Record<string, string> = {
  v2_programs: 'Programas académicos', v2_groups: 'Grupos', v2_sessions: 'Sesiones',
  v2_questions: 'Preguntas de sesiones', v2_prepared_items: 'Preguntas en cuestionarios preparados',
  v2_assignment_items: 'Preguntas en tareas', v2_paper_exam_questions: 'Preguntas en exámenes',
  v2_group_students: 'Alumnos del padrón', v2_roster_students: 'Alumnos del padrón anterior',
  v2_participants: 'Participantes', v2_responses: 'Respuestas', v2_response_receipts_v1: 'Comprobantes de respuesta',
  v2_attendance: 'Asistencias', v2_attendance_sessions: 'Listas de asistencia',
  v2_grade_categories: 'Categorías de calificación', v2_grade_items: 'Actividades de evaluación',
  v2_grade_scores: 'Calificaciones', v2_grades: 'Calificaciones', v2_academic_periods: 'Periodos académicos',
  v2_student_notes: 'Notas de alumnos', v2_paper_exams: 'Exámenes', v2_assignments: 'Tareas',
  v2_group_schedule_slots: 'Horarios', v2_group_alert_settings: 'Configuraciones de alertas',
  v2_session_check_runs: 'Pruebas previas de sesión', v2_session_health_events: 'Eventos de salud de la sesión',
};

export function deletionBlockerLabel(resource: string): string {
  if (resource === 'live_session') return 'La sesión está en vivo: ciérrala antes de intentar eliminarla';
  return resourceLabels[resource] || 'Otros registros vinculados';
}

export async function requestAcademicDeletion(target: AcademicDeleteTarget, version: string | null = null): Promise<AcademicDeletePreview> {
  if (!navigator.onLine) throw new Error('Necesitas conexión para revisar o eliminar. No se guardan eliminaciones pendientes.');
  const { data, error } = await supabase.rpc('v2_academic_delete', {
    p_kind: target.kind, p_id: target.id, p_expected_version: version,
  });
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') throw new Error('La eliminación segura todavía no está habilitada en el servidor. Falta aplicar la actualización de base de datos.');
    if (error.code === '55P03' || error.code === '40P01') throw new Error('El registro está siendo utilizado. Espera un momento y vuelve a revisar.');
    throw new Error(error.message || 'No se pudo confirmar la operación. Vuelve a revisar.');
  }
  if (!data || data.id !== target.id || data.kind !== target.kind || typeof data.label !== 'string'
    || typeof data.version !== 'string' || !data.version || typeof data.can_delete !== 'boolean'
    || !Array.isArray(data.blockers) || !data.blockers.every((item: { resource?: unknown; count?: unknown }) => item && typeof item.resource === 'string' && typeof item.count === 'number' && item.count > 0)
    || !Number.isInteger(data.question_count) || data.question_count < 0 || data.deleted !== (version !== null)) {
    throw new Error('El servidor no confirmó la operación. Actualiza la lista antes de volver a intentarlo.');
  }
  return data as AcademicDeletePreview;
}
