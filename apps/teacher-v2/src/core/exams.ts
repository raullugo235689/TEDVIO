import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { GroupRecord, StudentRecord } from './types';
import type { BankQuestion } from './bank';

export type ExamStatus = 'draft' | 'ready' | 'closed' | 'archived';
export type ExamVersionStrategy = 'same' | 'balanced';
export type ExamSourceMode = 'key_only' | 'bank';

export interface PaperExam {
  id: string;
  teacher_id: string;
  group_id?: string | null;
  title: string;
  subject?: string | null;
  question_count: number;
  option_count: number;
  versions: string[];
  answer_keys: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  question_metadata: Record<string, unknown>;
  period_id?: string | null;
  exam_date: string;
  status: ExamStatus;
  instructions?: string | null;
  passing_score: number;
  max_score: number;
  version_strategy: ExamVersionStrategy;
  source_mode: ExamSourceMode;
  ready_at?: string | null;
  closed_at?: string | null;
  archived_at?: string | null;
  grade_item_id?: string | null;
}

export interface PaperExamQuestion {
  id: string;
  exam_id: string;
  teacher_id: string;
  version: string;
  position: number;
  source_position: number;
  bank_question_id?: string | null;
  prompt: string;
  question_type: string;
  options: unknown;
  correct_answer: unknown;
  explanation?: string | null;
  subject?: string | null;
  topic?: string | null;
  difficulty?: string | null;
  bloom?: string | null;
  media_url?: string | null;
  media_type?: string | null;
  points: number;
  created_at: string;
  updated_at: string;
}

export interface PaperExamResult {
  id: string;
  exam_id: string;
  teacher_id: string;
  student_id?: string | null;
  enrollment?: string | null;
  student_name?: string | null;
  version: string;
  answers: unknown;
  correct_count: number;
  blank_count: number;
  score: number;
  reviewed: boolean;
  created_at: string;
  updated_at: string;
}

export interface AcademicPeriodRecord {
  id: string;
  teacher_id: string;
  group_id: string;
  name: string;
  starts_on: string;
  ends_on: string;
  course_weight: number;
  order_index: number;
  status: 'open' | 'closed';
}

export interface ExamResultSummary {
  examId: string;
  results: number;
  reviewed: number;
  average: number | null;
  passRate: number | null;
}

export interface ExamWorkspace {
  exams: PaperExam[];
  groups: GroupRecord[];
  periods: AcademicPeriodRecord[];
  bankQuestions: BankQuestion[];
  summaries: Record<string, ExamResultSummary>;
}

export interface ExamDetail {
  exam: PaperExam;
  questions: PaperExamQuestion[];
  results: PaperExamResult[];
  group: GroupRecord | null;
  period: AcademicPeriodRecord | null;
  roster: StudentRecord[];
}

export interface ExamDraftQuestion {
  bankQuestionId: string;
  points: number;
}

export interface ExamDraft {
  id?: string;
  title: string;
  subject: string;
  groupId: string;
  periodId: string;
  examDate: string;
  instructions: string;
  passingScore: number;
  maxScore: number;
  versions: string[];
  versionStrategy: ExamVersionStrategy;
  questions: ExamDraftQuestion[];
}

export interface ExamBlueprintItem {
  bank_question_id: string;
  source_position: number;
  prompt: string;
  question_type: 'multiple_choice' | 'true_false';
  options: string[];
  correct_answer: string;
  explanation: string;
  subject: string;
  topic: string;
  difficulty: string;
  bloom: string;
  media_url: string;
  media_type: string;
  points: number;
}

export interface ExamItemAnalytics {
  key: string;
  sourcePosition: number;
  bankQuestionId?: string | null;
  prompt: string;
  topic: string;
  total: number;
  correct: number;
  blank: number;
  correctRate: number | null;
  blankRate: number | null;
}

export interface ExamVersionAnalytics {
  version: string;
  results: number;
  average: number | null;
  passRate: number | null;
}

