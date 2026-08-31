import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { GroupRecord } from './types';

const MEDIA_BUCKET = 'tedvio-media-v2';

export interface TeacherProfileSettings {
  id: string;
  display_name?: string | null;
  institution?: string | null;
  educational_program?: string | null;
  default_group?: string | null;
  created_at?: string | null;
}

export interface AccountProfileSnapshot {
  email?: string | null;
  full_name?: string | null;
  role?: string | null;
  status?: string | null;
  plan?: string | null;
  last_sign_in_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface LegalDocumentSummary {
  document_key: string;
  version: string;
  title: string;
  summary?: string | null;
  effective_at?: string | null;
  required?: boolean | null;
  accepted?: boolean | null;
}

export interface InstitutionMembership {
  institution_id: string;
  member_role: 'teacher' | 'institution_admin' | string;
  status: string;
  name: string;
}

export interface AccountDeletionRequest {
  id?: string | null;
  status?: string | null;
  requested_at?: string | null;
  scheduled_for?: string | null;
  reason?: string | null;
}

export interface AccountSnapshot {
  profile?: AccountProfileSnapshot | null;
  documents?: LegalDocumentSummary[] | null;
  memberships?: InstitutionMembership[] | null;
  deletion_blockers?: Array<{ institution_id?: string; name?: string }> | null;
  pending_deletion?: AccountDeletionRequest | null;
  export_count?: number | null;
}

export interface ConsentRecord {
  document_key: string;
  document_version: string;
  accepted_at: string;
  source?: string | null;
}

export interface GroupAlertSetting {
  group_id: string;
  teacher_id: string;
  min_attendance: number;
  min_grade: number;
  updated_at?: string | null;
}

export interface InstitutionBranding {
  id: string;
  name: string;
  status?: string | null;
  plan?: string | null;
  report_display_name?: string | null;
  report_logo_path?: string | null;
  report_title?: string | null;
  report_approver_name?: string | null;
  report_approver_title?: string | null;
  report_approval_label?: string | null;
  report_document_code?: string | null;
}

export interface SettingsData {
  account: AccountSnapshot;
  profile: TeacherProfileSettings | null;
  groups: GroupRecord[];
  groupSettings: GroupAlertSetting[];
  consents: ConsentRecord[];
  institutions: InstitutionBranding[];
}

export interface ProfileSettingsDraft {
  displayName: string;
  institution: string;
  educationalProgram: string;
  defaultGroup: string;
}

export interface InstitutionBrandingDraft {
  institutionId: string;
  displayName: string;
  reportTitle: string;
  approverName: string;
  approverTitle: string;
  approvalLabel: string;
  documentCode: string;
  logo?: File | null;
}

export interface LegalDocumentContent {
  document_key: string;
  version: string;
  title: string;
  effective_at?: string | null;
  text: string;
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message || 'Error desconocido');
  }
  return String(error || 'Error desconocido');
}

