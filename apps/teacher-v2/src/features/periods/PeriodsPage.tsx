import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  closeAcademicPeriod,
  createPeriodTemplate,
  currentPeriod,
  deleteAcademicPeriod,
  fetchPeriodSummary,
  fetchPeriodWorkspace,
  periodProgress,
  periodSummaryKey,
  periodsForGroup,
  periodWorkspaceKey,
  reopenAcademicPeriod,
  saveAcademicPeriod,
  type AcademicPeriod,
  type PeriodDraft,
  type PeriodSummary,
  type PeriodWorkspace,
} from '../../core/periods';
import type { GroupRecord } from '../../core/types';
import { EmptyState, ErrorPanel, LoadingScreen, MetricCard, PageHeader, SectionCard, StatusPill } from '../../shared/components';
import { Icon } from '../../shared/icons';
import { useAuth } from '../auth/AuthProvider';

function groupLabel(group?: GroupRecord | null): string {
  if (!group) return 'Grupo';
  return [group.subject || group.program || 'Asignatura', group.group_name || group.name || 'Grupo'].filter(Boolean).join(' · ');
}

function dateText(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

function dateTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function grade(value?: number | null): string {
  return value == null || !Number.isFinite(Number(value)) ? '—' : Number(value).toFixed(1);
}

function percentage(value?: number | null): string {
  return value == null || !Number.isFinite(Number(value)) ? '—' : `${Number(value).toFixed(0)}%`;
}

function emptyDraft(groupId: string, orderIndex: number): PeriodDraft {
  return { groupId, name: '', startsOn: '', endsOn: '', courseWeight: 25, orderIndex };
}

function summaryNumber(summary: PeriodSummary | undefined, key: keyof PeriodSummary): number {
  const value = Number(summary?.[key] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function Landing({ workspace }: { workspace: PeriodWorkspace }) {
  const configured = workspace.groups.filter((group) => workspace.periods.some((period) => period.group_id === group.id)).length;
  const closed = workspace.periods.filter((period) => period.status === 'closed').length;
  return (
    <div className="view-stack phase5-page periods-page">
      <PageHeader
        eyebrow="FASE 5 · CIERRE ACADÉMICO"
        title="Periodos académicos"
        detail="Organiza parciales, verifica pendientes y conserva una fotografía oficial al cerrar cada etapa del curso."
      />
      <section className="metric-grid four">
        <MetricCard label="Grupos" value={String(workspace.groups.length)} detail={`${configured} con periodos`} icon="groups" tone="blue" />
        <MetricCard label="Periodos" value={String(workspace.periods.length)} detail={`${closed} cerrados`} icon="periods" tone="violet" />
        <MetricCard label="Cierre" value="Protegido" detail="Validación antes de congelar" icon="shield" tone="green" />
        <MetricCard label="Historial" value="Inmutable" detail="Cierre, reapertura y motivo" icon="route" tone="amber" />
      </section>
      {workspace.groups.length ? (
        <section className="phase5-card-grid">
          {workspace.groups.map((group) => {
            const periods = periodsForGroup(workspace, group.id);
            const weight = periods.reduce((sum, period) => sum + Number(period.course_weight || 0), 0);
            const active = currentPeriod(periods);
            return (
              <article className="phase5-group-card" key={group.id}>
                <header><div><span className="eyebrow">{group.university_name || group.university || 'TEDVIO'}</span><h2>{groupLabel(group)}</h2><p>{group.school_cycle || group.term || 'Sin ciclo escolar'}</p></div><StatusPill tone={Math.abs(weight - 100) < 0.01 ? 'green' : periods.length ? 'amber' : 'neutral'}>{periods.length ? `${weight.toFixed(0)}%` : 'Sin configurar'}</StatusPill></header>
                <div className="phase5-group-metrics"><span><small>Periodos</small><b>{periods.length}</b></span><span><small>Cerrados</small><b>{periods.filter((period) => period.status === 'closed').length}</b></span><span><small>Actual</small><b>{active?.name || '—'}</b></span></div>
                <footer><Link className="button primary" to={`/periods/${group.id}`}>{periods.length ? 'Administrar periodos' : 'Configurar periodos'}</Link></footer>
              </article>
            );
          })}
        </section>
      ) : <EmptyState icon="groups" title="Aún no hay grupos" detail="Crea un grupo antes de organizar sus periodos académicos." action={<Link className="button primary" to="/groups">Ir a Grupos</Link>} />}
    </div>
  );
}

function PeriodEditor({ draft, busy, onChange, onClose, onSave }: { draft: PeriodDraft; busy: boolean; onChange: (draft: PeriodDraft) => void; onClose: () => void; onSave: () => void }) {
  return (
    <SectionCard className="period-editor">
      <div className="section-heading"><div><span className="eyebrow">{draft.id ? 'EDITAR PERIODO' : 'NUEVO PERIODO'}</span><h2>{draft.id ? draft.name || 'Periodo académico' : 'Agregar periodo'}</h2><p>Las evidencias se vinculan automáticamente cuando su fecha coincide con el rango.</p></div><button className="button ghost" type="button" onClick={onClose}>Cerrar</button></div>
      <div className="form-grid period-form-grid">
        <label>Nombre<input value={draft.name} maxLength={80} onChange={(event) => onChange({ ...draft, name: event.target.value })} placeholder="Parcial 1" /></label>
        <label>Orden<input type="number" min="1" max="99" value={draft.orderIndex} onChange={(event) => onChange({ ...draft, orderIndex: Number(event.target.value) })} /></label>
        <label>Inicio<input type="date" value={draft.startsOn} onChange={(event) => onChange({ ...draft, startsOn: event.target.value })} /></label>
        <label>Fin<input type="date" value={draft.endsOn} onChange={(event) => onChange({ ...draft, endsOn: event.target.value })} /></label>
        <label>Peso en el curso<input type="number" min="0" max="100" step="0.1" value={draft.courseWeight} onChange={(event) => onChange({ ...draft, courseWeight: Number(event.target.value) })} /></label>
      </div>
      <footer className="phase5-editor-footer"><span>Los periodos del mismo grupo no pueden traslaparse.</span><button className="button primary" type="button" disabled={busy || !draft.name.trim() || !draft.startsOn || !draft.endsOn} onClick={onSave}>{busy ? 'Guardando…' : 'Guardar periodo'}</button></footer>
    </SectionCard>
  );
}

function PeriodReadiness({ period, summary, busy, reopenReason, onReopenReason, onClosePeriod, onReopen }: { period: AcademicPeriod; summary: PeriodSummary; busy: boolean; reopenReason: string; onReopenReason: (value: string) => void; onClosePeriod: () => void; onReopen: () => void }) {
  const issues = summary.issues || [];
  const warnings = summary.warnings || [];
  const ready = Boolean(summary.ready);
  const students = Number(summary.students || 0);
  const studentRows = summary.student_rows || [];
  return (
    <div className="view-stack compact-stack">
      <section className={`period-readiness-hero ${period.status === 'closed' ? 'closed' : ready ? 'ready' : 'pending'}`}>
        <div><span className="eyebrow">{period.status === 'closed' ? 'FOTOGRAFÍA ACADÉMICA' : 'PREPARACIÓN PARA CIERRE'}</span><h2>{period.status === 'closed' ? 'Periodo cerrado y protegido' : ready ? 'Parcial listo para cerrar' : 'El periodo todavía tiene pendientes'}</h2><p>{period.status === 'closed' ? `Cerrado el ${dateTime(period.closed_at)}. El resultado oficial se conserva aunque cambie el curso después.` : ready ? 'TEDVIO verificó categorías, evidencias, asistencia, OMR y promedios.' : 'Resuelve los puntos indicados antes de congelar los resultados.'}</p></div>
        <div className="period-readiness-score"><span>Peso con evidencia</span><b>{percentage(summary.evidence_weight)}</b><small>{students} alumnos activos</small></div>
      </section>

      <section className="metric-grid four">
        <MetricCard label="Promedio del grupo" value={grade(summary.group_grade)} detail={`Mínimo ${grade(summary.min_grade)}`} icon="grades" tone="blue" />
        <MetricCard label="Aprobación" value={percentage(summary.approval_rate)} detail={`${summary.students_without_grade || 0} sin promedio`} icon="check" tone="green" />
        <MetricCard label="Captura manual" value={`${summary.manual_captured || 0}/${summary.manual_expected || 0}`} detail={`${summary.manual_pending || 0} pendientes`} icon="layout" tone={summary.manual_pending ? 'amber' : 'green'} />
        <MetricCard label="Resultados OMR" value={`${summary.exam_results || 0}/${summary.omr_expected || 0}`} detail={`${summary.exam_count || 0} evaluaciones`} icon="exam" tone={summary.omr_expected && Number(summary.exam_results || 0) < Number(summary.omr_expected || 0) ? 'amber' : 'green'} />
      </section>

      {issues.length || warnings.length ? (
        <SectionCard>
          <div className="section-heading compact"><div><span className="eyebrow">VALIDACIÓN</span><h2>Condiciones del periodo</h2><p>Los bloqueos impiden cerrar; las advertencias informan sin modificar las calificaciones.</p></div></div>
          <div className="period-message-list">
            {issues.map((message, index) => <article className="issue" key={`issue-${message.code || index}`}><Icon name="alert" /><div><b>Bloqueo de cierre</b><p>{message.label}</p></div></article>)}
            {warnings.map((message, index) => <article className="warning" key={`warning-${message.code || index}`}><Icon name="alert" /><div><b>Advertencia</b><p>{message.label}</p></div></article>)}
          </div>
        </SectionCard>
      ) : null}

      {period.status === 'open' ? (
        <SectionCard className="period-close-card">
          <div><span className="eyebrow">CIERRE FORMAL</span><h2>Congelar resultados del periodo</h2><p>El cierre genera una fotografía oficial por alumno y bloquea modificaciones de evidencias hasta una reapertura controlada.</p></div>
          <button className="button primary" type="button" disabled={busy || !ready} onClick={onClosePeriod}>{busy ? 'Procesando…' : ready ? 'Cerrar periodo' : 'Pendientes por resolver'}</button>
        </SectionCard>
      ) : (
        <SectionCard className="period-reopen-card">
          <div className="section-heading"><div><span className="eyebrow">REAPERTURA CONTROLADA</span><h2>Corregir un periodo cerrado</h2><p>La fotografía anterior permanece en el historial y la reapertura registra usuario, fecha y motivo.</p></div></div>
          <label>Motivo de reapertura<textarea rows={3} value={reopenReason} onChange={(event) => onReopenReason(event.target.value)} placeholder="Ej. Corrección de una calificación capturada incorrectamente." /></label>
          <footer className="phase5-editor-footer"><span>Mínimo 3 caracteres.</span><button className="button secondary" type="button" disabled={busy || reopenReason.trim().length < 3} onClick={onReopen}>{busy ? 'Reabriendo…' : 'Reabrir periodo'}</button></footer>
        </SectionCard>
      )}

      {period.status === 'closed' && studentRows.length ? (
        <SectionCard>
          <div className="section-heading"><div><span className="eyebrow">RESULTADO OFICIAL</span><h2>Fotografía por alumno</h2><p>Estos valores provienen del snapshot generado durante el cierre.</p></div><StatusPill tone="blue">{studentRows.length} alumnos</StatusPill></div>
          <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Matrícula</th><th>Alumno</th><th>Promedio</th><th>Asistencia</th><th>OMR</th><th>Evidencia</th></tr></thead><tbody>{studentRows.map((row) => <tr key={row.student_id}><td>{row.enrollment || '—'}</td><td><b>{row.full_name || 'Alumno'}</b></td><td>{grade(row.grade)}</td><td>{percentage(row.attendance_rate)}</td><td>{grade(row.omr_avg)}</td><td>{percentage(row.evidence_weight)}</td></tr>)}</tbody></table></div>
        </SectionCard>
      ) : null}
    </div>
  );
}

export function PeriodsPage() {
  const { groupId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<PeriodDraft | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateStart, setTemplateStart] = useState('');
  const [templateEnd, setTemplateEnd] = useState('');
  const [reopenReason, setReopenReason] = useState('');
  const [notice, setNotice] = useState('');

  const workspaceQuery = useQuery({
    queryKey: periodWorkspaceKey(auth.user?.id),
    queryFn: () => {
      if (!auth.user) throw new Error('Tu sesión expiró.');
      return fetchPeriodWorkspace(auth.user);
    },
    enabled: Boolean(auth.user),
  });

  const group = workspaceQuery.data?.groups.find((row) => row.id === groupId) || null;
  const periods = useMemo(() => workspaceQuery.data && groupId ? periodsForGroup(workspaceQuery.data, groupId) : [], [workspaceQuery.data, groupId]);
  const requestedPeriod = searchParams.get('period');
  const selectedPeriod = periods.find((period) => period.id === requestedPeriod) || currentPeriod(periods);

  useEffect(() => {
    if (!requestedPeriod && selectedPeriod) setSearchParams({ period: selectedPeriod.id }, { replace: true });
  }, [requestedPeriod, selectedPeriod, setSearchParams]);

  const summaryQuery = useQuery({
    queryKey: periodSummaryKey(auth.user?.id, selectedPeriod?.id),
    queryFn: () => {
      if (!auth.user || !selectedPeriod) throw new Error('No hay un periodo seleccionado.');
      return fetchPeriodSummary(auth.user, selectedPeriod);
    },
    enabled: Boolean(auth.user && selectedPeriod),
  });

  async function refreshAll(periodId?: string | null) {
    await queryClient.invalidateQueries({ queryKey: periodWorkspaceKey(auth.user?.id) });
    if (periodId) await queryClient.invalidateQueries({ queryKey: periodSummaryKey(auth.user?.id, periodId) });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['teacher-gradebook-workspace', auth.user?.id] }),
      queryClient.invalidateQueries({ queryKey: ['teacher-home', auth.user?.id] }),
    ]);
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!auth.user || !draft) throw new Error('No hay un periodo para guardar.');
      return saveAcademicPeriod(auth.user, draft);
    },
    onSuccess: async (period) => {
      setDraft(null);
      setNotice('Periodo guardado correctamente.');
      setSearchParams({ period: period.id }, { replace: true });
      await refreshAll(period.id);
    },
  });

  const templateMutation = useMutation({
    mutationFn: () => {
      if (!auth.user || !groupId) throw new Error('No hay un grupo válido.');
      return createPeriodTemplate(auth.user, groupId, templateStart, templateEnd);
    },
    onSuccess: async (created) => {
      setTemplateOpen(false);
      setNotice('Plantilla de 3 parciales y final creada.');
      if (created[0]) setSearchParams({ period: created[0].id }, { replace: true });
      await refreshAll(created[0]?.id);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (period: AcademicPeriod) => {
      if (!auth.user) throw new Error('Tu sesión expiró.');
      return deleteAcademicPeriod(auth.user, period.id);
    },
    onSuccess: async () => {
      setNotice('Periodo eliminado. Las evidencias permanecen y podrán vincularse de nuevo por fecha.');
      setSearchParams({}, { replace: true });
      await refreshAll();
    },
  });

  const closeMutation = useMutation({
    mutationFn: () => {
      if (!auth.user || !selectedPeriod) throw new Error('No hay un periodo seleccionado.');
      return closeAcademicPeriod(auth.user, selectedPeriod.id);
    },
    onSuccess: async () => {
      setNotice('Periodo cerrado. La fotografía académica quedó protegida.');
      await refreshAll(selectedPeriod?.id);
    },
  });

  const reopenMutation = useMutation({
    mutationFn: () => {
      if (!auth.user || !selectedPeriod) throw new Error('No hay un periodo seleccionado.');
      return reopenAcademicPeriod(auth.user, selectedPeriod.id, reopenReason);
    },
    onSuccess: async () => {
      setReopenReason('');
      setNotice('Periodo reabierto con motivo registrado.');
      await refreshAll(selectedPeriod?.id);
    },
  });

  if (workspaceQuery.isLoading) return <LoadingScreen label="Cargando periodos académicos…" />;
  if (workspaceQuery.isError) return <ErrorPanel title="No pude cargar los periodos" detail={workspaceQuery.error.message} onRetry={() => workspaceQuery.refetch()} />;
  if (!workspaceQuery.data) return null;
  if (!groupId) return <Landing workspace={workspaceQuery.data} />;
  if (!group) return <ErrorPanel title="Grupo no disponible" detail="El grupo solicitado no pertenece a tu cuenta docente." />;

  const totalWeight = periods.reduce((sum, period) => sum + Number(period.course_weight || 0), 0);
  const nextOrder = periods.length ? Math.max(...periods.map((period) => period.order_index)) + 1 : 1;
  const busy = saveMutation.isPending || templateMutation.isPending || deleteMutation.isPending || closeMutation.isPending || reopenMutation.isPending;
  const mutationError = saveMutation.error || templateMutation.error || deleteMutation.error || closeMutation.error || reopenMutation.error;

  return (
    <div className="view-stack phase5-page periods-page">
      <PageHeader
        eyebrow="PERIODOS ACADÉMICOS"
        title={groupLabel(group)}
        detail="Configura fechas y pesos, revisa evidencia y ejecuta el cierre protegido del parcial."
        actions={<div className="page-actions"><Link className="button ghost" to="/periods">← Grupos</Link><Link className="button secondary" to={`/gradebook/${group.id}${selectedPeriod ? `?period=${selectedPeriod.id}` : ''}`}>Abrir Libro</Link><button className="button primary" type="button" disabled={busy} onClick={() => setDraft(emptyDraft(group.id, nextOrder))}>＋ Periodo</button></div>}
      />

      {notice ? <div className="success-strip"><Icon name="check" /><span>{notice}</span><button type="button" onClick={() => setNotice('')}>×</button></div> : null}
      {mutationError ? <ErrorPanel title="No se pudo completar la operación" detail={mutationError.message} /> : null}

      <section className="metric-grid four">
        <MetricCard label="Periodos" value={String(periods.length)} detail={`${periods.filter((period) => period.status === 'closed').length} cerrados`} icon="periods" tone="blue" />
        <MetricCard label="Peso total" value={`${totalWeight.toFixed(0)}%`} detail={Math.abs(totalWeight - 100) < 0.01 ? 'Curso completo' : 'Revisa la configuración'} icon="grades" tone={Math.abs(totalWeight - 100) < 0.01 ? 'green' : 'amber'} />
        <MetricCard label="Periodo actual" value={selectedPeriod?.name || '—'} detail={selectedPeriod ? `${dateText(selectedPeriod.starts_on)} – ${dateText(selectedPeriod.ends_on)}` : 'Sin periodo'} icon="calendar" tone="violet" />
        <MetricCard label="Estado" value={selectedPeriod?.status === 'closed' ? 'Cerrado' : selectedPeriod ? 'Abierto' : 'Sin configurar'} detail={selectedPeriod?.status === 'closed' ? 'Snapshot protegido' : 'Permite captura'} icon="shield" tone={selectedPeriod?.status === 'closed' ? 'blue' : 'green'} />
      </section>

      {!periods.length ? (
        <SectionCard className="period-template-card">
          <div><span className="eyebrow">CONFIGURACIÓN RÁPIDA</span><h2>3 parciales + final · 25% cada uno</h2><p>Selecciona el inicio y final del curso. TEDVIO dividirá el rango en cuatro periodos consecutivos sin traslapes.</p></div>
          {templateOpen ? <div className="period-template-form"><label>Inicio del curso<input type="date" value={templateStart} onChange={(event) => setTemplateStart(event.target.value)} /></label><label>Fin del curso<input type="date" value={templateEnd} onChange={(event) => setTemplateEnd(event.target.value)} /></label><button className="button primary" type="button" disabled={templateMutation.isPending || !templateStart || !templateEnd} onClick={() => templateMutation.mutate()}>{templateMutation.isPending ? 'Creando…' : 'Crear plantilla'}</button></div> : <button className="button primary" type="button" onClick={() => setTemplateOpen(true)}>Usar plantilla</button>}
        </SectionCard>
      ) : null}

      {draft ? <PeriodEditor draft={draft} busy={saveMutation.isPending} onChange={setDraft} onClose={() => setDraft(null)} onSave={() => saveMutation.mutate()} /> : null}

      {periods.length ? (
        <SectionCard>
          <div className="section-heading"><div><span className="eyebrow">ESTRUCTURA DEL CURSO</span><h2>Periodos del grupo</h2><p>Selecciona un periodo para revisar su estado y preparación de cierre.</p></div><StatusPill tone={Math.abs(totalWeight - 100) < 0.01 ? 'green' : 'amber'}>{totalWeight.toFixed(1)}%</StatusPill></div>
          <div className="period-card-list">
            {periods.map((period) => {
              const selected = selectedPeriod?.id === period.id;
              const progress = periodProgress(period);
              return (
                <article className={`${selected ? 'selected' : ''} ${period.status}`} key={period.id}>
                  <button className="period-card-main" type="button" onClick={() => setSearchParams({ period: period.id })}>
                    <span className="period-order">{period.order_index}</span>
                    <div><span className="eyebrow">{dateText(period.starts_on)} – {dateText(period.ends_on)}</span><h3>{period.name}</h3><p>{Number(period.course_weight).toFixed(0)}% del curso</p><i className="period-progress"><b style={{ width: `${progress}%` }} /></i></div>
                    <StatusPill tone={period.status === 'closed' ? 'blue' : 'green'}>{period.status === 'closed' ? 'Cerrado' : `${progress}%`}</StatusPill>
                  </button>
                  <div className="period-card-actions"><button className="button ghost compact" type="button" disabled={period.status === 'closed' || busy} onClick={() => setDraft({ id: period.id, groupId: period.group_id, name: period.name, startsOn: period.starts_on, endsOn: period.ends_on, courseWeight: Number(period.course_weight), orderIndex: period.order_index })}>Editar</button><button className="button ghost compact danger-text" type="button" disabled={period.status === 'closed' || busy} onClick={() => { if (window.confirm(`¿Eliminar ${period.name}? Las evidencias no se borrarán.`)) deleteMutation.mutate(period); }}>Eliminar</button></div>
                </article>
              );
            })}
          </div>
        </SectionCard>
      ) : null}

      {selectedPeriod ? (
        summaryQuery.isLoading ? <LoadingScreen label="Verificando el periodo…" /> : summaryQuery.isError ? <ErrorPanel title="No pude calcular el periodo" detail={summaryQuery.error.message} onRetry={() => summaryQuery.refetch()} /> : summaryQuery.data ? (
          <PeriodReadiness
            period={selectedPeriod}
            summary={summaryQuery.data}
            busy={closeMutation.isPending || reopenMutation.isPending}
            reopenReason={reopenReason}
            onReopenReason={setReopenReason}
            onClosePeriod={() => { if (window.confirm(`¿Cerrar ${selectedPeriod.name}? Las evidencias quedarán bloqueadas hasta una reapertura formal.`)) closeMutation.mutate(); }}
            onReopen={() => reopenMutation.mutate()}
          />
        ) : null
      ) : <EmptyState icon="periods" title="Sin periodos configurados" detail="Agrega uno manualmente o utiliza la plantilla rápida." />}

      {selectedPeriod?.transition_log?.length ? (
        <SectionCard>
          <div className="section-heading compact"><div><span className="eyebrow">TRAZABILIDAD</span><h2>Historial de transiciones</h2><p>El cierre y cada reapertura quedan registrados.</p></div></div>
          <div className="period-transition-list">{[...selectedPeriod.transition_log].reverse().map((event, index) => <article key={`${event.at || index}-${index}`}><Icon name={event.event === 'closed' ? 'shield' : 'refresh'} /><div><b>{event.event === 'closed' ? 'Periodo cerrado' : event.event === 'reopened' ? 'Periodo reabierto' : event.event || 'Transición'}</b><p>{event.reason || 'Sin motivo adicional.'}</p></div><time>{dateTime(event.at)}</time></article>)}</div>
        </SectionCard>
      ) : null}
    </div>
  );
}
