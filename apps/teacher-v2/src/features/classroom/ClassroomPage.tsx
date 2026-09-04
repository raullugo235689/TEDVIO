import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatPercent, groupName, groupSubject } from '../../core/academic';
import {
  classroomSessionKey,
  classroomSessionsKey,
  closeClassroomQuestion,
  closeClassroomSession,
  fetchClassroomSession,
  fetchClassroomSessions,
  launchClassroomQuestion,
  projectionUrl,
  revealClassroomQuestion,
  saveClassroomStudentNote,
  studentJoinUrl,
  subscribeClassroom,
  type ClassroomParticipant,
  type ClassroomQuestion,
  type ClassroomResponse,
  type ClassroomConnectionState,
  type ClassroomSession,
} from '../../core/classroom';
import { useTeacherHome } from '../../core/useTeacherHome';
import {
  classReadinessKey,
  fetchClassReadiness,
  recordSessionHealth,
  subscribePilotHealth,
} from '../../core/pilot-health';
import type { StudentRecord } from '../../core/types';
import { EmptyState, ErrorPanel, LoadingScreen, MetricCard, PageHeader, SectionCard, StatusPill } from '../../shared/components';
import { Icon } from '../../shared/icons';
import { useAuth } from '../auth/AuthProvider';

interface ScoreRow {
  id: string;
  name: string;
  team: string;
  points: number;
  correct: number;
  answered: number;
  streak: number;
}

interface QuestionInsight {
  question: ClassroomQuestion;
  responses: number;
  correct: number;
  accuracy: number | null;
}

interface StudentInsight extends ScoreRow {
  accuracy: number | null;
  participation: number;
  needsFollowUp: boolean;
}

type ParticipationKind = 'question' | 'contribution' | 'support';
type ParticipationState = Record<string, Record<ParticipationKind, number>>;

type ClassroomAction =
  | { type: 'launch'; questionId: string }
  | { type: 'reveal'; questionId: string }
  | { type: 'close-question'; questionId: string }
  | { type: 'close-session' };

function sessionTone(status: string): string {
  if (status === 'live') return 'green';
  if (status === 'draft') return 'amber';
  return 'neutral';
}

function sessionLabel(status: string): string {
  if (status === 'live') return 'En vivo';
  if (status === 'draft') return 'Preparada';
  return 'Finalizada';
}

function questionLabel(status: string): string {
  if (status === 'live') return 'Aceptando respuestas';
  if (status === 'revealed') return 'Respuesta revelada';
  if (status === 'closed') return 'Cerrada';
  return 'En cola';
}

function dateTime(value?: string | null): string {
  return value ? new Date(value).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

function durationLabel(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}` : `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function questionOptions(question?: ClassroomQuestion | null): string[] {
  return Array.isArray(question?.options) ? question.options.map((value) => String(value)) : [];
}

function correctSet(question?: ClassroomQuestion | null): Set<string> {
  const value = question?.correct_answer;
  if (Array.isArray(value)) return new Set(value.map(String));
  return value == null ? new Set() : new Set([String(value)]);
}

function scoreRows(participants: ClassroomParticipant[], responses: ClassroomResponse[], byTeam: boolean): ScoreRow[] {
  const rows = participants.map((participant) => ({
    id: participant.id,
    name: participant.display_name || 'Alumno',
    team: participant.team_name || '',
    points: 0,
    correct: 0,
    answered: 0,
    streak: 0,
  }));
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const response of responses) {
    const row = byId.get(response.participant_id);
    if (!row) continue;
    row.points += Number(response.points || 0);
    row.answered += 1;
    if (response.is_correct) row.correct += 1;
    row.streak = Math.max(row.streak, Number(response.streak || 0));
  }
  if (!byTeam) return rows.sort((a, b) => b.points - a.points || b.correct - a.correct || a.name.localeCompare(b.name));
  const teams = new Map<string, ScoreRow>();
  for (const row of rows) {
    const key = row.team || 'Sin equipo';
    const current = teams.get(key) || { id: key, name: key, team: key, points: 0, correct: 0, answered: 0, streak: 0 };
    current.points += row.points;
    current.correct += row.correct;
    current.answered += row.answered;
    current.streak = Math.max(current.streak, row.streak);
    teams.set(key, current);
  }
  return [...teams.values()].sort((a, b) => b.points - a.points || b.correct - a.correct || a.name.localeCompare(b.name));
}

function questionInsights(questions: ClassroomQuestion[], responses: ClassroomResponse[]): QuestionInsight[] {
  return questions.map((question) => {
    const rows = responses.filter((response) => response.question_id === question.id);
    const scored = rows.filter((response) => response.is_correct != null);
    const correct = scored.filter((response) => response.is_correct).length;
    return {
      question,
      responses: rows.length,
      correct,
      accuracy: scored.length ? Math.round(100 * correct / scored.length) : null,
    };
  });
}

function studentInsights(participants: ClassroomParticipant[], responses: ClassroomResponse[], scoredQuestions: number): StudentInsight[] {
  return scoreRows(participants, responses, false).map((row) => {
    const accuracy = row.answered ? Math.round(100 * row.correct / row.answered) : null;
    const participation = scoredQuestions ? Math.round(100 * row.answered / scoredQuestions) : 0;
    return { ...row, accuracy, participation, needsFollowUp: row.answered === 0 || participation < 60 || (accuracy != null && accuracy < 60) };
  });
}