export interface ExamAnalytics {
  results: number;
  reviewed: number;
  reviewedRate: number | null;
  average: number | null;
  median: number | null;
  passRate: number | null;
  versions: ExamVersionAnalytics[];
  items: ExamItemAnalytics[];
}

const compatibleTypes = new Set(['multiple_choice', 'true_false']);

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

function scalarText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  return String(value);
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort((a, b) => Number(a) - Number(b))
      .map((key) => String((value as Record<string, unknown>)[key] ?? ''));
  }
  return [];
}

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] ?? null : ((ordered[middle - 1] || 0) + (ordered[middle] || 0)) / 2;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function compatibleExamQuestion(question: BankQuestion): boolean {
  if (question.archived || !compatibleTypes.has(question.question_type)) return false;
  const options = Array.isArray(question.options) ? question.options.map(String).filter(Boolean) : [];
  const answer = scalarText(question.correct_answer);
  return options.length >= 2 && options.length <= 5 && Boolean(answer) && options.includes(answer);
}

export function versionLabels(count: number): string[] {
  return ['A', 'B', 'C'].slice(0, Math.max(1, Math.min(3, Math.round(count) || 1)));
}

export function emptyExamDraft(groupId = '', subject = ''): ExamDraft {
  return {
    title: '',
    subject,
    groupId,
    periodId: '',
    examDate: today(),
    instructions: '',
    passingScore: 6,
    maxScore: 10,
    versions: ['A'],
    versionStrategy: 'balanced',
    questions: [],
  };
}

export function examDraftFromDetail(detail: ExamDetail): ExamDraft {
  const firstVersion = detail.exam.versions[0] || 'A';
  const questions = detail.questions
    .filter((question) => question.version === firstVersion && question.bank_question_id)
    .sort((a, b) => a.position - b.position)
    .map((question) => ({
      bankQuestionId: String(question.bank_question_id),
      points: numberValue(question.points, 1),
    }));
  return {
    id: detail.exam.id,
    title: detail.exam.title,
    subject: detail.exam.subject || '',
    groupId: detail.exam.group_id || '',
    periodId: detail.exam.period_id || '',
    examDate: detail.exam.exam_date || today(),
    instructions: detail.exam.instructions || '',
    passingScore: numberValue(detail.exam.passing_score, 6),
    maxScore: numberValue(detail.exam.max_score, 10),
    versions: detail.exam.versions?.length ? [...detail.exam.versions] : ['A'],
    versionStrategy: detail.exam.version_strategy || 'balanced',
    questions,
  };
}

function rotate<T>(items: T[], shift: number): T[] {
  if (!items.length) return [];
  const offset = ((shift % items.length) + items.length) % items.length;
  return [...items.slice(offset), ...items.slice(0, offset)];
}

function orderForVersion<T>(items: T[], versionIndex: number, totalVersions: number, strategy: ExamVersionStrategy): T[] {
  if (strategy === 'same' || versionIndex === 0 || items.length < 2) return [...items];
  const step = Math.max(1, Math.ceil(items.length / totalVersions));
  const rotated = rotate(items, step * versionIndex);
  if (versionIndex % 2 === 1 && rotated.length > 3) {
    return [...rotated.filter((_, index) => index % 2 === 0), ...rotated.filter((_, index) => index % 2 === 1)];
  }
  return versionIndex > 1 ? [...rotated].reverse() : rotated;
}

