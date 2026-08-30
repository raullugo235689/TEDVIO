import type { ExamDetail } from '../../core/exams';
import { captureSourceLabel, downloadOmrCsv, resultConfirmedLabel, type OmrResultRecord } from '../../core/omr';
import { EmptyState, MetricCard, SectionCard, StatusPill } from '../../shared/components';
import { grade, percent } from './omr-ui';

export function ResultsPanel({ detail }: { detail: ExamDetail }) {
  const results = detail.results as OmrResultRecord[];
  const average = results.length ? results.reduce((sum, result) => sum + Number(result.score || 0), 0) / results.length : null;
  const passRate = results.length ? results.filter((result) => Number(result.score) >= Number(detail.exam.passing_score || 6)).length / results.length : null;
  const revisions = results.reduce((sum, result) => sum + (Array.isArray(result.revision_log) ? result.revision_log.length : 0), 0);

  if (!results.length) return <EmptyState icon="grades" title="Aún no hay hojas confirmadas" detail="Imprime y captura la primera hoja para comenzar el concentrado de resultados." />;

  return (
    <div className="view-stack compact-stack">
      <section className="metric-grid four">
        <MetricCard label="Resultados" value={String(results.length)} detail={`${detail.roster.length} alumnos en padrón`} icon="groups" tone="blue" />
        <MetricCard label="Promedio" value={grade(average)} detail={`Aprobación ${percent(passRate)}`} icon="grades" tone="green" />
        <MetricCard label="Confirmados" value={String(results.filter((result) => result.reviewed).length)} detail="Revisión docente" icon="shield" tone="violet" />
        <MetricCard label="Correcciones" value={String(revisions)} detail="Historial conservado" icon="refresh" tone="amber" />
      </section>
      <SectionCard>
        <div className="section-heading"><div><span className="eyebrow">RESULTADOS OMR</span><h2>Concentrado confirmado</h2><p>Las correcciones sustituyen la vista actual, pero conservan el valor anterior en la bitácora.</p></div><button className="button secondary" type="button" onClick={() => downloadOmrCsv(detail.exam, results)}>Exportar CSV</button></div>
        <div className="omr-results-table" role="table">
          <div className="omr-results-head" role="row"><span>Alumno</span><span>Versión</span><span>Aciertos</span><span>Blancos</span><span>Calificación</span><span>Origen</span><span>Confirmado</span></div>
          {results.map((result) => (
            <div role="row" key={result.id}>
              <span><b>{result.student_name || 'Sin nombre'}</b><small>{result.enrollment || 'Sin matrícula'}</small></span>
              <span><StatusPill tone="blue">{result.version}</StatusPill></span>
              <span>{result.correct_count}/{detail.exam.question_count}</span>
              <span>{result.blank_count}</span>
              <span><b>{grade(result.score)}</b></span>
              <span>{captureSourceLabel(result.capture_source)}</span>
              <span><b>{resultConfirmedLabel(result)}</b>{Array.isArray(result.revision_log) && result.revision_log.length ? <small>{result.revision_log.length} corrección{result.revision_log.length === 1 ? '' : 'es'}</small> : null}</span>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
