import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type BankQuestionType =
  | 'multiple_choice'
  | 'multiple_select'
  | 'true_false'
  | 'open_text'
  | 'numeric'
  | 'poll'
  | 'scale_5'
  | 'ordering'
  | 'hotspot';

export type QuestionDifficulty = 'baja' | 'media' | 'alta' | '';
export type BloomLevel = 'recordar' | 'comprender' | 'aplicar' | 'analizar' | 'evaluar' | 'crear' | '';
export type QuestionMediaType = 'image' | 'audio' | 'video' | '';

export interface BankQuestion {
  id: string;
  teacher_id: string;
  title: string;
  subject?: string | null;
  topic?: string | null;
  question_type: BankQuestionType;
  prompt: string;
  options: unknown;
  correct_answer?: unknown;
  media_url?: string | null;
  media_type?: QuestionMediaType | null;
  created_at: string;
  updated_at: string;
  explanation?: string | null;
  difficulty?: QuestionDifficulty | null;
  folder?: string | null;
  tags: string[];
  bloom?: BloomLevel | null;
  favorite: boolean;
  archived: boolean;
}

export interface BankMetric {
  bank_id: string;
  times_used: number;
  total_responses: number;
  correct_responses: number;
  accuracy_pct?: number | null;
  discrimination?: number | null;
}

export interface BankWorkspace {
  questions: BankQuestion[];
  metrics: Record<string, BankMetric>;
}

export interface BankQuestionDraft {
  id?: string;
  title: string;
  subject: string;
  topic: string;
  questionType: BankQuestionType;
  prompt: string;
  options: string[];
  correctAnswers: string[];
  explanation: string;
  difficulty: QuestionDifficulty;
  folder: string;
  tags: string[];
  bloom: BloomLevel;
  mediaUrl: string;
  mediaType: QuestionMediaType;
  favorite: boolean;
  archived: boolean;
}

export interface SessionLaunchResult {
  ok: boolean;
  session_id: string;
  code: string;
  questions: number;
}

export interface ClassroomLaunchOptions {
  competitive: boolean;
  teamMode: boolean;
  timerSeconds: number;
}

const optionTypes = new Set<BankQuestionType>([
  'multiple_choice',
  'multiple_select',
  'true_false',
  'poll',
  'scale_5',
  'ordering',
]);

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message || 'Error desconocido');
  }
  return String(error || 'Error desconocido');
}

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => text(value)).filter(Boolean))];
}

function normalizeOptions(draft: BankQuestionDraft): string[] {
  if (draft.questionType === 'true_false') return ['Verdadero', 'Falso'];
  if (draft.questionType === 'scale_5') return ['1', '2', '3', '4', '5'];
  if (!optionTypes.has(draft.questionType)) return [];
  return unique(draft.options);
}

function normalizeCorrectAnswer(draft: BankQuestionDraft, options: string[]): unknown {
  const selected = unique(draft.correctAnswers);
  if (draft.questionType === 'poll' || draft.questionType === 'scale_5') return null;
  if (draft.questionType === 'ordering') return options;
  if (draft.questionType === 'multiple_select') return selected.filter((answer) => options.includes(answer));
  if (draft.questionType === 'multiple_choice' || draft.questionType === 'true_false') {
    return selected.find((answer) => options.includes(answer)) || null;
  }
  return selected[0] || null;
}

function validateDraft(draft: BankQuestionDraft, options: string[], correctAnswer: unknown) {
  if (!text(draft.prompt)) throw new Error('Escribe el enunciado de la pregunta.');
  if (optionTypes.has(draft.questionType) && !['scale_5'].includes(draft.questionType) && options.length < 2) {
    throw new Error('Agrega al menos dos opciones.');
  }
  if (['multiple_choice', 'multiple_select', 'true_false'].includes(draft.questionType)) {
    const empty = correctAnswer == null || (Array.isArray(correctAnswer) && !correctAnswer.length);
    if (empty) throw new Error('Selecciona la respuesta correcta.');
  }
  if (draft.mediaType && !text(draft.mediaUrl)) throw new Error('Agrega la URL del recurso multimedia.');
}

export function emptyBankDraft(): BankQuestionDraft {
  return {
    title: '',
    subject: '',
    topic: '',
    questionType: 'multiple_choice',
    prompt: '',
    options: ['', '', '', ''],
    correctAnswers: [],
    explanation: '',
    difficulty: 'media',
    folder: '',
    tags: [],
    bloom: 'comprender',
    mediaUrl: '',
    mediaType: '',
    favorite: false,
    archived: false,
  };
}

