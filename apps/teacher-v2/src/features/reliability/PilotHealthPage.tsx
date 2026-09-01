import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchPilotHealth,
  runPilotLoadTest,
  subscribePilotHealth,
  type PilotLoadResult,
  type SessionHealthEvent,
} from '../../core/pilot-health';
import { EmptyState, ErrorPanel, LoadingScreen, MetricCard, PageHeader, SectionCard, StatusPill } from '../../shared/components';
import { Icon } from '../../shared/icons';
import { useAuth } from '../auth/AuthProvider';

type ClientCount = 30 | 50 | 100;

const eventLabels: Record<SessionHealthEvent['event_type'], string> = {
  client_connected: 'Conexión confirmada',
  client_reconnecting: 'Reconexión iniciada',
  client_offline: 'Conexión interrumpida',
  response_confirmed: 'Respuesta confirmada',
  response_queued: 'Respuesta protegida localmente',
  response_recovered: 'Respuesta recuperada',
  response_failed: 'Respuesta rechazada',
};

function time(value: string): string {
  return new Date(value).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function percentile95(values: number[]): number | null {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * 0.95) - 1)] ?? null;
}

function loadTone(status: string): string {
  if (status === 'healthy') return 'green';
  if (status === 'degraded') return 'amber';
  if (status === 'critical') return 'red';
  return 'blue';
}

