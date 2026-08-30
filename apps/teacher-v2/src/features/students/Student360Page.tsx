import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  calculateStudent360,
  exportStudent360Csv,
  fetchStudent360,
  fetchStudent360Directory,
  saveStudent360Note,
  student360DirectoryKey,
  student360Key,
  type Student360Alert,
  type Student360Calculation,
  type Student360Data,
  type Student360Directory,
} from '../../core/student360';
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
  return value == null || !Number.isFinite(Number(value)) ? '—' : `${Number(value).toFixed(0)}%`;
}

function dateText(value?: string | null): string {
  if (!value) return '—';
  const normalized = value.length === 10 ? `${value}T12:00:00` : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

function dateTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function statusTone(status: string): string {
  if (status === 'risk') return 'red';
  if (status === 'watch') return 'amber';
  if (status === 'ok') return 'green';
  return 'neutral';
}

function statusLabel(status: string): string {
  if (status === 'risk') return 'En riesgo';
  if (status === 'watch') return 'Atención';
  if (status === 'ok') return 'En orden';
  return 'Sin evidencia';
}

function attendanceLabel(status?: string | null): string {
  if (status === 'present') return 'Presente';
  if (status === 'late') return 'Retardo';
  if (status === 'absent') return 'Falta';
  if (status === 'justified') return 'Justificada';
  return 'Sin registro';
}

function attendanceTone(status?: string | null): string {
  if (status === 'present') return 'green';
  if (status === 'late') return 'amber';
  if (status === 'absent') return 'red';
  if (status === 'justified') return 'blue';
  return 'neutral';
}

function omrLabel(status: string): string {
  if (status === 'confirmed') return 'Confirmado';
  if (status === 'pending') return 'Por revisar';
  if (status === 'archived') return 'Archivado';
  return 'Sin resultado';
}

function omrTone(status: string): string {
  if (status === 'confirmed') return 'green';
  if (status === 'pending') return 'amber';
  if (status === 'archived') return 'neutral';
  return 'red';
}

function alertIcon(tone: Student360Alert['tone']) {
  return tone === 'green' ? 'check' : tone === 'blue' ? 'shield' : 'alert';
}

function Directory({ workspace }: { workspace: Student360Directory }) {
  const [groupId, setGroupId] = useState('all');
  const [query, setQuery] = useState('');
  const groups = new Map(workspace.groups.map((group) => [group.id, group]));
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('es-MX');
    return workspace.students.filter((student) => {
      if (groupId !== 'all' && student.group_id !== groupId) return false;
      if (!needle) return true;
      const group = groups.get(student.group_id);
      return `${student.enrollment} ${student.full_name} ${groupLabel(group)}`.toLocaleLowerCase('es-MX').includes(needle);
    });
  }, [groupId, groups, query, workspace.students]);

  const configuredGroups = workspace.groups.filter((group) => workspace.students.some((student) => student.group_id === group.id)).length;

  return (
    <div className="view-stack student360-page">
      <PageHeader
        eyebrow="ETAPA 4D · EXPEDIENTE"
        title="Alumno 360°"
        detail="Consulta trayectoria, asistencia, OMR, evidencias, pendientes y observaciones desde una sola fuente académica."
      />

      <section className="metric-grid four">
        <MetricCard label="Alumnos activos" value={String(workspace.students.length)} detail="Disponibles en el expediente" icon="groups" tone="blue" />
        <MetricCard label="Grupos" value={String(configuredGroups)} detail="Con padrón activo" icon="layout" tone="violet" />
        <MetricCard label="Fuentes" value="4" detail="Libro · OMR · Asistencia · Live" icon="route" tone="green" />
        <MetricCard label="Interpretación" value="Determinista" detail="Sin IA ni costo por tokens" icon="shield" tone="amber" />
      </section>

      <SectionCard>
        <div className="section-heading">
          <div><span className="eyebrow">DIRECTORIO ACADÉMICO</span><h2>Selecciona un estudiante</h2><p>Busca por nombre, matrícula, asignatura o grupo.</p></div>
          <StatusPill tone="blue">{visible.length} resultados</StatusPill>
        </div>
        <div className="student360-directory-tools">
          <label className="search-field"><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar alumno o matrícula" /></label>
          <label>Grupo<select value={groupId} onChange={(event) => setGroupId(event.target.value)}><option value="all">Todos los grupos</option>{workspace.groups.map((group) => <option key={group.id} value={group.id}>{groupLabel(group)}</option>)}</select></label>
        </div>

        {visible.length ? (
          <div className="student360-directory-grid">
            {visible.map((student) => {
              const group = groups.get(student.group_id);
              return (
                <article key={student.id} className="student360-directory-card">
                  <div className="student360-avatar">{student.full_name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</div>
                  <div><span className="eyebrow">{student.enrollment}</span><h3>{student.full_name}</h3><p>{groupLabel(group)}</p></div>
                  <Link className="button primary compact" to={`/students/${student.group_id}/${student.id}`}>Abrir expediente <Icon name="arrow" /></Link>
                </article>
              );
            })}
          </div>
        ) : <EmptyState icon="groups" title="No encontramos alumnos" detail="Ajusta la búsqueda o selecciona otro grupo." />}
      </SectionCard>
    </div>
  );
}

