import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type {
  Entitlements,
  ScheduleSlot,
  ScheduleException,
  TeacherDashboard,
  TeacherHomeData,
  TeacherProfile,
} from './types';

const MEDIA_BUCKET = 'tedvio-media-v2';

function message(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message || 'Error desconocido');
  }
  return String(error || 'Error desconocido');
}

export interface TeacherAccountSummary {
  profile: TeacherProfile;
  entitlements: Entitlements | null;
  warnings: string[];
}
export async function fetchTeacherAccount(user: User): Promise<TeacherAccountSummary> {
  const [profileResult, entitlementsResult] = await Promise.all([
    supabase.from('tedvio_user_profiles').select('status,plan,role').eq('user_id', user.id).maybeSingle(),
    supabase.rpc('tedvio_current_entitlements'),
  ]);
  const warnings: string[] = [];
  if (profileResult.error) warnings.push(`Perfil: ${message(profileResult.error)}`);
  if (entitlementsResult.error) warnings.push(`Plan: ${message(entitlementsResult.error)}`);
  return { profile: (profileResult.data || { role: 'teacher', plan: 'free' }) as TeacherProfile,
    entitlements: (entitlementsResult.data || null) as Entitlements | null, warnings };
}
export async function fetchTeacherHome(user: User, accountLoader = () => fetchTeacherAccount(user)): Promise<TeacherHomeData> {
  const [account, dashboardResult, scheduleResult, exceptionsResult] = await Promise.all([
    accountLoader(),
    supabase.rpc('v2_teacher_today_dashboard'),
    supabase
      .from('v2_group_schedule_slots')
      .select('id,group_id,weekday,start_time,end_time,room,modality,active,updated_at,starts_on,ends_on,recurrence,revision')
      .eq('teacher_id', user.id)
      .eq('active', true)
      .order('weekday')
      .order('start_time'),
    supabase.from('v2_schedule_exceptions').select('slot_id,original_date,status,class_date,start_time,end_time,room,modality,note').eq('teacher_id', user.id),
  ]);

  if (dashboardResult.error) {
    throw new Error(`No se pudo cargar el centro docente: ${message(dashboardResult.error)}`);
  }

  const warnings = [...account.warnings];
  if (scheduleResult.error) warnings.push(`Agenda: ${message(scheduleResult.error)}`);

  if (exceptionsResult.error) warnings.push(`Agenda: ${message(exceptionsResult.error)}`);

  const dashboard = (dashboardResult.data || {}) as TeacherDashboard;
  if (Array.isArray(dashboard.groups)) {
    dashboard.groups = dashboard.groups.map((group) => ({
      ...group,
      institution_logo_url: group.institution_logo_path
        ? supabase.storage.from(MEDIA_BUCKET).getPublicUrl(group.institution_logo_path).data.publicUrl || null
        : null,
    }));
  }

  return {
    user,
    profile: account.profile,
    entitlements: account.entitlements,
    dashboard,
    schedule: (scheduleResult.data || []) as ScheduleSlot[],
    scheduleExceptions: (exceptionsResult.data || []) as ScheduleException[],
    warnings,
  };
}
