import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { createIsolatedSupabaseClient, supabase } from './supabase';

export type SessionPreflightCheckName =
  | 'database'
  | 'source_ready'
  | 'student_surface'
  | 'projection_surface'
  | 'public_meta'
  | 'realtime'
  | 'student_join'
  | 'teacher_launch'
  | 'live_question'
  | 'answer_secret'
  | 'response_submit'
  | 'duplicate_guard'
  | 'recovery_receipt'
  | 'projection_data';

export interface SessionPreflightCheck {
  name: SessionPreflightCheckName;
  ok: boolean;
  latency_ms: number;
  detail: string;
}

interface SessionPreflightStart {
  run_id: string;
  session_id: string;
  question_id: string;
  code: string;
  expected_answer: string;
  expires_at: string;
  source_code: string;
  source_status: string;
  source_question_count: number;
  source_ready_question_count: number;
  realtime_publication_ready: boolean;
}

export interface SessionPreflightResult {
  run_id: string;
  status: 'passed' | 'degraded' | 'failed';
  total_checks: number;
  passed_checks: number;
  failed_checks: string[];
  participant_count: number;
  response_count: number;
  average_latency_ms: number;
  realtime_ok: boolean;
  duration_ms: number;
  cleanup_ok: boolean;
}

export interface SessionPreflightRun {
  id: string;
  status: 'running' | 'passed' | 'degraded' | 'failed' | 'expired';
  total_checks: number;
  passed_checks: number;
  failed_checks: string[];
  participant_count: number;
  response_count: number;
  average_latency_ms: number | null;
  realtime_ok: boolean | null;
  duration_ms: number | null;
  started_at: string;
  completed_at: string | null;
}

export interface SessionPreflightReport {
  start: SessionPreflightStart;
  checks: SessionPreflightCheck[];
  result: SessionPreflightResult;
}

type CheckTask = () => Promise<string>;

const expectedChecks: SessionPreflightCheckName[] = [
  'database',
  'source_ready',
  'student_surface',
  'projection_surface',
  'public_meta',
  'teacher_launch',
  'live_question',
  'answer_secret',
  'student_join',
  'response_submit',
  'duplicate_guard',
  'recovery_receipt',
  'projection_data',
  'realtime',
];

function message(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message || 'Error desconocido');
  }
  return String(error || 'Error desconocido');
}

function anonymousClient(surface: string): SupabaseClient {
  return createIsolatedSupabaseClient(surface);
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number, timeoutMessage: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(timeoutMessage)), milliseconds);
    promise.then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (error) => { window.clearTimeout(timer); reject(error); },
    );
  });
}

