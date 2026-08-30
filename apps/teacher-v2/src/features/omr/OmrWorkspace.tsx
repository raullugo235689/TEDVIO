import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { ExamDetail } from '../../core/exams';
import { PageHeader, StatusPill } from '../../shared/components';
import { Icon } from '../../shared/icons';
import { CapturePanel } from './OmrCapturePanel';
import { PrintPanel } from './OmrPrintPanel';
import { ResultsPanel } from './OmrResultsPanel';
import { groupLabel, shortDate, statusLabel, statusTone } from './omr-ui';

export function OmrWorkspace({ detail }: { detail: ExamDetail }) {
  const [tab, setTab] = useState<'capture' | 'results'>('capture');
  const confirmed = detail.results.filter((result) => result.reviewed).length;

  return (
    <div className="view-stack omr-page">
      <PageHeader
        eyebrow="CAPTURA OMR"
        title={detail.exam.title}
        detail={`${detail.exam.subject || 'Sin materia'} · ${groupLabel(detail.group)} · ${shortDate(detail.exam.exam_date)}`}
        actions={<div className="page-actions"><StatusPill tone={statusTone(detail.exam.status)}>{statusLabel(detail.exam.status)}</StatusPill><Link className="button secondary" to="/omr">← OMR</Link></div>}
      />

      <section className="omr-workflow-strip">
        <span className="complete"><b>1</b><small>Evaluación</small></span>
        <i />
        <span className={detail.exam.status === 'ready' ? 'active' : 'complete'}><b>2</b><small>Imprimir</small></span>
        <i />
        <span className={detail.exam.status === 'ready' ? 'active' : ''}><b>3</b><small>Capturar</small></span>
        <i />
        <span className={confirmed ? 'complete' : ''}><b>4</b><small>Confirmar</small></span>
        <i />
        <span><b>5</b><small>Libro</small></span>
      </section>

      <nav className="exam-tabs" aria-label="Secciones OMR">
        <button type="button" className={tab === 'capture' ? 'active' : ''} onClick={() => setTab('capture')}>Imprimir y capturar</button>
        <button type="button" className={tab === 'results' ? 'active' : ''} onClick={() => setTab('results')}>Resultados ({detail.results.length})</button>
      </nav>

      {tab === 'capture' ? <><PrintPanel detail={detail} /><CapturePanel detail={detail} /></> : <ResultsPanel detail={detail} />}

      <section className="omr-next-note"><Icon name="route" /><div><span className="eyebrow">SIGUIENTE BLOQUE · 4C</span><h2>Resultados listos para el Libro.</h2><p>La siguiente fase creará la evidencia de calificación y publicará los resultados confirmados sin recalcularlos.</p></div></section>
    </div>
  );
}