export function buildExamBlueprint(draft: ExamDraft, bankQuestions: BankQuestion[]): Record<string, ExamBlueprintItem[]> {
  if (!draft.questions.length) throw new Error('Selecciona al menos un reactivo.');
  if (draft.questions.length > 60) throw new Error('La evaluación admite un máximo de 60 reactivos.');
  const bank = new Map(bankQuestions.map((question) => [question.id, question]));
  const base = draft.questions.map((selection, index) => {
    const question = bank.get(selection.bankQuestionId);
    if (!question || !compatibleExamQuestion(question)) {
      throw new Error('Uno de los reactivos seleccionados ya no está disponible o no es compatible con OMR.');
    }
    const options = (question.options as unknown[]).map(String);
    const correct = scalarText(question.correct_answer);
    return {
      bank_question_id: question.id,
      source_position: index + 1,
      prompt: question.prompt,
      question_type: question.question_type as 'multiple_choice' | 'true_false',
      options,
      correct_answer: correct,
      explanation: question.explanation || '',
      subject: question.subject || draft.subject,
      topic: question.topic || '',
      difficulty: question.difficulty || '',
      bloom: question.bloom || '',
      media_url: question.media_url || '',
      media_type: question.media_type || '',
      points: Math.max(0.001, numberValue(selection.points, 1)),
    } satisfies ExamBlueprintItem;
  });

  return Object.fromEntries(
    draft.versions.map((version, versionIndex) => [
      version,
      orderForVersion(base, versionIndex, draft.versions.length, draft.versionStrategy),
    ]),
  );
}

export function answerLetter(question: Pick<PaperExamQuestion, 'options' | 'correct_answer'>): string {
  const options = Array.isArray(question.options) ? question.options.map(String) : [];
  const correct = scalarText(question.correct_answer);
  const index = options.indexOf(correct);
  return index >= 0 ? String.fromCharCode(65 + index) : '—';
}

export function examWorkspaceKey(userId?: string) {
  return ['teacher-exams', userId || 'anonymous'] as const;
}

export function examDetailKey(userId?: string, examId?: string) {
  return ['teacher-exam-detail', userId || 'anonymous', examId || 'none'] as const;
}

export async function fetchExamWorkspace(user: User): Promise<ExamWorkspace> {
  const [examsResult, groupsResult, periodsResult, bankResult, resultsResult] = await Promise.all([
    supabase
      .from('v2_paper_exams')
      .select('*')
      .eq('teacher_id', user.id)
      .order('updated_at', { ascending: false }),
    supabase
      .from('v2_groups')
      .select('*')
      .eq('teacher_id', user.id)
      .eq('is_demo', false)
      .order('created_at', { ascending: false }),
    supabase
      .from('v2_academic_periods')
      .select('id,teacher_id,group_id,name,starts_on,ends_on,course_weight,order_index,status')
      .eq('teacher_id', user.id)
      .order('group_id')
      .order('order_index'),
    supabase
      .from('v2_question_bank')
      .select('*')
      .eq('teacher_id', user.id)
      .eq('archived', false)
      .in('question_type', ['multiple_choice', 'true_false'])
      .order('favorite', { ascending: false })
      .order('updated_at', { ascending: false }),
    supabase
      .from('v2_paper_exam_results')
      .select('exam_id,score,reviewed')
      .eq('teacher_id', user.id)
      .range(0, 4999),
  ]);

  if (examsResult.error) throw new Error(`No se pudieron cargar las evaluaciones: ${errorMessage(examsResult.error)}`);
  if (groupsResult.error) throw new Error(`No se pudieron cargar los grupos: ${errorMessage(groupsResult.error)}`);
  if (periodsResult.error) throw new Error(`No se pudieron cargar los periodos: ${errorMessage(periodsResult.error)}`);
  if (bankResult.error) throw new Error(`No se pudo cargar Question Studio: ${errorMessage(bankResult.error)}`);
  if (resultsResult.error) throw new Error(`No se pudieron resumir los resultados: ${errorMessage(resultsResult.error)}`);

  const exams = (examsResult.data || []) as PaperExam[];
  const groupedResults = new Map<string, { scores: number[]; reviewed: number }>();
  for (const row of (resultsResult.data || []) as { exam_id: string; score: number; reviewed: boolean }[]) {
    const current = groupedResults.get(row.exam_id) || { scores: [], reviewed: 0 };
    const score = Number(row.score);
    if (Number.isFinite(score)) current.scores.push(score);
    if (row.reviewed) current.reviewed += 1;
    groupedResults.set(row.exam_id, current);
  }

  const summaries: Record<string, ExamResultSummary> = {};
  for (const exam of exams) {
    const grouped = groupedResults.get(exam.id) || { scores: [], reviewed: 0 };
    const passing = numberValue(exam.passing_score, 6);
    summaries[exam.id] = {
      examId: exam.id,
      results: grouped.scores.length,
      reviewed: grouped.reviewed,
      average: mean(grouped.scores),
      passRate: grouped.scores.length
        ? grouped.scores.filter((score) => score >= passing).length / grouped.scores.length
        : null,
    };
  }

  return {
    exams,
    groups: (groupsResult.data || []) as GroupRecord[],
    periods: (periodsResult.data || []) as AcademicPeriodRecord[],
    bankQuestions: ((bankResult.data || []) as BankQuestion[]).filter(compatibleExamQuestion),
    summaries,
  };
}

