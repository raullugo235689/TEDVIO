import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  buildAcademicReport, downloadAcademicReportCsv, fetchReportData, fetchReportWorkspace,
  printAcademicReport, reportDataKey, reportWorkspaceKey,
  type AcademicReportSpec, type AcademicReportType, type ReportWorkspace,
} from '../../core/reports';
import { groupAccent } from '../../core/group-identity';
import { useTeacherHome } from '../../core/useTeacherHome';
import { useTeacherIdentity } from '../../core/useTeacherIdentity';
import type { DashboardGroup, GroupRecord } from '../../core/types';
import { EmptyState, ErrorPanel, LoadingScreen, PageHeader, SectionCard, StatusPill } from '../../shared/components';
import { InstitutionIdentity } from '../../shared/InstitutionIdentity';
import { Icon, type IconName } from '../../shared/icons';
import { useAuth } from '../auth/AuthProvider';

const definitions: Array<{ type: AcademicReportType; title: string; detail: string; icon: IconName }> = [
  { type: 'group', title: 'Resumen académico', detail: 'Promedios, asistencia y alumnos que requieren atención.', icon: 'reports' },
  { type: 'roster', title: 'Lista de alumnos', detail: 'Matrícula y nombre del padrón activo.', icon: 'groups' },
  { type: 'attendance', title: 'Registro de asistencia', detail: 'Asistencias, retardos y faltas por fecha.', icon: 'attendance' },
  { type: 'grades', title: 'Calificaciones', detail: 'Ponderaciones y promedios por alumno.', icon: 'grades' },
  { type: 'evaluations', title: 'Resultados de evaluaciones', detail: 'Resultados confirmados y entregas registradas.', icon: 'exam' },
  { type: 'sessions', title: 'Historial de clases', detail: 'Participación y respuestas en Modo Clase.', icon: 'classroom' },
];

function groupLabel(group?: GroupRecord | null): string {
  return group ? [group.subject || group.program || 'Asignatura', group.group_name || group.name || 'Grupo'].filter(Boolean).join(' · ') : 'Grupo';
}
function currentMonth(): string {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 7);
}
function dateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function searchable(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-MX');
}

function Landing({ workspace, groups, teacherName }: { workspace: ReportWorkspace; groups: DashboardGroup[]; teacherName: string }) {
  const [query, setQuery] = useState('');
  const shown = workspace.groups.filter((group) => searchable(`${groupLabel(group)} ${group.university_name || group.university || ''}`).includes(searchable(query.trim())));
  return (
    <div className="view-stack reports-page reports-premium">
      <PageHeader eyebrow="DOCUMENTACIÓN ACADÉMICA" title="Centro de reportes" detail="Tus grupos, sus resultados y los documentos que necesitas entregar." />
      <section className="reports-intro" aria-label="Preparar un reporte">
        <div className="reports-intro-icon"><Icon name="reports" /></div>
        <div><span className="eyebrow">TU TRABAJO, LISTO PARA COMPARTIR</span><h2>Documentos con identidad propia</h2><p>Elige un grupo, revisa el periodo y prepara tu documento con el nombre del docente y la identidad de su institución.</p><span className="reports-teacher"><Icon name="groups" />{teacherName}</span></div>
        <div className="reports-intro-count"><b>{workspace.groups.length}</b><span>grupos disponibles</span><small>6 formatos por grupo</small></div>
      </section>
      {workspace.groups.length ? <>
        <div className="reports-catalog-heading"><div><h2>Selecciona un grupo</h2><p>Listas, asistencia, calificaciones y seguimiento académico.</p></div><label className="reports-search"><Icon name="search" /><input type="search" aria-label="Buscar grupo o asignatura" placeholder="Buscar grupo o asignatura" value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>
        <div className="reports-catalog">
          {shown.map((group) => {
            const identity = groups.find((item) => item.id === group.id);
            return <article className="report-group-card" key={group.id} data-group-color={groupAccent(group.id)}>
              <header><span className="eyebrow">{group.subject || group.program || 'Asignatura'}</span><span className="report-group-badge">{group.group_name || group.name}</span></header>
              <InstitutionIdentity name={group.university_name || group.university} logoUrl={identity?.institution_logo_url} detail={group.school_cycle || group.term} />
              <div className="report-group-formats"><span><Icon name="groups" />Lista de alumnos</span><span><Icon name="attendance" />Asistencia</span><span><Icon name="grades" />Calificaciones</span></div>
              <footer><span>6 formatos disponibles</span><Link className="button secondary compact" to={`/reports/${group.id}`}>Abrir reportes <Icon name="arrow" /></Link></footer>
            </article>;
          })}
        </div>
        {!shown.length ? <EmptyState icon="search" title="No encontramos ese grupo" detail="Prueba con el nombre del grupo, la asignatura o la universidad." action={<button type="button" className="button ghost" onClick={() => setQuery('')}>Mostrar todos</button>} /> : null}
      </> : <EmptyState icon="groups" title="Tu primer reporte empieza con un grupo" detail="Crea un grupo y agrega a tus alumnos para preparar listas y documentos académicos." action={<Link className="button primary" to="/groups">Ir a Grupos</Link>} />}
    </div>
  );
}

