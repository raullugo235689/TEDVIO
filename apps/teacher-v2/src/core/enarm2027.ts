import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';

export const ENARM_AREAS = [
  { key: 'medicina_interna', label: 'Medicina Interna', short: 'Medicina Interna', accent: '#4873df' },
  { key: 'pediatria', label: 'Pediatría', short: 'Pediatría', accent: '#17a797' },
  { key: 'ginecologia_obstetricia', label: 'Ginecología y Obstetricia', short: 'Gineco-Obstetricia', accent: '#bf6fbe' },
  { key: 'cirugia', label: 'Cirugía General', short: 'Cirugía', accent: '#ef9962' },
  { key: 'urgencias', label: 'Urgencias', short: 'Urgencias', accent: '#e16f79' },
  { key: 'medicina_familiar', label: 'Medicina Familiar', short: 'Medicina Familiar', accent: '#9079c7' },
  { key: 'salud_publica', label: 'Salud Pública', short: 'Salud Pública', accent: '#63a97f' },
] as const;

export type EnarmArea = (typeof ENARM_AREAS)[number]['key'];
export type EnarmMode = 'practica' | 'repaso' | 'simulador';
export type EnarmTab = 'panorama' | 'practica' | 'repaso' | 'simulador' | 'plan';

export interface EnarmCase {
  id: string;
  slug: string;
  area: EnarmArea;
  topic: string;
  difficulty: 'basico' | 'intermedio' | 'avanzado';
  vignette: string;
  prompt: string;
  options: [string, string, string, string];
}
export interface EnarmSettings {
  user_id: string;
  weekly_hours: number;
  target_pct: number;
  target_date: string | null;
  desired_specialty: string;
}
export interface EnarmAttempt {
  id: string;
  question_id: string;
  answer_index: number;
  is_correct: boolean;
  mode: EnarmMode;
  seconds_taken: number | null;
  answered_at: string;
}
export interface EnarmReview {
  user_id: string;
  question_id: string;
  stage: number;
  tries: number;
  successes: number;
  due_at: string;
  last_answered_at: string | null;
}
export interface EnarmNote {
  question_id: string;
  note: string;
  updated_at: string;
}
export interface EnarmAnswerResult {
  attempt_id: string;
  correct: boolean;
  correct_index: number;
  rationale: string;
  reference_hint: string;
  area: EnarmArea;
  topic: string;
  stage: number;
  due_at: string;
}
export interface EnarmWorkspace {
  cases: EnarmCase[];
  attempts: EnarmAttempt[];
  reviews: EnarmReview[];
  notes: EnarmNote[];
  settings: EnarmSettings;
}

export const DEFAULT_ENARM_SETTINGS = Object.freeze({
  weekly_hours: 6,
  target_pct: 80,
  target_date: null,
  desired_specialty: '',
});

function message(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) return String(error.message);
  return String(error || 'Error de conexión');
}

export function enarmWorkspaceKey(userId?: string) {
  return ['enarm2027-personal', userId || 'anonymous'] as const;
}

export function normalizeEnarmCases(value: unknown): EnarmCase[] {
  if (!Array.isArray(value)) return [];
  const known = new Set(ENARM_AREAS.map((a) => a.key));
  return value.filter((row): row is EnarmCase => {
    if (!row || typeof row !== 'object') return false;
    const q = row as Partial<EnarmCase>;
    return typeof q.id === 'string' && typeof q.slug === 'string'
      && known.has(q.area as EnarmArea)
      && typeof q.topic === 'string' && typeof q.vignette === 'string'
      && typeof q.prompt === 'string'
      && Array.isArray(q.options) && q.options.length === 4
      && q.options.every((option) => typeof option === 'string' && option.trim());
  }).map((row) => ({ ...row, options: [...row.options] as EnarmCase['options'] }));
}

