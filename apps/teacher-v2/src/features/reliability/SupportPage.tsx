import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  fetchSupportReports,
  supportReportReference,
  type SupportReportSummary,
} from '../../core/reliability';
import {
  EmptyState,
  ErrorPanel,
  MetricCard,
  PageHeader,
  SectionCard,
  StatusPill,
} from '../../shared/components';
import { Icon } from '../../shared/icons';
import { useAuth } from '../auth/AuthProvider';
import { useReliability } from './ReliabilityProvider';

function dateText(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
}

function categoryLabel(category: SupportReportSummary['category']): string {
  if (category === 'bug') return 'Problema';
  if (category === 'question') return 'Pregunta';
  if (category === 'feature') return 'Mejora';
  if (category === 'billing') return 'Cuenta o plan';
  return 'Otro';
}

function statusLabel(status: SupportReportSummary['status']): string {
  if (status === 'in_progress') return 'En revisión';
  if (status === 'resolved') return 'Resuelto';
  if (status === 'closed') return 'Cerrado';
  return 'Recibido';
}

function statusTone(status: SupportReportSummary['status']): string {
  if (status === 'resolved' || status === 'closed') return 'green';
  if (status === 'in_progress') return 'blue';
  return 'amber';
}

export function SupportPage() {
  const auth = useAuth();
  const reliability = useReliability();
  const reports = useQuery({
    queryKey: ['tedvio-support-reports', auth.user?.id],
    queryFn: () => {
      if (!auth.user) throw new Error('Tu sesión expiró.');
      return fetchSupportReports(auth.user.id);
    },
    enabled: Boolean(auth.user),
  });

  useEffect(() => {
    const refresh = () => void reports.refetch();
    window.addEventListener('tedvio:support-submitted', refresh);
    return () => window.removeEventListener('tedvio:support-submitted', refresh);
  }, [reports]);

  const lastSync = reliability.lastSyncAt ? dateText(reliability.lastSyncAt) : 'Sin sincronización reciente';

  return (
    <div className="view-stack support-page">
      <PageHeader
        eyebrow="SOPORTE Y CONFIABILIDAD"
        title="Estado técnico y ayuda"
        detail="Consulta la conexión, sincroniza reportes pendientes y envía un incidente sin adjuntar datos académicos sensibles."
        actions={(
          <button className="button primary" type="button" onClick={() => reliability.openSupport()}>
            <Icon name="alert" />Reportar un problema
          </button>
        )}
      />

      <section className="metric-grid four support-metrics">
        <MetricCard
          label="Conexión"
          value={reliability.online ? 'En línea' : 'Sin conexión'}
          detail={reliability.online ? 'Supabase disponible' : 'TEDVIO conservará los reportes localmente'}
          icon={reliability.online ? 'check' : 'alert'}
          tone={reliability.online ? 'green' : 'amber'}
        />
        <MetricCard
          label="Pendientes"
          value={String(reliability.pendingCount)}
          detail={reliability.pendingCount ? 'Envíos conservados en este dispositivo' : 'Todo sincronizado'}
          icon="clock"
          tone={reliability.pendingCount ? 'amber' : 'green'}
        />
        <MetricCard
          label="Última sincronización"
          value={reliability.lastSyncAt ? 'Registrada' : '—'}
          detail={lastSync}
          icon="refresh"
          tone="blue"
        />
        <MetricCard
          label="Privacidad"
          value="Mínima"
          detail="Sin respuestas, notas ni calificaciones automáticas"
          icon="shield"
          tone="violet"
        />
      </section>

      {reliability.pendingCount ? (
        <SectionCard className="support-sync-card">
          <div>
            <span className="eyebrow">COLA LOCAL</span>
            <h2>{reliability.pendingCount} envío(s) pendiente(s)</h2>
            <p>
              Se conservaron porque no había conexión o el servidor no confirmó el registro.
              TEDVIO intentará enviarlos automáticamente al volver a estar en línea.
            </p>
          </div>
          <button
            className="button secondary"
            type="button"
            disabled={!reliability.online || reliability.syncing}
            onClick={() => void reliability.flush()}
          >
            <Icon name="refresh" />{reliability.syncing ? 'Sincronizando…' : 'Sincronizar ahora'}
          </button>
        </SectionCard>
      ) : null}

      <SectionCard>
        <div className="section-heading">
          <div>
            <span className="eyebrow">MIS REPORTES</span>
            <h2>Seguimiento reciente</h2>
            <p>Solo tú y el equipo administrativo autorizado pueden consultar estos registros.</p>
          </div>
          <button className="button ghost compact" type="button" onClick={() => void reports.refetch()}>
            <Icon name="refresh" />Actualizar
          </button>
        </div>

        {reports.isLoading ? (
          <div className="support-list-loading">Consultando reportes…</div>
        ) : reports.isError ? (
          <ErrorPanel title="No pude consultar tus reportes" detail={reports.error.message} onRetry={() => reports.refetch()} />
        ) : reports.data?.length ? (
          <div className="support-report-list">
            {reports.data.map((report) => (
              <article key={report.id}>
                <div className="support-report-main">
                  <div className="support-report-heading">
                    <StatusPill tone={statusTone(report.status)}>{statusLabel(report.status)}</StatusPill>
                    <span>{categoryLabel(report.category)}</span>
                    <time>{dateText(report.created_at)}</time>
                  </div>
                  <h3>{supportReportReference(report)}</h3>
                  <p>{report.message}</p>
                  <small>{report.page || 'Ruta no registrada'}</small>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            icon="shield"
            title="Aún no has enviado reportes"
            detail="Cuando necesites ayuda, TEDVIO generará una referencia y mostrará aquí el seguimiento."
            action={<button className="button primary" type="button" onClick={() => reliability.openSupport()}>Crear primer reporte</button>}
          />
        )}
      </SectionCard>

      <SectionCard className="support-privacy-card">
        <div className="support-privacy-icon"><Icon name="shield" /></div>
        <div>
          <span className="eyebrow">DIAGNÓSTICO PRIVADO</span>
          <h2>Qué puede adjuntar TEDVIO</h2>
          <p>Ruta, versión, navegador, tamaño de pantalla, estado de conexión y referencia del último error técnico.</p>
        </div>
        <div>
          <span className="eyebrow">QUÉ NO ADJUNTA</span>
          <p>Nombres de alumnos, matrículas, respuestas, reactivos, notas docentes, asistencias ni calificaciones.</p>
        </div>
      </SectionCard>
    </div>
  );
}
