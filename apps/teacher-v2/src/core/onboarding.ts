import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type OnboardingStepId = 'group' | 'students' | 'attendance' | 'question' | 'session';

export interface OnboardingSnapshot {
  version: string;
  universities: number;
  programs: number;
  groups: number;
  students: number;
  attendance_sessions: number;
  questions: number;
  sessions: number;
  demo_ready: boolean;
  demo_group_id?: string | null;
  demo_session_id?: string | null;
  dismissed: boolean;
  last_step: string;
  completed_steps: string[];
  started_at?: string | null;
  completed_at?: string | null;
  completed: boolean;
  score: number;
}

export interface DemoWorkspaceResult {
  ok: boolean;
  group_id: string;
  session_id: string;
  code: string;
  students: number;
  questions: number;
}

export interface OnboardingStep {
  id: OnboardingStepId;
  title: string;
  detail: string;
  path: string;
  complete: boolean;
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message || 'Error desconocido');
  }
  return String(error || 'Error desconocido');
}

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function snapshotFrom(value: unknown): OnboardingSnapshot {
  const row = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const score = Math.max(0, Math.min(5, numberValue(row.score)));
  return {
    version: String(row.version || '2026.08.31.21'),
    universities: numberValue(row.universities),
    programs: numberValue(row.programs),
    groups: numberValue(row.groups),
    students: numberValue(row.students),
    attendance_sessions: numberValue(row.attendance_sessions),
    questions: numberValue(row.questions),
    sessions: numberValue(row.sessions),
    demo_ready: Boolean(row.demo_ready),
    demo_group_id: row.demo_group_id ? String(row.demo_group_id) : null,
    demo_session_id: row.demo_session_id ? String(row.demo_session_id) : null,
    dismissed: Boolean(row.dismissed),
    last_step: String(row.last_step || 'welcome'),
    completed_steps: Array.isArray(row.completed_steps) ? row.completed_steps.map(String) : [],
    started_at: row.started_at ? String(row.started_at) : null,
    completed_at: row.completed_at ? String(row.completed_at) : null,
    completed: Boolean(row.completed) || score >= 5,
    score,
  };
}

export function onboardingKey(userId?: string) {
  return ['teacher-onboarding', userId || 'anonymous'] as const;
}

export async function fetchOnboardingSnapshot(user: User): Promise<OnboardingSnapshot> {
  if (!user.id) throw new Error('Tu sesión expiró.');
  const { data, error } = await supabase.rpc('tedvio_onboarding_snapshot_v21');
  if (error) throw new Error(`No se pudo cargar la guía inicial: ${errorMessage(error)}`);
  return snapshotFrom(data);
}

export function onboardingSteps(snapshot: OnboardingSnapshot): OnboardingStep[] {
  return [
    {
      id: 'group',
      title: 'Crea tu primer grupo',
      detail: 'Define institución, programa, materia y ciclo escolar.',
      path: '/groups',
      complete: snapshot.groups > 0,
    },
    {
      id: 'students',
      title: 'Agrega tu lista de alumnos',
      detail: 'Importa matrícula y nombre desde una hoja de cálculo.',
      path: '/groups',
      complete: snapshot.students > 0,
    },
    {
      id: 'attendance',
      title: 'Registra tu primera asistencia',
      detail: 'Crea una lista y confirma que quedó guardada.',
      path: '/attendance',
      complete: snapshot.attendance_sessions > 0,
    },
    {
      id: 'question',
      title: 'Crea tu primer reactivo',
      detail: 'Prepara una pregunta reutilizable en Question Studio.',
      path: '/bank',
      complete: snapshot.questions > 0,
    },
    {
      id: 'session',
      title: 'Inicia tu primera clase',
      detail: 'Abre Modo Clase y trabaja con tu grupo en tiempo real.',
      path: '/classroom',
      complete: snapshot.sessions > 0,
    },
  ];
}

export async function saveOnboardingProgress(
  user: User,
  step: string,
  completedSteps: string[],
  dismissed: boolean,
): Promise<void> {
  if (!user.id) throw new Error('Tu sesión expiró.');
  const now = new Date().toISOString();
  const uniqueSteps = [...new Set(completedSteps.filter(Boolean))];
  const { error } = await supabase.from('tedvio_onboarding_progress').upsert({
    user_id: user.id,
    last_step: step || 'welcome',
    completed_steps: uniqueSteps,
    dismissed,
    completed_at: uniqueSteps.length >= 5 ? now : null,
    updated_at: now,
  }, { onConflict: 'user_id' });
  if (error) throw new Error(`No se pudo actualizar la guía: ${errorMessage(error)}`);
}

export async function trackActivation(
  user: User,
  eventType: string,
  context: Record<string, unknown> = {},
): Promise<void> {
  if (!user.id) return;
  const { error } = await supabase.from('tedvio_activation_events').insert({
    user_id: user.id,
    event_type: eventType.slice(0, 80),
    context: {
      ...context,
      product: 'teacher-v2',
      scope: 'launch-1.0',
      path: typeof window === 'undefined' ? '' : window.location.hash || window.location.pathname,
    },
  });
  if (error) console.warn('TEDVIO activation event', error.message);
}

export async function createDemoWorkspace(user: User): Promise<DemoWorkspaceResult> {
  if (!user.id) throw new Error('Tu sesión expiró.');
  const { data, error } = await supabase.rpc('tedvio_create_demo_v68');
  if (error) throw new Error(`No se pudo crear la demostración: ${errorMessage(error)}`);
  const result = data as DemoWorkspaceResult | null;
  if (!result?.session_id) throw new Error('TEDVIO no devolvió una sesión de demostración.');
  return result;
}

export async function resetDemoWorkspace(user: User): Promise<DemoWorkspaceResult> {
  if (!user.id) throw new Error('Tu sesión expiró.');
  const { data, error } = await supabase.rpc('tedvio_reset_demo_v21');
  if (error) throw new Error(`No se pudo reiniciar la demostración: ${errorMessage(error)}`);
  const result = data as DemoWorkspaceResult | null;
  if (!result?.session_id) throw new Error('TEDVIO no devolvió una sesión de demostración.');
  return result;
}
