import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  exportOmrResultsCsv,
  fetchOmrExam,
  fetchOmrWorkspace,
  omrExamKey,
  omrWorkspaceKey,
  setOmrResultArchived,
  type OmrExamDetail,
  type OmrResult,
  type OmrWorkspace,
} from '../../core/omr';
import type { PaperExam } from '../../core/exams';
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
import { OmrScanner } from './OmrScanner';

function groupLabel(group?: GroupRecord | null): string {
  if (!group) return 'Sin grupo';
  return [group.subject || group.program || 'Asignatura', group.group_name || group.name || 'Grupo']
    .filter(Boolean)
    .join(' · ');
}

function shortDate(value?: string | null): string {
  if (!value) return 'Sin fecha';
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

function dateTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function grade(value?: number | null): string {
  return value == null || Number.isNaN(Number(value)) ? '—' : Number(value).toFixed(1);
}

function percent(value?: number | null): string {
  return value == null || Number.isNaN(Number(value)) ? '—' : `${Math.round(Number(value) * 100)}%`;
}

function studentLabel(result: OmrResult): string {
  return result.student_name || result.enrollment || 'Alumno sin identificar';
}

function reviewTone(result: OmrResult): string {
  if (result.archived_at || result.review_status === 'archived') return 'neutral';
  return result.review_status === 'confirmed' || result.reviewed ? 'green' : 'amber';
}

function reviewLabel(result: OmrResult): string {
  if (result.archived_at || result.review_status === 'archived') return 'Archivada';
  return result.review_status === 'confirmed' || result.reviewed ? 'Confirmada' : 'Pendiente';
}

function activeResults(detail: OmrExamDetail): OmrResult[] {
  return detail.results.filter((result) => !result.archived_at && result.review_status !== 'archived');
}

function OmrExamCard({ exam, workspace }: { exam: PaperExam; workspace: OmrWorkspace }) {
  const group = workspace.groups.find((item) => item.id === exam.group_id) || null;
  const summary = workspace.summaries[exam.id];
  const pending = workspace.pendingByExam[exam.id] || 0;
  return (
    <article className="omr-exam-card">
      <header>
        <div>
          <div className="question-chips">
            <StatusPill tone={exam.status === 'ready' ? 'green' : 'blue'}>{exam.status === 'ready' ? 'Lista' : 'Cerrada'}</StatusPill>
            <StatusPill tone="violet">{exam.versions.join(' / ')}</StatusPill>
            {pending ? <StatusPill tone="amber">{pending} por revisar</StatusPill> : null}
          </div>
          <h2>{exam.title}</h2>
          <p>{groupLabel(group)}</p>
        </div>
        <span className="omr-exam-date">{shortDate(exam.exam_date)}</span>
      </header>
      <div className="omr-exam-metrics">
        <span><small>Reactivos</small><b>{exam.question_count}</b></span>
        <span><small>Capturas</small><b>{summary?.results || 0}</b></span>
        <span><small>Promedio</small><b>{grade(summary?.average)}</b></span>
        <span><small>Aprobación</small><b>{percent(summary?.passRate)}</b></span>
      </div>
      <footer>
        <small>{summary?.reviewed || 0} confirmadas</small>
        <Link className="button primary" to={`/omr/${exam.id}`}>Abrir OMR</Link>
      </footer>
    </article>
  );
}

function OmrLanding({ workspace }: { workspace: OmrWorkspace }) {
  const [query, setQuery] = useState('');
  const [groupId, setGroupId] = useState('');
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('es-MX');
    return workspace.exams.filter((exam) => {
      if (groupId && exam.group_id !== groupId) return false;
      if (!needle) return true;
      const group = workspace.groups.find((item) => item.id === exam.group_id);
      return [exam.title, exam.subject, group?.name, group?.group_name, group?.program, group?.university]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('es-MX')
        .includes(needle);
    });
  }, [groupId, query, workspace]);

  const totalResults = workspace.exams.reduce((sum, exam) => sum + (workspace.summaries[exam.id]?.results || 0), 0);
  const pending = Object.values(workspace.pendingByExam).reduce((sum, value) => sum + value, 0);

  return (
    <div className="view-stack omr-page">
      <PageHeader
        eyebrow="ETAPA 4B · OMR"
        title="Captura óptica de respuestas"
        detail="Imprime hojas, usa la cámara, revisa las marcas dudosas y confirma resultados dentro del frontend unificado."
        actions={<Link className="button secondary" to="/exams">Evaluaciones</Link>}
      />

      <section className="metric-grid four">
        <MetricCard label="Evaluaciones OMR" value={String(workspace.exams.length)} detail="Listas o cerradas" icon="exam" tone="blue" />
        <MetricCard label="Capturas" value={String(totalResults)} detail="Resultados activos" icon="grades" tone="violet" />
        <MetricCard label="Por revisar" value={String(pending)} detail={pending ? 'Requieren confirmación' : 'Sin pendientes'} icon="alert" tone={pending ? 'amber' : 'green'} />
        <MetricCard label="Procesamiento" value="Local" detail="La fotografía no se sube a Supabase" icon="shield" tone="green" />
      </section>

      <SectionCard>
        <div className="omr-toolbar">
          <label className="search-field"><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar evaluación, materia o grupo" /></label>
          <select value={groupId} onChange={(event) => setGroupId(event.target.value)}>
            <option value="">Todos los grupos</option>
            {workspace.groups.map((group) => <option key={group.id} value={group.id}>{groupLabel(group)}</option>)}
          </select>
          <StatusPill tone="blue">{filtered.length} evaluaciones</StatusPill>
        </div>
      </SectionCard>

      {filtered.length ? (
        <section className="omr-exam-grid">
          {filtered.map((exam) => <OmrExamCard key={exam.id} exam={exam} workspace={workspace} />)}
        </section>
      ) : (
        <EmptyState
          icon="exam"
          title={workspace.exams.length ? 'No hay coincidencias' : 'No hay evaluaciones listas para OMR'}
          detail={workspace.exams.length ? 'Ajusta la búsqueda o el filtro de grupo.' : 'Crea una evaluación desde Question Studio y márcala como Lista.'}
          action={<Link className="button primary" to="/exams/new">Crear evaluación</Link>}
        />
      )}

      <section className="omr-privacy-note">
        <Icon name="shield" />
        <div><span className="eyebrow">PRIVACIDAD POR DISEÑO</span><h2>La fotografía no sale del dispositivo.</h2><p>TEDVIO guarda las respuestas, la calidad de lectura y una huella técnica; no conserva la imagen de la hoja.</p></div>
      </section>
    </div>
  );
}