export async function fetchEnarmWorkspace(user: User): Promise<EnarmWorkspace> {
  const [catalog, settings, attempts, reviews, notes] = await Promise.all([
    supabase.rpc('tedvio_enarm2027_catalog', { p_area: null, p_limit: 200 }),
    supabase.from('tedvio_enarm2027_settings').select('*').eq('user_id', user.id).maybeSingle(),
    supabase.from('tedvio_enarm2027_attempts')
      .select('id,question_id,answer_index,is_correct,mode,seconds_taken,answered_at')
      .eq('user_id', user.id).order('answered_at', { ascending: false }).limit(600),
    supabase.from('tedvio_enarm2027_review')
      .select('user_id,question_id,stage,tries,successes,due_at,last_answered_at')
      .eq('user_id', user.id),
    supabase.from('tedvio_enarm2027_notes')
      .select('question_id,note,updated_at').eq('user_id', user.id),
  ]);
  const err = [catalog.error, settings.error, attempts.error, reviews.error, notes.error].find(Boolean);
  if (err) throw new Error('No se pudo cargar tu espacio ENARM: ' + message(err));
  return {
    cases: normalizeEnarmCases(catalog.data),
    settings: { user_id: user.id, ...DEFAULT_ENARM_SETTINGS, ...(settings.data || {}) } as EnarmSettings,
    attempts: (attempts.data || []) as EnarmAttempt[],
    reviews: (reviews.data || []) as EnarmReview[],
    notes: (notes.data || []) as EnarmNote[],
  };
}

export async function saveEnarmSettings(user: User, input: Pick<EnarmSettings, 'weekly_hours' | 'target_pct' | 'target_date' | 'desired_specialty'>) {
  if (!Number.isInteger(input.weekly_hours) || input.weekly_hours < 1 || input.weekly_hours > 40) throw new Error('Elige entre 1 y 40 horas por semana.');
  if (!Number.isInteger(input.target_pct) || input.target_pct < 50 || input.target_pct > 100) throw new Error('La meta de acierto debe estar entre 50% y 100%.');
  if (input.target_date && !/^2027-\d{2}-\d{2}$/.test(input.target_date)) throw new Error('La fecha personal debe estar dentro de 2027.');
  if (input.desired_specialty.length > 100) throw new Error('Escribe una especialidad más breve.');
  const { data, error } = await supabase.from('tedvio_enarm2027_settings')
    .upsert({ user_id: user.id, ...input, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    .select('*').single();
  if (error) throw new Error('No se pudo guardar tu plan: ' + message(error));
  return data as EnarmSettings;
}

export async function submitEnarmAnswer(questionId: string, answerIndex: number, mode: EnarmMode, secondsTaken?: number) {
  if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3) throw new Error('Selecciona una respuesta válida.');
  const { data, error } = await supabase.rpc('tedvio_enarm2027_submit', {
    p_question_id: questionId,
    p_answer_index: answerIndex,
    p_mode: mode,
    p_seconds_taken: secondsTaken == null ? null : Math.max(0, Math.min(7200, Math.floor(secondsTaken))),
  });
  if (error) throw new Error('No se pudo registrar tu respuesta: ' + message(error));
  if (!data || typeof data !== 'object' || typeof data.correct !== 'boolean' || !Number.isInteger(data.correct_index)) {
    throw new Error('La confirmación de la respuesta no fue válida. Revisa tu historial antes de reintentar.');
  }
  return data as EnarmAnswerResult;
}

export async function saveEnarmNote(user: User, questionId: string, note: string) {
  const normalized = note.trim();
  if (normalized.length > 4000) throw new Error('La nota supera los 4,000 caracteres.');
  if (!normalized) {
    const { error } = await supabase.from('tedvio_enarm2027_notes')
      .delete().eq('user_id', user.id).eq('question_id', questionId);
    if (error) throw new Error(message(error));
    return;
  }
  const { error } = await supabase.from('tedvio_enarm2027_notes')
    .upsert({ user_id: user.id, question_id: questionId, note: normalized, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,question_id' });
  if (error) throw new Error('No se pudo guardar la nota: ' + message(error));
}