function ReportPreview({ spec }: { spec: AcademicReportSpec }) {
  const [page, setPage] = useState(0);
  const pageSize = 40;
  const pages = Math.max(1, Math.ceil(spec.rows.length / pageSize));
  const current = Math.min(page, pages - 1);
  const previewRows = spec.rows.slice(current * pageSize, (current + 1) * pageSize);
  return <section className="report-preview-shell" aria-label="Vista previa del documento">
    <div className="report-preview-toolbar"><span><Icon name="reports" />Vista previa</span><b>{spec.type === 'roster' ? 'A4 vertical' : 'A4 horizontal'}</b></div>
    <SectionCard className="report-preview-card report-paper">
      <header className="report-paper-header"><InstitutionIdentity name={spec.institution} logoUrl={spec.logoUrl} /><span>DOCUMENTO ACADÉMICO</span></header>
      <div className="report-paper-title"><h2>{spec.title}</h2><p>{spec.subtitle}</p></div>
      <dl className="report-paper-context"><div><dt>Docente</dt><dd>{spec.teacherName}</dd></div><div><dt>Asignatura · Grupo</dt><dd>{spec.subject} · {spec.group}</dd></div><div><dt>Programa</dt><dd>{spec.program}</dd></div><div><dt>Periodo{spec.academicYear ? ' · Ciclo escolar' : ''}</dt><dd>{spec.period}{spec.academicYear ? ` · ${spec.academicYear}` : ''}</dd></div></dl>
      <div className="report-paper-summary">{spec.summary.map((item) => <div key={item.label}><span>{item.label}</span><b>{item.value}</b></div>)}</div>
      <div className="report-table-wrap" role="region" aria-label="Contenido del reporte, desplázate para ver todas las columnas" tabIndex={0}><table className="report-table"><caption>{spec.rows.length} registros · {spec.title}</caption><thead><tr>{spec.columns.map((column, index) => <th scope="col" key={`${column}-${index}`}>{column}</th>)}</tr></thead><tbody>{previewRows.length ? previewRows.map((row, rowIndex) => <tr key={current * pageSize + rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell == null ? '' : String(cell)}</td>)}</tr>) : <tr><td colSpan={spec.columns.length} className="report-empty-cell">No hay registros para el periodo seleccionado.</td></tr>}</tbody></table></div>
      {spec.note ? <p className="report-note">{spec.note}</p> : null}
      {spec.approverName ? <footer className="report-approval"><div><span>{spec.approvalLabel}</span><b>{spec.approverName}</b><small>{spec.approverTitle}</small></div></footer> : null}
      <div className="report-paper-footer"><span>Generado en TEDVIO</span><span>{dateTime(spec.generatedAt)}{spec.documentCode ? ` · ${spec.documentCode}` : ''}</span></div>
    </SectionCard>
    <div className="report-preview-pagination"><span role="status">{spec.rows.length ? `${current * pageSize + 1}–${Math.min((current + 1) * pageSize, spec.rows.length)} de ${spec.rows.length} registros` : 'Sin registros'}. La exportación incluye el documento completo.</span>{pages > 1 ? <nav aria-label="Páginas de vista previa"><button type="button" className="button ghost compact" disabled={current === 0} onClick={() => setPage(current - 1)}>Anterior</button><button type="button" className="button ghost compact" disabled={current === pages - 1} onClick={() => setPage(current + 1)}>Siguiente</button></nav> : null}</div>
  </section>;
}