function PrintPanel({ detail }: { detail: OmrExamDetail }) {
  const [mode, setMode] = useState<'generic' | 'roster'>(detail.roster.length ? 'roster' : 'generic');
  const [version, setVersion] = useState(detail.exam.versions[0] || 'A');
  const [alternate, setAlternate] = useState(detail.exam.versions.length > 1);
  const [copies, setCopies] = useState(Math.max(1, detail.roster.length || 1));

  function openSheets() {
    const params = new URLSearchParams({
      mode,
      version,
      alternate: alternate ? '1' : '0',
      copies: String(Math.max(1, Math.min(200, Math.round(copies) || 1))),
    });
    const url = `${window.location.origin}/teacher-v2/#/omr/${detail.exam.id}/sheets?${params.toString()}`;
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (!opened) window.location.hash = `/omr/${detail.exam.id}/sheets?${params.toString()}`;
  }

  const sheetCount = mode === 'roster' ? detail.roster.length : Math.max(1, Math.min(200, Math.round(copies) || 1));
  return (
    <SectionCard className="omr-print-panel">
      <div className="section-heading">
        <div><span className="eyebrow">1 · PREPARAR HOJAS</span><h2>Impresión A4</h2><p>Genera hojas genéricas o personalizadas con QR, versión y cuatro marcas de registro.</p></div>
        <StatusPill tone="blue">{sheetCount} hoja{sheetCount === 1 ? '' : 's'}</StatusPill>
      </div>
      <div className="omr-print-options">
        <label>Tipo<select value={mode} onChange={(event) => setMode(event.target.value as 'generic' | 'roster')}><option value="roster" disabled={!detail.roster.length}>Padrón personalizado</option><option value="generic">Genéricas</option></select></label>
        {mode === 'generic' ? <label>Copias<input type="number" min="1" max="200" value={copies} onChange={(event) => setCopies(Number(event.target.value))} /></label> : null}
        <label>Versión<select value={version} onChange={(event) => setVersion(event.target.value)}>{detail.exam.versions.map((item) => <option key={item} value={item}>Versión {item}</option>)}</select></label>
        <label className="toggle-field"><input type="checkbox" checked={alternate} disabled={detail.exam.versions.length < 2} onChange={(event) => setAlternate(event.target.checked)} /> Alternar versiones</label>
      </div>
      <div className="omr-print-summary"><Icon name="exam" /><span><b>{detail.exam.question_count} reactivos · {detail.exam.option_count} opciones</b><small>{mode === 'roster' ? `${detail.roster.length} alumnos activos` : `${sheetCount} copias genéricas`} · {alternate ? detail.exam.versions.join('/') : version}</small></span></div>
      <button className="button primary wide" type="button" onClick={openSheets}>Abrir hojas para imprimir</button>
    </SectionCard>
  );
}

