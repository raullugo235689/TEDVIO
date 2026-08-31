import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  buildAcademicReport,
  downloadAcademicReportCsv,
  fetchReportData,
  fetchReportWorkspace,
  printAcademicReport,
  reportDataKey,
  reportWorkspaceKey,
  type AcademicReportSpec,
  type AcademicReportType,
  type ReportWorkspace,
} from '../../core/reports';
import type { GroupRecord } from '../../core/types';
import { EmptyState, ErrorPanel, LoadingScreen, MetricCard, PageHeader, SectionCard, StatusPill } from '../../shared/components';
import { Icon } from '../../shared/icons';
import { useAuth } from '../auth/AuthProvider';

const definitions: Array<{ type: AcademicReportType; title: string; detail: string; icon: 'reports' | 'groups' | 'attendance' | 'grades' | 'exam' | 'classroom' }> = [
  { type: 'group', title: 'Reporte académico del grupo', detail: 'Promedio, asistencia, OMR, evidencia, pendientes y alertas.', icon: 'reports' },
  { type: 'roster', title: 'Lista oficial de alumnos', detail: 'Padrón activo con matrícula y nombre completo.', icon: 'groups' },
  { type: 'attendance', title: 'Registro de asistencia', detail: 'Matriz P/R/F/J por fecha con porcentaje individual.', icon: 'attendance' },
  { type: 'grades', title: 'Concentrado de calificaciones', detail: 'Categorías, ponderaciones, promedio y peso con evidencia.', icon: 'grades' },
  { type: 'evaluations', title: 'Resultados de evaluaciones', detail: 'OMR confirmado y tareas digitales del periodo.', icon: 'exam' },
  { type: 'sessions', title: 'Historial de sesiones', detail: 'Participantes, preguntas, respuestas y acierto Live.', icon: 'classroom' },
];

function groupLabel(group?: GroupRecord | null): string {
  if (!group) return 'Grupo';
  return [group.subject || group.program || 'Asignatura', group.group_name || group.name || 'Grupo'].filter(Boolean).join(' · ');
}

function currentMonth(): string {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 7);
}

function dateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function Landing({ workspace }: { workspace: ReportWorkspace }) {
  return (
    <div className="view-stack phase5-page reports-page">
      <PageHeader
        eyebrow="FASE 5 · DOCUMENTACIÓN"
        title="Centro de reportes"
        detail="Genera documentos consistentes desde la misma evidencia utilizada por el Libro, OMR, Asistencia y Alumno 360°."
      />
      <section className="metric-grid four">
        <MetricCard label="Grupos" value={String(workspace.groups.length)} detail="Disponibles para reportar" icon="groups" tone="blue" />
        <MetricCard label="Reportes" value={String(definitions.length)} detail="Académicos e institucionales" icon="reports" tone="violet" />
        <MetricCard label="Exportación" value="CSV" detail="Generación bajo demanda" icon="route" tone="green" />
        <MetricCard label="Impresión" value="A4" detail="Vista institucional del navegador" icon="shield" tone="amber" />
      </section>
      {workspace.groups.length ? (
        <section className="phase5-card-grid">
          {workspace.groups.map((group) => (
            <article className="phase5-group-card" key={group.id}>
              <header><div><span className="eyebrow">{group.university_name || group.university || 'TEDVIO'}</span><h2>{groupLabel(group)}</h2><p>{group.school_cycle || group.term || 'Sin ciclo escolar'}</p></div><StatusPill tone="blue">6 formatos</StatusPill></header>
              <div className="phase5-group-metrics"><span><small>Fuente</small><b>Libro</b></span><span><small>Privacidad</small><b>RLS</b></span><span><small>IA</small><b>$0</b></span></div>
              <footer><Link className="button primary" to={`/reports/${group.id}`}>Abrir reportes</Link></footer>
            </article>
          ))}
        </section>
      ) : <EmptyState icon="groups" title="Aún no hay grupos" detail="Crea un grupo antes de generar documentación académica." action={<Link className="button primary" to="/groups">Ir a Grupos</Link>} />}
    </div>
  );
}

function ReportPreview({ spec }: { spec: AcademicReportSpec }) {
  const previewRows = spec.rows.slice(0, 40);
  return (
    <SectionCard className="report-preview-card">
      <header className="report-document-head">
        <div className="report-document-logo">{spec.logoUrl ? <img src={spec.logoUrl} alt="Logotipo institucional" /> : <span>TEDVIO</span>}</div>
        <div><span className="eyebrow">{spec.institution}</span><h2>{spec.title}</h2><p>{spec.subtitle}</p></div>
        <div className="report-document-meta"><b>{spec.subject} · {spec.group}</b><span>{spec.program}</span><span>{spec.period}</span>{spec.documentCode ? <span>{spec.documentCode}</span> : null}</div>
      </header>
      <div className="report-summary-grid">{spec.summary.map((item) => <article key={item.label}><span>{item.label}</span><b>{item.value}</b></article>)}</div>
      <div className="report-table-wrap"><table className="report-table"><thead><tr>{spec.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{previewRows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={`${rowIndex}-${cellIndex}`}>{cell == null ? '' : String(cell)}</td>)}</tr>)}</tbody></table></div>
      {spec.rows.length > previewRows.length ? <div className="report-preview-limit"><Icon name="more" /> Se muestran 40 de {spec.rows.length} filas. La exportación incluye todo.</div> : null}
      {spec.note ? <p className="report-note">{spec.note}</p> : null}
      {spec.approverName ? <footer className="report-approval"><div><span>{spec.approvalLabel}</span><b>{spec.approverName}</b><small>{spec.approverTitle}</small></div></footer> : null}
    </SectionCard>
  );
}