function AlertList({ calculation }: { calculation: Student360Calculation }) {
  return (
    <div className="student360-alert-list">
      {calculation.alerts.map((alert) => (
        <article key={alert.id} className={`student360-alert tone-${alert.tone}`}>
          <div className="student360-alert-icon"><Icon name={alertIcon(alert.tone)} /></div>
          <div><b>{alert.title}</b><p>{alert.detail}</p></div>
          {alert.actionTo ? <Link className="button ghost compact" to={alert.actionTo}>{alert.actionLabel || 'Abrir'}</Link> : null}
        </article>
      ))}
    </div>
  );
}

function SummaryTab({ data, calculation }: { data: Student360Data; calculation: Student360Calculation }) {
  return (
    <div className="student360-summary-grid">
      <section className={`student360-next-action tone-${calculation.nextAction.tone}`}>
        <div><span className="eyebrow">SIGUIENTE ACCIÓN</span><h2>{calculation.nextAction.title}</h2><p>{calculation.nextAction.detail}</p>{calculation.nextAction.actionTo ? <Link className="button primary" to={calculation.nextAction.actionTo}>{calculation.nextAction.actionLabel || 'Abrir módulo'}</Link> : null}</div>
        <div className="student360-score-orbit"><span>{calculation.selectedPeriod?.name || 'Curso'}</span><b>{grade(calculation.current.displayedGrade)}</b><small>{calculation.current.officialGrade != null ? 'Promedio oficial' : 'Promedio provisional'}</small></div>
      </section>

      <SectionCard>
        <div className="section-heading compact"><div><span className="eyebrow">ALERTAS ACTIVAS</span><h2>Lectura académica</h2><p>Reglas transparentes basadas en umbrales y evidencia registrada.</p></div></div>
        <AlertList calculation={calculation} />
      </SectionCard>

      <SectionCard>
        <div className="section-heading compact"><div><span className="eyebrow">COMPONENTES</span><h2>Cómo se forma el promedio</h2><p>Cada categoría muestra la evidencia que sustenta su valor.</p></div></div>
        <div className="student360-category-grid">
          {data.detail.categories.map((category) => {
            const value = calculation.current.categoryValues[category.id];
            return <article key={category.id}><header><span>{category.name}</span><StatusPill tone={value?.value == null ? 'neutral' : 'blue'}>{Number(category.weight).toFixed(0)}%</StatusPill></header><b>{grade(value?.value)}</b><p>{value?.label || 'Sin evidencia'}</p></article>;
          })}
        </div>
      </SectionCard>

      <SectionCard>
        <div className="section-heading compact"><div><span className="eyebrow">PENDIENTES</span><h2>Evidencias por completar</h2><p>Se separan de la calificación para evitar confundir ausencia de dato con cero.</p></div><StatusPill tone={calculation.pendingCount ? 'amber' : 'green'}>{calculation.pendingCount}</StatusPill></div>
        {calculation.pendingCount ? (
          <div className="student360-pending-list">
            {calculation.manualEvidence.filter((row) => row.status === 'pending').map((row) => <article key={`manual-${row.item.id}`}><Icon name="grades" /><div><b>{row.item.title}</b><p>{row.categoryName} · {dateText(row.item.item_date)}</p></div><StatusPill tone="amber">Manual</StatusPill></article>)}
            {calculation.omrEvidence.filter((row) => row.status === 'missing' || row.status === 'pending').map((row) => <article key={`omr-${row.examId}`}><Icon name="exam" /><div><b>{row.title}</b><p>{row.status === 'pending' ? 'Lectura pendiente de confirmar' : 'Sin resultado confirmado'}</p></div><StatusPill tone="amber">OMR</StatusPill></article>)}
            {calculation.assignmentEvidence.filter((row) => row.assignment.status !== 'draft' && row.status !== 'submitted').map((row) => <article key={`assignment-${row.assignment.id}`}><Icon name="bank" /><div><b>{row.assignment.title}</b><p>{row.status === 'in_progress' ? 'Intento en curso' : 'Sin entrega registrada'}</p></div><StatusPill tone="amber">Tarea</StatusPill></article>)}
          </div>
        ) : <EmptyState icon="check" title="Sin pendientes detectados" detail="La evidencia registrada para el periodo seleccionado está completa." />}
      </SectionCard>
    </div>
  );
}