export function bankDraftFromQuestion(question: BankQuestion): BankQuestionDraft {
  const options = Array.isArray(question.options) ? question.options.map((value) => String(value)) : [];
  const answers = Array.isArray(question.correct_answer)
    ? question.correct_answer.map((value) => String(value))
    : question.correct_answer == null
      ? []
      : [String(question.correct_answer)];
  return {
    id: question.id,
    title: question.title || '',
    subject: question.subject || '',
    topic: question.topic || '',
    questionType: question.question_type,
    prompt: question.prompt || '',
    options: options.length ? options : ['', '', '', ''],
    correctAnswers: answers,
    explanation: question.explanation || '',
    difficulty: question.difficulty || '',
    folder: question.folder || '',
    tags: question.tags || [],
    bloom: question.bloom || '',
    mediaUrl: question.media_url || '',
    mediaType: question.media_type || '',
    favorite: Boolean(question.favorite),
    archived: Boolean(question.archived),
  };
}

export function bankWorkspaceKey(userId?: string) {
  return ['teacher-bank', userId || 'anonymous'] as const;
}

export async function fetchBankWorkspace(user: User): Promise<BankWorkspace> {
  const [questionsResult, metricsResult] = await Promise.all([
    supabase
      .from('v2_question_bank')
      .select('*')
      .eq('teacher_id', user.id)
      .order('favorite', { ascending: false })
      .order('updated_at', { ascending: false }),
    supabase.rpc('v2_teacher_question_bank_metrics'),
  ]);

  if (questionsResult.error) throw new Error(`No se pudo cargar el banco: ${errorMessage(questionsResult.error)}`);
  if (metricsResult.error) throw new Error(`No se pudieron cargar las métricas: ${errorMessage(metricsResult.error)}`);

  const metrics: Record<string, BankMetric> = {};
  for (const row of (metricsResult.data || []) as BankMetric[]) metrics[row.bank_id] = row;
  return { questions: (questionsResult.data || []) as BankQuestion[], metrics };
}

export async function saveBankQuestion(user: User, draft: BankQuestionDraft): Promise<BankQuestion> {
  const options = normalizeOptions(draft);
  const correctAnswer = normalizeCorrectAnswer(draft, options);
  validateDraft(draft, options, correctAnswer);

  const prompt = text(draft.prompt);
  const payload = {
    title: text(draft.title) || prompt.slice(0, 110),
    subject: text(draft.subject) || null,
    topic: text(draft.topic) || null,
    question_type: draft.questionType,
    prompt,
    options,
    correct_answer: correctAnswer,
    media_url: text(draft.mediaUrl) || null,
    media_type: draft.mediaType || null,
    explanation: text(draft.explanation) || null,
    difficulty: draft.difficulty || null,
    folder: text(draft.folder) || null,
    tags: unique(draft.tags),
    bloom: draft.bloom || null,
    favorite: Boolean(draft.favorite),
    archived: Boolean(draft.archived),
    updated_at: new Date().toISOString(),
  };

  if (draft.id) {
    const { data, error } = await supabase
      .from('v2_question_bank')
      .update(payload)
      .eq('id', draft.id)
      .eq('teacher_id', user.id)
      .select('*')
      .single();
    if (error) throw new Error(`No se pudo actualizar la pregunta: ${errorMessage(error)}`);
    return data as BankQuestion;
  }

  const { data, error } = await supabase
    .from('v2_question_bank')
    .insert({ ...payload, teacher_id: user.id })
    .select('*')
    .single();
  if (error) throw new Error(`No se pudo guardar la pregunta: ${errorMessage(error)}`);
  return data as BankQuestion;
}