function csvCell(value: unknown): string {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function downloadSessionSummary(session: ClassroomSession, questions: QuestionInsight[], students: StudentInsight[]): void {
  const lines = [
    ['TEDVIO', 'Resumen postclase'],
    ['Sesión', session.title || 'Sesión TEDVIO'],
    ['Código', session.code],
    ['Fecha de cierre', session.closed_at ? new Date(session.closed_at).toLocaleString('es-MX') : '—'],
    [],
    ['ANÁLISIS POR REACTIVO'],
    ['N.º', 'Reactivo', 'Respuestas', 'Correctas', 'Acierto'],
    ...questions.map((row) => [row.question.position, row.question.prompt, row.responses, row.correct, row.accuracy == null ? 'No calificable' : `${row.accuracy}%`]),
    [],
    ['DESEMPEÑO POR PARTICIPANTE'],
    ['Posición', 'Nombre', 'Matrícula', 'Respuestas', 'Correctas', 'Acierto', 'Participación', 'Puntos', 'Seguimiento'],
    ...students.map((row, index) => [index + 1, row.name, row.team, row.answered, row.correct, row.accuracy == null ? '—' : `${row.accuracy}%`, `${row.participation}%`, row.points, row.needsFollowUp ? 'Revisar' : 'En orden']),
  ];
  const blob = new Blob([`\ufeff${lines.map((row) => row.map(csvCell).join(',')).join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `TEDVIO_Resumen_${session.code}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function useClock(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    let timer = 0;
    const tick = () => {
      setNow(Date.now());
      timer = window.setTimeout(tick, 1000);
    };
    tick();
    return () => window.clearTimeout(timer);
  }, [active]);
  return now;
}

function SessionCard({ session, groupLabel }: { session: ClassroomSession; groupLabel: string }) {
  return (
    <article className="classroom-session-card">
      <header><div><span className="eyebrow">CÓDIGO {session.code}</span><h2>{session.title || 'Sesión TEDVIO'}</h2><p>{groupLabel}</p></div><StatusPill tone={sessionTone(session.status)}>{sessionLabel(session.status)}</StatusPill></header>
      <div className="classroom-session-meta"><span><small>Creada</small><b>{dateTime(session.created_at)}</b></span><span><small>Modalidad</small><b>{session.competitive ? 'Competitiva' : 'Formativa'}</b></span><span><small>Participación</small><b>{session.team_mode ? 'Equipos' : 'Individual'}</b></span></div>
      <footer><Link className="button primary" to={`/classroom/${session.id}`}>{session.status === 'closed' ? 'Ver resumen' : 'Abrir control'}</Link></footer>
    </article>
  );
}

function ClassroomLanding() {
  const auth = useAuth();
  const home = useTeacherHome();
  const [searchParams] = useSearchParams();
  const [groupId, setGroupId] = useState(searchParams.get('group') || '');
  const sessions = useQuery({
    queryKey: classroomSessionsKey(auth.user?.id),
    queryFn: () => {
      if (!auth.user) throw new Error('No hay una sesión docente activa.');
      return fetchClassroomSessions(auth.user);
    },
    enabled: Boolean(auth.user),
  });

  if (home.isLoading || sessions.isLoading) return <LoadingScreen label="Preparando Modo Clase…" />;
  if (home.isError) return <ErrorPanel title="No pude cargar tus grupos" detail={home.error.message} onRetry={() => home.refetch()} />;
  if (sessions.isError) return <ErrorPanel title="No pude cargar las sesiones" detail={sessions.error.message} onRetry={() => sessions.refetch()} />;

  const groups = home.data?.dashboard.groups || [];
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const active = (sessions.data || []).filter((session) => session.status !== 'closed');
  const closed = (sessions.data || []).filter((session) => session.status === 'closed');

  return (
    <div className="view-stack classroom-landing">
      <PageHeader eyebrow="MODO CLASE" title="Cockpit docente" detail="Prepara preguntas, abre una sala, acompaña respuestas y cierra la sesión sin desmontar TEDVIO 2.0." />

      <section className="classroom-start-panel">
        <div><span className="eyebrow">NUEVA CLASE</span><h2>Empieza desde tu banco revisado</h2><p>Elige el grupo y después selecciona las preguntas que quieres llevar al aula.</p></div>
        <label>Grupo<select value={groupId} onChange={(event) => setGroupId(event.target.value)}><option value="">Selecciona un grupo</option>{groups.map((group) => <option key={group.id} value={group.id}>{groupSubject(group)} · {groupName(group)}</option>)}</select></label>
        <Link className={`button primary${groupId ? '' : ' disabled-link'}`} aria-disabled={!groupId} to={groupId ? `/bank?group=${groupId}&launch=1` : '/classroom'}>Elegir preguntas <Icon name="arrow" /></Link>
      </section>

      <SectionCard>
        <div className="section-heading"><div><span className="eyebrow">SESIONES ACTIVAS</span><h2>Preparadas o en curso</h2><p>Retoma el control desde cualquier dispositivo con tu sesión docente.</p></div><StatusPill tone={active.length ? 'green' : 'neutral'}>{active.length} activas</StatusPill></div>
        {active.length ? <div className="classroom-session-grid">{active.map((session) => { const group = session.group_id ? groupById.get(session.group_id) : null; return <SessionCard key={session.id} session={session} groupLabel={group ? `${groupSubject(group)} · ${groupName(group)}` : session.group_name || 'Sin grupo vinculado'} />; })}</div> : <EmptyState icon="classroom" title="No hay sesiones activas" detail="Selecciona un grupo y prepara una clase desde el Banco de Reactivos." action={<Link className="button secondary" to="/bank">Abrir banco</Link>} />}
      </SectionCard>

      <SectionCard>
        <div className="section-heading"><div><span className="eyebrow">HISTORIAL RECIENTE</span><h2>Clases finalizadas</h2><p>Consulta códigos, resultados y participación sin borrar la evidencia.</p></div><StatusPill>{closed.length} cerradas</StatusPill></div>
        {closed.length ? <div className="classroom-session-grid compact-grid">{closed.slice(0, 12).map((session) => { const group = session.group_id ? groupById.get(session.group_id) : null; return <SessionCard key={session.id} session={session} groupLabel={group ? `${groupSubject(group)} · ${groupName(group)}` : session.group_name || 'Sin grupo vinculado'} />; })}</div> : <p className="muted-copy">Cuando finalices una clase aparecerá aquí.</p>}
      </SectionCard>
    </div>
  );
}

function Distribution({ question, responses }: { question: ClassroomQuestion; responses: ClassroomResponse[] }) {
  const options = questionOptions(question);
  const correct = correctSet(question);
  if (question.question_type === 'open_text') {
    return <div className="open-response-list">{responses.length ? responses.slice().reverse().slice(0, 16).map((response) => <article key={response.id}>{typeof response.answer === 'string' ? response.answer : JSON.stringify(response.answer)}</article>) : <p>Aún no hay respuestas.</p>}</div>;
  }
  if (!options.length) {
    const correctCount = responses.filter((response) => response.is_correct).length;
    return <div className="numeric-response-summary"><b>{responses.length}</b><span>respuestas recibidas</span>{question.status === 'revealed' && question.correct_answer != null ? <small>Respuesta de referencia: {String(question.correct_answer)}</small> : null}{responses.length ? <small>{correctCount} correctas</small> : null}</div>;
  }
  return (
    <div className="classroom-distribution">
      {options.map((option, index) => {
        const count = responses.filter((response) => Array.isArray(response.answer) ? response.answer.map(String).includes(option) : String(response.answer) === option).length;
        const percentage = responses.length ? Math.round((count / responses.length) * 100) : 0;
        const isCorrect = question.status === 'revealed' && correct.has(option);
        return <article className={isCorrect ? 'correct' : ''} key={`${option}-${index}`}><div><span><b>{String.fromCharCode(65 + index)}</b>{option}</span><strong>{count} · {percentage}%</strong></div><div className="result-bar"><i style={{ width: `${percentage}%` }} /></div></article>;
      })}
    </div>
  );
}

function ParticipationPanel({
  roster,
  notes,
  sessionId,
  groupId,
  onSaveNote,
  saving,
}: {
  roster: StudentRecord[];
  notes: Map<string, string>;
  sessionId: string;
  groupId?: string | null;
  onSaveNote: (studentId: string, note: string) => void;
  saving: boolean;
}) {
  const storageKey = `tedvio.classroom.participation.${sessionId}`;
  const [studentId, setStudentId] = useState('');
  const [note, setNote] = useState('');
  const [participation, setParticipation] = useState<ParticipationState>(() => {
    try { return JSON.parse(sessionStorage.getItem(storageKey) || '{}') as ParticipationState; } catch { return {}; }
  });
  const selected = roster.find((student) => student.id === studentId) || null;

  function choose(student: StudentRecord | null) {
    setStudentId(student?.id || '');
    setNote(student ? notes.get(student.id) || '' : '');
  }

  function randomStudent() {
    if (!roster.length) return;
    const candidates = roster.length > 1 && studentId ? roster.filter((student) => student.id !== studentId) : roster;
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    const randomValue = values[0] ?? 0;
    const candidate = candidates[randomValue % candidates.length];
    if (candidate) choose(candidate);
  }

  function add(kind: ParticipationKind) {
    if (!selected) return;
    setParticipation((current) => {
      const row = current[selected.id] || { question: 0, contribution: 0, support: 0 };
      const next = { ...current, [selected.id]: { ...row, [kind]: row[kind] + 1 } };
      sessionStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  }

  const counts = selected ? participation[selected.id] || { question: 0, contribution: 0, support: 0 } : { question: 0, contribution: 0, support: 0 };
  return (
    <SectionCard className="participation-panel">
      <div className="section-heading compact"><div><span className="eyebrow">PARTICIPACIÓN DOCENTE</span><h2>Alumno aleatorio y notas</h2><p>Los contadores son locales a esta sesión en el dispositivo; la nota sí se guarda en el expediente.</p></div><button className="button primary compact" type="button" onClick={randomStudent} disabled={!roster.length}>Elegir alumno</button></div>
      {selected ? (
        <div className="selected-student-card">
          <header><div><span className="student-avatar">{selected.full_name.slice(0, 2).toUpperCase()}</span><span><b>{selected.full_name}</b><small>{selected.enrollment}</small></span></div><button className="icon-button compact-icon" type="button" onClick={() => choose(null)} aria-label="Cerrar">×</button></header>
          <div className="participation-buttons"><button type="button" onClick={() => add('question')}><b>{counts.question}</b><span>Pregunta</span></button><button type="button" onClick={() => add('contribution')}><b>{counts.contribution}</b><span>Aporte</span></button><button type="button" onClick={() => add('support')}><b>{counts.support}</b><span>Apoyo</span></button></div>
          <label>Nota docente<textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Observación académica breve" /></label>
          <button className="button secondary wide" type="button" disabled={!groupId || saving} onClick={() => onSaveNote(selected.id, note)}>{saving ? 'Guardando…' : 'Guardar nota en Alumno 360°'}</button>
        </div>
      ) : <div className="empty-compact"><Icon name="groups" /><div><b>{roster.length ? 'Selecciona al azar' : 'Sin padrón vinculado'}</b><span>{roster.length ? 'TEDVIO evitará repetir al alumno anterior cuando sea posible.' : 'Vincula la sesión con un grupo para utilizar esta herramienta.'}</span></div></div>}
    </SectionCard>
  );
}

function ClassroomControl({ sessionId }: { sessionId: string }) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [notice, setNotice] = useState('');
  const [showRanking, setShowRanking] = useState(true);
  const [connection, setConnection] = useState<ClassroomConnectionState>(() => navigator.onLine ? 'connecting' : 'offline');

  const workspace = useQuery({
    queryKey: classroomSessionKey(auth.user?.id, sessionId),
    queryFn: () => {
      if (!auth.user) throw new Error('No hay una sesión docente activa.');
      return fetchClassroomSession(auth.user, sessionId);
    },
    enabled: Boolean(auth.user && sessionId),
    staleTime: 5_000,
  });

  const readinessQueryKey = useMemo(
    () => classReadinessKey(auth.user?.id, sessionId),
    [auth.user?.id, sessionId],
  );
  const readiness = useQuery({
    queryKey: readinessQueryKey,
    queryFn: () => {
      if (!auth.user) throw new Error('No hay una sesión docente activa.');
      return fetchClassReadiness(auth.user, sessionId);
    },
    enabled: Boolean(auth.user && sessionId),
    staleTime: 5_000,
  });

  const data = workspace.data;
  const current = data?.questions.find((question) => question.id === data.session.current_question_id)
    || data?.questions.find((question) => question.status === 'live' || question.status === 'revealed')
    || null;

  useEffect(() => {
    if (!sessionId) return;
    return subscribeClassroom(sessionId, current?.id, () => {
      void queryClient.invalidateQueries({ queryKey: classroomSessionKey(auth.user?.id, sessionId) });
    }, setConnection);
  }, [auth.user?.id, current?.id, queryClient, sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    return subscribePilotHealth(sessionId, () => {
      void queryClient.invalidateQueries({ queryKey: readinessQueryKey });
    });
  }, [queryClient, readinessQueryKey, sessionId]);

  useEffect(() => {
    const refresh = () => void queryClient.invalidateQueries({ queryKey: classroomSessionKey(auth.user?.id, sessionId) });
    const onOnline = () => {
      setConnection('reconnecting');
      if (sessionStorage.getItem(`tedvio.classroom.offline.${sessionId}`)) {
        sessionStorage.removeItem(`tedvio.classroom.offline.${sessionId}`);
        void recordSessionHealth(sessionId, 'client_offline', null, 'recovered_after_offline').catch(() => undefined);
      }
      refresh();
    };
    const onOffline = () => {
      sessionStorage.setItem(`tedvio.classroom.offline.${sessionId}`, new Date().toISOString());
      setConnection('offline');
    };
    const onVisibility = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [auth.user?.id, queryClient, sessionId]);

  useEffect(() => {
    if (!data || connection === 'offline') return;
    const eventType = connection === 'connected' ? 'client_connected' : 'client_reconnecting';
    void recordSessionHealth(sessionId, eventType).catch(() => undefined);
  }, [connection, data?.session.id, sessionId]);

  useEffect(() => {
    if (connection === 'connected' || data?.session.status === 'closed') return;
    let active = true;
    let fallback = 0;
    const recover = async () => {
      await queryClient.invalidateQueries({ queryKey: classroomSessionKey(auth.user?.id, sessionId) });
      if (active) fallback = window.setTimeout(() => void recover(), 5_000);
    };
    fallback = window.setTimeout(() => void recover(), 5_000);
    return () => { active = false; window.clearTimeout(fallback); };
  }, [auth.user?.id, connection, data?.session.status, queryClient, sessionId]);

  const now = useClock(Boolean(data && (data.session.status === 'live' || current?.status === 'live')));

  async function invalidate() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: classroomSessionKey(auth.user?.id, sessionId) }),
      queryClient.invalidateQueries({ queryKey: classroomSessionsKey(auth.user?.id) }),
      queryClient.invalidateQueries({ queryKey: ['teacher-home', auth.user?.id] }),
    ]);
  }

  const actionMutation = useMutation({
    mutationFn: async (action: ClassroomAction) => {
      if (!auth.user) throw new Error('Tu sesión expiró.');
      if (action.type === 'launch') await launchClassroomQuestion(auth.user, sessionId, action.questionId);
      if (action.type === 'reveal') await revealClassroomQuestion(auth.user, sessionId, action.questionId);
      if (action.type === 'close-question') await closeClassroomQuestion(auth.user, sessionId, action.questionId);
      if (action.type === 'close-session') await closeClassroomSession(auth.user, sessionId);
      return action.type;
    },
    onSuccess: async (type) => {
      const messages: Record<ClassroomAction['type'], string> = { launch: 'Pregunta iniciada.', reveal: 'Respuesta revelada.', 'close-question': 'Respuestas cerradas.', 'close-session': 'Clase finalizada y guardada.' };
      setNotice(messages[type]);
      await invalidate();
    },
  });

  const noteMutation = useMutation({
    mutationFn: ({ studentId, note }: { studentId: string; note: string }) => {
      if (!auth.user || !data?.session.group_id) throw new Error('La sesión no está vinculada a un grupo.');
      return saveClassroomStudentNote(auth.user, data.session.group_id, studentId, note);
    },
    onSuccess: async () => { setNotice('Nota guardada en el expediente del alumno.'); await invalidate(); },
  });

  if (workspace.isLoading) return <LoadingScreen label="Abriendo el cockpit docente…" />;
  if (workspace.isError) return <ErrorPanel title="No pude abrir Modo Clase" detail={workspace.error.message} onRetry={() => workspace.refetch()} />;
  if (!data) return null;

  const { session, questions, participants, responses, group, roster } = data;
  const currentResponses = current ? responses.filter((response) => response.question_id === current.id) : [];
  const answeredIds = new Set(currentResponses.map((response) => response.participant_id));
  const queued = questions.filter((question) => question.status === 'queued').sort((a, b) => a.position - b.position);
  const completed = questions.filter((question) => question.status === 'closed' || question.status === 'revealed').length;
  const nextQuestion = queued[0] || null;
  const ranking = scoreRows(participants, responses, session.team_mode);
  const perQuestion = questionInsights(questions, responses);
  const scoredQuestionCount = perQuestion.filter((row) => row.accuracy != null).length;
  const perStudent = studentInsights(participants, responses, Math.max(questions.length, scoredQuestionCount));
  const difficultQuestions = perQuestion.filter((row) => row.accuracy != null).sort((a, b) => (a.accuracy ?? 101) - (b.accuracy ?? 101));
  const followUpStudents = perStudent.filter((row) => row.needsFollowUp).sort((a, b) => a.participation - b.participation || (a.accuracy ?? -1) - (b.accuracy ?? -1));
  const activeParticipants = perStudent.filter((row) => row.answered > 0).length;
  const participationRate = participants.length ? Math.round(100 * activeParticipants / participants.length) : 0;
  const notes = new Map(data.notes.map((item) => [item.student_id, item.note || '']));
  const elapsedFrom = session.started_at || session.created_at;
  const elapsed = now - new Date(elapsedFrom).getTime();
  const remaining = current?.status === 'live' && current.launched_at
    ? Math.max(0, Math.ceil(Number(current.timer_seconds || 30) - (now - new Date(current.launched_at).getTime()) / 1000))
    : 0;
  const responseRate = participants.length ? Math.round((currentResponses.length / participants.length) * 100) : 0;
  const allScored = responses.filter((response) => response.is_correct != null);
  const accuracyRate = allScored.length ? Math.round((allScored.filter((response) => response.is_correct).length / allScored.length) * 100) : null;
  const closed = session.status === 'closed';
  const actionError = actionMutation.error || noteMutation.error;
  const readinessData = readiness.data || { ready: 0, degraded: 0, updateRequired: 0, observed: 0, clients: [], latestAt: null };
  const participantIds = new Set(participants.map((participant) => participant.id));
  const readinessClients = readinessData.clients.filter((client) => participantIds.has(client.participantId));
  const readinessByParticipant = new Map(readinessClients.map((client) => [client.participantId, client.status]));
  const readyClients = readinessClients.filter((client) => client.status === 'ready').length;
  const degradedClients = readinessClients.filter((client) => client.status === 'degraded').length;
  const updateRequiredClients = readinessClients.filter((client) => client.status === 'update_required').length;
  const readinessPending = Math.max(0, participants.length - readinessClients.length);
  const readinessTone = !participants.length
    ? 'waiting'
    : updateRequiredClients
      ? 'risk'
      : degradedClients || readinessPending
        ? 'degraded'
        : 'ready';

  async function copy(value: string, fallback: string) {
    try { await navigator.clipboard.writeText(value); setNotice('Enlace copiado.'); } catch { window.prompt(fallback, value); }
  }

  function openProjection() {
    window.open(projectionUrl(session.code), 'tedvio_projection', 'noopener,noreferrer');
  }

  function launchFromLobby(questionId: string) {
    if (participants.length && readinessTone !== 'ready') {
      const detail = updateRequiredClients
        ? `${updateRequiredClients} dispositivo(s) necesitan actualizar TEDVIO.`
        : `${readinessPending} dispositivo(s) siguen comprobándose y ${degradedClients} están en modo de respaldo.`;
      if (!window.confirm(`${detail}\n\n¿Deseas iniciar la pregunta de todas formas?`)) return;
    }
    actionMutation.mutate({ type: 'launch', questionId });
  }

  return (
    <div className="view-stack classroom-control">
      <PageHeader eyebrow="MODO CLASE" title={session.title || 'Sesión TEDVIO'} detail={`${group?.subject || session.educational_program || 'Clase'} · Código ${session.code}`} actions={<div className="page-actions"><Link className="button ghost" to="/classroom">← Sesiones</Link>{session.group_id ? <Link className="button ghost" to={`/attendance/${session.group_id}`}>Asistencia</Link> : null}<Link className="button secondary" to={`/classroom/${session.id}/health`}><Icon name="shield" />Salud</Link><button className="button secondary" type="button" onClick={openProjection}>Proyectar</button></div>} />

      <div className={`classroom-connection ${connection}`} role="status"><i /><span>{connection === 'connected' ? 'Sincronización en vivo activa' : connection === 'offline' ? 'Sin internet · la clase se conserva y se recuperará al volver' : 'Reconectando · comprobando el estado guardado de la clase'}</span></div>

      {!closed ? <section className={`classroom-readiness ${readinessTone}`} role="status" aria-live="polite">
        <div className="classroom-readiness-title"><i /><span><small>PREPARACIÓN DEL GRUPO</small><b>{readinessTone === 'ready' ? 'Todos los dispositivos observados están listos' : readinessTone === 'risk' ? 'Hay dispositivos que deben actualizarse' : readinessTone === 'waiting' ? 'Esperando alumnos' : 'La clase puede continuar con respaldo'}</b></span></div>
        <div className="classroom-readiness-counts"><span><b>{readyClients}</b><small>Listos</small></span><span><b>{degradedClients}</b><small>Respaldo</small></span><span><b>{updateRequiredClients}</b><small>Actualizar</small></span><span><b>{readinessPending}</b><small>Comprobando</small></span></div>
        <Link className="button ghost compact" to={`/classroom/${session.id}/health`}>Preparar clase</Link>
      </section> : null}

      {notice ? <div className="success-strip"><Icon name="check" /><span>{notice}</span><button type="button" onClick={() => setNotice('')}>×</button></div> : null}
      {actionError ? <ErrorPanel title="No se pudo completar la acción" detail={(actionError as Error).message || 'Intenta nuevamente.'} /> : null}

      <section className={`classroom-status-bar ${closed ? 'closed' : session.status}`}>
        <div><span className="live-indicator" /><span><small>ESTADO</small><b>{sessionLabel(session.status)}</b></span></div>
        <div><small>DURACIÓN</small><b>{durationLabel(elapsed)}</b></div>
        <div><small>PARTICIPANTES</small><b>{participants.length}</b></div>
        <div><small>PREGUNTAS</small><b>{completed}/{questions.length}</b></div>
        <div className="classroom-code"><small>CÓDIGO DE ACCESO</small><b>{session.code}</b><button type="button" onClick={() => void copy(session.code, 'Código de acceso')}>Copiar</button></div>
      </section>

      {closed ? (
        <>
          <section className="metrics-grid">
            <MetricCard icon="groups" label="Participantes" value={String(participants.length)} detail="Ingresaron a la sesión" tone="blue" />
            <MetricCard icon="attendance" label="Participación" value={`${participationRate}%`} detail={`${activeParticipants} de ${participants.length} respondieron`} tone={participationRate < 70 ? 'amber' : 'green'} />
            <MetricCard icon="bank" label="Preguntas" value={String(questions.length)} detail={`${completed} completadas · ${responses.length} respuestas`} tone="violet" />
            <MetricCard icon="check" label="Acierto" value={accuracyRate == null ? '—' : `${accuracyRate}%`} detail="En reactivos calificables" tone={accuracyRate != null && accuracyRate < 60 ? 'amber' : 'green'} />
          </section>
          <section className="postclass-hero">
            <div><span className="eyebrow">INTELIGENCIA POSTCLASE</span><h2>Resumen listo para tomar decisiones</h2><p>{followUpStudents.length ? `${followUpStudents.length} participante${followUpStudents.length === 1 ? '' : 's'} requiere${followUpStudents.length === 1 ? '' : 'n'} revisión; ` : 'No hay alertas críticas; '}{difficultQuestions[0]?.accuracy != null ? `el reactivo más difícil tuvo ${difficultQuestions[0].accuracy}% de acierto.` : 'la sesión no incluyó reactivos calificables.'}</p></div>
            <button className="button primary" type="button" onClick={() => downloadSessionSummary(session, perQuestion, perStudent)}>Exportar resumen CSV</button>
          </section>
          <div className="classroom-summary-grid postclass-grid">
            <SectionCard><div className="section-heading compact"><div><span className="eyebrow">REACTIVOS DIFÍCILES</span><h2>Dónde necesita refuerzo el grupo</h2><p>Ordenados por menor porcentaje de acierto.</p></div><StatusPill tone={difficultQuestions[0]?.accuracy != null && difficultQuestions[0].accuracy < 60 ? 'amber' : 'green'}>{difficultQuestions.filter((row) => row.accuracy != null && row.accuracy < 60).length} bajo 60%</StatusPill></div><div className="insight-list">{difficultQuestions.length ? difficultQuestions.slice(0, 6).map((row) => <article key={row.question.id}><span className={row.accuracy != null && row.accuracy < 60 ? 'risk' : 'ok'}>{row.accuracy == null ? '—' : `${row.accuracy}%`}</span><div><b>{row.question.prompt}</b><small>{row.correct} correctas de {row.responses} respuestas</small></div></article>) : <p className="muted-copy">No hay reactivos para analizar.</p>}</div></SectionCard>
            <SectionCard><div className="section-heading compact"><div><span className="eyebrow">SEGUIMIENTO SUGERIDO</span><h2>Alumnos que conviene revisar</h2><p>Se señalan por baja participación, bajo acierto o ausencia de respuestas.</p></div><StatusPill tone={followUpStudents.length ? 'amber' : 'green'}>{followUpStudents.length} alertas</StatusPill></div><div className="insight-list student-insights">{followUpStudents.length ? followUpStudents.slice(0, 8).map((row) => <article key={row.id}><span className="risk">{row.accuracy == null ? '—' : `${row.accuracy}%`}</span><div><b>{row.name}</b><small>{row.participation}% participación · {row.answered} respuestas · {row.points} pts</small></div>{row.id && participants.find((participant) => participant.id === row.id)?.roster_student_id && session.group_id ? <Link className="button ghost compact" to={`/students/${session.group_id}/${participants.find((participant) => participant.id === row.id)?.roster_student_id}`}>Alumno 360°</Link> : null}</article>) : <div className="positive-insight"><Icon name="check" /><span><b>Grupo sin alertas críticas</b><small>Todos alcanzaron los umbrales de participación y acierto.</small></span></div>}</div></SectionCard>
          </div>
          <div className="classroom-summary-grid">
            <SectionCard><div className="section-heading compact"><div><span className="eyebrow">EVIDENCIA POR REACTIVO</span><h2>Clase finalizada</h2><p>Cerrada {dateTime(session.closed_at)} · duración {durationLabel((session.closed_at ? new Date(session.closed_at).getTime() : now) - new Date(elapsedFrom).getTime())}</p></div></div><div className="closed-question-list">{perQuestion.map((row) => <article key={row.question.id}><span>{row.question.position}</span><div><b>{row.question.prompt}</b><small>{row.responses} respuestas · {row.accuracy == null ? 'No calificable' : `${row.accuracy}% de acierto`}</small></div></article>)}</div></SectionCard>
            <SectionCard><div className="section-heading compact"><div><span className="eyebrow">RANKING FINAL</span><h2>{session.team_mode ? 'Equipos' : 'Participantes'}</h2></div></div><div className="ranking-list">{ranking.length ? ranking.slice(0, 15).map((row, index) => <article key={row.id}><span>{index + 1}</span><div><b>{row.name}</b><small>{row.correct} correctas · {row.answered} respuestas</small></div><strong>{row.points} pts</strong></article>) : <p className="muted-copy">No hubo puntuación registrada.</p>}</div></SectionCard>
          </div>
          <section className="classroom-next-actions"><div><span className="eyebrow">SIGUIENTE ACCIÓN</span><h2>La evidencia quedó guardada</h2><p>Puedes revisar la evolución del grupo o preparar una nueva clase.</p></div><Link className="button ghost" to="/classroom">Historial</Link>{session.group_id ? <Link className="button secondary" to={`/analytics/${session.group_id}`}>Ver evolución</Link> : null}<Link className="button primary" to={session.group_id ? `/bank?group=${session.group_id}&launch=1` : '/bank'}>Preparar otra clase</Link></section>
        </>
      ) : (
        <>
          {!current ? (
            <section className="classroom-lobby-grid premium-stage" key={`lobby:${session.id}`}>
              <div className="classroom-lobby-main">
                <span className="eyebrow">SALA DE ESPERA</span><h2>{session.title}</h2><p>Los alumnos pueden entrar con el código o mediante el enlace de acceso.</p>
                <div className="join-code-panel"><div><small>CÓDIGO</small><b>{session.code}</b></div><div><button className="button secondary" type="button" onClick={() => void copy(studentJoinUrl(session.code), 'Enlace para alumnos')}>Copiar enlace de alumnos</button><button className="button secondary" type="button" onClick={openProjection}>Abrir proyección</button></div></div>
                <div className="lobby-participants"><span><b>{participants.length}</b> conectados</span>{participants.length ? participants.slice(0, 30).map((participant) => {
                  const deviceStatus = readinessByParticipant.get(participant.id) || 'checking';
                  const deviceLabel = deviceStatus === 'ready' ? 'Listo' : deviceStatus === 'degraded' ? 'Respaldo activo' : deviceStatus === 'update_required' ? 'Debe actualizar' : 'Comprobando';
                  return <i key={participant.id} className={`device-${deviceStatus}`} title={deviceLabel}><span />{participant.display_name}</i>;
                }) : <p>Esperando alumnos…</p>}</div>
              </div>
              <SectionCard><div className="section-heading compact"><div><span className="eyebrow">COLA DE PREGUNTAS</span><h2>{queued.length} preparadas</h2><p>Inicia la primera cuando el grupo esté listo.</p></div></div><div className="question-queue">{queued.map((question) => <article key={question.id}><span>{question.position}</span><div><b>{question.prompt}</b><small>{question.timer_seconds} s · {questionLabel(question.status)}</small></div><button className="button primary compact" type="button" disabled={actionMutation.isPending} onClick={() => launchFromLobby(question.id)}>Iniciar</button></article>)}</div><Link className="button ghost wide" to={`/bank?session=${session.id}${session.group_id ? `&group=${session.group_id}` : ''}`}>＋ Añadir preguntas desde el banco</Link></SectionCard>
            </section>
          ) : (
            <>
              <nav className="classroom-question-strip" aria-label="Preguntas de la sesión">{questions.map((question) => <button type="button" key={question.id} className={`${question.status}${current.id === question.id ? ' current' : ''}`} disabled={question.status === 'queued' || actionMutation.isPending} onClick={() => question.status !== 'queued' && actionMutation.mutate({ type: 'launch', questionId: question.id })}>{question.position}</button>)}</nav>
              <section className="classroom-stage-grid premium-stage" key={`${current.id}:${current.status}`}>
                <article className={`classroom-question-stage stage-${current.status}`}>
                  <header><div><div className="question-chips"><StatusPill tone={current.status === 'live' ? 'green' : current.status === 'revealed' ? 'violet' : 'neutral'}>{questionLabel(current.status)}</StatusPill><StatusPill>Pregunta {current.position} de {questions.length}</StatusPill><StatusPill>{current.question_type.replaceAll('_', ' ')}</StatusPill></div><h2>{current.prompt}</h2></div><div className={`classroom-timer${remaining <= 5 && current.status === 'live' ? ' urgent' : ''}`}><b>{current.status === 'live' ? remaining : '—'}</b><span>{current.status === 'live' ? 'segundos' : 'cerrada'}</span></div></header>
                  {current.media_url ? current.media_type === 'image' ? <img className="classroom-media" src={current.media_url} alt="Recurso de la pregunta" /> : current.media_type === 'audio' ? <audio controls src={current.media_url} /> : <video className="classroom-media" controls src={current.media_url} /> : null}
                  <Distribution question={current} responses={currentResponses} />
                  {current.status === 'revealed' && current.explanation ? <div className="question-explanation"><Icon name="check" /><div><b>Explicación</b><p>{current.explanation}</p></div></div> : null}
                </article>
                <aside className="classroom-live-side">
                  <SectionCard><div className="section-heading compact"><div><span className="eyebrow">RESPUESTAS</span><h2>{responseRate}% del grupo</h2><p>{currentResponses.length} respondieron · {Math.max(0, participants.length - currentResponses.length)} pendientes</p></div></div><div className="response-progress"><i style={{ width: `${responseRate}%` }} /></div><div className="response-roster">{participants.length ? participants.map((participant) => <article className={answeredIds.has(participant.id) ? 'answered' : ''} key={participant.id}><i /><div><b>{participant.display_name}</b><small>{participant.team_name || participant.matricula || ''}</small></div><span>{answeredIds.has(participant.id) ? 'Respondió' : 'Esperando'}</span></article>) : <p className="muted-copy">Aún no hay participantes.</p>}</div></SectionCard>
                  {session.competitive ? <SectionCard><div className="section-heading compact"><div><span className="eyebrow">RANKING EN VIVO</span><h2>{session.team_mode ? 'Por equipos' : 'Individual'}</h2></div><button className="button ghost compact" type="button" onClick={() => setShowRanking((value) => !value)}>{showRanking ? 'Ocultar' : 'Mostrar'}</button></div>{showRanking ? <div className="ranking-list">{ranking.length ? ranking.slice(0, 10).map((row, index) => <article key={row.id}><span>{index + 1}</span><div><b>{row.name}</b><small>{row.correct} correctas · racha {row.streak}</small></div><strong>{row.points}</strong></article>) : <p className="muted-copy">Aún no hay puntuación.</p>}</div> : null}</SectionCard> : null}
                </aside>
              </section>
              <section className="classroom-toolbar">
                <div><button className="button ghost" type="button" onClick={() => navigate(`/bank?session=${session.id}${session.group_id ? `&group=${session.group_id}` : ''}`)}>＋ Banco</button><button className="button ghost" type="button" onClick={() => void workspace.refetch()}>Actualizar</button></div>
                <div>{current.status === 'live' ? <button className="button secondary" type="button" disabled={actionMutation.isPending} onClick={() => actionMutation.mutate({ type: 'close-question', questionId: current.id })}>Cerrar respuestas</button> : null}{current.status !== 'revealed' && current.question_type !== 'poll' && current.question_type !== 'scale_5' && current.question_type !== 'open_text' ? <button className="button secondary" type="button" disabled={actionMutation.isPending} onClick={() => actionMutation.mutate({ type: 'reveal', questionId: current.id })}>Mostrar respuesta</button> : null}{nextQuestion ? <button className="button primary" type="button" disabled={actionMutation.isPending} onClick={() => actionMutation.mutate({ type: 'launch', questionId: nextQuestion.id })}>Siguiente <Icon name="arrow" /></button> : <Link className="button primary" to={`/bank?session=${session.id}${session.group_id ? `&group=${session.group_id}` : ''}`}>Añadir siguiente</Link>}</div>
              </section>
            </>
          )}

          <div className="classroom-tools-grid">
            <ParticipationPanel roster={roster} notes={notes} sessionId={session.id} groupId={session.group_id} saving={noteMutation.isPending} onSaveNote={(studentId, note) => noteMutation.mutate({ studentId, note })} />
            <SectionCard><div className="section-heading compact"><div><span className="eyebrow">CIERRE DE CLASE</span><h2>Deja la evidencia lista</h2><p>{questions.length ? `${completed} de ${questions.length} preguntas completadas.` : 'La sesión todavía no contiene preguntas.'}</p></div></div><div className="classroom-close-summary"><span><small>Conectados</small><b>{participants.length}</b></span><span><small>Respuestas</small><b>{responses.length}</b></span><span><small>Acierto</small><b>{accuracyRate == null ? '—' : `${accuracyRate}%`}</b></span></div><button className="button danger wide" type="button" disabled={actionMutation.isPending} onClick={() => { if (window.confirm('¿Finalizar esta clase? Las respuestas quedarán guardadas y la sesión se cerrará.')) actionMutation.mutate({ type: 'close-session' }); }}>Finalizar clase</button></SectionCard>
          </div>
        </>
      )}
    </div>
  );
}

export function ClassroomPage() {
  const { sessionId } = useParams();
  return sessionId ? <ClassroomControl sessionId={sessionId} /> : <ClassroomLanding />;
}