function stripHtml(value: string): string {
  if (typeof DOMParser === 'undefined') return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const documentValue = new DOMParser().parseFromString(value, 'text/html');
  return String(documentValue.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
}

export function settingsKey(userId?: string) {
  return ['teacher-settings', userId || 'anonymous'] as const;
}

export async function fetchSettings(user: User): Promise<SettingsData> {
  const [accountResult, profileResult, groupsResult, settingsResult, consentsResult] = await Promise.all([
    supabase.rpc('tedvio_account_center_snapshot_v69'),
    supabase.from('profiles').select('id,display_name,institution,educational_program,default_group,created_at').eq('id', user.id).maybeSingle(),
    supabase.from('v2_groups').select('*').eq('teacher_id', user.id).eq('is_demo', false).order('created_at', { ascending: false }),
    supabase.from('v2_group_alert_settings').select('*').eq('teacher_id', user.id).order('group_id'),
    supabase.from('tedvio_user_consents').select('document_key,document_version,accepted_at,source').eq('user_id', user.id).order('accepted_at', { ascending: false }).limit(100),
  ]);

  if (accountResult.error) throw new Error(`No se pudo abrir el Centro de cuenta: ${errorMessage(accountResult.error)}`);
  if (profileResult.error) throw new Error(`No se pudo cargar el perfil: ${errorMessage(profileResult.error)}`);
  if (groupsResult.error) throw new Error(`No se pudieron cargar los grupos: ${errorMessage(groupsResult.error)}`);
  if (settingsResult.error) throw new Error(`No se pudieron cargar los umbrales: ${errorMessage(settingsResult.error)}`);
  if (consentsResult.error) throw new Error(`No se pudo cargar el historial de privacidad: ${errorMessage(consentsResult.error)}`);

  const account = (accountResult.data || {}) as AccountSnapshot;
  const adminIds = (account.memberships || []).filter((membership) => membership.member_role === 'institution_admin' && membership.status === 'active').map((membership) => membership.institution_id);
  const institutionsResult = adminIds.length
    ? await supabase.from('tedvio_institutions').select('id,name,status,plan,report_display_name,report_logo_path,report_title,report_approver_name,report_approver_title,report_approval_label,report_document_code').in('id', adminIds).order('name')
    : { data: [], error: null };
  if (institutionsResult.error) throw new Error(`No se pudo cargar la configuración institucional: ${errorMessage(institutionsResult.error)}`);

  return {
    account,
    profile: (profileResult.data || null) as TeacherProfileSettings | null,
    groups: (groupsResult.data || []) as GroupRecord[],
    groupSettings: (settingsResult.data || []) as GroupAlertSetting[],
    consents: (consentsResult.data || []) as ConsentRecord[],
    institutions: (institutionsResult.data || []) as InstitutionBranding[],
  };
}

export async function saveProfileSettings(user: User, draft: ProfileSettingsDraft): Promise<TeacherProfileSettings> {
  if (!user.id) throw new Error('Tu sesión expiró.');
  const { data, error } = await supabase.rpc('v2_save_teacher_profile_settings', {
    p_display_name: draft.displayName,
    p_institution: draft.institution,
    p_educational_program: draft.educationalProgram,
    p_default_group: draft.defaultGroup || null,
  });
  if (error) throw new Error(`No se pudo guardar el perfil: ${errorMessage(error)}`);
  const metadataResult = await supabase.auth.updateUser({
    data: {
      full_name: draft.displayName || null,
      display_name: draft.displayName || null,
    },
  });
  if (metadataResult.error) throw new Error(`El perfil se guardó, pero no se pudo actualizar el nombre de la sesión: ${errorMessage(metadataResult.error)}`);
  return data as TeacherProfileSettings;
}

export async function saveGroupAlertSettings(user: User, groupId: string, minAttendance: number, minGrade: number): Promise<GroupAlertSetting> {
  if (!user.id) throw new Error('Tu sesión expiró.');
  const { data, error } = await supabase.rpc('v2_save_group_alert_settings_v2', {
    p_group_id: groupId,
    p_min_attendance: minAttendance,
    p_min_grade: minGrade,
  });
  if (error) throw new Error(`No se pudieron guardar los umbrales: ${errorMessage(error)}`);
  return data as GroupAlertSetting;
}

export async function fetchLegalDocument(documentKey: string, version: string): Promise<LegalDocumentContent> {
  const { data, error } = await supabase
    .from('tedvio_legal_documents')
    .select('document_key,version,title,content_html,effective_at')
    .eq('document_key', documentKey)
    .eq('version', version)
    .eq('status', 'published')
    .single();
  if (error) throw new Error(`No se pudo abrir el documento: ${errorMessage(error)}`);
  return {
    document_key: data.document_key,
    version: data.version,
    title: data.title,
    effective_at: data.effective_at,
    text: stripHtml(String(data.content_html || '')),
  };
}

export async function acceptLegalDocument(user: User, documentKey: string, version: string): Promise<void> {
  if (!user.id) throw new Error('Tu sesión expiró.');
  const { error } = await supabase.rpc('tedvio_accept_legal_v69', {
    p_document_key: documentKey,
    p_document_version: version,
    p_source: 'teacher_v2_settings',
  });
  if (error) throw new Error(`No se pudo registrar la aceptación: ${errorMessage(error)}`);
}

export async function changePassword(password: string): Promise<void> {
  if (password.length < 8) throw new Error('Usa una contraseña de al menos 8 caracteres.');
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error(`No se pudo cambiar la contraseña: ${errorMessage(error)}`);
}

export async function signOutOtherSessions(): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope: 'others' });
  if (error) throw new Error(`No se pudieron cerrar las otras sesiones: ${errorMessage(error)}`);
}

