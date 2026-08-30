import { Link } from 'react-router-dom';
import type { ExamWorkspace } from '../../core/exams';
import { EmptyState, MetricCard, PageHeader, StatusPill } from '../../shared/components';
import { Icon } from '../../shared/icons';
import { grade, groupLabel, percent, shortDate, statusLabel, statusTone } from './omr-ui';

export function OmrHome({ workspace }: { workspace: ExamWorkspace }) {
  const candidates = workspace.exams.filter((exam) => ['ready', 'closed'].includes(exam.status));
  const ready = candidates.filter((exam) => exam.status === 'ready');
  const results = candidates.reduce((sum, exam) => sum + (workspace.summaries[exam.id]?.results || 0), 0);
  const pending = candidates.reduce((sum, exam) => {
    const summary = workspace.summaries[exam.id];
    return sum + Math.max(0, (summary?.results || 0) - (summary?.reviewed || 0));
  }, 0);

  return (
    <div className="view-stack omr-page">
      <PageHeader
        eyebrow="ETAPA 4B · OMR"
        title="Captura OMR"
        detail="Imprime hojas, fotografía respuestas, revisa marcas dudosas y confirma resultados sin salir del frontend unificado."
        actions={<Link className="button secondary" to="/exams">Evaluaciones</Link>}
      />

      <section className="metric-grid four">
        <MetricCard label="Listas para aplicar" value={String(ready.length)} detail="Aceptan nuevas capturas" icon="exam" tone="green" />
        <MetricCard label="Evaluaciones OMR" value={String(candidates.length)} detail="Listas y cerradas" icon="layout" tone="blue" />
        <MetricCard label="Resultados" value={String(results)} detail="Evidencia conservada" icon="grades" tone="violet" />
        <MetricCard label="Pendientes heredados" value={String(pending)} detail="Capturas sin confirmación" icon="alert" tone="amber" />
      </section>

      {candidates.length ? (
        <section className="omr-exam-grid">
          {candidates.map((exam) => {
            const group = workspace.groups.find((item) => item.id === exam.group_id) || null;
            const summary = workspace.summaries[exam.id];
            return (
              <article className="omr-exam-card" key={exam.id}>
                <header>
                  <div><StatusPill tone={statusTone(exam.status)}>{statusLabel(exam.status)}</StatusPill><StatusPill tone="blue">{exam.versions.join(' / ')}</StatusPill></div>
                  <span>{shortDate(exam.exam_date)}</span>
                </header>
                <h2>{exam.title}</h2>
                <p>{groupLabel(group)}</p>
                <div className="omr-card-metrics">
                  <span><small>Reactivos</small><b>{exam.question_count}</b></span>
                  <span><small>Capturas</small><b>{summary?.results || 0}</b></span>
                  <span><small>Promedio</small><b>{grade(summary?.average)}</b></span>
                  <span><small>Aprobación</small><b>{percent(summary?.passRate)}</b></span>
                </div>
                <footer><Link className="button primary" to={`/omr/${exam.id}`}>{exam.status === 'ready' ? 'Abrir captura' : 'Consultar resultados'}</Link></footer>
              </article>
            );
          })}
        </section>
      ) : (
        <EmptyState
          icon="exam"
          title="No hay evaluaciones listas para OMR"
          detail="Construye una evaluación desde Question Studio y márcala como lista antes de imprimir o capturar hojas."
          action={<Link className="button primary" to="/exams/new">Crear evaluación</Link>}
        />
      )}

      <section className="omr-integrity-note">
        <Icon name="shield" />
        <div><span className="eyebrow">CONFIRMACIÓN DOCENTE</span><h2>Una marca dudosa nunca se convierte sola en calificación.</h2><p>La imagen se procesa en tu dispositivo. TEDVIO guarda respuestas, métricas de lectura y trazabilidad, pero no conserva la fotografía de la hoja.</p></div>
      </section>
    </div>
  );
}
