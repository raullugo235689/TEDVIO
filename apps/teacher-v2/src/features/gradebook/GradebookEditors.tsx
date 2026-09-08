import { useRef, useState } from 'react';
import { calculateGradebook, saveGradebookCategories, saveGradebookScores, type CategoryDraft, type GradebookDetail } from '../../core/gradebook';
import { categoriesSaved, categoryIssue, categorySnapshot, scoreIssue, scorePayload, scoreSnapshot, scoresSaved } from '../../core/gradebook-draft';
import { ActionDialog } from '../../shared/ActionDialog';
import { SectionCard, StatusPill } from '../../shared/components';
import { useAuth } from '../auth/AuthProvider';
import { useGradebookCapture } from './useGradebookCapture';

function CaptureStatus({ dirty, conflict, saved, online, busy, error, discard }: {
  dirty: boolean; conflict: boolean; saved: boolean; online: boolean; busy: boolean; error?: string; discard: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  return <>
    <div className={`gradebook-capture-status${conflict || !online ? ' warning' : ''}`} role="status">
      <div><b>{busy ? 'Confirmando guardado…' : !online ? 'Sin conexión' : conflict ? 'La información guardada cambió' : dirty ? 'Cambios pendientes de guardar' : saved ? 'Guardado confirmado' : 'Sin cambios pendientes'}</b>
        <p>{dirty ? 'Se conservan al navegar en esta pestaña. Guarda antes de recargar o cerrar sesión.' : !online ? 'El guardado requiere conexión.' : 'Comprueba los datos antes de guardar.'}</p>
        {conflict ? <p>Tu captura sigue visible. Para usar los datos guardados, descarta estos cambios.</p> : null}</div>
      {dirty ? <button className="button ghost" type="button" disabled={busy} onClick={() => setConfirm(true)}>Descartar cambios</button> : null}
    </div>
    {error ? <p className="gradebook-input-error" role="alert">{error}</p> : null}
    {confirm ? <ActionDialog eyebrow="TEDVIO · CALIFICACIONES" title="¿Descartar estos cambios?" detail="Se recuperará la información disponible del libro. Esta captura pendiente se perderá." confirmLabel="Descartar cambios" danger busy={busy} onDismiss={() => setConfirm(false)} onConfirm={() => { discard(); setConfirm(false); }} /> : null}
  </>;
}

export function CategoriesEditor({ detail, periodId }: { detail: GradebookDetail; periodId: string | null }) {
  const auth = useAuth();
  const capture = useGradebookCapture({ detail, periodId, capture: 'categories', snapshot: categorySnapshot, validate: categoryIssue, savedMatches: categoriesSaved,
    write: rows => { if (!auth.user) throw new Error('Tu sesión expiró.'); return saveGradebookCategories(auth.user, detail.group.id, rows); },
  });
  const total = capture.rows.reduce((sum, row) => sum + row.weight, 0);
  function patch(index: number, values: Partial<CategoryDraft>) { capture.edit(capture.rows.map((row, position) => position === index ? { ...row, ...values } : row)); }
  return <SectionCard>
    <div className="section-heading"><div><span className="eyebrow">PONDERACIONES</span><h2>Estructura del curso</h2><p>Distribuye el 100% entre tus categorías. El tipo de una categoría existente se conserva.</p></div><StatusPill tone={capture.issue ? 'red' : 'green'}>{total.toFixed(1)}%</StatusPill></div>
    <CaptureStatus {...capture} />
    <fieldset className="gradebook-capture-fields" disabled={capture.busy}>
      <legend className="sr-only">Ponderaciones del grupo</legend>
      <div className="gradebook-category-editor">
        {capture.rows.map((row, index) => <article key={row.id || `new-${index}`}>
          <label>Nombre<input aria-label={`Nombre de categoría ${index + 1}`} maxLength={80} value={row.name} onChange={event => patch(index, { name: event.target.value })} /></label>
          <label>Fuente<select value={row.kind} disabled={Boolean(row.id)} onChange={event => patch(index, { kind: event.target.value as CategoryDraft['kind'] })}><option value="manual">Manual</option><option value="omr">OMR</option><option value="attendance">Asistencia</option><option value="live">Participación Live</option></select></label>
          <label>Peso<input aria-label={`Peso de categoría ${index + 1}`} aria-describedby="gradebook-weight-issue" type="number" inputMode="decimal" min="0" max="100" step="0.1" value={row.weight} onChange={event => patch(index, { weight: Number(event.target.value) })} /></label><b>%</b>
        </article>)}
      </div>
    </fieldset>
    {capture.issue ? <p id="gradebook-weight-issue" className="gradebook-input-error" role="alert">{capture.issue}</p> : null}
    <footer className="gradebook-editor-footer">
      <button className="button ghost" type="button" disabled={capture.busy || capture.rows.length >= 12} onClick={() => capture.edit([...capture.rows, { name: '', kind: 'manual', weight: 0 }])}>＋ Categoría manual</button>
      <button className="button primary" type="button" disabled={!capture.dirty || capture.busy || !capture.online || Boolean(capture.issue)} onClick={capture.save}>{capture.busy ? 'Guardando…' : 'Guardar ponderaciones'}</button>
    </footer>
  </SectionCard>;
}

export function ScoreCapture({ detail, periodId, itemId, onClose }: { detail: GradebookDetail; periodId: string | null; itemId: string; onClose: () => void }) {
  const auth = useAuth();
  const item = detail.items.find(row => row.id === itemId);
  const max = Number(item?.max_score || 0);
  const fields = useRef<HTMLFieldSetElement>(null), saveButton = useRef<HTMLButtonElement>(null);
  const [closeDialog, setCloseDialog] = useState(false);
  const capture = useGradebookCapture({ detail, periodId, capture: `scores:${itemId}`, snapshot: data => scoreSnapshot(data, itemId), savedMatches: scoresSaved,
    validate: rows => rows.some(row => scoreIssue(row.score, max) || row.note.length > 1000) ? 'Revisa las calificaciones señaladas antes de guardar.' : '',
    editable: data => { const result = calculateGradebook(data, periodId); return result.editable && result.manualItems.some(row => row.id === itemId); },
    write: rows => { if (!auth.user) throw new Error('Tu sesión expiró.'); return saveGradebookScores(auth.user, itemId, scorePayload(rows)); },
  });
  const names = new Map(detail.students.map(row => [row.id, row]));
  const display = [...capture.rows].sort((a, b) => (names.get(a.studentId)?.full_name || a.studentId).localeCompare(names.get(b.studentId)?.full_name || b.studentId));
  function update(studentId: string, patch: { score?: string; note?: string }) { capture.edit(capture.rows.map(row => row.studentId === studentId ? { ...row, ...patch } : row)); }
  return <SectionCard className="gradebook-score-capture">
    <div className="section-heading"><div><span className="eyebrow">CAPTURA MASIVA</span><h2>{item?.title || 'Actividad no disponible'}</h2><p>Máximo {max.toFixed(2)} · Enter avanza al siguiente alumno; Mayús + Enter regresa.</p></div><button className="button ghost" type="button" disabled={capture.busy} onClick={() => capture.dirty ? setCloseDialog(true) : onClose()}>Cerrar captura</button></div>
    <CaptureStatus {...capture} />
    {capture.locked ? <p className="gradebook-input-error" role="alert">La actividad o el periodo ya no permiten captura. Puedes revisar o descartar los cambios pendientes.</p> : null}
    <fieldset ref={fields} className="gradebook-capture-fields" disabled={capture.busy || capture.locked}>
      <legend className="sr-only">Calificaciones de la actividad</legend>
      <div className="gradebook-score-list">
        {display.map((row, index) => { const student = names.get(row.studentId); const issue = scoreIssue(row.score, max); const errorId = `gradebook-score-error-${index}`;
          return <article key={row.studentId}><div><b>{student?.full_name || `Alumno ${row.studentId}`}</b><small>{student?.enrollment || 'Ya no aparece en el padrón activo'}</small></div>
            <label>Calificación<input data-score-input aria-label={`Calificación de ${student?.full_name || row.studentId}`} aria-invalid={Boolean(issue)} aria-describedby={issue ? errorId : undefined} type="text" inputMode="decimal" enterKeyHint="next" autoComplete="off" value={row.score} onChange={event => update(row.studentId, { score: event.target.value })} onKeyDown={event => {
              if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
              event.preventDefault(); const inputs = fields.current?.querySelectorAll<HTMLInputElement>('[data-score-input]');
              const next = inputs?.[index + (event.shiftKey ? -1 : 1)];
              if (next) { next.focus(); next.select(); } else if (!event.shiftKey) saveButton.current?.focus();
            }} />{issue ? <small id={errorId} className="gradebook-input-error">{issue}</small> : null}</label>
            <label>Nota<input aria-label={`Nota de ${student?.full_name || row.studentId}`} maxLength={1000} value={row.note} onChange={event => update(row.studentId, { note: event.target.value })} /></label></article>;
        })}
      </div>
    </fieldset>
    <footer className="gradebook-editor-footer gradebook-save-bar"><span>{capture.rows.filter(row => row.score.trim()).length}/{capture.rows.length} capturadas · En blanco: sin calificación; 0: cero.</span><button ref={saveButton} className="button primary" type="button" disabled={!capture.dirty || capture.busy || !capture.online || capture.locked || Boolean(capture.issue)} onClick={capture.save}>{capture.busy ? 'Guardando…' : 'Guardar captura'}</button></footer>
    {closeDialog ? <ActionDialog eyebrow="TEDVIO · CALIFICACIONES" title="¿Cerrar con cambios pendientes?" detail="La captura se conservará en esta pestaña. Vuelve a abrir esta actividad para continuar y guarda antes de recargar o cerrar sesión." confirmLabel="Conservar y cerrar" busy={capture.busy} onDismiss={() => setCloseDialog(false)} onConfirm={onClose} /> : null}
  </SectionCard>;
}