function createRealtimeProbe(client: SupabaseClient, sessionId: string, questionId: string) {
  const events = new Set<string>();
  let wake: (() => void) | null = null;
  let subscribedResolve: (() => void) | null = null;
  let subscribedReject: ((error: Error) => void) | null = null;
  const subscribed = new Promise<void>((resolve, reject) => {
    subscribedResolve = resolve;
    subscribedReject = reject;
  });
  const note = (name: string) => {
    events.add(name);
    wake?.();
  };

  const channel: RealtimeChannel = client
    .channel(`session-preflight-${sessionId}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'v2_sessions', filter: `id=eq.${sessionId}` }, () => note('session'))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'v2_questions', filter: `id=eq.${questionId}` }, () => note('question'))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'v2_participants', filter: `session_id=eq.${sessionId}` }, () => note('participant'))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'v2_responses', filter: `question_id=eq.${questionId}` }, () => note('response'))
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') subscribedResolve?.();
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        subscribedReject?.(new Error(`Realtime respondió ${status}`));
      }
    });

  async function waitForEvents(required: string[]): Promise<void> {
    const ready = () => required.every((name) => events.has(name));
    if (ready()) return;
    await withTimeout(new Promise<void>((resolve) => {
      wake = () => { if (ready()) resolve(); };
    }), 5_000, `Realtime no entregó: ${required.filter((name) => !events.has(name)).join(', ')}`);
  }

  return {
    subscribed: withTimeout(subscribed, 7_000, 'Realtime no confirmó la suscripción.'),
    waitForEvents,
    events,
    cleanup: () => client.removeChannel(channel),
  };
}

async function fetchSurfaceText(path: string, marker: string): Promise<void> {
  const response = await fetch(path, { cache: 'no-store', credentials: 'same-origin' });
  if (!response.ok) throw new Error(`${path} respondió HTTP ${response.status}`);
  const body = await response.text();
  if (!body.includes(marker)) throw new Error(`${path} no publicó su marcador esperado.`);
}

async function fetchBundledSurface(path: string, htmlMarker: string, bundleMarker: string): Promise<void> {
  const response = await fetch(path, { cache: 'no-store', credentials: 'same-origin' });
  if (!response.ok) throw new Error(`${path} respondió HTTP ${response.status}`);
  const html = await response.text();
  if (!html.includes(htmlMarker)) throw new Error(`${path} no publicó su marcador esperado.`);
  const source = html.match(/<script[^>]+type=["']module["'][^>]+src=["']([^"']+)["']/i)?.[1]
    || html.match(/<script[^>]+src=["']([^"']+)["'][^>]+type=["']module["']/i)?.[1];
  if (!source) throw new Error(`${path} no declaró su aplicación empaquetada.`);
  const url = new URL(source, window.location.origin);
  if (url.origin !== window.location.origin) throw new Error(`${path} depende de un runtime externo.`);
  await fetchSurfaceText(url.pathname, bundleMarker);
}

async function checkStudentSurface(): Promise<string> {
  await fetchBundledSurface('/student-v2/', 'data-tedvio-surface="student-v2-react"', 'v2_join_session_v3');
  return 'Student está disponible con su runtime protegido dentro de TEDVIO.';
}

async function checkProjectionSurface(): Promise<string> {
  await fetchBundledSurface('/projection-v2/', 'data-tedvio-surface="projection-v2"', 'v2_public_live_counts');
  return 'Projection y su generador QR están protegidos dentro de TEDVIO.';
}

export async function fetchSessionPreflightRuns(sessionId: string): Promise<SessionPreflightRun[]> {
  await supabase.rpc('v2_teacher_cleanup_session_checks');
  const { data, error } = await supabase
    .from('v2_session_check_runs')
    .select('id,status,total_checks,passed_checks,failed_checks,participant_count,response_count,average_latency_ms,realtime_ok,duration_ms,started_at,completed_at')
    .eq('source_session_id', sessionId)
    .order('started_at', { ascending: false })
    .limit(6);
  if (error) throw new Error(`No se pudo cargar el historial de comprobaciones: ${message(error)}`);
  return (data || []) as SessionPreflightRun[];
}

export async function runSessionPreflight(
  sourceSessionId: string,
  onProgress: (check: SessionPreflightCheck, completed: number, total: number) => void,
): Promise<SessionPreflightReport> {
  const startedAt = performance.now();
  const checks: SessionPreflightCheck[] = [];
  const startRequestAt = performance.now();
  const { data: rawStart, error: startError } = await supabase.rpc('v2_teacher_start_session_check', {
    p_source_session_id: sourceSessionId,
  });
  if (startError || !rawStart) throw new Error(`No se pudo iniciar la comprobación: ${message(startError)}`);
  const start = rawStart as SessionPreflightStart;

  const publish = (check: SessionPreflightCheck) => {
    checks.push(check);
    onProgress(check, checks.length, expectedChecks.length);
  };
  publish({ name: 'database', ok: true, latency_ms: Math.round(performance.now() - startRequestAt), detail: 'Supabase creó una sala técnica aislada.' });

  const studentClient = anonymousClient('session-preflight-student');
  const recoveryClient = anonymousClient('session-preflight-recovery');
  const realtime = createRealtimeProbe(studentClient, start.session_id, start.question_id);
  let participantId = '';
  let responseRequestId = '';
  let responseReceiptId = '';
  let realtimeSubscribed = false;
  let realtimeSubscriptionError = '';

  const runCheck = async (name: SessionPreflightCheckName, task: CheckTask): Promise<SessionPreflightCheck> => {
    const checkStartedAt = performance.now();
    try {
      const detail = await task();
      const check = { name, ok: true, latency_ms: Math.round(performance.now() - checkStartedAt), detail };
      publish(check);
      return check;
    } catch (error) {
      const check = { name, ok: false, latency_ms: Math.round(performance.now() - checkStartedAt), detail: message(error) };
      publish(check);
      return check;
    }
  };

  let result: SessionPreflightResult | null = null;
  try {
    await runCheck('source_ready', async () => {
      const ready = start.source_status !== 'closed'
        && /^\d{6}$/.test(start.source_code)
        && start.source_question_count > 0
        && start.source_ready_question_count > 0;
      if (!ready) throw new Error(start.source_status === 'closed'
        ? 'La sesión seleccionada está cerrada.'
        : 'La sesión necesita al menos una pregunta preparada.');
      return `${start.source_ready_question_count}/${start.source_question_count} preguntas preparadas`;
    });

    await Promise.all([
      runCheck('student_surface', checkStudentSurface),
      runCheck('projection_surface', checkProjectionSurface),
      runCheck('public_meta', async () => {
        const { data, error } = await studentClient.rpc('v2_public_session_meta', { p_code: start.source_code });
        if (error) throw error;
        if (data?.[0]?.session_id !== sourceSessionId) throw new Error('El código público no resolvió la sesión seleccionada.');
        return `Código ${start.source_code} visible para Student y Projection`;
      }),
      realtime.subscribed.then(() => { realtimeSubscribed = true; }).catch((error) => {
        realtimeSubscriptionError = message(error);
      }),
    ]);

    await runCheck('teacher_launch', async () => {
      const { error } = await supabase.rpc('v2_teacher_classroom_command', {
        p_session_id: start.session_id,
        p_action: 'launch',
        p_question_id: start.question_id,
      });
      if (error) throw error;
      return 'Teacher publicó la pregunta mediante el comando atómico.';
    });

    await runCheck('live_question', async () => {
      const [session, question] = await Promise.all([
        studentClient.from('v2_sessions').select('id,status,current_question_id').eq('id', start.session_id).single(),
        studentClient.from('v2_questions').select('id,status,prompt,options').eq('id', start.question_id).single(),
      ]);
      if (session.error) throw session.error;
      if (question.error) throw question.error;
      if (session.data.status !== 'live' || session.data.current_question_id !== start.question_id || question.data.status !== 'live') {
        throw new Error('Student no recibió la pregunta activa.');
      }
      return 'Student recibió la misma pregunta que publicó Teacher.';
    });

    await runCheck('answer_secret', async () => {
      const { data, error } = await studentClient
        .from('v2_questions')
        .select('correct_answer,explanation')
        .eq('id', start.question_id)
        .single();
      if (error) throw error;
      if (data.correct_answer != null || data.explanation != null) throw new Error('La clave apareció antes de revelar la respuesta.');
      return 'La respuesta correcta permanece protegida durante la pregunta.';
    });

    await runCheck('student_join', async () => {
      const { data, error } = await studentClient.rpc('v2_join_session_v3', {
        p_code: start.code,
        p_name: 'Verificador TEDVIO',
        p_matricula: null,
        p_team: null,
      });
      if (error) throw error;
      participantId = data?.[0]?.participant_id || '';
      if (!participantId || data?.[0]?.session_id !== start.session_id) throw new Error('Student no obtuvo un participante válido.');
      return 'Student entró a la sala sintética mediante la RPC pública real.';
    });

    await runCheck('response_submit', async () => {
      if (!participantId) throw new Error('No existe un participante de prueba.');
      responseRequestId = crypto.randomUUID();
      const { data, error } = await studentClient.rpc('v2_submit_response_v2', {
        p_question_id: start.question_id,
        p_participant_id: participantId,
        p_answer: start.expected_answer,
        p_request_id: responseRequestId,
      });
      if (error) throw error;
      const receipt = data as {
        receipt_version?: number;
        confirmed?: boolean;
        response_id?: string;
        request_id?: string;
        question_id?: string;
        submitted_at?: string;
        status?: string;
      } | null;
      responseReceiptId = receipt?.response_id || '';
      if (
        receipt?.receipt_version !== 1
        || !receipt.confirmed
        || !responseReceiptId
        || receipt.status !== 'recorded'
        || receipt.request_id !== responseRequestId
        || receipt.question_id !== start.question_id
        || !receipt.submitted_at
      ) throw new Error('El motor no devolvió un recibo válido.');
      return 'La respuesta obtuvo un recibo único del motor académico.';
    });

    await runCheck('duplicate_guard', async () => {
      if (!participantId || !responseRequestId || !responseReceiptId) throw new Error('No existe un recibo de prueba.');
      const { data, error } = await studentClient.rpc('v2_submit_response_v2', {
        p_question_id: start.question_id,
        p_participant_id: participantId,
        p_answer: start.expected_answer,
        p_request_id: responseRequestId,
      });
      if (error) throw error;
      const receipt = data as {
        receipt_version?: number;
        confirmed?: boolean;
        response_id?: string;
        request_id?: string;
        question_id?: string;
        submitted_at?: string;
        status?: string;
        duplicate?: boolean;
      } | null;
      if (
        receipt?.receipt_version !== 1
        || !receipt.confirmed
        || receipt.status !== 'replayed'
        || !receipt.duplicate
        || receipt.response_id !== responseReceiptId
        || receipt.request_id !== responseRequestId
        || receipt.question_id !== start.question_id
        || !receipt.submitted_at
      ) {
        throw new Error('El reintento no recuperó el mismo recibo.');
      }
      return 'El motor convirtió el doble envío en el mismo recibo, sin duplicar datos.';
    });

    await runCheck('recovery_receipt', async () => {
      if (!participantId) throw new Error('No existe un participante de prueba.');
      const { data, error } = await recoveryClient.rpc('v2_student_answer_result', {
        p_question_id: start.question_id,
        p_participant_id: participantId,
      });
      if (error) throw error;
      if (!data?.[0]?.submitted_at) throw new Error('El segundo cliente no recuperó el comprobante.');
      return 'Un cliente nuevo recuperó la respuesta ya confirmada.';
    });

    await runCheck('projection_data', async () => {
      const reveal = await supabase.rpc('v2_teacher_classroom_command', {
        p_session_id: start.session_id,
        p_action: 'reveal',
        p_question_id: start.question_id,
      });
      if (reveal.error) throw reveal.error;
      const [counts, people, results, ranking] = await Promise.all([
        recoveryClient.rpc('v2_public_live_counts', { p_code: start.code }),
        recoveryClient.rpc('v2_public_session_people', { p_code: start.code }),
        recoveryClient.rpc('v2_public_question_results', { p_session_id: start.session_id, p_question_id: start.question_id }),
        recoveryClient.rpc('v2_public_ranking', { p_code: start.code }),
      ]);
      const firstError = [counts.error, people.error, results.error, ranking.error].find(Boolean);
      if (firstError) throw firstError;
      if (Number(counts.data?.[0]?.participant_count) !== 1 || Number(counts.data?.[0]?.answered_count) !== 1) {
        throw new Error('Projection no reconstruyó los contadores 1/1.');
      }
      if (people.data?.[0]?.display_name !== 'Verificador TEDVIO' || Number(results.data?.[0]?.votes) !== 1 || !ranking.data?.length) {
        throw new Error('Projection no recibió personas, resultado y ranking coherentes.');
      }
      return 'Projection reconstruyó participantes, respuesta, resultado y ranking.';
    });

    await runCheck('realtime', async () => {
      if (!realtimeSubscribed) throw new Error(realtimeSubscriptionError || 'Realtime no confirmó la conexión.');
      if (!start.realtime_publication_ready) throw new Error('Faltan tablas del aula en la publicación Realtime.');
      await realtime.waitForEvents(['session', 'question', 'participant', 'response']);
      return 'Realtime entregó cambios de Teacher, pregunta, alumno y respuesta.';
    });
  } finally {
    for (const name of expectedChecks) {
      if (!checks.some((check) => check.name === name)) {
        publish({ name, ok: false, latency_ms: 0, detail: 'No se ejecutó porque falló una dependencia anterior.' });
      }
    }

    await Promise.allSettled([
      realtime.cleanup(),
      recoveryClient.removeAllChannels(),
    ]);

    const { data: rawResult, error: finishError } = await supabase.rpc('v2_teacher_finish_session_check', {
      p_run_id: start.run_id,
      p_check_results: checks.map(({ name, ok, latency_ms }) => ({ name, ok, latency_ms })),
      p_duration_ms: Math.round(performance.now() - startedAt),
    });
    if (finishError || !rawResult) throw new Error(`La comprobación terminó, pero no pudo limpiar su sala: ${message(finishError)}`);
    result = rawResult as SessionPreflightResult;
  }

  if (!result) throw new Error('La comprobación no produjo un resultado.');
  return { start, checks, result };
}
