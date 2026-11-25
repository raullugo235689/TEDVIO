import type { BankQuestion } from './bank';
import type { GroupRecord } from './types';

export type OnlineFormFeedback = 'score_only' | 'after_submit' | 'after_close';
export type OnlineFormStatus = 'draft' | 'published' | 'closed';
export interface OnlineFormItem {
  id: string; bank_id: string; section_id: string; position: number;
  prompt: string; question_type: 'multiple_choice' | 'true_false'; options: string[];
  correct_answer: string; explanation: string | null; topic: string | null;
  points: number; media_url?: string | null; media_type?: string | null;
}
export interface OnlineFormSection {
  id: string; title: string; position: number; draw_count: number; items: OnlineFormItem[];
}
export interface OnlineForm {
  id: string; code: string; title: string; instructions: string; group_id: string | null;
  status: OnlineFormStatus; question_count: number; pool_count: number;
  attempt_count: number; submitted_count: number; max_attempts: number;
  time_limit_minutes: number | null; opens_at: string | null; closes_at: string | null;
  shuffle_questions: boolean; shuffle_options: boolean; feedback_mode: OnlineFormFeedback;
  created_at: string; updated_at: string; sections: OnlineFormSection[]; revision?: number;
}
export interface OnlineFormResponse {
  item_id: string; answer: string | null; is_correct: boolean | null; points: number;
}
export interface OnlineFormAttempt {
  id: string; display_name: string; enrollment: string; attempt_no: number;
  status: 'in_progress' | 'submitted'; started_at: string; submitted_at: string | null;
  expires_at: string | null; auto_submitted?: boolean; score: number | null;
  max_score: number | null; percentage: number | null;
  item_ids: string[]; responses: OnlineFormResponse[];
}
export interface OnlineFormResults {
  form: OnlineForm; sections: OnlineFormSection[]; items: OnlineFormItem[];
  attempts: OnlineFormAttempt[]; server_now?: string;
}
export interface OnlineFormDetail {
  form: OnlineForm; candidates: BankQuestion[]; attempts: OnlineFormAttempt[]; results: OnlineFormResults;
}
export interface OnlineFormsWorkspace { forms: OnlineForm[]; groups: GroupRecord[]; questions: BankQuestion[] }
export interface OnlineFormDraft {
  id?: string; revision?: number; title: string; instructions: string; groupId: string;
  questionIds: string[]; selectionMode: 'all' | 'random' | 'topic_quotas';
  questionCount: number; topicQuotas: Record<string, number>; shuffleOptions: boolean;
  maxAttempts: number; timeLimitMinutes: number | null; opensAt: string; closesAt: string;
  feedbackMode: OnlineFormFeedback;
}
export interface OnlineFormMeta {
  id: string; code: string; title: string; instructions: string; status: OnlineFormStatus;
  question_count: number; max_attempts: number; time_limit_minutes: number | null;
  opens_at: string | null; closes_at: string | null; group_name?: string | null;
  available: boolean; message?: string; server_now: string;
}
export interface OnlineFormPublicItem {
  id: string; prompt: string; options: string[]; points: number; section_title: string;
  media_url?: string | null; media_type?: string | null;
}
export interface OnlineFormStudentFeedback extends OnlineFormResponse { correct_answer: string; explanation?: string | null }
export interface OnlineFormState {
  status: 'in_progress' | 'submitted'; title: string; instructions: string;
  form_code: string; attempt_id: string; display_name: string; enrollment: string; attempt_no: number;
  server_now: string; expires_at: string | null; started_at: string; submitted_at: string | null;
  auto_submitted: boolean; items: OnlineFormPublicItem[];
  responses: { item_id: string; answer: string }[]; score: number | null;
  max_score: number | null; percentage: number | null; released: boolean;
  show_answers: boolean; feedback: OnlineFormStudentFeedback[];
}
export interface RawOnlineFormState {
  form: Pick<OnlineForm, 'title' | 'instructions' | 'code'>;
  attempt: OnlineFormAttempt; server_now: string;
  sections: Pick<OnlineFormSection, 'id' | 'title' | 'position' | 'draw_count'>[];
  items: (Omit<OnlineFormPublicItem, 'section_title'> & { section_id: string })[];
  answers: Record<string, string>; released: boolean; show_answers: boolean;
  feedback: OnlineFormStudentFeedback[];
}

