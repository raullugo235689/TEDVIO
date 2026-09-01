import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchSessionPreflightRuns,
  runSessionPreflight,
  type SessionPreflightCheck,
  type SessionPreflightCheckName,
  type SessionPreflightReport,
} from '../../core/session-preflight';
import { SectionCard, StatusPill } from '../../shared/components';
import { Icon } from '../../shared/icons';
import { useAuth } from '../auth/AuthProvider';

const checkLabels: Record<SessionPreflightCheckName, string> = {
  database: 'Supabase y sala aislada',
  source_ready: 'Contenido de la sesión',
  student_surface: 'Aplicación Student',
  projection_surface: 'Aplicación Projection y QR',
  public_meta: 'Código público de acceso',
  realtime: 'Eventos Realtime completos',
  student_join: 'Entrada del alumno',
  teacher_launch: 'Publicación del docente',
  live_question: 'Recepción de la pregunta',
  answer_secret: 'Protección de la respuesta',
  response_submit: 'Confirmación de respuesta',
  duplicate_guard: 'Bloqueo de duplicado',
  recovery_receipt: 'Recuperación tras reconectar',
  projection_data: 'Resultados en Projection',
};

function tone(status: string): 'green' | 'amber' | 'red' | 'blue' {
  if (status === 'passed') return 'green';
  if (status === 'degraded') return 'amber';
  if (status === 'failed' || status === 'expired') return 'red';
  return 'blue';
}

function statusLabel(status: string): string {
  if (status === 'passed') return 'Aprobada';
  if (status === 'degraded') return 'Con observación';
  if (status === 'failed') return 'Requiere atención';
  if (status === 'expired') return 'Interrumpida';
  return 'En curso';
}

export function SessionPreflightPanel({ sessionId }: { sessionId: string }) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [checks, setChecks] = useState<SessionPreflightCheck[]>([]);
  const [report, setReport] = useState<SessionPreflightReport | null>(null);
  const [error, setError] = useState('');
  const historyKey = useMemo(() => ['session-preflight-runs', auth.user?.id, sessionId], [auth.user?.id, sessionId]);
  const history = useQuery({
    queryKey: historyKey,
    queryFn: () => fetchSessionPreflightRuns(sessionId),
    enabled: Boolean(auth.user && sessionId),
    staleTime: 10_000,
  });

  async function runCheck() {
    setRunning(true);
    setProgress(0);
    setChecks([]);
    setReport(null);
    setError('');
    try {
      const next = await runSessionPreflight(sessionId, (check, completed, total) => {
        setChecks((current) => [...current.filter((item) => item.name !== check.name), check]);
        setProgress(Math.round(completed / total * 100));
      });
      setReport(next);
      await queryClient.invalidateQueries({ queryKey: historyKey });
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'La comprobación no pudo completarse.');
      await queryClient.invalidateQueries({ queryKey: historyKey });
    } finally {
      setRunning(false);
    }
  }

  const final = report?.result;
  return (
    <SectionCard className="session-preflight-card">
      <div className="section-heading session-preflight-heading">
        <div>
          <span className="eyebrow">COMPROBACIÓN PREVIA</span>
          <h2>¿Todo está listo para iniciar?</h2>
          <p>Ejecuta una microclase temporal de principio a fin antes de recibir alumnos.</p>
        </div>
        <div className="session-preflight-seal"><Icon name="shield" /><span>Prueba integral</span></div>
      </div>

      <div className="session-preflight-flow" aria-label="Componentes que serán comprobados">
        <span><Icon name="classroom" />Teacher</span><i>→</i>
        <span><Icon name="groups" />Student</span><i>→</i>
        <span><Icon name="layout" />Projection</span><i>→</i>
        <span><Icon name="refresh" />Realtime</span>
      </div>

      <div className="session-preflight-actions">
        <div><b>No modifica tu clase</b><span>La sala técnica no utiliza grupos, matrículas ni preguntas reales y se elimina al terminar.</span></div>
        <button className="button primary" type="button" disabled={running} onClick={() => void runCheck()}>
          <Icon name={running ? 'refresh' : 'check'} />{running ? 'Comprobando…' : 'Comprobar sesión'}
        </button>
      </div>

      {running || checks.length ? <div className="session-preflight-progress" role="status" aria-live="polite">
        <div><span>{running ? 'Recorriendo la microclase…' : 'Comprobación terminada'}</span><b>{progress}%</b></div>
        <i><b style={{ width: `${progress}%` }} /></i>
      </div> : null}

      {checks.length ? <div className="session-check-grid">
        {checks.map((check) => <article key={check.name} className={check.ok ? 'passed' : 'failed'}>
          <span className="session-check-icon"><Icon name={check.ok ? 'check' : 'alert'} /></span>
          <div><b>{checkLabels[check.name]}</b><small>{check.detail}</small></div>
          <time>{check.latency_ms} ms</time>
        </article>)}
      </div> : null}

      {error ? <div className="session-preflight-error" role="alert"><Icon name="alert" /><div><b>No se completó la comprobación</b><span>{error}</span></div></div> : null}

      {final ? <div className={`session-preflight-result ${final.status}`}>
        <div className="session-preflight-result-mark"><Icon name={final.status === 'passed' ? 'check' : 'alert'} /></div>
        <div>
          <span className="eyebrow">VEREDICTO</span>
          <h3>{final.status === 'passed' ? 'TEDVIO está listo para recibir alumnos' : final.status === 'degraded' ? 'La clase funciona, pero Realtime requiere observación' : 'Conviene corregir antes de iniciar la clase'}</h3>
          <p>{final.passed_checks}/{final.total_checks} controles aprobados · {final.average_latency_ms} ms promedio · sala temporal {final.cleanup_ok ? 'eliminada' : 'pendiente de limpieza'}.</p>
        </div>
        <StatusPill tone={tone(final.status)}>{statusLabel(final.status)}</StatusPill>
      </div> : null}

      <div className="session-preflight-history">
        <div><span className="eyebrow">ÚLTIMAS COMPROBACIONES</span>{history.isError ? <small>No se pudo actualizar el historial.</small> : null}</div>
        {history.data?.length ? <div className="session-preflight-runs">{history.data.map((run) => <article key={run.id}>
          <time>{new Date(run.started_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}</time>
          <span>{run.passed_checks}/{run.total_checks} controles</span>
          <span>{run.duration_ms == null ? '—' : `${(run.duration_ms / 1000).toFixed(1)} s`}</span>
          <StatusPill tone={tone(run.status)}>{statusLabel(run.status)}</StatusPill>
        </article>)}</div> : <small className="muted-copy">Todavía no hay comprobaciones guardadas para esta sesión.</small>}
      </div>
    </SectionCard>
  );
}