export function ReportsPage() {
  const { groupId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const auth = useAuth();
  const identity = useTeacherIdentity();
  const home = useTeacherHome();
  const [type, setType] = useState<AcademicReportType>('group');
  const [month, setMonth] = useState(currentMonth());
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const periodId = searchParams.get('period') || null;
  const workspaceQuery = useQuery({ queryKey: reportWorkspaceKey(auth.user?.id), queryFn: () => {
    if (!auth.user) throw new Error('Tu sesión expiró.');
    return fetchReportWorkspace(auth.user);
  }, enabled: Boolean(auth.user) });
  const dataQuery = useQuery({ queryKey: reportDataKey(auth.user?.id, groupId, periodId), queryFn: () => {
    if (!auth.user || !groupId) throw new Error('No hay un grupo válido.');
    return fetchReportData(auth.user, groupId, periodId);
  }, enabled: Boolean(auth.user && groupId) });
  const spec = useMemo(() => {
    if (!dataQuery.data) return null;
    return { ...buildAcademicReport(dataQuery.data, type, type === 'attendance' || type === 'sessions' || type === 'evaluations' ? month : ''), teacherName: identity.displayName };
  }, [dataQuery.data, month, type, identity.displayName]);

  if (workspaceQuery.isLoading) return <LoadingScreen label="Cargando tus reportes…" />;
  if (workspaceQuery.isError) return <ErrorPanel title="No pude cargar los reportes" detail={workspaceQuery.error.message} onRetry={() => workspaceQuery.refetch()} />;
  if (!workspaceQuery.data) return null;
  if (!groupId) return <Landing workspace={workspaceQuery.data} groups={home.data?.dashboard.groups || []} teacherName={identity.displayName} />;
  const group = workspaceQuery.data.groups.find((row) => row.id === groupId) || null;
  if (!group) return <ErrorPanel title="Grupo no disponible" detail="El grupo solicitado no pertenece a tu cuenta docente." />;
  if (dataQuery.isLoading) return <LoadingScreen label="Preparando documentos del grupo…" />;
  if (dataQuery.isError) return <ErrorPanel title="No pude preparar los reportes" detail={dataQuery.error.message} onRetry={() => dataQuery.refetch()} />;
  if (!dataQuery.data || !spec) return null;
  const periods = dataQuery.data.detail.periods;
  const needsMonth = type === 'attendance' || type === 'sessions' || type === 'evaluations';
  function exportCsv() {
    downloadAcademicReportCsv(spec!);
    setNotice({ text: 'CSV descargado con todos los registros. Puedes abrirlo en Excel.' });
  }
  function print() {
    try { printAcademicReport(spec!); setNotice({ text: 'Documento completo abierto en otra pestaña para imprimir o guardar como PDF.' }); }
    catch (error) { setNotice({ text: error instanceof Error ? error.message : 'No se pudo abrir la impresión.', error: true }); }
  }
  return <div className="view-stack reports-page reports-premium" data-group-color={groupAccent(groupId)}>
    <PageHeader eyebrow="DOCUMENTACIÓN ACADÉMICA" title="Reportes del grupo" detail="Elige un formato, revisa el periodo y prepara tu documento." actions={<Link className="button ghost compact" to="/reports"><Icon name="reports" />Todos los reportes</Link>} />
    {notice ? <div className={notice.error ? 'warning-strip' : 'success-strip'} role={notice.error ? 'alert' : 'status'}><Icon name={notice.error ? 'alert' : 'check'} /><span>{notice.text}</span><button type="button" aria-label="Cerrar aviso" onClick={() => setNotice(null)}>×</button></div> : null}
    <SectionCard className="report-controls-card">
      <div className="report-controls-heading"><div><span className="eyebrow">01 · DEFINE EL CORTE</span><h2>¿Qué periodo vas a entregar?</h2></div><StatusPill tone={dataQuery.data.calculation.period?.status === 'closed' ? 'blue' : 'neutral'}>{dataQuery.data.calculation.period?.status === 'closed' ? 'Periodo cerrado' : 'Datos actuales'}</StatusPill></div>
      <div className="report-controls"><label>Periodo<select value={periodId || ''} onChange={(event) => { const value = event.target.value; setSearchParams(value ? { period: value } : {}); setNotice(null); }}><option value="">Curso completo</option>{periods.map((period) => <option key={period.id} value={period.id}>{period.name} · {period.status === 'closed' ? 'Cerrado' : 'Abierto'}</option>)}</select></label>{needsMonth ? <label>Mes<input type="month" value={month} onChange={(event) => { setMonth(event.target.value); setNotice(null); }} /><small>Vacío para incluir todo el periodo.</small></label> : null}<div className="report-controls-teacher"><span>Preparado por</span><b>{identity.displayName}</b></div></div>
    </SectionCard>
    <div className="report-editor-layout">
      <aside className="report-format-panel"><div><span className="eyebrow">02 · ELIGE EL FORMATO</span><h2>Tu documento</h2></div><div className="report-format-list" role="group" aria-label="Tipo de reporte">{definitions.map((definition) => <button type="button" aria-pressed={type === definition.type} key={definition.type} onClick={() => { setType(definition.type); setNotice(null); }}><Icon name={definition.icon} /><span><b>{definition.title}</b><small>{definition.detail}</small></span>{type === definition.type ? <Icon name="check" /> : null}</button>)}</div><Link className="report-analytics-link" to={`/analytics/${groupId}`}><Icon name="analytics" />Ver análisis del grupo<Icon name="arrow" /></Link></aside>
      <div className="report-document-workspace"><div className="report-export-bar"><div><span className="eyebrow">03 · REVISA Y COMPARTE</span><p>Exporta todos los registros del corte seleccionado.</p></div><div className="page-actions"><button className="button secondary" type="button" onClick={exportCsv}>Exportar CSV</button><button className="button primary" type="button" onClick={print}><Icon name="reports" />Imprimir / PDF</button></div></div><ReportPreview key={`${groupId}:${type}:${periodId}:${month}`} spec={spec} /></div>
    </div>
  </div>;
}