export function ReportsPage() {
  const { groupId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const auth = useAuth();
  const [type, setType] = useState<AcademicReportType>('group');
  const [month, setMonth] = useState(currentMonth());
  const [notice, setNotice] = useState('');
  const periodId = searchParams.get('period') || null;

  const workspaceQuery = useQuery({
    queryKey: reportWorkspaceKey(auth.user?.id),
    queryFn: () => {
      if (!auth.user) throw new Error('Tu sesión expiró.');
      return fetchReportWorkspace(auth.user);
    },
    enabled: Boolean(auth.user),
  });

  const dataQuery = useQuery({
    queryKey: reportDataKey(auth.user?.id, groupId, periodId),
    queryFn: () => {
      if (!auth.user || !groupId) throw new Error('No hay un grupo válido.');
      return fetchReportData(auth.user, groupId, periodId);
    },
    enabled: Boolean(auth.user && groupId),
  });

  const spec = useMemo(() => dataQuery.data ? buildAcademicReport(dataQuery.data, type, type === 'attendance' || type === 'sessions' || type === 'evaluations' ? month : '') : null, [dataQuery.data, month, type]);

  if (workspaceQuery.isLoading) return <LoadingScreen label="Cargando Centro de reportes…" />;
  if (workspaceQuery.isError) return <ErrorPanel title="No pude cargar los reportes" detail={workspaceQuery.error.message} onRetry={() => workspaceQuery.refetch()} />;
  if (!workspaceQuery.data) return null;
  if (!groupId) return <Landing workspace={workspaceQuery.data} />;

  const group = workspaceQuery.data.groups.find((row) => row.id === groupId) || null;
  if (!group) return <ErrorPanel title="Grupo no disponible" detail="El grupo solicitado no pertenece a tu cuenta docente." />;
  if (dataQuery.isLoading) return <LoadingScreen label="Preparando datos del grupo…" />;
  if (dataQuery.isError) return <ErrorPanel title="No pude preparar los reportes" detail={dataQuery.error.message} onRetry={() => dataQuery.refetch()} />;
  if (!dataQuery.data || !spec) return null;

  const periods = dataQuery.data.detail.periods;
  const needsMonth = type === 'attendance' || type === 'sessions' || type === 'evaluations';

  function exportCsv() {
    downloadAcademicReportCsv(spec!);
    setNotice('Archivo CSV generado con todas las filas del reporte.');
  }

  function print() {
    try {
      printAcademicReport(spec!);
      setNotice('Vista de impresión abierta en una pestaña nueva.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo abrir la impresión.');
    }
  }

  return (
    <div className="view-stack phase5-page reports-page">
      <PageHeader
        eyebrow="CENTRO DE REPORTES"
        title={groupLabel(group)}
        detail="Selecciona el corte, revisa la vista previa y exporta solamente cuando lo necesites."
        actions={<div className="page-actions"><Link className="button ghost" to="/reports">← Grupos</Link><button className="button secondary" type="button" onClick={exportCsv}><Icon name="reports" /> Exportar CSV</button><button className="button primary" type="button" onClick={print}>Imprimir / PDF</button></div>}
      />

      {notice ? <div className="success-strip"><Icon name="check" /><span>{notice}</span><button type="button" onClick={() => setNotice('')}>×</button></div> : null}

      <SectionCard className="report-controls-card">
        <div className="report-controls">
          <label>Periodo<select value={periodId || ''} onChange={(event) => { const value = event.target.value; setSearchParams(value ? { period: value } : {}); }}><option value="">Curso completo</option>{periods.map((period) => <option key={period.id} value={period.id}>{period.name} · {period.status === 'closed' ? 'Cerrado' : 'Abierto'}</option>)}</select></label>
          <label className={needsMonth ? '' : 'control-disabled'}>Mes<input type="month" value={month} disabled={!needsMonth} onChange={(event) => setMonth(event.target.value)} /></label>
          <div><span>Generado</span><b>{dateTime(spec.generatedAt)}</b></div>
          <div><span>Fuente</span><b>{dataQuery.data.calculation.period?.status === 'closed' ? 'Snapshot oficial' : 'Datos actuales'}</b></div>
        </div>
      </SectionCard>

      <section className="report-definition-grid">
        {definitions.map((definition) => (
          <button className={type === definition.type ? 'active' : ''} type="button" key={definition.type} onClick={() => setType(definition.type)}>
            <span><Icon name={definition.icon} /></span><div><b>{definition.title}</b><p>{definition.detail}</p></div><StatusPill tone={type === definition.type ? 'blue' : 'neutral'}>{type === definition.type ? 'Vista actual' : 'Abrir'}</StatusPill>
          </button>
        ))}
      </section>

      <ReportPreview spec={spec} />

      <SectionCard className="report-reliability-card">
        <div><Icon name="shield" /><span><b>Datos protegidos</b><small>Las consultas respetan RLS y el docente autenticado.</small></span></div>
        <div><Icon name="route" /><span><b>Una sola fuente</b><small>El promedio coincide con Libro y Alumno 360°.</small></span></div>
        <div><Icon name="check" /><span><b>OMR confirmado</b><small>Las lecturas pendientes o archivadas no se publican.</small></span></div>
        <div><Icon name="reports" /><span><b>Sin costo adicional</b><small>CSV e impresión se generan localmente.</small></span></div>
      </SectionCard>
    </div>
  );
}
