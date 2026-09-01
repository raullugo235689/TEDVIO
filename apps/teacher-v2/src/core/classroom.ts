import type { RealtimeChannel, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { GroupRecord, StudentRecord } from './types';

export type ClassroomSessionState = 'draft' | 'live' | 'closed';
export type ClassroomQuestionState = 'queued' | 'live' | 'closed' | 'revealed';

export interface ClassroomSession {
  id: string;
  teacher_id: string;
  code: string;
  title: string;
  status: ClassroomSessionState;
  competitive: boolean;
  team_mode: boolean;
  current_question_id?: string | null;
  created_at: string;
  started_at?: string | null;
  closed_at?: string | null;
  university?: string | null;
  educational_program?: string | null;
  group_name?: string | null;
  group_id?: string | null;
  scoring_mode: 'speed' | 'accuracy' | 'none';
  speed_bonus: boolean;
  streak_bonus: boolean;
  randomize_questions: boolean;
  randomize_options: boolean;
  roster_required: boolean;
  base_points: number;
  speed_bonus_max: number;
  streak_bonus_step: number;
  is_demo: boolean;
}

export interface ClassroomQuestion {
  id: string;
  session_id: string;
  bank_id?: string | null;
  position: number;
  prompt: string;
  question_type: string;
  options: unknown;
  correct_answer?: unknown;
  media_url?: string | null;
  media_type?: string | null;
  timer_seconds: number;
  status: ClassroomQuestionState;
  launched_at?: string | null;
  closed_at?: string | null;
  explanation?: string | null;
  difficulty?: string | null;
}

export interface ClassroomParticipant {
  id: string;
  session_id: string;
  display_name: string;
  team_name?: string | null;
  joined_at: string;
  last_seen_at: string;
  roster_student_id?: string | null;
  matricula?: string | null;
}

export interface ClassroomResponse {
  id: string;
  question_id: string;
  participant_id: string;
  answer: unknown;
  submitted_at: string;
  is_correct?: boolean | null;
  points: number;
  streak: number;
}

export interface StudentNote {
  id: string;
  group_id: string;
  student_id: string;
  teacher_id: string;
  note?: string | null;
  updated_at: string;
}

export interface ClassroomWorkspace {
  session: ClassroomSession;
  questions: ClassroomQuestion[];
  participants: ClassroomParticipant[];
  responses: ClassroomResponse[];
  group: GroupRecord | null;
  roster: StudentRecord[];
  notes: StudentNote[];
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message || 'Error desconocido');
  }
  return String(error || 'Error desconocido');
}

export function classroomSessionsKey(userId?: string) {
  return ['teacher-classroom-sessions', userId || 'anonymous'] as const;
}

export function classroomSessionKey(userId?: string, sessionId?: string) {
  return ['teacher-classroom-session', userId || 'anonymous', sessionId || 'none'] as const;
}

export async function fetchClassroomSessions(user: User): Promise<ClassroomSession[]> {
  const { data, error } = await supabase
    .from('v2_sessions')
    .select('*')
    .eq('teacher_id', user.id)
    .eq('is_demo', false)
    .order('created_at', { ascending: false })
    .limit(60);
  if (error) throw new Error(`No se pudieron cargar las sesiones: ${errorMessage(error)}`);
  return (data || []) as ClassroomSession[];
}

