import type { User } from '@supabase/supabase-js';
import { supabase, createIsolatedSupabaseClient } from './supabase';
import { fetchAllPages } from './data-pages';
import type { BankQuestion } from './bank';
import type { GroupRecord } from './types';
import {
  compatibleOnlineFormQuestion, onlineFormDraftPayload, normalizeOnlineFormState,
  type OnlineForm, type OnlineFormDetail, type OnlineFormDraft, type OnlineFormMeta,
  type OnlineFormResults, type OnlineFormsWorkspace, type RawOnlineFormState,
} from './online-forms-model';
export * from './online-forms-model';

// A respondent never inherits a teacher session on a shared computer.
const respondent = createIsolatedSupabaseClient('online-form-respondent');
export const onlineFormsWorkspaceKey = (userId?: string) => ['online-forms', userId || 'anonymous'] as const;
export const onlineFormDetailKey = (userId?: string, formId?: string) => ['online-form', userId || 'anonymous', formId || 'new'] as const;
export function onlineFormError(error: unknown): string {
  const message = error instanceof Error ? error.message : error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error || 'No se pudo completar la operación.');
  if (/PGRST202|Could not find the function|schema cache/i.test(message)) return 'El módulo de formularios todavía no está habilitado en esta instalación. Contacta al administrador.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(message)) return 'No pudimos conectar. Comprueba tu conexión y vuelve a intentar; tus cambios locales se conservan.';
  return message;
}
async function call<T>(name: string, args: Record<string, unknown> = {}, publicCall = false): Promise<T> {
  const { data, error } = await (publicCall ? respondent : supabase).rpc(name, args);
  if (error) throw new Error(onlineFormError(error));
  if (data == null) throw new Error('El formulario no está disponible.');
  return data as T;
}
async function bankQuestions(user: User): Promise<BankQuestion[]> {
  return fetchAllPages<BankQuestion>((from, to) => supabase.from('v2_question_bank').select('*').eq('teacher_id', user.id).order('id').range(from, to));
}
export async function fetchOnlineFormsWorkspace(user: User): Promise<OnlineFormsWorkspace> {
  const [forms, groups, questions] = await Promise.all([
    call<OnlineForm[]>('v2_online_forms_list'),
    fetchAllPages<GroupRecord>((from, to) => supabase.from('v2_groups').select('*').eq('teacher_id', user.id).order('id').range(from, to)),
    bankQuestions(user),
  ]);
  return { forms, groups, questions: questions.filter(compatibleOnlineFormQuestion) };
}
export async function fetchOnlineFormDetail(user: User, formId: string): Promise<OnlineFormDetail> {
  const [form, results, questions] = await Promise.all([
    call<OnlineForm>('v2_online_form_detail', { p_form_id: formId }),
    call<OnlineFormResults>('v2_online_form_results', { p_form_id: formId }),
    bankQuestions(user),
  ]);
  return { form, candidates: questions.filter(compatibleOnlineFormQuestion), attempts: results.attempts, results };
}
export async function saveOnlineFormDraft(user: User, draft: OnlineFormDraft): Promise<string> {
  const questions = await bankQuestions(user);
  const form = await call<OnlineForm>('v2_online_form_save', { p_form: onlineFormDraftPayload(draft, questions) });
  return form.id;
}
export async function publishOnlineForm(_user: User, id: string): Promise<void> {
  await call('v2_online_form_set_status', { p_form_id: id, p_status: 'published' });
}
export async function closeOnlineForm(_user: User, id: string): Promise<void> {
  await call('v2_online_form_set_status', { p_form_id: id, p_status: 'closed' });
}
export function onlineFormStudentUrl(form: Pick<OnlineForm, 'code'>): string {
  return `${window.location.origin}/teacher#/form/${encodeURIComponent(form.code)}`;
}
export async function fetchOnlineFormMeta(code: string): Promise<OnlineFormMeta> {
  return call<OnlineFormMeta>('v2_online_form_meta', { p_code: code }, true);
}
export async function startOnlineForm(code: string, name: string, enrollment: string, token: string, group = '') {
  const args = { p_code: code, p_name: name, p_enrollment: enrollment, p_token: token };
  return normalizeOnlineFormState(await call<RawOnlineFormState>(group ? 'v2_online_form_start_grouped' : 'v2_online_form_start', group ? { ...args, p_group: group } : args, true));
}
export async function configurePublishedFormGroups(formId: string, choices: string[]) {
  return call<OnlineForm>('v2_online_form_set_group_choices', { p_form_id: formId, p_choices: choices });
}
export async function fetchOnlineFormState(token: string) {
  return normalizeOnlineFormState(await call<RawOnlineFormState>('v2_online_form_state', { p_token: token }, true));
}
export async function saveOnlineFormAnswer(token: string, itemId: string, answer: string): Promise<{ saved: boolean; submitted?: boolean; expired?: boolean; server_now?: string }> {
  return call('v2_online_form_answer', { p_token: token, p_item_id: itemId, p_answer: answer }, true);
}
export async function submitOnlineForm(token: string) {
  return normalizeOnlineFormState(await call<RawOnlineFormState>('v2_online_form_submit', { p_token: token }, true));
}
