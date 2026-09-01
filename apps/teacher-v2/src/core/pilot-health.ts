import type { RealtimeChannel, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type SessionHealthEventType =
  | 'client_connected'
  | 'client_reconnecting'
  | 'client_offline'
  | 'response_confirmed'
  | 'response_queued'
  | 'response_recovered'
  | 'response_failed';

export interface SessionHealthEvent {
  id: number;
  participant_id: string | null;
  actor_role: 'teacher' | 'student';
  event_type: SessionHealthEventType;
  latency_ms: number | null;
  details: { surface?: string; question_id?: string; reason?: string };
  created_at: string;
}

export interface PilotLoadResult {
  run_id: string;
  status: 'healthy' | 'degraded' | 'critical';
  requested_clients: number;
  accepted_clients: number;
  duplicates_blocked: number;
  recovered_clients: number;
  failed_requests: number;
  average_latency_ms: number;
  p95_latency_ms: number;
}

export interface PilotLoadRun {
  id: string;
  status: 'running' | 'healthy' | 'degraded' | 'critical';
  requested_clients: number;
  disconnect_percent: number;
  accepted_clients: number;
  duplicates_blocked: number;
  recovered_clients: number;
  failed_requests: number;
  average_latency_ms: number | null;
  p95_latency_ms: number | null;
  started_at: string;
  completed_at: string | null;
}

export interface PilotHealthWorkspace {
  session: { id: string; title: string; code: string; status: string; created_at: string };
  participantCount: number;
  events: SessionHealthEvent[];
  runs: PilotLoadRun[];
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error || 'Error desconocido');
}

export async function fetchPilotHealth(user: User, sessionId: string): Promise<PilotHealthWorkspace> {
  const since = new Date(Date.now() - 6 * 60 * 60_000).toISOString();
  const sessionPromise = supabase
    .from('v2_sessions')
    .select('id,title,code,status,created_at')
    .eq('id', sessionId)
    .eq('teacher_id', user.id)
    .single();
  const participantsPromise = supabase
    .from('v2_participants')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId);
  const eventsPromise = supabase
    .from('v2_session_health_events')
    .select('id,participant_id,actor_role,event_type,latency_ms,details,created_at')
    .eq('teacher_id', user.id)
    .eq('session_id', sessionId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(250);
  const runsPromise = supabase
    .from('v2_pilot_load_runs')
    .select('id,status,requested_clients,disconnect_percent,accepted_clients,duplicates_blocked,recovered_clients,failed_requests,average_latency_ms,p95_latency_ms,started_at,completed_at')
    .eq('teacher_id', user.id)
    .order('started_at', { ascending: false })
    .limit(8);

  const [session, participants, events, runs] = await Promise.all([
    sessionPromise,
    participantsPromise,
    eventsPromise,
    runsPromise,
  ]);
  if (session.error) throw new Error(`No se pudo abrir la sesión: ${message(session.error)}`);
  if (participants.error) throw new Error(`No se pudieron contar participantes: ${message(participants.error)}`);
  if (events.error) throw new Error(`No se pudo cargar la telemetría: ${message(events.error)}`);
  if (runs.error) throw new Error(`No se pudo cargar el laboratorio: ${message(runs.error)}`);

  return {
    session: session.data,
    participantCount: participants.count || 0,
    events: (events.data || []) as SessionHealthEvent[],
    runs: (runs.data || []) as PilotLoadRun[],
  };
}

export async function recordSessionHealth(
  sessionId: string,
  eventType: SessionHealthEventType,
  latencyMs?: number | null,
  reason?: string,
): Promise<void> {
  const { error } = await supabase.rpc('v2_record_session_health', {
    p_session_id: sessionId,
    p_participant_id: null,
    p_event_type: eventType,
    p_latency_ms: latencyMs == null ? null : Math.round(latencyMs),
    p_details: { surface: 'teacher-v2', reason: reason || null },
  });
  if (error) throw new Error(message(error));
}

export function subscribePilotHealth(sessionId: string, onChange: () => void): () => void {
  const channel: RealtimeChannel = supabase
    .channel(`pilot-health-${sessionId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'v2_session_health_events', filter: `session_id=eq.${sessionId}` },
      onChange,
    )
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}

async function loadProbe(runId: string, clientNo: number, recovered: boolean): Promise<number> {
  const started = performance.now();
  const { error } = await supabase.rpc('v2_teacher_load_probe', {
    p_run_id: runId,
    p_client_no: clientNo,
    p_recovered: recovered,
  });
  if (error) throw new Error(message(error));
  return Math.max(0, Math.round(performance.now() - started));
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export async function runPilotLoadTest(
  virtualClients: 30 | 50 | 100,
  disconnectPercent: number,
  onProgress: (completed: number, total: number) => void,
): Promise<PilotLoadResult> {
  const { data: runId, error: startError } = await supabase.rpc('v2_teacher_start_load_test', {
    p_virtual_clients: virtualClients,
    p_disconnect_percent: disconnectPercent,
  });
  if (startError || !runId) throw new Error(`No se pudo iniciar la prueba: ${message(startError)}`);

  const latencies: number[] = [];
  let completed = 0;
  let failedRequests = 0;
  const disconnectEvery = disconnectPercent ? Math.max(2, Math.round(100 / disconnectPercent)) : 0;

  await Promise.all(Array.from({ length: virtualClients }, async (_, index) => {
    const clientNo = index + 1;
    const recovered = Boolean(disconnectEvery && clientNo % disconnectEvery === 0);
    const duplicate = clientNo % 10 === 0;
    if (recovered) await delay(180 + (clientNo % 5) * 25);
    try {
      const attempts = duplicate
        ? await Promise.all([loadProbe(runId, clientNo, recovered), loadProbe(runId, clientNo, recovered)])
        : [await loadProbe(runId, clientNo, recovered)];
      latencies.push(...attempts);
    } catch {
      failedRequests += 1;
    } finally {
      completed += 1;
      onProgress(completed, virtualClients);
    }
  }));

  const { data, error } = await supabase.rpc('v2_teacher_finish_load_test', {
    p_run_id: runId,
    p_latency_samples: latencies,
    p_failed_requests: failedRequests,
  });
  if (error || !data) throw new Error(`No se pudo finalizar la prueba: ${message(error)}`);
  return data as PilotLoadResult;
}