export async function exportAccountData(): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke('tedvio-account-v69', { body: { action: 'export' } });
  if (error) throw new Error(`No se pudo preparar la exportación: ${errorMessage(error)}`);
  if (data?.error) throw new Error(String(data.error));
  return (data || {}) as Record<string, unknown>;
}

export async function requestAccountDeletion(user: User, reason: string): Promise<void> {
  if (!user.id) throw new Error('Tu sesión expiró.');
  const { error } = await supabase.rpc('tedvio_request_account_deletion_v69', { p_reason: reason || null });
  if (error) throw new Error(`No se pudo registrar la solicitud: ${errorMessage(error)}`);
}

export async function cancelAccountDeletion(user: User): Promise<void> {
  if (!user.id) throw new Error('Tu sesión expiró.');
  const { error } = await supabase.rpc('tedvio_cancel_account_deletion_v69');
  if (error) throw new Error(`No se pudo cancelar la solicitud: ${errorMessage(error)}`);
}

function publicLogo(path?: string | null): string {
  if (!path) return '';
  return supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl || '';
}

export function institutionLogoUrl(institution: InstitutionBranding): string {
  return publicLogo(institution.report_logo_path);
}

async function uploadInstitutionLogo(user: User, institutionId: string, file: File): Promise<string> {
  if (!['image/png', 'image/jpeg'].includes(file.type)) throw new Error('Usa un logotipo PNG o JPG.');
  if (file.size > 2 * 1024 * 1024) throw new Error('El logotipo debe pesar máximo 2 MB.');
  const extension = file.type === 'image/png' ? 'png' : 'jpg';
  const path = `${user.id}/institution-branding/${institutionId}/logo-${Date.now()}.${extension}`;
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, {
    cacheControl: '3600',
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(`No se pudo subir el logotipo: ${errorMessage(error)}`);
  return path;
}

export async function saveInstitutionBranding(user: User, current: InstitutionBranding, draft: InstitutionBrandingDraft): Promise<InstitutionBranding> {
  if (!user.id) throw new Error('Tu sesión expiró.');
  let newPath: string | null = null;
  try {
    if (draft.logo) newPath = await uploadInstitutionLogo(user, draft.institutionId, draft.logo);
    const { data, error } = await supabase.rpc('tedvio_update_institution_branding_v6811', {
      p_institution_id: draft.institutionId,
      p_name: draft.displayName || current.name,
      p_report_logo_path: newPath || current.report_logo_path || null,
      p_report_title: draft.reportTitle || 'REGISTRO DE ASISTENCIA Y EVALUACIÓN',
      p_report_approver_name: draft.approverName || null,
      p_report_approver_title: draft.approverTitle || null,
      p_report_approval_label: draft.approvalLabel || 'Vo. Bo.',
      p_report_document_code: draft.documentCode || null,
    });
    if (error) throw error;
    if (newPath && current.report_logo_path && current.report_logo_path !== newPath) {
      void supabase.storage.from(MEDIA_BUCKET).remove([current.report_logo_path]);
    }
    return data as InstitutionBranding;
  } catch (error) {
    if (newPath) void supabase.storage.from(MEDIA_BUCKET).remove([newPath]);
    throw new Error(`No se pudo guardar la institución: ${errorMessage(error)}`);
  }
}

export function downloadAccountJson(data: Record<string, unknown>): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `TEDVIO_Mis_Datos_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