function revisionCount(detail: OmrExamDetail, resultId: string): number {
  return detail.revisions.filter((revision) => revision.result_id === resultId).length;
}

function ResultRow({
  detail,
  result,
  onEdit,
  onArchive,
  busy,
}: {
  detail: OmrExamDetail;
  result: OmrResult;
  onEdit: () => void;
  onArchive: (archived: boolean) => void;
  busy: boolean;
}) {
  const archived = Boolean(result.archived_at || result.review_status === 'archived');
  const revisions = revisionCount(detail, result.id);
  return (
    <div className={archived ? 'archived' : ''} role="row">
      <span><b>{studentLabel(result)}</b><small>{result.enrollment || 'Sin matrícula'} · {dateTime(result.updated_at || result.created_at)}</small></span>
      <span>{result.version}</span>
      <span>{result.correct_count}/{detail.exam.question_count}</span>
      <span>{result.blank_count}</span>
      <span><b>{grade(result.score)}</b></span>
      <span><StatusPill tone={reviewTone(result)}>{reviewLabel(result)}</StatusPill><small>{revisions ? `${revisions} revisión${revisions === 1 ? '' : 'es'}` : 'Sin correcciones'}</small></span>
      <span className="omr-result-actions">
        {!archived ? <button className="button ghost compact" type="button" disabled={busy} onClick={onEdit}>Revisar</button> : null}
        <button className="button ghost compact" type="button" disabled={busy} onClick={() => onArchive(!archived)}>{archived ? 'Restaurar' : 'Archivar'}</button>
      </span>
    </div>
  );
}