export async function fetchClassroomSession(user: User, sessionId: string): Promise<ClassroomWorkspace> {
  const sessionResult = await supabase
    .from('v2_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('teacher_id', user.id)
    .single();
  if (sessionResult.error) throw new Error(`No se pudo abrir la sesión: ${errorMessage(sessionResult.error)}`);
  const session = sessionResult.data as ClassroomSession;

  const [questionsResult, participantsResult, groupResult] = await Promise.all([
    supabase
      .from('v2_questions')
      .select('*')
      .eq('session_id', session.id)
      .order('position'),
    supabase
      .from('v2_participants')
      .select('id,session_id,display_name,team_name,joined_at,last_seen_at,roster_student_id,matricula')
      .eq('session_id', session.id)
      .order('joined_at'),
    session.group_id
      ? supabase
          .from('v2_groups')
          .select('*')
          .eq('id', session.group_id)
          .eq('teacher_id', user.id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (questionsResult.error) throw new Error(`No se pudieron cargar las preguntas: ${errorMessage(questionsResult.error)}`);
  if (participantsResult.error) throw new Error(`No se pudieron cargar los participantes: ${errorMessage(participantsResult.error)}`);
  if (groupResult.error) throw new Error(`No se pudo cargar el grupo: ${errorMessage(groupResult.error)}`);

  const questions = (questionsResult.data || []) as ClassroomQuestion[];
  const questionIds = questions.map((question) => question.id);
  const responsePromise = questionIds.length
    ? supabase
        .from('v2_responses')
        .select('id,question_id,participant_id,answer,submitted_at,is_correct,points,streak')
        .in('question_id', questionIds)
        .order('submitted_at')
    : Promise.resolve({ data: [], error: null });

  const rosterPromise = session.group_id
    ? supabase
        .from('v2_group_students')
        .select('*')
        .eq('teacher_id', user.id)
        .eq('group_id', session.group_id)
        .eq('active', true)
        .order('full_name')
    : Promise.resolve({ data: [], error: null });

  const notesPromise = session.group_id
    ? supabase
        .from('v2_student_notes')
        .select('*')
        .eq('teacher_id', user.id)
        .eq('group_id', session.group_id)
        .order('updated_at', { ascending: false })
    : Promise.resolve({ data: [], error: null });

  const [responsesResult, rosterResult, notesResult] = await Promise.all([
    responsePromise,
    rosterPromise,
    notesPromise,
  ]);

  if (responsesResult.error) throw new Error(`No se pudieron cargar las respuestas: ${errorMessage(responsesResult.error)}`);
  if (rosterResult.error) throw new Error(`No se pudo cargar el padrón: ${errorMessage(rosterResult.error)}`);
  if (notesResult.error) throw new Error(`No se pudieron cargar las notas: ${errorMessage(notesResult.error)}`);

  return {
    session,
    questions,
    participants: (participantsResult.data || []) as ClassroomParticipant[],
    responses: (responsesResult.data || []) as ClassroomResponse[],
    group: (groupResult.data || null) as GroupRecord | null,
    roster: (rosterResult.data || []) as StudentRecord[],
    notes: (notesResult.data || []) as StudentNote[],
  };
}

export async function launchClassroomQuestion(user: User, sessionId: string, questionId: string): Promise<void> {
  await runClassroomCommand(user, sessionId, 'launch', questionId);
}

export async function revealClassroomQuestion(user: User, sessionId: string, questionId: string): Promise<void> {
  await runClassroomCommand(user, sessionId, 'reveal', questionId);
}

export async function closeClassroomQuestion(user: User, sessionId: string, questionId: string): Promise<void> {
  await runClassroomCommand(user, sessionId, 'close_question', questionId);
}

export async function closeClassroomSession(user: User, sessionId: string): Promise<void> {
  await runClassroomCommand(user, sessionId, 'close_session');
}

async function runClassroomCommand(
  user: User,
  sessionId: string,
  action: 'launch' | 'reveal' | 'close_question' | 'close_session',
  questionId?: string,
): Promise<void> {
  if (!user.id) throw new Error('Tu sesión expiró.');
  const { error } = await supabase.rpc('v2_teacher_classroom_command', {
    p_session_id: sessionId,
    p_action: action,
    p_question_id: questionId || null,
  });
  if (error) throw new Error(`No se pudo actualizar la clase: ${errorMessage(error)}`);
}

export async function saveClassroomStudentNote(
  user: User,
  groupId: string,
  studentId: string,
  note: string,
): Promise<void> {
  const { error } = await supabase
    .from('v2_student_notes')
    .upsert(
      {
        group_id: groupId,
        student_id: studentId,
        teacher_id: user.id,
        note: note.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'group_id,student_id' },
    );
  if (error) throw new Error(`No se pudo guardar la nota: ${errorMessage(error)}`);
}

export function subscribeClassroom(
  sessionId: string,
  currentQuestionId: string | null | undefined,
  onChange: () => void,
  onStatus: (status: ClassroomConnectionState) => void = () => undefined,
): () => void {
  const channelName = `teacher-classroom-${sessionId}-${currentQuestionId || 'lobby'}`;
  let channel: RealtimeChannel = supabase
    .channel(channelName)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'v2_sessions', filter: `id=eq.${sessionId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'v2_questions', filter: `session_id=eq.${sessionId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'v2_participants', filter: `session_id=eq.${sessionId}` }, onChange);

  if (currentQuestionId) {
    channel = channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'v2_responses', filter: `question_id=eq.${currentQuestionId}` },
      onChange,
    );
  }
  onStatus(navigator.onLine ? 'connecting' : 'offline');
  channel.subscribe((status) => {
    if (!navigator.onLine) onStatus('offline');
    else if (status === 'SUBSCRIBED') onStatus('connected');
    else onStatus('reconnecting');
  });
  return () => {
    void supabase.removeChannel(channel);
  };
}

export type ClassroomConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'offline';

export function studentJoinUrl(code: string): string {
  return `${window.location.origin}/student-v2/?code=${encodeURIComponent(code)}`;
}

export function projectionUrl(code: string): string {
  return `${window.location.origin}/projection-v2/?code=${encodeURIComponent(code)}`;
}