export async function duplicateBankQuestion(user: User, questionId: string): Promise<BankQuestion> {
  const { data: source, error: sourceError } = await supabase
    .from('v2_question_bank')
    .select('*')
    .eq('id', questionId)
    .eq('teacher_id', user.id)
    .single();
  if (sourceError) throw new Error(`No se pudo leer la pregunta: ${errorMessage(sourceError)}`);

  const question = source as BankQuestion;
  const { id: _id, created_at: _created, updated_at: _updated, ...copy } = question;
  const { data, error } = await supabase
    .from('v2_question_bank')
    .insert({
      ...copy,
      teacher_id: user.id,
      title: `${question.title || 'Pregunta'} · copia`,
      favorite: false,
      archived: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single();
  if (error) throw new Error(`No se pudo duplicar la pregunta: ${errorMessage(error)}`);
  return data as BankQuestion;
}

export async function updateBankQuestionFlags(
  user: User,
  questionId: string,
  changes: Partial<Pick<BankQuestion, 'favorite' | 'archived'>>,
): Promise<void> {
  const { error } = await supabase
    .from('v2_question_bank')
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq('id', questionId)
    .eq('teacher_id', user.id);
  if (error) throw new Error(`No se pudo actualizar la pregunta: ${errorMessage(error)}`);
}

export async function launchClassroomSession(
  user: User,
  groupId: string,
  questionIds: string[],
  options: ClassroomLaunchOptions = { competitive: true, teamMode: false, timerSeconds: 30 },
): Promise<SessionLaunchResult> {
  const ids = unique(questionIds);
  if (!groupId) throw new Error('Selecciona un grupo.');
  if (!ids.length) throw new Error('Selecciona al menos una pregunta.');
  const { data, error } = await supabase.rpc('tedvio_launch_first_session_v68', {
    p_group_id: groupId,
    p_bank_ids: ids,
  });
  if (error) throw new Error(`No se pudo crear la sesión: ${errorMessage(error)}`);
  const result = data as SessionLaunchResult;
  if (!result?.session_id) throw new Error('TEDVIO no devolvió la sesión creada.');

  const timerSeconds = Math.max(5, Math.min(600, Number(options.timerSeconds) || 30));
  const [sessionUpdate, questionUpdate] = await Promise.all([
    supabase
      .from('v2_sessions')
      .update({ competitive: Boolean(options.competitive), team_mode: Boolean(options.competitive && options.teamMode) })
      .eq('id', result.session_id)
      .eq('teacher_id', user.id),
    supabase
      .from('v2_questions')
      .update({ timer_seconds: timerSeconds })
      .eq('session_id', result.session_id),
  ]);
  if (sessionUpdate.error) throw new Error(`La sesión se creó, pero no se pudo aplicar la modalidad: ${errorMessage(sessionUpdate.error)}`);
  if (questionUpdate.error) throw new Error(`La sesión se creó, pero no se pudo aplicar el tiempo: ${errorMessage(questionUpdate.error)}`);
  return result;
}

export async function appendBankQuestionsToSession(
  user: User,
  sessionId: string,
  questionIds: string[],
  timerSeconds = 30,
): Promise<number> {
  const ids = unique(questionIds);
  if (!ids.length) throw new Error('Selecciona al menos una pregunta.');

  const [sessionResult, bankResult, positionResult] = await Promise.all([
    supabase
      .from('v2_sessions')
      .select('id,status')
      .eq('id', sessionId)
      .eq('teacher_id', user.id)
      .single(),
    supabase
      .from('v2_question_bank')
      .select('*')
      .eq('teacher_id', user.id)
      .in('id', ids),
    supabase
      .from('v2_questions')
      .select('position')
      .eq('session_id', sessionId)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (sessionResult.error) throw new Error(`No se pudo validar la sesión: ${errorMessage(sessionResult.error)}`);
  if (sessionResult.data.status === 'closed') throw new Error('La sesión está cerrada.');
  if (bankResult.error) throw new Error(`No se pudieron cargar las preguntas: ${errorMessage(bankResult.error)}`);
  if (positionResult.error) throw new Error(`No se pudo calcular la posición: ${errorMessage(positionResult.error)}`);

  const owned = new Map(((bankResult.data || []) as BankQuestion[]).map((question) => [question.id, question]));
  if (owned.size !== ids.length) throw new Error('Una o más preguntas no pertenecen a tu banco.');
  const start = Number(positionResult.data?.position || 0);
  const rows = ids.map((id, index) => {
    const question = owned.get(id)!;
    return {
      session_id: sessionId,
      bank_id: question.id,
      position: start + index + 1,
      prompt: question.prompt,
      question_type: question.question_type,
      options: question.options,
      correct_answer: question.correct_answer,
      media_url: question.media_url || null,
      media_type: question.media_type || null,
      timer_seconds: Math.max(5, Math.min(600, Number(timerSeconds) || 30)),
      status: 'queued',
      explanation: question.explanation || null,
      difficulty: question.difficulty || null,
    };
  });

  const { error } = await supabase.from('v2_questions').insert(rows);
  if (error) throw new Error(`No se pudieron agregar las preguntas: ${errorMessage(error)}`);
  return rows.length;
}
