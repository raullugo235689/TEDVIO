import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { AcademicPeriodRecord } from './exams';
import type { GroupRecord } from './types';

export interface PeriodTransition {
  event?: 'closed' | 'reopened' | string;
  at?: string | null;
  by?: string | null;
  reason?: string | null;
}

export interface AcademicPeriod extends AcademicPeriodRecord {
  closed_at?: string | null;
  reopened_at?: string | null;
  closed_snapshot?: PeriodSummary | null;
  transition_log?: PeriodTransition[] | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface PeriodStudentSummary {
  student_id: string;
  full_name?: string | null;
  enrollment?: string | null;
  grade?: number | null;
  evidence_weight?: number | null;
  attendance_rate?: number | null;
  omr_avg?: number | null;
}

export interface PeriodMessage {
  code?: string | null;
  label: string;
}

export interface PeriodSummary {
  period_id?: string | null;
  group_id?: string | null;
  name?: string | null;
  starts_on?: string | null;
  ends_on?: string | null;
  course_weight?: number | null;
  course_weight_total?: number | null;
  status?: 'open' | 'closed' | string | null;
  closed_at?: string | null;
  students?: number | null;
  student_rows?: PeriodStudentSummary[] | null;
  group_grade?: number | null;
  approval_rate?: number | null;
  min_grade?: number | null;
  students_without_grade?: number | null;
  category_weight?: number | null;
  evidence_weight?: number | null;
  missing_categories?: Array<{ id?: string; name?: string; kind?: string; weight?: number }> | null;
  manual_items?: number | null;
  manual_expected?: number | null;
  manual_captured?: number | null;
  manual_pending?: number | null;
  attendance_sessions?: number | null;
  attendance_records?: number | null;
  attendance_expected?: number | null;
  open_attendance?: number | null;
  exam_count?: number | null;
  exam_results?: number | null;
  omr_expected?: number | null;
  live_sessions?: number | null;
  issues?: PeriodMessage[] | null;
  warnings?: PeriodMessage[] | null;
  ready?: boolean | null;
}

export interface PeriodWorkspace {
  groups: GroupRecord[];
  periods: AcademicPeriod[];
}

export interface PeriodDraft {
  id?: string | null;
  groupId: string;
  name: string;
  startsOn: string;
  endsOn: string;
  courseWeight: number;
  orderIndex: number;
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message || 'Error desconocido');
  }
  return String(error || 'Error desconocido');
}

export function periodWorkspaceKey(userId?: string) {
  return ['teacher-period-workspace', userId || 'anonymous'] as const;
}

export function periodSummaryKey(userId?: string, periodId?: string | null) {
  return ['teacher-period-summary', userId || 'anonymous', periodId || 'none'] as const;
}

export async function fetchPeriodWorkspace(user: User): Promise<PeriodWorkspace> {
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

export async function fetchPeriodSummary(user: User, period: AcademicPeriod): Promise<PeriodSummary> {
  if (!user.id) throw new Error('Tu sesión expiró.');
  if (period.status === 'closed' && period.closed_snapshot) {
    return { ...period.closed_snapshot, status: 'closed', closed_at: period.closed_at };
  }
  const { data, error } = await supabase.rpc('v2_teacher_academic_period_summary', {
    p_period_id: period.id,
  });
  if (error) throw new Error(`No se pudo calcular el periodo: ${errorMessage(error)}`);
  return (data || {}) as PeriodSummary;
}

export async function saveAcademicPeriod(user: User, draft: PeriodDraft): Promise<AcademicPeriod> {
  if (!user.id) throw new Error('Tu sesión expiró.');
  const { data, error } = await supabase.rpc('v2_save_academic_period_v2', {
    p_period_id: draft.id || null,
    p_group_id: draft.groupId,
    p_name: draft.name,
    p_starts_on: draft.startsOn,
    p_ends_on: draft.endsOn,
    p_course_weight: draft.courseWeight,
    p_order_index: draft.orderIndex,
  });
  if (error) throw new Error(`No se pudo guardar el periodo: ${errorMessage(error)}`);
  return data as AcademicPeriod;
}

export async function createPeriodTemplate(user: User, groupId: string, startsOn: string, endsOn: string): Promise<AcademicPeriod[]> {
  if (!user.id) throw new Error('Tu sesión expiró.');
  const { data, error } = await supabase.rpc('v2_create_period_template_v2', {
    p_group_id: groupId,
    p_starts_on: startsOn,
    p_ends_on: endsOn,
  });
  if (error) throw new Error(`No se pudo crear la plantilla: ${errorMessage(error)}`);
  return (Array.isArray(data) ? data : []) as AcademicPeriod[];
}

export async function deleteAcademicPeriod(user: User, periodId: string): Promise<void> {
  if (!user.id) throw new Error('Tu sesión expiró.');
  const { error } = await supabase.rpc('v2_delete_academic_period_v2', { p_period_id: periodId });
  if (error) throw new Error(`No se pudo eliminar el periodo: ${errorMessage(error)}`);
}

export async function closeAcademicPeriod(user: User, periodId: string): Promise<PeriodSummary> {
  if (!user.id) throw new Error('Tu sesión expiró.');
  const { data, error } = await supabase.rpc('v2_teacher_close_academic_period', { p_period_id: periodId });
  if (error) throw new Error(`No se pudo cerrar el periodo: ${errorMessage(error)}`);
  return (data || {}) as PeriodSummary;
}

export async function reopenAcademicPeriod(user: User, periodId: string, reason: string): Promise<PeriodSummary> {
  if (!user.id) throw new Error('Tu sesión expiró.');
  const { data, error } = await supabase.rpc('v2_teacher_reopen_academic_period', {
    p_period_id: periodId,
    p_reason: reason,
  });
  if (error) throw new Error(`No se pudo reabrir el periodo: ${errorMessage(error)}`);
  return (data || {}) as PeriodSummary;
}

export function periodsForGroup(workspace: PeriodWorkspace, groupId: string): AcademicPeriod[] {
  return workspace.periods
    .filter((period) => period.group_id === groupId)
    .sort((a, b) => a.order_index - b.order_index || a.starts_on.localeCompare(b.starts_on));
}

export function localDate(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export function periodProgress(period: AcademicPeriod, today = localDate()): number {
  if (today < period.starts_on) return 0;
  if (today > period.ends_on) return 100;
  const start = new Date(`${period.starts_on}T12:00:00`).getTime();
  const end = new Date(`${period.ends_on}T12:00:00`).getTime();
  const current = new Date(`${today}T12:00:00`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 100;
  return Math.max(0, Math.min(100, Math.round(((current - start) / (end - start)) * 100)));
}

export function currentPeriod(periods: AcademicPeriod[], today = localDate()): AcademicPeriod | null {
  return periods.find((period) => period.starts_on <= today && today <= period.ends_on)
    || periods.find((period) => period.status === 'open')
    || periods[0]
    || null;
}
