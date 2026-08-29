import type { User } from '@supabase/supabase-js';

export type AttendanceSessionState = 'open' | 'paused' | 'closed';
export type AttendanceState = AttendanceSessionState | '' | null;
export type AttendanceRecordStatus = 'present' | 'late' | 'absent' | 'justified';

export interface TeacherProfile {
  status?: string | null;
  plan?: string | null;
  role?: string | null;
}

export interface Entitlements {
  display_name?: string | null;
  plan?: string | null;
  limits?: Record<string, number | string | null>;
  usage?: Record<string, number | string | null>;
  features?: Record<string, boolean | null>;
}

export interface DashboardGroup {
  id: string;
  name?: string | null;
  group_name?: string | null;
  subject?: string | null;
  program?: string | null;
  university?: string | null;
  term?: string | null;
  students?: number | null;
  attendance_rate?: number | null;
  grade_avg?: number | null;
  risk_count?: number | null;
  watch_count?: number | null;
  today_attendance_status?: AttendanceState;
  today_attendance_records_count?: number | null;
  attendance_sessions_count?: number | null;
  last_activity?: string | null;
}

export interface PriorityStudent {
  student_id?: string | null;
  group_id?: string | null;
  full_name?: string | null;
  enrollment?: string | null;
  attendance_rate?: number | null;
  grade?: number | null;
  status?: 'risk' | 'watch' | string | null;
}

export interface LatestEvaluation {
  id?: string | null;
  group_id?: string | null;
  title?: string | null;
  average?: number | null;
  created_at?: string | null;
}

export interface TeacherDashboard {
  groups_count?: number | null;
  pending_attendance?: number | null;
  risk_students?: number | null;
  watch_students?: number | null;
  groups?: DashboardGroup[] | null;
  priority_students?: PriorityStudent[] | null;
  latest_evaluation?: LatestEvaluation | null;
}

export interface ScheduleSlot {
  id: string;
  group_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  room?: string | null;
  modality?: string | null;
  active?: boolean | null;
  updated_at?: string | null;
}

export interface TeacherHomeData {
  user: User;
  profile: TeacherProfile;
  entitlements: Entitlements | null;
  dashboard: TeacherDashboard;
  schedule: ScheduleSlot[];
  warnings: string[];
}

export interface AgendaOccurrence {
  slot: ScheduleSlot;
  group: DashboardGroup | null;
  start: Date;
  end: Date;
}

export interface AgendaSnapshot {
  current: AgendaOccurrence | null;
  next: AgendaOccurrence | null;
  after: AgendaOccurrence | null;
  today: AgendaOccurrence[];
}

export interface RecommendedAction {
  eyebrow: string;
  title: string;
  detail: string;
  groupId?: string;
  tone: 'blue' | 'green' | 'amber' | 'red' | 'violet';
}

export interface UniversityRecord {
  id: string;
  teacher_id: string;
  name: string;
  created_at: string;
}

export interface ProgramRecord {
  id: string;
  teacher_id: string;
  university_id: string;
  name: string;
  created_at: string;
}

export interface GroupRecord {
  id: string;
  teacher_id: string;
  program_id: string;
  name: string;
  term?: string | null;
  subject?: string | null;
  created_at: string;
  university?: string | null;
  program?: string | null;
  group_name?: string | null;
  school_cycle?: string | null;
  is_demo?: boolean | null;
  university_name?: string | null;
  program_name?: string | null;
}

export interface StudentRecord {
  id: string;
  group_id: string;
  teacher_id: string;
  enrollment: string;
  full_name: string;
  active: boolean;
  created_at: string;
}

export interface AttendanceSessionRecord {
  id: string;
  group_id: string;
  teacher_id: string;
  attendance_date: string;
  notes?: string | null;
  created_at: string;
  status: AttendanceSessionState;
  opened_at: string;
  paused_at?: string | null;
  closed_at?: string | null;
  late_after_minutes: number;
  auto_mark_absent: boolean;
  updated_at: string;
}

export interface AttendanceRecordRow {
  id: string;
  attendance_session_id: string;
  student_id: string;
  teacher_id: string;
  status: AttendanceRecordStatus;
  note?: string | null;
  observation?: string | null;
  updated_at: string;
}

export interface GroupWorkspaceData {
  universities: UniversityRecord[];
  programs: ProgramRecord[];
  groups: GroupRecord[];
}

export interface GroupDetailData {
  group: GroupRecord;
  students: StudentRecord[];
  attendance_sessions: AttendanceSessionRecord[];
  attendance_records: AttendanceRecordRow[];
}

export interface AttendanceDayData {
  group: GroupRecord;
  students: StudentRecord[];
  session: AttendanceSessionRecord | null;
  records: AttendanceRecordRow[];
  date: string;
}