function ResultsPanel({
  detail,
  onEdit,
  onChanged,
}: {
  detail: OmrExamDetail;
  onEdit: (result: OmrResult) => void;
  onChanged: () => Promise<void>;
}) {
  const auth = useAuth();
  const [showArchived, setShowArchived] = useState(false);
  const [notice, setNotice] = useState('');
  const mutation = useMutation({
    mutationFn: async ({ result, archived }: { result: OmrResult; archived: boolean }) => {
      if (!auth.user) throw new Error('Tu sesión expiró.');
      const prompt = archived
        ? 'Motivo para archivar este resultado:'
        : 'Motivo para restaurar este resultado:';
      const reason = window.prompt(prompt, archived ? 'Corrección o captura duplicada' : 'Resultado restablecido por el docente');
      if (reason === null) throw new Error('Operación cancelada.');
      return setOmrResultArchived(auth.user, result.id, archived, reason);
    },
    onSuccess: async (result) => {
      setNotice(result.archived_at ? 'Resultado archivado sin eliminar su historial.' : 'Resultado restaurado.');
      await onChanged();
    },
  });

  const visible = detail.results.filter((result) => showArchived || (!result.archived_at && result.review_status !== 'archived'));
  const error = mutation.error as Error | null;
  return (
    <SectionCard>
      <div className="section-heading">
        <div><span className="eyebrow">HISTORIAL OMR</span><h2>Resultados y revisiones</h2><p>Las correcciones guardan una fotografía anterior; los resultados se archivan, nunca se eliminan.</p></div>
        <div className="page-actions"><label className="toggle-field"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} /> Mostrar archivados</label><button className="button secondary" type="button" disabled={!activeResults(detail).length} onClick={() => exportOmrResultsCsv(detail.exam, detail.results)}>Exportar CSV</button></div>
      </div>
      {notice ? <div className="success-strip"><Icon name="check" /><span>{notice}</span><button type="button" onClick={() => setNotice('')}>×</button></div> : null}
      {error && error.message !== 'Operación cancelada.' ? <ErrorPanel title="No se pudo actualizar el resultado" detail={error.message} /> : null}
      {visible.length ? (
        <div className="omr-results-table" role="table">
          <div className="omr-results-head" role="row"><span>Alumno</span><span>Versión</span><span>Aciertos</span><span>Blancos</span><span>Calificación</span><span>Estado</span><span>Acciones</span></div>
          {visible.map((result) => <ResultRow key={result.id} detail={detail} result={result} onEdit={() => onEdit(result)} onArchive={(archived) => mutation.mutate({ result, archived })} busy={mutation.isPending} />)}
        </div>
      ) : (
        <EmptyState icon="grades" title="Aún no hay capturas" detail="Escanea o registra manualmente la primera hoja de respuestas." />
      )}
    </SectionCard>
  );
}

