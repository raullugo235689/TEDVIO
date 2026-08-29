import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type {
  AttendanceRecordRow,
  AttendanceSessionRecord,
  GroupDetailData,
  GroupRecord,
  GroupWorkspaceData,
  ProgramRecord,
  StudentRecord,
  UniversityRecord,
} from './types';

export interface GroupDraft {
  id?: string;
  programId: string;
  name: string;
  subject: string;
  term: string;
}

export interface StudentDraft {
  id?: string;
  enrollment: string;
  fullName: string;
  active?: boolean;
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message || 'Error desconocido');
  }
  return String(error || 'Error desconocido');
}

function clean(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function groupWorkspaceKey(userId?: string) {
  return ['groups-workspace', userId] as const;
}

export function groupDetailKey(userId?: string, groupId?: string) {
  return ['group-detail', userId, groupId] as const;
}

export async function fetchGroupWorkspace(user: User): Promise<GroupWorkspaceData> {
  const [universitiesResult, programsResult, groupsResult] = await Promise.all([
    supabase
      .from('v2_universities')
      .select('id,teacher_id,name,created_at')
      .eq('teacher_id', user.id)
      .order('name'),
    supabase
      .from('v2_programs')
      .select('id,teacher_id,university_id,name,created_at')
      .eq('teacher_id', user.id)
      .order('name'),
    supabase
      .from('v2_groups')
      .select('id,teacher_id,program_id,name,term,subject,created_at,university,program,group_name,school_cycle,is_demo')
      .eq('teacher_id', user.id)
      .eq('is_demo', false)
      .order('created_at', { ascending: false }),
  ]);

  if (universitiesResult.error) throw new Error(`Instituciones: ${errorMessage(universitiesResult.error)}`);
  if (programsResult.error) throw new Error(`Programas: ${errorMessage(programsResult.error)}`);
  if (groupsResult.error) throw new Error(`Grupos: ${errorMessage(groupsResult.error)}`);

  const universities = (universitiesResult.data || []) as UniversityRecord[];
  const programs = (programsResult.data || []) as ProgramRecord[];
  const universityById = new Map(universities.map((item) => [item.id, item]));
  const programById = new Map(programs.map((item) => [item.id, item]));

  const groups = ((groupsResult.data || []) as GroupRecord[]).map((group) => {
    const program = programById.get(group.program_id);
    const university = program ? universityById.get(program.university_id) : null;
    return {
      ...group,
      program_name: program?.name || group.program || null,
      university_name: university?.name || group.university || null,
    };
  });

  return { universities, programs, groups };
}

export async function createUniversity(user: User, name: string): Promise<UniversityRecord> {
  const normalized = clean(name);
  if (!normalized) throw new Error('Escribe el nombre de la institución.');
  const { data, error } = await supabase
    .from('v2_universities')
    .upsert({ teacher_id: user.id, name: normalized }, { onConflict: 'teacher_id,name' })
    .select('id,teacher_id,name,created_at')
    .single();
  if (error) throw new Error(errorMessage(error));
  return data as UniversityRecord;
}

export async function createProgram(user: User, universityId: string, name: string): Promise<ProgramRecord> {
  const normalized = clean(name);
  if (!universityId) throw new Error('Selecciona una institución.');
  if (!normalized) throw new Error('Escribe el nombre del programa académico.');
  const { data, error } = await supabase
    .from('v2_programs')
    .upsert(
      { teacher_id: user.id, university_id: universityId, name: normalized },
      { onConflict: 'university_id,name' },
    )
    .select('id,teacher_id,university_id,name,created_at')
    .single();
  if (error) throw new Error(errorMessage(error));
  return data as ProgramRecord;
}

export async function saveGroup(user: User, workspace: GroupWorkspaceData, draft: GroupDraft): Promise<GroupRecord> {
  const name = clean(draft.name);
  const subject = clean(draft.subject);
  const term = clean(draft.term);
  const program = workspace.programs.find((item) => item.id === draft.programId);
  const university = program ? workspace.universities.find((item) => item.id === program.university_id) : null;

  if (!program || !university) throw new Error('Selecciona un programa académico válido.');
  if (!name) throw new Error('Escribe el grado o nombre del grupo.');
  if (!subject) throw new Error('Escribe la asignatura.');

  const payload = {
    program_id: program.id,
    name,
    term: term || null,
    subject,
    university: university.name,
    program: program.name,
    group_name: name,
    school_cycle: term || null,
  };

  const request = draft.id
    ? supabase
        .from('v2_groups')
        .update(payload)
        .eq('id', draft.id)
        .eq('teacher_id', user.id)
        .select('id,teacher_id,program_id,name,term,subject,created_at,university,program,group_name,school_cycle,is_demo')
        .single()
    : supabase
        .from('v2_groups')
        .insert({ ...payload, teacher_id: user.id })
        .select('id,teacher_id,program_id,name,term,subject,created_at,university,program,group_name,school_cycle,is_demo')
        .single();

  const { data, error } = await request;
  if (error) throw new Error(error.code === '23505' ? 'Ya existe un grupo con ese nombre dentro del programa.' : errorMessage(error));
  return data as GroupRecord;
}

export async function fetchGroupDetail(user: User, groupId: string): Promise<GroupDetailData> {
  const [groupResult, studentsResult, sessionsResult] = await Promise.all([
    supabase
      .from('v2_groups')
      .select('id,teacher_id,program_id,name,term,subject,created_at,university,program,group_name,school_cycle,is_demo')
      .eq('id', groupId)
      .eq('teacher_id', user.id)
      .single(),
    supabase
      .from('v2_group_students')
      .select('id,group_id,teacher_id,enrollment,full_name,active,created_at')
      .eq('group_id', groupId)
      .eq('teacher_id', user.id)
      .order('active', { ascending: false })
      .order('full_name'),
    supabase
      .from('v2_attendance_sessions')
      .select('id,group_id,teacher_id,attendance_date,notes,created_at,status,opened_at,paused_at,closed_at,late_after_minutes,auto_mark_absent,updated_at')
      .eq('group_id', groupId)
      .eq('teacher_id', user.id)
      .order('attendance_date', { ascending: false })
      .limit(20),
  ]);

  if (groupResult.error) throw new Error(`Grupo: ${errorMessage(groupResult.error)}`);
  if (studentsResult.error) throw new Error(`Alumnos: ${errorMessage(studentsResult.error)}`);
  if (sessionsResult.error) throw new Error(`Asistencia: ${errorMessage(sessionsResult.error)}`);

  const sessions = (sessionsResult.data || []) as AttendanceSessionRecord[];
  let records: AttendanceRecordRow[] = [];
  if (sessions.length) {
    const { data, error } = await supabase
      .from('v2_attendance_records')
      .select('id,attendance_session_id,student_id,teacher_id,status,note,observation,updated_at')
      .eq('teacher_id', user.id)
      .in('attendance_session_id', sessions.map((item) => item.id));
    if (error) throw new Error(`Registros de asistencia: ${errorMessage(error)}`);
    records = (data || []) as AttendanceRecordRow[];
  }

  return {
    group: groupResult.data as GroupRecord,
    students: (studentsResult.data || []) as StudentRecord[],
    attendance_sessions: sessions,
    attendance_records: records,
  };
}

export async function saveStudent(user: User, groupId: string, draft: StudentDraft): Promise<StudentRecord> {
  const enrollment = clean(draft.enrollment);
  const fullName = clean(draft.fullName);
  if (!enrollment || !fullName) throw new Error('Matrícula y nombre son obligatorios.');

  const payload = { enrollment, full_name: fullName, active: draft.active ?? true };
  const request = draft.id
    ? supabase
        .from('v2_group_students')
        .update(payload)
        .eq('id', draft.id)
        .eq('group_id', groupId)
        .eq('teacher_id', user.id)
        .select('id,group_id,teacher_id,enrollment,full_name,active,created_at')
        .single()
    : supabase
        .from('v2_group_students')
        .upsert(
          { ...payload, group_id: groupId, teacher_id: user.id },
          { onConflict: 'group_id,enrollment' },
        )
        .select('id,group_id,teacher_id,enrollment,full_name,active,created_at')
        .single();

  const { data, error } = await request;
  if (error) throw new Error(error.code === '23505' ? 'Esa matrícula ya está registrada en el grupo.' : errorMessage(error));
  return data as StudentRecord;
}

export function parseRosterText(text: string): StudentDraft[] {
  const unique = new Map<string, StudentDraft>();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const parts = line.split(/[,;\t]/).map((part) => clean(part)).filter(Boolean);
    const enrollment = parts.shift() || '';
    const fullName = clean(parts.join(' '));
    if (!enrollment || !fullName) continue;
    unique.set(enrollment.toLocaleLowerCase('es-MX'), { enrollment, fullName, active: true });
  }
  return [...unique.values()];
}

export async function importStudents(user: User, groupId: string, students: StudentDraft[]): Promise<number> {
  if (!students.length) throw new Error('No encontré filas válidas. Usa matrícula, nombre.');
  const rows = students.map((student) => ({
    group_id: groupId,
    teacher_id: user.id,
    enrollment: clean(student.enrollment),
    full_name: clean(student.fullName),
    active: true,
  }));
  const { data, error } = await supabase
    .from('v2_group_students')
    .upsert(rows, { onConflict: 'group_id,enrollment' })
    .select('id');
  if (error) throw new Error(errorMessage(error));
  return data?.length || rows.length;
}

export async function setStudentActive(user: User, groupId: string, studentId: string, active: boolean): Promise<void> {
  const { error } = await supabase
    .from('v2_group_students')
    .update({ active })
    .eq('id', studentId)
    .eq('group_id', groupId)
    .eq('teacher_id', user.id);
  if (error) throw new Error(errorMessage(error));
}
