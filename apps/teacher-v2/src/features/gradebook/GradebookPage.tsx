import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  calculateGradebook,
  ensureGradebookDefaults,
  exportGradebookCsv,
  fetchGradebookDetail,
  fetchGradebookWorkspace,
  gradebookDetailKey,
  gradebookWorkspaceKey,
  linkOmrExamToGradebook,
  recommendedPeriodId,
  saveGradebookCategories,
  saveGradebookItem,
  saveGradebookScores,
  type CategoryDraft,
  type GradeCategory,
  type GradeItem,
  type GradeScoreDraft,
  type GradebookCalculation,
  type GradebookDetail,
  type GradebookRevision,
  type GradebookWorkspace,
  type StudentGradeCalculation,
} from '../../core/gradebook';
import type { GroupRecord } from '../../core/types';
import {
  EmptyState,
  ErrorPanel,
  LoadingScreen,
  MetricCard,
  PageHeader,
  SectionCard,
  StatusPill,
} from '../../shared/components';
import { Icon } from '../../shared/icons';
import { useAuth } from '../auth/AuthProvider';

function groupLabel(group?: GroupRecord | null): string {
  if (!group) return 'Grupo';
  return [group.subject || group.program || 'Asignatura', group.group_name || group.name || 'Grupo'].filter(Boolean).join(' · ');
}

function grade(value?: number | null): string {
  return value == null || !Number.isFinite(Number(value)) ? '—' : Number(value).toFixed(1);
}

function percent(value?: number | null): string {
  return value == null || !Number.isFinite(Number(value)) ? '—' : `${Math.round(Number(value) * 100)}%`;
}