function OmrDetailView({ detail, refetch }: { detail: OmrExamDetail; refetch: () => Promise<unknown> }) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [editing, setEditing] = useState<OmrResult | null>(null);
  const active = activeResults(detail);
  const confirmed = active.filter((result) => result.review_status === 'confirmed' || result.reviewed);
  const pending = active.filter((result) => result.review_status === 'needs_review' && !result.reviewed);
  const scores = confirmed.map((result) => Number(result.score)).filter(Number.isFinite);
  const average = scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null;
  const passing = Number(detail.exam.passing_score || 6);
  const passRate = scores.length ? scores.filter((score) => score >= passing).length / scores.length : null;
  const coverage = detail.roster.length
    ? new Set(active.filter((result) => result.student_id).map((result) => result.student_id)).size / detail.roster.length
    : null;

  async function refreshAll() {
    await Promise.all([
      refetch(),
      queryClient.invalidateQueries({ queryKey: omrWorkspaceKey(auth.user?.id) }),
      queryClient.invalidateQueries({ queryKey: ['teacher-exam-detail', auth.user?.id, detail.exam.id] }),
      queryClient.invalidateQueries({ queryKey: ['teacher-exams', auth.user?.id] }),
    ]);
  }

  if (scannerOpen || editing) {
    return (
      <div className="view-stack omr-page">
        <PageHeader eyebrow="OMR · CAPTURA" title={detail.exam.title} detail={`${groupLabel(detail.group)} · ${detail.exam.question_count} reactivos`} actions={<button className="button secondary" type="button" onClick={() => { setScannerOpen(false); setEditing(null); }}>← Evaluación</button>} />
        <OmrScanner
          detail={detail}
          initialResult={editing}
          onCancel={() => { setScannerOpen(false); setEditing(null); }}
          onSaved={async () => {
            await refreshAll();
            setScannerOpen(false);
            setEditing(null);
          }}
        />
      </div>
    );
  }

  return (
    <div className="view-stack omr-page">
      <PageHeader
        eyebrow="OMR · EVALUACIÓN"
        title={detail.exam.title}
        detail={`${detail.exam.subject || 'Sin materia'} · ${groupLabel(detail.group)} · ${shortDate(detail.exam.exam_date)}`}
        actions={<div className="page-actions"><StatusPill tone={detail.exam.status === 'ready' ? 'green' : 'blue'}>{detail.exam.status === 'ready' ? 'Lista' : 'Cerrada'}</StatusPill><Link className="button secondary" to="/omr">← OMR</Link></div>}
      />

      <section className="metric-grid four">
        <MetricCard label="Confirmadas" value={String(confirmed.length)} detail={`${pending.length} pendientes`} icon="grades" tone="blue" />
        <MetricCard label="Cobertura" value={percent(coverage)} detail={`${detail.roster.length} alumnos en padrón`} icon="groups" tone="violet" />
        <MetricCard label="Promedio" value={grade(average)} detail={`Aprobación ${percent(passRate)}`} icon="reports" tone="green" />
        <MetricCard label="Versiones" value={detail.exam.versions.join(' / ')} detail={`${detail.exam.question_count} reactivos`} icon="exam" tone="amber" />
      </section>

      <section className="omr-top-grid">
        <PrintPanel detail={detail} />
        <SectionCard className="omr-workflow-card">
          <div className="section-heading"><div><span className="eyebrow">2 · CAPTURAR</span><h2>Cámara, archivo o captura manual</h2><p>Ninguna marca dudosa se confirma sin revisión docente.</p></div></div>
          <ol>
            <li><b>Fotografía</b><span>Incluye toda la hoja y las cuatro marcas negras.</span></li>
            <li><b>Revisa</b><span>TEDVIO señala blancos y respuestas ambiguas.</span></li>
            <li><b>Confirma</b><span>PostgreSQL recalcula la calificación y guarda el resultado.</span></li>
          </ol>
          <button className="button primary wide" type="button" onClick={() => setScannerOpen(true)}>Abrir escáner OMR</button>
          <div className="omr-zero-cost"><Icon name="shield" /><div><b>Costo de inferencia: $0</b><span>Visión computacional determinista; sin IA generativa ni tokens.</span></div></div>
        </SectionCard>
      </section>

      <ResultsPanel detail={detail} onEdit={(result) => setEditing(result)} onChanged={refreshAll} />

      <section className="omr-next-phase">
        <Icon name="route" />
        <div><span className="eyebrow">SIGUIENTE BLOQUE · 4C</span><h2>Los resultados ya están listos para el Libro.</h2><p>La Fase 4C conectará estas capturas con categorías, ponderaciones, evidencias y publicación académica.</p></div>
        <Link className="button secondary" to="/gradebook">Ver preparación del Libro</Link>
      </section>
    </div>
  );
}

export function OmrPage() {
  const auth = useAuth();
  const { examId } = useParams();
  const workspace = useQuery({
    queryKey: omrWorkspaceKey(auth.user?.id),
    queryFn: () => {
      if (!auth.user) throw new Error('No hay una sesión docente activa.');
      return fetchOmrWorkspace(auth.user);
    },
    enabled: Boolean(auth.user),
  });
  const detail = useQuery({
    queryKey: omrExamKey(auth.user?.id, examId),
    queryFn: () => {
      if (!auth.user || !examId) throw new Error('No se puede abrir la captura OMR.');
      return fetchOmrExam(auth.user, examId);
    },
    enabled: Boolean(auth.user && examId),
  });

  if (workspace.isLoading) return <LoadingScreen label="Abriendo OMR…" />;
  if (workspace.isError) return <ErrorPanel title="No pude cargar OMR" detail={workspace.error.message} onRetry={() => workspace.refetch()} />;
  if (!workspace.data) return <ErrorPanel title="OMR no disponible" detail="No se recibió el catálogo de evaluaciones." />;
  if (!examId) return <OmrLanding workspace={workspace.data} />;
  if (detail.isLoading) return <LoadingScreen label="Preparando la evaluación OMR…" />;
  if (detail.isError) return <ErrorPanel title="No pude abrir la evaluación" detail={detail.error.message} onRetry={() => detail.refetch()} />;
  if (!detail.data) return <ErrorPanel title="Evaluación no disponible" detail="No se encontró la evaluación seleccionada." />;
  return <OmrDetailView detail={detail.data} refetch={() => detail.refetch()} />;
}