export function PilotHealthPage() {
  const { sessionId = '' } = useParams();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [clients, setClients] = useState<ClientCount>(50);
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<PilotLoadResult | null>(null);
  const [labError, setLabError] = useState('');
  const queryKey = useMemo(() => ['pilot-health', auth.user?.id, sessionId], [auth.user?.id, sessionId]);

  const health = useQuery({
    queryKey,
    queryFn: () => {
      if (!auth.user) throw new Error('Tu sesión expiró.');
      return fetchPilotHealth(auth.user, sessionId);
    },
    enabled: Boolean(auth.user && sessionId),
    staleTime: 5_000,
  });

  useEffect(() => {
    if (!sessionId) return;
    return subscribePilotHealth(sessionId, () => void queryClient.invalidateQueries({ queryKey }));
  }, [queryClient, queryKey, sessionId]);

  const summary = useMemo(() => {
    const events = health.data?.events || [];
    const recentCutoff = Date.now() - 15 * 60_000;
    const recent = events.filter((event) => new Date(event.created_at).getTime() >= recentCutoff);
    const latencies = recent.flatMap((event) => event.latency_ms == null ? [] : [event.latency_ms]);
    const reconnects = recent.filter((event) => event.event_type === 'client_reconnecting').length;
    const failures = recent.filter((event) => event.event_type === 'response_failed').length;
    const queued = events.filter((event) => event.event_type === 'response_queued').length;
    const recovered = events.filter((event) => event.event_type === 'response_recovered').length;
    const latestByParticipant = new Map<string, SessionHealthEvent>();
    for (const event of events) {
      if (event.participant_id && !latestByParticipant.has(event.participant_id)) latestByParticipant.set(event.participant_id, event);
    }
    const activeClients = [...latestByParticipant.values()].filter((event) => event.event_type !== 'client_offline').length;
    const status = failures ? 'critical' : reconnects >= 3 ? 'degraded' : 'healthy';
    return { activeClients, failures, queued, recovered, reconnects, p95: percentile95(latencies), status };
  }, [health.data?.events]);

  async function runLab() {
    setRunning(true);
    setProgress(0);
    setResult(null);
    setLabError('');
    try {
      const next = await runPilotLoadTest(clients, 10, (completed, total) => setProgress(Math.round(completed / total * 100)));
      setResult(next);
      await queryClient.invalidateQueries({ queryKey });
    } catch (error) {
      setLabError(error instanceof Error ? error.message : 'La prueba no pudo completarse.');
    } finally {
      setRunning(false);
    }
  }

  if (health.isLoading) return <LoadingScreen label="Abriendo salud del piloto…" />;
  if (health.isError) return <ErrorPanel title="No pude abrir la salud de la sesión" detail={health.error.message} onRetry={() => health.refetch()} />;
  if (!health.data) return null;

  const { session, participantCount, events, runs } = health.data;
  const statusLabel = summary.status === 'healthy' ? 'Estable' : summary.status === 'degraded' ? 'Degradada' : 'Crítica';

  return (
    <div className="view-stack pilot-health-page">
      <PageHeader
        eyebrow="SALUD DEL PILOTO"
        title={session.title || 'Sesión TEDVIO'}
        detail={`Código ${session.code} · telemetría técnica de las últimas 6 horas`}
        actions={<div className="page-actions"><Link className="button ghost" to={`/classroom/${session.id}`}>← Volver a clase</Link><button className="button secondary" type="button" onClick={() => void health.refetch()}><Icon name="refresh" />Actualizar</button></div>}
      />

      <section className={`pilot-health-hero ${summary.status}`}>
        <div className="pilot-health-orb"><i /><span>{statusLabel}</span></div>
        <div><span className="eyebrow">DIAGNÓSTICO ACTUAL</span><h2>{summary.status === 'healthy' ? 'La sesión responde con normalidad' : summary.status === 'degraded' ? 'Se detectaron reconexiones frecuentes' : 'La sesión requiere revisión'}</h2><p>El diagnóstico utiliza conexión, recuperación y latencia; nunca inspecciona el contenido de las respuestas.</p></div>
        <StatusPill tone={loadTone(summary.status)}>{session.status === 'closed' ? 'Sesión cerrada' : 'Sesión activa'}</StatusPill>
      </section>

      <section className="metric-grid four">
        <MetricCard icon="groups" label="Clientes observados" value={String(summary.activeClients)} detail={`${participantCount} participantes registrados`} tone="blue" />
        <MetricCard icon="refresh" label="Reconexiones" value={String(summary.reconnects)} detail="Durante los últimos 15 minutos" tone={summary.reconnects >= 3 ? 'amber' : 'green'} />
        <MetricCard icon="shield" label="Recuperadas" value={String(summary.recovered)} detail={`${summary.queued} protegidas localmente`} tone={summary.recovered ? 'violet' : 'green'} />
        <MetricCard icon="clock" label="Latencia P95" value={summary.p95 == null ? '—' : `${summary.p95} ms`} detail={summary.p95 == null ? 'Aún sin muestras' : 'Respuesta confirmada en el dispositivo'} tone={summary.p95 != null && summary.p95 > 1500 ? 'amber' : 'green'} />
      </section>

      <div className="pilot-health-grid">
        <SectionCard>
          <div className="section-heading"><div><span className="eyebrow">EVENTOS RECIENTES</span><h2>Qué ocurrió en la sesión</h2><p>Se muestran únicamente señales técnicas.</p></div><StatusPill>{events.length} eventos</StatusPill></div>
          {events.length ? <div className="pilot-event-list">{events.slice(0, 18).map((event) => <article key={event.id} className={event.event_type.includes('failed') || event.event_type === 'client_offline' ? 'risk' : event.event_type.includes('recover') ? 'recovered' : ''}><i /><div><b>{eventLabels[event.event_type]}</b><small>{event.actor_role === 'teacher' ? 'Docente' : 'Alumno'}{event.details?.surface ? ` · ${event.details.surface}` : ''}</small></div><span>{event.latency_ms == null ? time(event.created_at) : `${event.latency_ms} ms`}</span></article>)}</div> : <EmptyState icon="shield" title="Esperando señales" detail="Los eventos aparecerán cuando los clientes de esta versión se conecten o respondan." />}
        </SectionCard>

        <SectionCard className="pilot-lab-card">
          <div className="section-heading"><div><span className="eyebrow">SALA DE PRUEBA</span><h2>Simular carga aislada</h2><p>Genera solicitudes reales contra Supabase sin crear alumnos ni respuestas académicas.</p></div><Icon name="classroom" /></div>
          <div className="pilot-client-selector" role="group" aria-label="Cantidad de clientes virtuales">{([30, 50, 100] as ClientCount[]).map((count) => <button type="button" key={count} className={clients === count ? 'selected' : ''} disabled={running} onClick={() => setClients(count)}><b>{count}</b><span>clientes</span></button>)}</div>
          <div className="pilot-lab-spec"><span><Icon name="refresh" />10% reconexiones simuladas</span><span><Icon name="shield" />Duplicados intencionales</span><span><Icon name="clock" />Latencia promedio y P95</span></div>
          {running ? <div className="pilot-load-progress" role="status"><div><span>Ejecutando solicitudes concurrentes…</span><b>{progress}%</b></div><i><b style={{ width: `${progress}%` }} /></i></div> : null}
          {labError ? <div className="pilot-lab-error" role="alert">{labError}</div> : null}
          <button className="button primary wide" type="button" disabled={running} onClick={() => void runLab()}>{running ? 'Prueba en curso…' : `Probar con ${clients} clientes`}</button>
          {result ? <div className={`pilot-result ${result.status}`}><header><div><span className="eyebrow">RESULTADO</span><h3>{result.status === 'healthy' ? 'Prueba aprobada' : result.status === 'degraded' ? 'Rendimiento degradado' : 'Prueba crítica'}</h3></div><StatusPill tone={loadTone(result.status)}>{result.accepted_clients}/{result.requested_clients}</StatusPill></header><div><span><small>Duplicados bloqueados</small><b>{result.duplicates_blocked}</b></span><span><small>Reconexiones recuperadas</small><b>{result.recovered_clients}</b></span><span><small>Latencia P95</small><b>{result.p95_latency_ms} ms</b></span><span><small>Fallos</small><b>{result.failed_requests}</b></span></div></div> : null}
        </SectionCard>
      </div>

      <SectionCard>
        <div className="section-heading"><div><span className="eyebrow">HISTORIAL DEL LABORATORIO</span><h2>Últimas pruebas</h2><p>Los detalles temporales se eliminan al terminar; sólo permanece el resumen.</p></div></div>
        {runs.length ? <div className="pilot-run-table">{runs.map((run) => <article key={run.id}><time>{new Date(run.started_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}</time><b>{run.requested_clients} clientes</b><span>{run.p95_latency_ms == null ? 'En curso' : `P95 ${run.p95_latency_ms} ms`}</span><span>{run.duplicates_blocked} duplicados</span><StatusPill tone={loadTone(run.status)}>{run.status === 'healthy' ? 'Aprobada' : run.status === 'running' ? 'En curso' : run.status === 'degraded' ? 'Degradada' : 'Crítica'}</StatusPill></article>)}</div> : <p className="muted-copy">Aún no se han ejecutado pruebas.</p>}
      </SectionCard>

      <SectionCard className="pilot-privacy-note"><Icon name="shield" /><div><b>Telemetría académicamente privada</b><p>No se almacenan nombres, matrículas, texto de reactivos, respuestas, calificaciones ni notas docentes.</p></div></SectionCard>
    </div>
  );
}