export async function fetchExamDetail(user: User, examId: string): Promise<ExamDetail> {
  const examResult = await supabase
    .from('v2_paper_exams')
    .select('*')
    .eq('id', examId)
    .eq('teacher_id', user.id)
    .single();
  if (examResult.error) throw new Error(`No se pudo abrir la evaluación: ${errorMessage(examResult.error)}`);
  const exam = examResult.data as PaperExam;

  const [questionsResult, resultsResult, groupResult, periodResult, rosterResult] = await Promise.all([
    supabase
      .from('v2_paper_exam_questions')
      .select('*')
      .eq('exam_id', examId)
      .eq('teacher_id', user.id)
      .order('version')
      .order('position'),
    supabase
      .from('v2_paper_exam_results')
      .select('*')
      .eq('exam_id', examId)
      .eq('teacher_id', user.id)
      .order('created_at', { ascending: false })
      .range(0, 4999),
    exam.group_id
      ? supabase.from('v2_groups').select('*').eq('id', exam.group_id).eq('teacher_id', user.id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    exam.period_id
      ? supabase
          .from('v2_academic_periods')
          .select('id,teacher_id,group_id,name,starts_on,ends_on,course_weight,order_index,status')
          .eq('id', exam.period_id)
          .eq('teacher_id', user.id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    exam.group_id
      ? supabase
          .from('v2_group_students')
          .select('*')
          .eq('group_id', exam.group_id)
          .eq('teacher_id', user.id)
          .eq('active', true)
          .order('full_name')
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (questionsResult.error) throw new Error(`No se pudo cargar la composición: ${errorMessage(questionsResult.error)}`);
  if (resultsResult.error) throw new Error(`No se pudieron cargar los resultados: ${errorMessage(resultsResult.error)}`);
  if (groupResult.error) throw new Error(`No se pudo cargar el grupo: ${errorMessage(groupResult.error)}`);
  if (periodResult.error) throw new Error(`No se pudo cargar el periodo: ${errorMessage(periodResult.error)}`);
  if (rosterResult.error) throw new Error(`No se pudo cargar el padrón: ${errorMessage(rosterResult.error)}`);

  return {
    exam,
    questions: (questionsResult.data || []) as PaperExamQuestion[],
    results: (resultsResult.data || []) as PaperExamResult[],
    group: (groupResult.data || null) as GroupRecord | null,
    period: (periodResult.data || null) as AcademicPeriodRecord | null,
    roster: (rosterResult.data || []) as StudentRecord[],
  };
}

export async function saveExamDraft(user: User, draft: ExamDraft, bankQuestions: BankQuestion[]): Promise<string> {
  const blueprint = buildExamBlueprint(draft, bankQuestions);
  const { data, error } = await supabase.rpc('v2_save_paper_exam_v2', {
    p_exam_id: draft.id || null,
    p_group_id: draft.groupId || null,
    p_period_id: draft.periodId || null,
    p_title: draft.title.trim(),
    p_subject: draft.subject.trim() || null,
    p_exam_date: draft.examDate || today(),
    p_instructions: draft.instructions.trim() || null,
    p_passing_score: Math.max(0, Math.min(10, numberValue(draft.passingScore, 6))),
    p_max_score: 10,
    p_versions: draft.versions,
    p_version_strategy: draft.versionStrategy,
    p_blueprint: blueprint,
  });
  if (error) throw new Error(`No se pudo guardar la evaluación: ${errorMessage(error)}`);
  const examId = String(data || '');
  if (!examId) throw new Error('TEDVIO no devolvió el identificador de la evaluación.');
  return examId;
}

export async function setExamStatus(user: User, examId: string, status: ExamStatus): Promise<PaperExam> {
  if (!user.id) throw new Error('Tu sesión expiró.');
  const { data, error } = await supabase.rpc('v2_set_paper_exam_status', {
    p_exam_id: examId,
    p_status: status,
  });
  if (error) throw new Error(`No se pudo cambiar el estado: ${errorMessage(error)}`);
  return data as PaperExam;
}

export async function duplicateExam(user: User, examId: string): Promise<string> {
  if (!user.id) throw new Error('Tu sesión expiró.');
  const { data, error } = await supabase.rpc('v2_duplicate_paper_exam', { p_exam_id: examId });
  if (error) throw new Error(`No se pudo duplicar la evaluación: ${errorMessage(error)}`);
  const duplicateId = String(data || '');
  if (!duplicateId) throw new Error('TEDVIO no devolvió la copia creada.');
  return duplicateId;
}

export function analyzeExam(detail: ExamDetail): ExamAnalytics {
  const passing = numberValue(detail.exam.passing_score, 6);
  const scores = detail.results.map((result) => numberValue(result.score, Number.NaN)).filter(Number.isFinite);
  const questionMap = new Map<string, PaperExamQuestion[]>();
  for (const question of detail.questions) {
    const version = String(question.version || 'A');
    const list = questionMap.get(version) || [];
    list.push(question);
    questionMap.set(version, list);
  }
  for (const list of questionMap.values()) list.sort((a, b) => a.position - b.position);

  const itemMap = new Map<string, ExamItemAnalytics>();
  for (const result of detail.results) {
    const questions = questionMap.get(String(result.version || 'A')) || [];
    const answers = stringArray(result.answers);
    for (const question of questions) {
      const key = question.bank_question_id || `source-${question.source_position}`;
      const current = itemMap.get(key) || {
        key,
        sourcePosition: question.source_position,
        bankQuestionId: question.bank_question_id,
        prompt: question.prompt,
        topic: question.topic || '',
        total: 0,
        correct: 0,
        blank: 0,
        correctRate: null,
        blankRate: null,
      };
      const answer = String(answers[question.position - 1] || '').trim();
      current.total += 1;
      if (!answer) current.blank += 1;
      if (answer && answer === scalarText(question.correct_answer)) current.correct += 1;
      itemMap.set(key, current);
    }
  }

  const items = [...itemMap.values()]
    .map((item) => ({
      ...item,
      correctRate: item.total ? item.correct / item.total : null,
      blankRate: item.total ? item.blank / item.total : null,
    }))
    .sort((a, b) => a.sourcePosition - b.sourcePosition);

  const versions = (detail.exam.versions || ['A']).map((version) => {
    const versionScores = detail.results
      .filter((result) => String(result.version || 'A') === version)
      .map((result) => numberValue(result.score, Number.NaN))
      .filter(Number.isFinite);
    return {
      version,
      results: versionScores.length,
      average: mean(versionScores),
      passRate: versionScores.length
        ? versionScores.filter((score) => score >= passing).length / versionScores.length
        : null,
    };
  });

  return {
    results: detail.results.length,
    reviewed: detail.results.filter((result) => result.reviewed).length,
    reviewedRate: detail.results.length
      ? detail.results.filter((result) => result.reviewed).length / detail.results.length
      : null,
    average: mean(scores),
    median: median(scores),
    passRate: scores.length ? scores.filter((score) => score >= passing).length / scores.length : null,
    versions,
    items,
  };
}