function shortDate(value?: string | null): string {
  if (!value) return 'Sin fecha';
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

function dateTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function kindLabel(kind: GradeCategory['kind']): string {
  if (kind === 'omr') return 'Evaluaciones OMR';
  if (kind === 'attendance') return 'Asistencia';
  if (kind === 'live') return 'Participación Live';
  return 'Captura manual';
}

function studentTone(status: StudentGradeCalculation['status']): string {
  if (status === 'risk') return 'red';
  if (status === 'watch') return 'amber';
  if (status === 'ok') return 'green';
  return 'neutral';
}

function studentStatus(status: StudentGradeCalculation['status']): string {
  if (status === 'risk') return 'En riesgo';
  if (status === 'watch') return 'Atención';
  if (status === 'ok') return 'En orden';
  return 'Sin evidencia';
}

function Landing({ workspace }: { workspace: GradebookWorkspace }) {
  const configured = workspace.groups.filter((group) => workspace.categories.some((category) => category.group_id === group.id)).length;
  const activePeriods = workspace.periods.filter((period) => period.status === 'open').length;
  return (
    <div className="view-stack gradebook-page">
      <PageHeader
        eyebrow="ETAPA 4C · LIBRO"
        title="Libro de calificaciones"
        detail="Integra actividades, asistencia y resultados OMR con ponderaciones trazables y protección por periodo."
      />
      <section className="metric-grid four">
        <MetricCard label="Grupos" value={String(workspace.groups.length)} detail={`${configured} configurados`} icon="groups" tone="blue" />
        <MetricCard label="Evidencias" value={String(workspace.items.length)} detail="Manuales y sincronizadas" icon="grades" tone="violet" />
        <MetricCard label="Periodos abiertos" value={String(activePeriods)} detail="Permiten captura" icon="periods" tone="green" />
        <MetricCard label="Cálculo" value="Trazable" detail="Fuente → evidencia → promedio" icon="shield" tone="amber" />
      </section>
      {workspace.groups.length ? (
        <section className="gradebook-group-grid">
          {workspace.groups.map((group) => {
            const categories = workspace.categories.filter((category) => category.group_id === group.id);
            const items = workspace.items.filter((item) => item.group_id === group.id);
            const periods = workspace.periods.filter((period) => period.group_id === group.id);
            const weight = categories.reduce((sum, category) => sum + Number(category.weight || 0), 0);
            return (
              <article className="gradebook-group-card" key={group.id}>
                <header><div><span className="eyebrow">{group.university_name || group.university || 'TEDVIO'}</span><h2>{groupLabel(group)}</h2><p>{group.school_cycle || group.term || 'Sin ciclo escolar'}</p></div><StatusPill tone={Math.abs(weight - 100) < 0.01 ? 'green' : categories.length ? 'amber' : 'neutral'}>{categories.length ? `${weight.toFixed(0)}%` : 'Sin configurar'}</StatusPill></header>
                <div className="gradebook-group-metrics"><span><small>Categorías</small><b>{categories.length}</b></span><span><small>Evidencias</small><b>{items.length}</b></span><span><small>Periodos</small><b>{periods.length}</b></span></div>
                <footer><Link className="button primary" to={`/gradebook/${group.id}`}>Abrir Libro</Link></footer>
              </article>
            );
          })}
        </section>
      ) : <EmptyState icon="groups" title="Aún no hay grupos" detail="Crea un grupo e importa su padrón para comenzar." action={<Link className="button primary" to="/groups">Ir a Grupos</Link>} />}
    </div>
  );
}

function CategoriesEditor({ categories, busy, onSave }: { categories: GradeCategory[]; busy: boolean; onSave: (rows: CategoryDraft[]) => void }) {
  const [drafts, setDrafts] = useState<CategoryDraft[]>([]);
  useEffect(() => setDrafts(categories.map((category) => ({ id: category.id, name: category.name, kind: category.kind, weight: Number(category.weight) }))), [categories]);
  const total = drafts.reduce((sum, category) => sum + Number(category.weight || 0), 0);
  function patch(index: number, values: Partial<CategoryDraft>) {
    setDrafts((current) => current.map((row, position) => position === index ? { ...row, ...values } : row));
  }
  function addManual() {
    setDrafts((current) => [...current, { name: `Categoría ${current.filter((row) => row.kind === 'manual').length + 1}`, kind: 'manual', weight: 0 }]);
  }
  return (
    <SectionCard>
      <div className="section-heading"><div><span className="eyebrow">PONDERACIONES</span><h2>Estructura del curso</h2><p>La suma debe ser 100%. El tipo de una categoría existente no cambia para conservar la trazabilidad.</p></div><StatusPill tone={Math.abs(total - 100) < 0.01 ? 'green' : 'red'}>{total.toFixed(1)}%</StatusPill></div>
      <div className="gradebook-category-editor">
        {drafts.map((category, index) => (
          <article key={category.id || `new-${index}`}>
            <label>Nombre<input value={category.name} onChange={(event) => patch(index, { name: event.target.value })} /></label>
            <label>Fuente<select value={category.kind} disabled={Boolean(category.id)} onChange={(event) => patch(index, { kind: event.target.value as CategoryDraft['kind'] })}><option value="manual">Manual</option><option value="omr">OMR</option><option value="attendance">Asistencia</option><option value="live">Participación Live</option></select></label>
            <label>Peso<input type="number" min="0" max="100" step="0.1" value={category.weight} onChange={(event) => patch(index, { weight: Number(event.target.value) })} /></label><b>%</b>
          </article>
        ))}
      </div>
      <footer className="gradebook-editor-footer"><button className="button ghost" type="button" onClick={addManual}>＋ Categoría manual</button><button className="button primary" type="button" disabled={busy || Math.abs(total - 100) >= 0.01 || drafts.some((row) => !row.name.trim())} onClick={() => onSave(drafts)}>{busy ? 'Guardando…' : 'Guardar ponderaciones'}</button></footer>
    </SectionCard>
  );
}

function ScoreCapture({ detail, calculation, item, busy, onClose, onSave }: { detail: GradebookDetail; calculation: GradebookCalculation; item: GradeItem; busy: boolean; onClose: () => void; onSave: (rows: GradeScoreDraft[]) => void }) {
  const studentMap = new Map(calculation.students.map((student) => [student.student.id, student.itemScores[item.id]]));
  const noteMap = new Map(detail.scores.filter((score) => score.item_id === item.id).map((score) => [score.student_id, score.note || '']));
  const [rows, setRows] = useState<GradeScoreDraft[]>(() => detail.students.map((student) => ({ studentId: student.id, score: studentMap.get(student.id) ?? null, note: noteMap.get(student.id) || '' })));
  function update(studentId: string, patch: Partial<GradeScoreDraft>) {
    setRows((current) => current.map((row) => row.studentId === studentId ? { ...row, ...patch } : row));
  }
  return (
    <SectionCard className="gradebook-score-capture">
      <div className="section-heading"><div><span className="eyebrow">CAPTURA MASIVA</span><h2>{item.title}</h2><p>Máximo {Number(item.max_score).toFixed(2)} · {shortDate(item.item_date)}</p></div><button className="button ghost" type="button" onClick={onClose}>Cerrar</button></div>
      <div className="gradebook-score-list">
        {detail.students.map((student) => {
          const row = rows.find((value) => value.studentId === student.id)!;
          return <article key={student.id}><div><b>{student.full_name}</b><small>{student.enrollment}</small></div><label>Calificación<input type="number" min="0" max={Number(item.max_score)} step="0.01" value={row.score ?? ''} onChange={(event) => update(student.id, { score: event.target.value === '' ? null : Number(event.target.value) })} /></label><label>Nota<input value={row.note || ''} onChange={(event) => update(student.id, { note: event.target.value })} /></label></article>;
        })}
      </div>
      <footer className="gradebook-editor-footer"><span>{rows.filter((row) => row.score != null).length}/{rows.length} capturadas</span><button className="button primary" type="button" disabled={busy} onClick={() => onSave(rows)}>{busy ? 'Guardando…' : 'Guardar captura'}</button></footer>
    </SectionCard>
  );
}

function GradeTable({ detail, calculation }: { detail: GradebookDetail; calculation: GradebookCalculation }) {
  return (
    <SectionCard>
      <div className="section-heading"><div><span className="eyebrow">RESUMEN POR ALUMNO</span><h2>{calculation.period?.status === 'closed' ? 'Promedios oficiales' : 'Promedios actuales'}</h2><p>Cada promedio muestra la ponderación que ya tiene evidencia disponible.</p></div></div>
      <div className="gradebook-table-wrap"><table className="gradebook-table"><thead><tr><th>Alumno</th>{detail.categories.map((category) => <th key={category.id}>{category.name}<small>{Number(category.weight).toFixed(0)}%</small></th>)}<th>Promedio</th><th>Evidencia</th><th>Estado</th></tr></thead><tbody>{calculation.students.map((student) => <tr key={student.student.id}><td><b>{student.student.full_name}</b><small>{student.student.enrollment}</small></td>{detail.categories.map((category) => <td key={category.id}><b>{grade(student.categoryValues[category.id]?.value)}</b><small>{student.categoryValues[category.id]?.label || 'Sin evidencia'}</small></td>)}<td className="gradebook-final"><b>{grade(student.displayedGrade)}</b><small>{student.officialGrade != null ? 'Oficial' : 'Provisional'}</small></td><td>{student.evidenceWeight.toFixed(0)}%</td><td><StatusPill tone={studentTone(student.status)}>{studentStatus(student.status)}</StatusPill></td></tr>)}</tbody></table></div>
    </SectionCard>
  );
}

function EvidencePanel({ detail, calculation, editable, busyExam, onSync, onNewItem, onCapture }: { detail: GradebookDetail; calculation: GradebookCalculation; editable: boolean; busyExam: string; onSync: (examId: string, categoryId: string) => void; onNewItem: () => void; onCapture: (item: GradeItem) => void }) {
  const omrCategory = detail.categories.find((category) => category.kind === 'omr');
  return (
    <div className="view-stack compact-stack">
      <SectionCard>
        <div className="section-heading"><div><span className="eyebrow">OMR → LIBRO</span><h2>Evaluaciones confirmadas</h2><p>Solo se publican resultados confirmados y no archivados.</p></div><Link className="button ghost" to="/omr">Abrir OMR</Link></div>
        {calculation.examSync.length ? <div className="gradebook-evidence-list">{calculation.examSync.map((state) => <article key={state.exam.id}><div><b>{state.exam.title}</b><small>{shortDate(state.exam.exam_date)} · {state.confirmed} confirmados · {state.pending} pendientes{state.unmatched ? ` · ${state.unmatched} sin alumno` : ''}</small></div><StatusPill tone={state.linked ? 'green' : 'amber'}>{state.linked ? 'Sincronizada' : 'Por publicar'}</StatusPill><button className="button secondary compact" type="button" disabled={!editable || !omrCategory || busyExam === state.exam.id} onClick={() => omrCategory && onSync(state.exam.id, omrCategory.id)}>{busyExam === state.exam.id ? 'Sincronizando…' : state.linked ? 'Actualizar' : 'Publicar en Libro'}</button></article>)}</div> : <EmptyState icon="exam" title="Sin evaluaciones OMR" detail="Marca una evaluación como Lista y confirma sus resultados para publicarla." action={<Link className="button primary" to="/exams">Ir a Evaluaciones</Link>} />}
        {!omrCategory ? <div className="warning-strip"><Icon name="alert" /><span>Configura una categoría de tipo OMR antes de publicar evaluaciones.</span></div> : null}
      </SectionCard>
      <SectionCard>
        <div className="section-heading"><div><span className="eyebrow">ACTIVIDADES MANUALES</span><h2>Prácticas, tareas y evidencias</h2><p>La puntuación se normaliza a escala 0–10 usando su máximo.</p></div><button className="button primary" type="button" disabled={!editable} onClick={onNewItem}>＋ Actividad</button></div>
        {calculation.manualItems.length ? <div className="gradebook-evidence-list">{calculation.manualItems.map((item) => { const captured = detail.scores.filter((score) => score.item_id === item.id && score.score != null).length; return <article key={item.id}><div><b>{item.title}</b><small>{shortDate(item.item_date)} · máximo {Number(item.max_score).toFixed(2)} · {captured}/{detail.students.length} capturadas</small></div><StatusPill tone={captured === detail.students.length && detail.students.length ? 'green' : 'amber'}>{captured}/{detail.students.length}</StatusPill><button className="button secondary compact" type="button" disabled={!editable} onClick={() => onCapture(item)}>Capturar</button></article>; })}</div> : <EmptyState icon="grades" title="Sin actividades manuales" detail="Crea la primera actividad dentro de una categoría manual." />}
      </SectionCard>
    </div>
  );
}

function History({ revisions }: { revisions: GradebookRevision[] }) {
  return <SectionCard><div className="section-heading"><div><span className="eyebrow">BITÁCORA</span><h2>Cambios recientes</h2><p>Las correcciones no sustituyen silenciosamente el historial.</p></div></div>{revisions.length ? <div className="gradebook-history">{revisions.map((revision) => <article key={revision.id}><Icon name={revision.action === 'insert' ? 'check' : 'refresh'} /><div><b>{revision.entity_type === 'category' ? 'Categoría' : revision.entity_type === 'item' ? 'Evidencia' : 'Calificación'} · {revision.action === 'insert' ? 'creada' : 'actualizada'}</b><small>{revision.reason || 'Cambio académico'} · {dateTime(revision.created_at)}</small></div></article>)}</div> : <EmptyState icon="shield" title="Sin cambios todavía" detail="La bitácora comenzará con la primera configuración o captura." />}</SectionCard>;
}

function DetailView({ detail, periodId, onPeriod }: { detail: GradebookDetail; periodId: string | null; onPeriod: (periodId: string | null) => void }) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'book' | 'evidence' | 'config' | 'history'>('book');
  const [notice, setNotice] = useState('');
  const [newItemOpen, setNewItemOpen] = useState(false);
  const [captureItem, setCaptureItem] = useState<GradeItem | null>(null);
  const [itemTitle, setItemTitle] = useState('');
  const [itemCategory, setItemCategory] = useState('');
  const [itemMax, setItemMax] = useState(10);
  const [itemDate, setItemDate] = useState(todayLocal());
  const calculation = useMemo(() => calculateGradebook(detail, periodId), [detail, periodId]);
  const period = calculation.period;

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: gradebookDetailKey(auth.user?.id, detail.group.id, periodId) }),
      queryClient.invalidateQueries({ queryKey: gradebookWorkspaceKey(auth.user?.id) }),
      queryClient.invalidateQueries({ queryKey: ['teacher-home', auth.user?.id] }),
    ]);
  }

  const defaults = useMutation({ mutationFn: () => { if (!auth.user) throw new Error('Tu sesión expiró.'); return ensureGradebookDefaults(auth.user, detail.group.id); }, onSuccess: async () => { setNotice('Estructura 40/30/20/10 creada.'); await refresh(); } });
  const categories = useMutation({ mutationFn: (rows: CategoryDraft[]) => { if (!auth.user) throw new Error('Tu sesión expiró.'); return saveGradebookCategories(auth.user, detail.group.id, rows); }, onSuccess: async () => { setNotice('Ponderaciones guardadas.'); await refresh(); } });
  const item = useMutation({ mutationFn: () => { if (!auth.user) throw new Error('Tu sesión expiró.'); return saveGradebookItem(auth.user, { groupId: detail.group.id, categoryId: itemCategory, periodId, title: itemTitle, maxScore: itemMax, itemDate, reason: 'Nueva actividad desde TEDVIO 2.0' }); }, onSuccess: async () => { setNotice('Actividad creada.'); setNewItemOpen(false); setItemTitle(''); await refresh(); } });
  const score = useMutation({ mutationFn: (rows: GradeScoreDraft[]) => { if (!auth.user || !captureItem) throw new Error('No hay una actividad válida.'); return saveGradebookScores(auth.user, captureItem.id, rows); }, onSuccess: async () => { setNotice('Calificaciones guardadas.'); setCaptureItem(null); await refresh(); } });
  const omr = useMutation({ mutationFn: ({ examId, categoryId }: { examId: string; categoryId: string }) => { if (!auth.user) throw new Error('Tu sesión expiró.'); return linkOmrExamToGradebook(auth.user, examId, categoryId); }, onSuccess: async (result) => { setNotice(`${result.linked} resultados OMR publicados; ${result.pending} pendientes.`); await refresh(); } });
  const error = (defaults.error || categories.error || item.error || score.error || omr.error) as Error | null;
  const manualCategories = detail.categories.filter((category) => category.kind === 'manual');
  const official = detail.periodSummary;

  useEffect(() => {
    if (!itemCategory && manualCategories[0]) setItemCategory(manualCategories[0].id);
  }, [itemCategory, manualCategories]);

  return (
    <div className="view-stack gradebook-page">
      <PageHeader eyebrow="LIBRO DE CALIFICACIONES" title={groupLabel(detail.group)} detail={[detail.group.university_name || detail.group.university, detail.group.school_cycle || detail.group.term].filter(Boolean).join(' · ')} actions={<div className="page-actions"><Link className="button ghost" to="/gradebook">← Libros</Link><button className="button secondary" type="button" onClick={() => exportGradebookCsv(detail, calculation)}>Exportar CSV</button></div>} />
      {notice ? <div className="success-strip"><Icon name="check" /><span>{notice}</span><button type="button" onClick={() => setNotice('')}>×</button></div> : null}
      {error ? <ErrorPanel title="No se pudo completar la operación" detail={error.message} /> : null}
      <section className="gradebook-context-bar"><label>Periodo<select value={periodId || 'course'} onChange={(event) => onPeriod(event.target.value === 'course' ? null : event.target.value)}><option value="course">Curso completo</option>{detail.periods.map((row) => <option key={row.id} value={row.id}>{row.name} · {row.status === 'closed' ? 'cerrado' : 'abierto'}</option>)}</select></label>{period ? <><StatusPill tone={period.status === 'closed' ? 'blue' : 'green'}>{period.status === 'closed' ? 'Periodo cerrado' : 'Periodo abierto'}</StatusPill><span>{shortDate(period.starts_on)}–{shortDate(period.ends_on)}</span></> : <StatusPill tone={detail.periods.length ? 'amber' : 'green'}>{detail.periods.length ? 'Vista consolidada' : 'Curso editable'}</StatusPill>}{Math.abs(calculation.configuredWeight - 100) >= 0.01 ? <StatusPill tone="red">Ponderaciones {calculation.configuredWeight.toFixed(1)}%</StatusPill> : <StatusPill tone="green">Ponderaciones 100%</StatusPill>}</section>
      {period?.status === 'closed' ? <section className="gradebook-locked-banner"><Icon name="shield" /><div><span className="eyebrow">CIERRE PROTEGIDO</span><h2>Los promedios provienen del snapshot oficial.</h2><p>Reabre el periodo desde Periodos Académicos antes de corregir evidencias.</p></div><Link className="button secondary" to="/periods">Ver Periodos</Link></section> : null}
      {!period && detail.periods.length ? <div className="warning-strip"><Icon name="alert" /><span>La vista del curso es consolidada. Selecciona un periodo abierto para crear evidencias o capturar calificaciones.</span></div> : null}
      <section className="metric-grid four"><MetricCard label={period?.status === 'closed' ? 'Promedio oficial' : 'Promedio actual'} value={grade(calculation.groupAverage)} detail={`Aprobación ${percent(calculation.approvalRate)}`} icon="grades" tone="blue" /><MetricCard label="Alumnos evaluados" value={String(calculation.students.length - calculation.studentsWithoutGrade)} detail={`${calculation.studentsWithoutGrade} sin promedio`} icon="groups" tone="violet" /><MetricCard label="Captura manual" value={`${calculation.manualCaptured}/${calculation.manualExpected}`} detail={`${calculation.manualPending} pendientes`} icon="check" tone={calculation.manualPending ? 'amber' : 'green'} /><MetricCard label="OMR confirmado" value={String(calculation.confirmedOmr)} detail={`${calculation.pendingOmr} por revisar`} icon="exam" tone={calculation.pendingOmr ? 'amber' : 'green'} /></section>
      {!detail.categories.length ? <section className="gradebook-setup-hero"><div><Icon name="grades" /></div><div><span className="eyebrow">CONFIGURACIÓN INICIAL</span><h2>Prepara el Libro con una estructura base.</h2><p>TEDVIO creará Exámenes OMR 40%, Actividades 30%, Prácticas 20% y Asistencia 10%. Después podrás ajustar nombres y ponderaciones.</p><button className="button primary" type="button" disabled={defaults.isPending} onClick={() => defaults.mutate()}>{defaults.isPending ? 'Configurando…' : 'Crear estructura 40/30/20/10'}</button></div></section> : <><nav className="gradebook-tabs" aria-label="Secciones del Libro"><button type="button" className={tab === 'book' ? 'active' : ''} onClick={() => setTab('book')}>Libro</button><button type="button" className={tab === 'evidence' ? 'active' : ''} onClick={() => setTab('evidence')}>Evidencias</button><button type="button" className={tab === 'config' ? 'active' : ''} onClick={() => setTab('config')}>Ponderaciones</button><button type="button" className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>Bitácora</button></nav>{tab === 'book' ? <><div className="gradebook-category-cards">{detail.categories.map((category) => { const values = calculation.students.map((student) => student.categoryValues[category.id]?.value).filter((value): value is number => value != null); const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; return <article key={category.id}><div><span className="eyebrow">{kindLabel(category.kind)}</span><h3>{category.name}</h3></div><b>{Number(category.weight).toFixed(0)}%</b><small>Promedio {grade(average)}</small></article>; })}</div><GradeTable detail={detail} calculation={calculation} />{official && period ? <SectionCard><div className="section-heading"><div><span className="eyebrow">PREPARACIÓN DE CIERRE</span><h2>{Boolean(official.ready) ? 'Periodo listo para cerrar' : 'Pendientes académicos'}</h2><p>{Boolean(official.ready) ? 'Las reglas de cierre no detectan incidencias.' : 'TEDVIO conserva visibles los faltantes antes del cierre.'}</p></div><StatusPill tone={Boolean(official.ready) ? 'green' : 'amber'}>{Boolean(official.ready) ? 'Listo' : 'En proceso'}</StatusPill></div>{Array.isArray(official.issues) && official.issues.length ? <ul className="gradebook-issue-list">{official.issues.map((issue, index) => <li key={index}><Icon name="alert" />{String((issue as Record<string, unknown>).label || 'Pendiente')}</li>)}</ul> : <div className="success-strip"><Icon name="check" /><span>Sin incidencias de cierre.</span></div>}</SectionCard> : null}</> : null}{tab === 'evidence' ? <><EvidencePanel detail={detail} calculation={calculation} editable={calculation.editable} busyExam={omr.variables?.examId || ''} onSync={(examId, categoryId) => omr.mutate({ examId, categoryId })} onNewItem={() => setNewItemOpen(true)} onCapture={setCaptureItem} />{newItemOpen ? <SectionCard><div className="section-heading"><div><span className="eyebrow">NUEVA EVIDENCIA</span><h2>Actividad manual</h2></div><button className="button ghost" type="button" onClick={() => setNewItemOpen(false)}>Cerrar</button></div><div className="form-grid four"><label>Título<input value={itemTitle} onChange={(event) => setItemTitle(event.target.value)} /></label><label>Categoría<select value={itemCategory} onChange={(event) => setItemCategory(event.target.value)}>{manualCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>Máximo<input type="number" min="0.01" max="10000" step="0.01" value={itemMax} onChange={(event) => setItemMax(Number(event.target.value))} /></label><label>Fecha<input type="date" value={itemDate} onChange={(event) => setItemDate(event.target.value)} /></label></div><footer className="gradebook-editor-footer"><button className="button primary" type="button" disabled={item.isPending || !calculation.editable || !itemTitle.trim() || !itemCategory} onClick={() => item.mutate()}>{item.isPending ? 'Guardando…' : 'Crear actividad'}</button></footer></SectionCard> : null}{captureItem ? <ScoreCapture detail={detail} calculation={calculation} item={captureItem} busy={score.isPending} onClose={() => setCaptureItem(null)} onSave={(rows) => score.mutate(rows)} /> : null}<SectionCard><div className="section-heading"><div><span className="eyebrow">MATRIZ DE EVIDENCIAS</span><h2>Fuente, captura y resultado</h2><p>Permite localizar exactamente qué actividad origina cada calificación.</p></div></div><div className="gradebook-table-wrap"><table className="gradebook-table evidence"><thead><tr><th>Alumno</th>{calculation.items.map((evidence) => <th key={evidence.id}>{evidence.title}<small>/{Number(evidence.max_score).toFixed(1)}</small></th>)}<th>Promedio</th></tr></thead><tbody>{calculation.students.map((student) => <tr key={student.student.id}><td><b>{student.student.full_name}</b><small>{student.student.enrollment}</small></td>{calculation.items.map((evidence) => <td key={evidence.id}>{student.itemScores[evidence.id] == null ? '—' : Number(student.itemScores[evidence.id]).toFixed(2)}</td>)}<td className="gradebook-final"><b>{grade(student.displayedGrade)}</b></td></tr>)}</tbody></table></div></SectionCard></> : null}{tab === 'config' ? <CategoriesEditor categories={detail.categories} busy={categories.isPending} onSave={(rows) => categories.mutate(rows)} /> : null}{tab === 'history' ? <History revisions={detail.revisions} /> : null}</>}
      <section className="gradebook-next-phase"><Icon name="route" /><div><span className="eyebrow">SIGUIENTE BLOQUE · 4D</span><h2>La evidencia ya está lista para Alumno 360°.</h2><p>El expediente consolidará trayectoria, asistencia, OMR, actividades, notas y evolución por periodo.</p></div></section>
    </div>
  );
}

