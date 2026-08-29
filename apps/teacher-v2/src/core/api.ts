import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type {
  Entitlements,
  ScheduleSlot,
  TeacherDashboard,
  TeacherHomeData,
  TeacherProfile,
} from './types';

function message(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message || 'Error desconocido');
  }
  return String(error || 'Error desconocido');
}

export async function fetchTeacherHome(user: User): Promise<TeacherHomeData> {
  const [profileResult, entitlementsResult, dashboardResult, scheduleResult] = await Promise.all([
    supabase
      .from('tedvio_user_profiles')
      .select('status,plan,role')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase.rpc('tedvio_current_entitlements'),
    supabase.rpc('v2_teacher_today_dashboard'),
    supabase
      .from('v2_group_schedule_slots')
      .select('id,group_id,weekday,start_time,end_time,room,modality,active,updated_at')
      .eq('teacher_id', user.id)
      .eq('active', true)
      .order('weekday')
      .order('start_time'),
  ]);

  if (dashboardResult.error) {
    throw new Error(`No se pudo cargar el centro docente: ${message(dashboardResult.error)}`);
  }

  const warnings: string[] = [];
  if (profileResult.error) warnings.push(`Perfil: ${message(profileResult.error)}`);
  if (entitlementsResult.error) warnings.push(`Plan: ${message(entitlementsResult.error)}`);
  if (scheduleResult.error) warnings.push(`Agenda: ${message(scheduleResult.error)}`);

  return {
    user,
    profile: (profileResult.data || { role: 'teacher', plan: 'free' }) as TeacherProfile,
    entitlements: (entitlementsResult.data || null) as Entitlements | null,
    dashboard: (dashboardResult.data || {}) as TeacherDashboard,
    schedule: (scheduleResult.data || []) as ScheduleSlot[],
    warnings,
  };
}