export function compatibleOnlineFormQuestion(q: BankQuestion): boolean {
  return !q.archived && ['multiple_choice', 'true_false'].includes(q.question_type)
    && Array.isArray(q.options) && q.options.length >= 2 && q.options.length <= 10
    && q.options.every(option => typeof option === 'string' && option.trim().length > 0)
    && new Set(q.options).size === q.options.length
    && typeof q.correct_answer === 'string' && q.options.includes(q.correct_answer)
    && Boolean(q.prompt.trim());
}
export function onlineFormTopic(question: Pick<BankQuestion, 'topic'>): string {
  return question.topic?.trim() || 'Sin tema';
}
export function emptyOnlineFormDraft(groupId = ''): OnlineFormDraft {
  return { title: '', instructions: '', groupId, questionIds: [], selectionMode: 'random',
    questionCount: 35, topicQuotas: {}, shuffleOptions: true, maxAttempts: 1,
    timeLimitMinutes: null, opensAt: '', closesAt: '', feedbackMode: 'score_only' };
}
function localDateTime(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
export function onlineFormDraftFromDetail(detail: OnlineFormDetail): OnlineFormDraft {
  const form = detail.form;
  const sections = form.sections || [];
  const ids = sections.flatMap(section => section.items.map(item => item.bank_id));
  return { id: form.id, revision: form.revision, title: form.title, instructions: form.instructions || '', groupId: form.group_id || '',
    questionIds: ids, selectionMode: sections.length > 1 ? 'topic_quotas' : form.question_count === ids.length ? 'all' : 'random',
    questionCount: form.question_count, topicQuotas: Object.fromEntries(sections.map(section => [section.title, section.draw_count])),
    shuffleOptions: form.shuffle_options, maxAttempts: form.max_attempts, timeLimitMinutes: form.time_limit_minutes,
    opensAt: localDateTime(form.opens_at), closesAt: localDateTime(form.closes_at), feedbackMode: form.feedback_mode };
}
export function onlineFormDraftPayload(draft: OnlineFormDraft, questions: BankQuestion[]) {
  if (!draft.title.trim()) throw new Error('Escribe el título del formulario.');
  if (draft.title.trim().length > 200) throw new Error('El título admite hasta 200 caracteres.');
  const ids = [...new Set(draft.questionIds)];
  if (!ids.length) throw new Error('Selecciona preguntas del banco.');
  if (ids.length > 1000) throw new Error('El conjunto admite hasta 1000 preguntas candidatas.');
  const byId = new Map(questions.map(question => [question.id, question]));
  const selected = ids.map(id => {
    const question = byId.get(id);
    if (!question || !compatibleOnlineFormQuestion(question)) throw new Error('Hay preguntas que ya no están disponibles o no tienen una respuesta válida. Revisa la selección.');
    return question;
  });
  const groups = new Map<string, BankQuestion[]>();
  if (draft.selectionMode === 'topic_quotas') {
    for (const question of selected) { const topic = onlineFormTopic(question); groups.set(topic, [...(groups.get(topic) || []), question]); }
  } else groups.set('Preguntas', selected);
  const sections = [...groups].map(([title, candidates]) => {
    const count = draft.selectionMode === 'all' ? candidates.length : draft.selectionMode === 'random' ? Number(draft.questionCount) : Number(draft.topicQuotas[title] ?? 0);
    if (!Number.isInteger(count) || count < 0 || count > candidates.length) throw new Error(`Revisa la cantidad de «${title}»: hay ${candidates.length} preguntas disponibles.`);
    return { title, draw_count: count, items: candidates.map(question => ({ bank_id: question.id, points: 1 })) };
  }).filter(section => section.draw_count > 0);
  if (!sections.length) throw new Error('El examen debe asignar al menos una pregunta.');
  if (sections.length > 20) throw new Error('El formulario admite hasta 20 temas o secciones.');
  if (sections.reduce((sum, section) => sum + section.draw_count, 0) > 200) throw new Error('Se pueden asignar hasta 200 preguntas por intento.');
  if (!Number.isInteger(draft.maxAttempts) || draft.maxAttempts < 1 || draft.maxAttempts > 5) throw new Error('Elige entre 1 y 5 intentos.');
  if (draft.timeLimitMinutes != null && (!Number.isInteger(draft.timeLimitMinutes) || draft.timeLimitMinutes < 1 || draft.timeLimitMinutes > 300)) throw new Error('El tiempo debe estar entre 1 y 300 minutos.');
  const date = (value: string) => { if (!value) return null; const parsed = new Date(value); if (!Number.isFinite(parsed.getTime())) throw new Error('Revisa las fechas de apertura y cierre.'); return parsed.toISOString(); };
  const opensAt = date(draft.opensAt), closesAt = date(draft.closesAt);
  if (opensAt && closesAt && closesAt <= opensAt) throw new Error('El cierre debe ser posterior a la apertura.');
  return { id: draft.id || null, ...(draft.revision != null ? { revision: draft.revision } : {}), title: draft.title.trim(), instructions: draft.instructions.trim(),
    group_id: draft.groupId || null, opens_at: opensAt, closes_at: closesAt,
    time_limit_minutes: draft.timeLimitMinutes, max_attempts: draft.maxAttempts,
    shuffle_questions: true, shuffle_options: draft.shuffleOptions, feedback_mode: draft.feedbackMode, sections };
}
export function normalizeOnlineFormState(raw: RawOnlineFormState): OnlineFormState {
  const attempt = raw.attempt;
  const titles = new Map((raw.sections || []).map(section => [section.id, section.title]));
  return { status: attempt.status, title: raw.form.title, instructions: raw.form.instructions || '',
    form_code: raw.form.code, attempt_id: attempt.id, display_name: attempt.display_name,
    enrollment: attempt.enrollment, attempt_no: attempt.attempt_no, server_now: raw.server_now,
    expires_at: attempt.expires_at, started_at: attempt.started_at, submitted_at: attempt.submitted_at,
    auto_submitted: Boolean(attempt.auto_submitted),
    items: (raw.items || []).map(item => ({ ...item, section_title: titles.get(item.section_id) || 'Preguntas' })),
    responses: Object.entries(raw.answers || {}).map(([item_id, answer]) => ({ item_id, answer })),
    score: attempt.score, max_score: attempt.max_score, percentage: attempt.percentage,
    released: raw.released, show_answers: raw.show_answers, feedback: raw.feedback || [] };
}
