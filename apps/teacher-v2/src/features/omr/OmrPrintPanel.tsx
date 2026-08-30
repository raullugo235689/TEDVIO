import { useState } from 'react';
import type { ExamDetail } from '../../core/exams';
import { printRoute } from '../../core/omr';
import { SectionCard, StatusPill } from '../../shared/components';
import { Icon } from '../../shared/icons';

export function PrintPanel({ detail }: { detail: ExamDetail }) {
  const [mode, setMode] = useState<'generic' | 'roster'>(detail.roster.length ? 'roster' : 'generic');
  const [version, setVersion] = useState(detail.exam.versions[0] || 'A');
  const [alternate, setAlternate] = useState(detail.exam.versions.length > 1);
  const pageCount = mode === 'roster' ? detail.roster.length : 1;

  function openPrint() {
    const url = printRoute(detail.exam.id, { mode, version, alternate: mode === 'roster' && alternate });
    const printWindow = window.open(url, '_blank');
    if (!printWindow) window.alert('Permite ventanas emergentes para abrir la vista de impresión.');
    else printWindow.opener = null;
  }

  return (
    <SectionCard className="omr-print-panel">
      <div className="section-heading"><div><span className="eyebrow">1 · PREPARAR</span><h2>Hojas de respuestas</h2><p>Las cuatro marcas negras permiten corregir perspectiva y orientación durante la lectura.</p></div><StatusPill tone="blue">A4 · hasta 60 reactivos</StatusPill></div>
      <div className="omr-print-options">
        <label>Tipo de hojas<select value={mode} onChange={(event) => setMode(event.target.value as 'generic' | 'roster')}><option value="generic">Una hoja genérica</option><option value="roster" disabled={!detail.roster.length}>Una por alumno ({detail.roster.length})</option></select></label>
        <label>Versión inicial<select value={version} onChange={(event) => setVersion(event.target.value)}>{detail.exam.versions.map((item) => <option key={item} value={item}>Versión {item}</option>)}</select></label>
        <label className="toggle-field"><input type="checkbox" checked={alternate} disabled={mode !== 'roster' || detail.exam.versions.length < 2} onChange={(event) => setAlternate(event.target.checked)} /> Alternar versiones</label>
      </div>
      <div className="context-strip"><Icon name="layout" /><span><b>{pageCount} hoja{pageCount === 1 ? '' : 's'} para imprimir</b><small>{mode === 'roster' ? 'Nombre y matrícula incluidos' : 'El alumno se seleccionará al capturar'}</small></span><button className="button primary" type="button" onClick={openPrint}>Abrir impresión</button></div>
    </SectionCard>
  );
}