function TrajectoryTab({ calculation }: { calculation: Student360Calculation }) {
  return (
    <div className="view-stack compact-stack">
      <SectionCard>
        <div className="section-heading"><div><span className="eyebrow">TRAYECTORIA</span><h2>Evolución por periodos</h2><p>Los periodos cerrados utilizan su fotografía oficial; los abiertos conservan lectura provisional.</p></div></div>
        {calculation.trajectory.length ? (
          <div className="student360-chart" aria-label="Trayectoria de calificaciones por periodo">
            {calculation.trajectory.map((row) => (
              <article key={row.period.id}>
                <div className="student360-chart-value">{grade(row.grade)}</div>
                <div className="student360-chart-track"><i style={{ height: `${Math.max(4, Math.min(100, Number(row.grade || 0) * 10))}%` }} /></div>
                <b>{row.period.name}</b>
                <small>{row.period.status === 'closed' ? 'Oficial' : 'En curso'}</small>
              </article>
            ))}
          </div>
        ) : <EmptyState icon="periods" title="Aún no hay periodos" detail="La trayectoria aparecerá cuando configures parciales o periodos académicos." />}
      </SectionCard>

      {calculation.trajectory.length ? (
        <SectionCard>
          <div className="student360-trajectory-list">
            {calculation.trajectory.map((row) => (
              <article key={row.period.id}>
                <header><div><span className="eyebrow">{dateText(row.period.starts_on)} – {dateText(row.period.ends_on)}</span><h3>{row.period.name}</h3></div><StatusPill tone={row.period.status === 'closed' ? 'blue' : 'green'}>{row.period.status === 'closed' ? 'Cerrado' : 'Abierto'}</StatusPill></header>
                <div className="student360-period-metrics"><span><small>Promedio</small><b>{grade(row.grade)}</b></span><span><small>Asistencia</small><b>{percent(row.attendanceRate)}</b></span><span><small>OMR</small><b>{grade(row.omrAverage)}</b></span><span><small>Evidencia</small><b>{row.evidenceWeight.toFixed(0)}%</b></span><span><small>Cambio</small><b className={row.delta != null && row.delta < 0 ? 'negative' : 'positive'}>{row.delta == null ? '—' : `${row.delta > 0 ? '+' : ''}${row.delta.toFixed(1)}`}</b></span></div>
                <footer><span>{row.pendingManual} manuales pendientes</span><span>{row.pendingOmr} OMR pendientes</span><StatusPill tone={statusTone(row.status)}>{statusLabel(row.status)}</StatusPill></footer>
              </article>
            ))}
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}

function EvidenceTab({ calculation }: { calculation: Student360Calculation }) {
  return (
    <div className="view-stack compact-stack">
      <SectionCard>
        <div className="section-heading"><div><span className="eyebrow">EVIDENCIAS MANUALES</span><h2>Actividades, prácticas y tareas capturables</h2><p>Se muestra el puntaje original y su equivalencia en escala 0–10.</p></div></div>
        {calculation.manualEvidence.length ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Evidencia</th><th>Categoría</th><th>Fecha</th><th>Puntaje</th><th>Normalizada</th><th>Estado</th></tr></thead><tbody>{calculation.manualEvidence.map((row) => <tr key={row.item.id}><td><b>{row.item.title}</b>{row.note ? <small>{row.note}</small> : null}</td><td>{row.categoryName}</td><td>{dateText(row.item.item_date)}</td><td>{row.rawScore == null ? '—' : `${row.rawScore.toFixed(2)} / ${Number(row.item.max_score).toFixed(2)}`}</td><td>{grade(row.normalizedScore)}</td><td><StatusPill tone={row.status === 'captured' ? 'green' : 'amber'}>{row.status === 'captured' ? 'Capturada' : 'Pendiente'}</StatusPill></td></tr>)}</tbody></table></div> : <EmptyState icon="grades" title="Sin evidencias manuales" detail="No hay actividades manuales dentro del periodo actual." />}
      </SectionCard>

      <SectionCard>
        <div className="section-heading"><div><span className="eyebrow">EVALUACIONES OMR</span><h2>Resultados vinculados</h2><p>Solo los resultados confirmados aportan al Libro.</p></div></div>
        {calculation.omrEvidence.length ? <div className="student360-omr-grid">{calculation.omrEvidence.map((row) => <article key={row.examId}><header><div><span className="eyebrow">{dateText(row.examDate)}</span><h3>{row.title}</h3></div><StatusPill tone={omrTone(row.status)}>{omrLabel(row.status)}</StatusPill></header><div className="student360-omr-score"><b>{grade(row.score)}</b><span>{row.version ? `Versión ${row.version}` : 'Sin versión'}</span></div><footer><span>{row.correctCount == null ? '—' : `${row.correctCount} aciertos`}</span><span>{row.blankCount == null ? '—' : `${row.blankCount} blancos`}</span></footer></article>)}</div> : <EmptyState icon="exam" title="Sin evaluaciones OMR" detail="No hay exámenes asociados al periodo actual." />}
      </SectionCard>

      <div className="student360-evidence-columns">
        <SectionCard>
          <div className="section-heading compact"><div><span className="eyebrow">ASISTENCIA</span><h2>Historial reciente</h2><p>{calculation.attendanceEvidence.length} listas en el periodo.</p></div></div>
          {calculation.attendanceEvidence.length ? <div className="student360-compact-list">{calculation.attendanceEvidence.slice(0, 20).map((row) => <article key={row.session.id}><div><b>{dateText(row.session.attendance_date)}</b><small>{row.record?.observation || row.record?.note || row.session.notes || 'Sin observación'}</small></div><StatusPill tone={attendanceTone(row.record?.status)}>{attendanceLabel(row.record?.status)}</StatusPill></article>)}</div> : <EmptyState icon="attendance" title="Sin listas" detail="No hay asistencia registrada en este periodo." />}
        </SectionCard>

        <SectionCard>
          <div className="section-heading compact"><div><span className="eyebrow">TAREAS DIGITALES</span><h2>Entregas e intentos</h2><p>Estado de las actividades publicadas.</p></div></div>
          {calculation.assignmentEvidence.length ? <div className="student360-compact-list">{calculation.assignmentEvidence.map((row) => <article key={row.assignment.id}><div><b>{row.assignment.title}</b><small>{row.attempt ? `Intento ${row.attempt.attempt_no}${row.attempt.late ? ' · tardío' : ''}` : 'Sin intento'}</small></div><div className="student360-list-score"><b>{grade(row.normalizedScore)}</b><StatusPill tone={row.status === 'submitted' ? 'green' : 'amber'}>{row.status === 'submitted' ? 'Entregada' : row.status === 'in_progress' ? 'En curso' : 'Pendiente'}</StatusPill></div></article>)}</div> : <EmptyState icon="bank" title="Sin tareas" detail="No hay actividades digitales en el periodo actual." />}
        </SectionCard>
      </div>

      <SectionCard>
        <div className="section-heading compact"><div><span className="eyebrow">PARTICIPACIÓN LIVE</span><h2>Presencia en sesiones</h2><p>La participación mostrada proviene de sesiones identificadas por padrón o matrícula.</p></div><StatusPill tone="blue">{calculation.liveEvidence.filter((row) => row.participated).length}/{calculation.liveEvidence.length}</StatusPill></div>
        {calculation.liveEvidence.length ? <div className="student360-live-strip">{calculation.liveEvidence.map((row) => <span key={row.sessionId} className={row.participated ? 'participated' : ''} title={dateTime(row.date)}>{row.participated ? '✓' : '—'}</span>)}</div> : <EmptyState icon="classroom" title="Sin sesiones Live" detail="No hay sesiones vinculadas al periodo actual." />}
      </SectionCard>
    </div>
  );
}

function HistoryTab({ data, calculation, note, reason, busy, changed, onNote, onReason, onSave }: { data: Student360Data; calculation: Student360Calculation; note: string; reason: string; busy: boolean; changed: boolean; onNote: (value: string) => void; onReason: (value: string) => void; onSave: () => void }) {
  const requiresReason = Boolean(data.note && changed);
  return (
    <div className="student360-history-grid">
      <SectionCard className="student360-note-card">
        <div className="section-heading compact"><div><span className="eyebrow">OBSERVACIÓN DOCENTE</span><h2>Seguimiento cualitativo</h2><p>Cada modificación queda protegida en el historial.</p></div><StatusPill tone={changed ? 'amber' : 'green'}>{changed ? 'Cambios sin guardar' : 'Guardada'}</StatusPill></div>
        <label>Observación<textarea rows={9} value={note} onChange={(event) => onNote(event.target.value)} placeholder="Acuerdos, fortalezas, dificultades y seguimiento…" /></label>
        {requiresReason ? <label>Motivo del cambio<input value={reason} onChange={(event) => onReason(event.target.value)} placeholder="Ej. Seguimiento posterior a asesoría" /></label> : null}
        <button className="button primary wide" type="button" disabled={busy || !changed || (requiresReason && reason.trim().length < 5)} onClick={onSave}>{busy ? 'Guardando…' : 'Guardar observación'}</button>
        <p className="student360-privacy-note"><Icon name="shield" /> Visible únicamente para el docente propietario del grupo.</p>
      </SectionCard>

      <SectionCard>
        <div className="section-heading compact"><div><span className="eyebrow">HISTORIAL</span><h2>Cambios del expediente</h2><p>Observaciones, calificaciones y correcciones OMR.</p></div><StatusPill tone="blue">{calculation.audit.length}</StatusPill></div>
        {calculation.audit.length ? <div className="student360-audit-list">{calculation.audit.map((event) => <article key={event.id}><div className={`student360-audit-icon kind-${event.kind}`}><Icon name={event.kind === 'note' ? 'groups' : event.kind === 'omr' ? 'exam' : 'grades'} /></div><div><b>{event.title}</b><p>{event.detail}</p><small>{event.reason} · {dateTime(event.createdAt)}</small></div></article>)}</div> : <EmptyState icon="clock" title="Sin cambios históricos" detail="Las revisiones aparecerán cuando se actualice una observación, calificación o lectura OMR." />}
      </SectionCard>
    </div>
  );
}

function StudentDetail({ groupId, studentId }: { groupId: string; studentId: string }) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'summary' | 'trajectory' | 'evidence' | 'history'>('summary');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState('');

  const profile = useQuery({
    queryKey: student360Key(auth.user?.id, groupId, studentId),
    queryFn: () => {
      if (!auth.user) throw new Error('Tu sesión expiró.');
      return fetchStudent360(auth.user, groupId, studentId);
    },
    enabled: Boolean(auth.user && groupId && studentId),
  });

  useEffect(() => {
    setNote(profile.data?.note?.note || '');
    setReason('');
  }, [profile.data?.note?.id, profile.data?.note?.updated_at]);

  const saveNote = useMutation({
    mutationFn: () => {
      if (!auth.user) throw new Error('Tu sesión expiró.');
      return saveStudent360Note(auth.user, groupId, studentId, note, reason);
    },
    onSuccess: async () => {
      setNotice('Observación guardada y registrada en el historial.');
      setReason('');
      await queryClient.invalidateQueries({ queryKey: student360Key(auth.user?.id, groupId, studentId) });
    },
  });

  if (profile.isLoading) return <LoadingScreen label="Construyendo Alumno 360°…" />;
  if (profile.isError) return <ErrorPanel title="No pude abrir el expediente" detail={profile.error.message} onRetry={() => profile.refetch()} />;
  if (!profile.data) return null;

  const data = profile.data;
  const calculation = calculateStudent360(data);
  const changed = note.trim() !== String(data.note?.note || '').trim();
  const groupTitle = groupLabel(data.detail.group);

  return (
    <div className="view-stack student360-page">
      <PageHeader
        eyebrow="ALUMNO 360°"
        title={data.student.full_name}
        detail={`${data.student.enrollment} · ${groupTitle}`}
        actions={<div className="page-actions"><Link className="button ghost" to="/students">← Directorio</Link><Link className="button ghost" to={`/groups/${groupId}`}>Grupo</Link><Link className="button secondary" to={`/gradebook/${groupId}`}>Libro</Link><button className="button primary" type="button" onClick={() => exportStudent360Csv(data, calculation)}>Exportar CSV</button></div>}
      />

      {notice ? <div className="success-strip"><Icon name="check" /><span>{notice}</span><button type="button" onClick={() => setNotice('')}>×</button></div> : null}
      {saveNote.isError ? <ErrorPanel title="No se pudo guardar la observación" detail={saveNote.error.message} /> : null}

      <section className="student360-profile-hero">
        <div className="student360-profile-main"><div className="student360-avatar large">{data.student.full_name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</div><div><span className="eyebrow">EXPEDIENTE ACADÉMICO</span><h2>{data.student.full_name}</h2><p>{data.student.enrollment} · {data.student.active ? 'Alumno activo' : 'Alumno inactivo'}</p></div></div>
        <StatusPill tone={statusTone(calculation.current.status)}>{statusLabel(calculation.current.status)}</StatusPill>
      </section>

      <section className="metric-grid four">
        <MetricCard label="Promedio" value={grade(calculation.current.displayedGrade)} detail={calculation.current.officialGrade != null ? 'Oficial del periodo' : 'Provisional'} icon="grades" tone={calculation.current.status === 'risk' ? 'red' : calculation.current.status === 'watch' ? 'amber' : 'green'} />
        <MetricCard label="Asistencia" value={percent(calculation.current.attendanceRate)} detail={`Mínimo ${calculation.minAttendance.toFixed(0)}%`} icon="attendance" tone={calculation.current.attendanceRate != null && calculation.current.attendanceRate < calculation.minAttendance ? 'red' : 'blue'} />
        <MetricCard label="Promedio OMR" value={grade(calculation.current.omrAverage)} detail={`${calculation.omrEvidence.filter((row) => row.status === 'confirmed').length} confirmadas`} icon="exam" tone="violet" />
        <MetricCard label="Peso con evidencia" value={`${calculation.current.evidenceWeight.toFixed(0)}%`} detail={`${calculation.pendingCount} pendientes`} icon="route" tone={calculation.pendingCount ? 'amber' : 'green'} />
      </section>

      <div className="module-tabs student360-tabs" role="tablist" aria-label="Secciones de Alumno 360°">
        <button type="button" className={tab === 'summary' ? 'active' : ''} onClick={() => setTab('summary')}>Resumen</button>
        <button type="button" className={tab === 'trajectory' ? 'active' : ''} onClick={() => setTab('trajectory')}>Trayectoria</button>
        <button type="button" className={tab === 'evidence' ? 'active' : ''} onClick={() => setTab('evidence')}>Evidencias</button>
        <button type="button" className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>Seguimiento e historial</button>
      </div>

      {tab === 'summary' ? <SummaryTab data={data} calculation={calculation} /> : null}
      {tab === 'trajectory' ? <TrajectoryTab calculation={calculation} /> : null}
      {tab === 'evidence' ? <EvidenceTab calculation={calculation} /> : null}
      {tab === 'history' ? <HistoryTab data={data} calculation={calculation} note={note} reason={reason} busy={saveNote.isPending} changed={changed} onNote={setNote} onReason={setReason} onSave={() => saveNote.mutate()} /> : null}
    </div>
  );
}

export function Student360Page() {
  const { groupId = '', studentId = '' } = useParams();
  const auth = useAuth();

  const directory = useQuery({
    queryKey: student360DirectoryKey(auth.user?.id),
    queryFn: () => {
      if (!auth.user) throw new Error('Tu sesión expiró.');
      return fetchStudent360Directory(auth.user);
    },
    enabled: Boolean(auth.user && !groupId && !studentId),
  });

  if (groupId && studentId) return <StudentDetail groupId={groupId} studentId={studentId} />;
  if (directory.isLoading) return <LoadingScreen label="Preparando el directorio académico…" />;
  if (directory.isError) return <ErrorPanel title="No pude cargar Alumno 360°" detail={directory.error.message} onRetry={() => directory.refetch()} />;
  return directory.data ? <Directory workspace={directory.data} /> : null;
}