function todayLocal(): string {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export function GradebookPage() {
  const auth = useAuth();
  const { groupId } = useParams();
  const [params, setParams] = useSearchParams();
  const workspace = useQuery({ queryKey: gradebookWorkspaceKey(auth.user?.id), queryFn: () => { if (!auth.user) throw new Error('No hay una sesión docente activa.'); return fetchGradebookWorkspace(auth.user); }, enabled: Boolean(auth.user) });
  const requested = params.get('period');
  const periodId = requested && requested !== 'course' ? requested : null;
  const detail = useQuery({ queryKey: gradebookDetailKey(auth.user?.id, groupId, periodId), queryFn: () => { if (!auth.user || !groupId) throw new Error('No se puede abrir el Libro.'); return fetchGradebookDetail(auth.user, groupId, periodId); }, enabled: Boolean(auth.user && groupId) });

  useEffect(() => {
    if (!groupId || requested || !detail.data?.periods.length) return;
    const next = recommendedPeriodId(detail.data.periods);
    if (next) setParams({ period: next }, { replace: true });
  }, [detail.data?.periods, groupId, requested, setParams]);

  if (workspace.isLoading) return <LoadingScreen label="Abriendo el Libro…" />;
  if (workspace.isError) return <ErrorPanel title="No pude cargar el Libro" detail={workspace.error.message} onRetry={() => workspace.refetch()} />;
  if (!workspace.data) return <ErrorPanel title="Libro no disponible" detail="No se recibió el espacio académico." />;
  if (!groupId) return <Landing workspace={workspace.data} />;
  if (detail.isLoading) return <LoadingScreen label="Calculando evidencias…" />;
  if (detail.isError) return <ErrorPanel title="No pude abrir el grupo" detail={detail.error.message} onRetry={() => detail.refetch()} />;
  if (!detail.data) return <ErrorPanel title="Grupo no disponible" detail="No se encontró el Libro solicitado." />;
  return <DetailView detail={detail.data} periodId={periodId} onPeriod={(next) => setParams(next ? { period: next } : { period: 'course' })} />;
}
