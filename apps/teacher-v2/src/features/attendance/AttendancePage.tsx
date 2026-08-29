import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { attendanceLabel, groupName, groupSubject } from '../../core/academic';
import {
  attendanceDayKey,
  createAttendanceSession,
  fetchAttendanceDay,
  localDateKey,
  saveAttendanceRecords,
  updateAttendanceOptions,
  updateAttendanceState,
  type AttendanceDraftRecord,
  type AttendanceSessionOptions,
} from '../../core/attendance';
import { groupDetailKey, groupWorkspaceKey } from '../../core/groups';
import type { AttendanceRecordStatus, AttendanceSessionState, DashboardGroup } from '../../core/types';
import { useTeacherHome } from '../../core/useTeacherHome';
import { EmptyState, ErrorPanel, LoadingScreen, MetricCard, PageHeader, SectionCard, StatusPill } from '../../shared/components';
import { Icon } from '../../shared/icons';
import { useAuth } from '../auth/AuthProvider';

const statuses: Array<{ key: AttendanceRecordStatus; label: string; short: string }> = [
  { key: 'present', label: 'Presente', short: 'P' },
  { key: 'late', label: 'Retardo', short: 'R' },
  { key: 'absent', label: 'Falta', short: 'F' },
  { key: 'justified', label: 'Justificada', short: 'J' },
];

function dateLabel(value: string): string {
  return new Date(`${value}T12:00:00`).toLocaleDateString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function moveDate(value: string, delta: number): string {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + delta);
  return localDateKey(date);
}

function sessionLabel(status?: string | null): string {
  if (status === 'open') return 'Lista abierta';
  if (status === 'paused') return 'Lista pausada';
  if (status === 'closed') return 'Lista cerrada';
  return 'Sin lista';
}

function sessionTone(status?: string | null): string {
  if (status === 'open') return 'green';
  if (status === 'paused') return 'amber';
  if (status === 'closed') return 'blue';
  return 'neutral';
}

function AttendanceLanding() {
  const home = useTeacherHome();
  const [query, setQuery] = useState('');
  const [date, setDate] = useState(localDateKey());
  const groups = home.data?.dashboard.groups || [];
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('es-MX');
    if (!needle) return groups;
    return groups.filter((group) => `${groupName(group)} ${groupSubject(group)} ${group.university || ''}`.toLocaleLowerCase('es-MX').includes(needle));
  }, [groups, query]);

  if (home.isLoading) return <LoadingScreen label="Preparando asistencia…" />;
  if (home.isError) return <ErrorPanel title="No pude cargar los grupos" detail={home.error.message} onRetry={() => home.refetch()} />;

  return (
    <div className="view-stack">
      <PageHeader eyebrow="ASISTENCIA PRO" title="Selecciona un grupo" detail="Abre, pausa, corrige y cierra listas desde el mismo shell, sin regresar a la interfaz heredada." />
      <SectionCard>
        <div className="attendance-landing-tools">
          <label className="search-field"><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar grupo o materia" /></label>
          <label className="date-field">Fecha<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <StatusPill tone="blue">{filtered.length} grupos</StatusPill>
        </div>
      </SectionCard>
      {filtered.length ? (
        <section className="attendance-group-grid">
          {filtered.map((group) => <AttendanceGroupCard key={group.id} group={group} date={date} />)}
        </section>
      ) : <EmptyState icon="attendance" title={groups.length ? 'Sin coincidencias' : 'Aún no tienes grupos'} detail={groups.length ? 'Prueba con otro nombre o materia.' : 'Crea un grupo y agrega alumnos antes de pasar asistencia.'} action={<Link className="button primary" to="/groups">Abrir Grupos</Link>} />}
    </div>
  );
}

function AttendanceGroupCard({ group, date }: { group: DashboardGroup; date: string }) {
  return (
    <article className="attendance-group-card">
      <header><div><span className="eyebrow">{groupSubject(group)}</span><h2>{groupName(group)}</h2><p>{group.university || 'TEDVIO'}{group.term ? ` · ${group.term}` : ''}</p></div><StatusPill tone={sessionTone(group.today_attendance_status)}>{attendanceLabel(group)}</StatusPill></header>
      <div className="attendance-group-metrics"><span><small>Alumnos</small><b>{Number(group.students || 0)}</b></span><span><small>Listas</small><b>{Number(group.attendance_sessions_count || 0)}</b></span><span><small>Asistencia</small><b>{group.attendance_rate == null ? '—' : `${Math.round(Number(group.attendance_rate))}%`}</b></span></div>
      <footer><small>{dateLabel(date)}</small><Link className="button primary" to={`/attendance/${group.id}?date=${date}`}>{group.today_attendance_status && date === localDateKey() ? 'Continuar lista' : 'Abrir asistencia'}</Link></footer>
    </article>
  );
}

function AttendanceEditor({ groupId }: { groupId: string }) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const date = searchParams.get('date') || localDateKey();
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<Record<string, { status: AttendanceRecordStatus; note: string }>>({});
  const [options, setOptions] = useState<AttendanceSessionOptions>({ lateAfterMinutes: 10, autoMarkAbsent: true, notes: '' });
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState('');

  const day = useQuery({
    queryKey: attendanceDayKey(auth.user?.id, groupId, date),
    queryFn: () => {
      if (!auth.user) throw new Error('Tu sesión expiró.');
      return fetchAttendanceDay(auth.user, groupId, date);
    },
    enabled: Boolean(auth.user && groupId),
  });

  useEffect(() => {
    if (!day.data) return;
    const recordByStudent = new Map(day.data.records.map((record) => [record.student_id, record]));
    const next: Record<string, { status: AttendanceRecordStatus; note: string }> = {};
    for (const student of day.data.students) {
      const record = recordByStudent.get(student.id);
      next[student.id] = {
        status: record?.status || 'present',
        note: record?.observation || record?.note || '',
      };
    }
    setDraft(next);
    setOptions({
      lateAfterMinutes: Number(day.data.session?.late_after_minutes ?? 10),
      autoMarkAbsent: day.data.session?.auto_mark_absent ?? true,
      notes: day.data.session?.notes || '',
    });
    setDirty(false);
  }, [day.data]);

  async function invalidate() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: attendanceDayKey(auth.user?.id, groupId, date) }),
      queryClient.invalidateQueries({ queryKey: groupDetailKey(auth.user?.id, groupId) }),
      queryClient.invalidateQueries({ queryKey: groupWorkspaceKey(auth.user?.id) }),
      queryClient.invalidateQueries({ queryKey: ['teacher-home', auth.user?.id] }),
    ]);
  }

  const createMutation = useMutation({
    mutationFn: () => {
      if (!auth.user) throw new Error('Tu sesión expiró.');
      return createAttendanceSession(auth.user, groupId, date, options);
    },
    onSuccess: async () => {
      setNotice('Lista creada. Marca las excepciones y guarda.');
      await invalidate();
    },
  });

  function draftRows(): AttendanceDraftRecord[] {
    return Object.entries(draft).map(([studentId, value]) => ({ studentId, status: value.status, note: value.note }));
  }

  const commitMutation = useMutation({
    mutationFn: async (action: 'save' | AttendanceSessionState) => {
      if (!auth.user || !day.data?.session) throw new Error('La lista todavía no existe.');
      if (action !== 'open' || day.data.session.status !== 'closed') {
        await saveAttendanceRecords(auth.user, day.data.session.id, draftRows());
        await updateAttendanceOptions(auth.user, day.data.session.id, options);
      }
      if (action !== 'save') await updateAttendanceState(auth.user, day.data.session.id, action);
      return action;
    },
    onSuccess: async (action) => {
      const labels: Record<string, string> = { save: 'Lista guardada.', open: 'Lista abierta.', paused: 'Lista pausada.', closed: 'Lista cerrada.' };
      setNotice(labels[action] || 'Cambios guardados.');
      setDirty(false);
      await invalidate();
    },
  });

  function changeDate(next: string) {
    if (dirty && !window.confirm('Hay cambios sin guardar. ¿Cambiar de fecha de todos modos?')) return;
    setSearchParams({ date: next });
    setNotice('');
  }

  function setAll(status: AttendanceRecordStatus) {
    setDraft((current) => Object.fromEntries(Object.entries(current).map(([id, value]) => [id, { ...value, status }])));
    setDirty(true);
  }

  const filteredStudents = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('es-MX');
    return (day.data?.students || []).filter((student) => !needle || `${student.enrollment} ${student.full_name}`.toLocaleLowerCase('es-MX').includes(needle));
  }, [day.data?.students, query]);

  const counts = useMemo(() => {
    const values = Object.values(draft);
    return Object.fromEntries(statuses.map((status) => [status.key, values.filter((value) => value.status === status.key).length])) as Record<AttendanceRecordStatus, number>;
  }, [draft]);

  if (day.isLoading) return <LoadingScreen label="Cargando la lista…" />;
  if (day.isError) return <ErrorPanel title="No pude abrir la asistencia" detail={day.error.message} onRetry={() => day.refetch()} />;
  if (!day.data) return null;

  const { group, session, students } = day.data;
  const locked = session?.status === 'closed';
  const busy = createMutation.isPending || commitMutation.isPending;

  return (
    <div className="view-stack">
      <PageHeader
        eyebrow="ASISTENCIA PRO"
        title={group.group_name || group.name}
        detail={`${group.subject || 'Grupo'} · ${dateLabel(date)}`}
        actions={<div className="page-actions"><Link className="button ghost" to="/attendance">← Grupos</Link><Link className="button ghost" to={`/groups/${groupId}`}>Centro del grupo</Link></div>}
      />

      {notice ? <div className="success-strip"><Icon name="check" /><span>{notice}</span><button type="button" onClick={() => setNotice('')}>×</button></div> : null}
      {createMutation.isError || commitMutation.isError ? <ErrorPanel title="No se pudo guardar la asistencia" detail={(createMutation.error || commitMutation.error)?.message || 'Intenta nuevamente.'} /> : null}

      <SectionCard className="attendance-date-card">
        <div className="attendance-date-controls">
          <button className="icon-button" type="button" onClick={() => changeDate(moveDate(date, -1))} aria-label="Día anterior">←</button>
          <label>Fecha<input type="date" value={date} onChange={(event) => changeDate(event.target.value)} /></label>
          <button className="icon-button" type="button" onClick={() => changeDate(moveDate(date, 1))} aria-label="Día siguiente">→</button>
          <button className="button ghost compact" type="button" onClick={() => changeDate(localDateKey())}>Hoy</button>
          <StatusPill tone={sessionTone(session?.status)}>{sessionLabel(session?.status)}</StatusPill>
        </div>
      </SectionCard>

      {!session ? (
        <section className="attendance-create-panel">
          <div><span className="eyebrow">NUEVA LISTA</span><h2>No existe asistencia para esta fecha</h2><p>{students.length ? `TEDVIO preparará ${students.length} alumnos activos con estado Presente por defecto.` : 'El grupo todavía no tiene alumnos activos.'}</p></div>
          <div className="attendance-options compact-options">
            <label>Retardo después de<input type="number" min="0" max="120" value={options.lateAfterMinutes} onChange={(event) => setOptions({ ...options, lateAfterMinutes: Number(event.target.value) })} /><span>minutos</span></label>
            <label className="toggle-field"><input type="checkbox" checked={options.autoMarkAbsent} onChange={(event) => setOptions({ ...options, autoMarkAbsent: event.target.checked })} /> Completar ausencias al cierre</label>
          </div>
          <button className="button primary" type="button" disabled={!students.length || createMutation.isPending} onClick={() => createMutation.mutate()}>{createMutation.isPending ? 'Creando lista…' : 'Crear lista de asistencia'}</button>
        </section>
      ) : (
        <>
          <section className="metrics-grid attendance-metrics">
            <MetricCard icon="check" label="Presentes" value={String(counts.present || 0)} detail="Asistencia puntual" tone="green" />
            <MetricCard icon="clock" label="Retardos" value={String(counts.late || 0)} detail={`Después de ${options.lateAfterMinutes} min`} tone="amber" />
            <MetricCard icon="alert" label="Faltas" value={String(counts.absent || 0)} detail="Ausencias registradas" tone="red" />
            <MetricCard icon="shield" label="Justificadas" value={String(counts.justified || 0)} detail="Con justificación" tone="violet" />
          </section>

          <SectionCard>
            <div className="section-heading attendance-heading">
              <div><span className="eyebrow">CAPTURA</span><h2>{students.length} alumnos activos</h2><p>{locked ? 'La lista está cerrada. Reábrela para corregir registros.' : dirty ? 'Hay cambios pendientes de guardar.' : 'Todos los cambios visibles están sincronizados.'}</p></div>
              <div className="page-actions">
                {!locked ? <><button className="button ghost compact" type="button" onClick={() => setAll('present')}>Todos presentes</button><button className="button ghost compact" type="button" onClick={() => setAll('absent')}>Todos falta</button></> : null}
              </div>
            </div>

            <div className="attendance-options">
              <label>Retardo después de <input type="number" min="0" max="120" disabled={locked} value={options.lateAfterMinutes} onChange={(event) => { setOptions({ ...options, lateAfterMinutes: Number(event.target.value) }); setDirty(true); }} /> minutos</label>
              <label className="toggle-field"><input type="checkbox" disabled={locked} checked={options.autoMarkAbsent} onChange={(event) => { setOptions({ ...options, autoMarkAbsent: event.target.checked }); setDirty(true); }} /> Completar ausencias al cierre</label>
              <label className="attendance-general-note">Nota de la lista<input disabled={locked} value={options.notes} onChange={(event) => { setOptions({ ...options, notes: event.target.value }); setDirty(true); }} placeholder="Tema, actividad o incidencia general" /></label>
            </div>

            <div className="toolbar-v2">
              <label className="search-field"><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar alumno o matrícula" /></label>
              <StatusPill tone="blue">{filteredStudents.length} de {students.length}</StatusPill>
            </div>

            {filteredStudents.length ? (
              <div className="attendance-roster">
                {filteredStudents.map((student) => {
                  const value = draft[student.id] || { status: 'present' as AttendanceRecordStatus, note: '' };
                  return (
                    <article className={`attendance-student status-${value.status}`} key={student.id}>
                      <div className="attendance-student-name"><strong>{student.full_name}</strong><span>{student.enrollment}</span></div>
                      <div className="attendance-status-control" role="group" aria-label={`Estado de ${student.full_name}`}>
                        {statuses.map((status) => <button key={status.key} type="button" disabled={locked} className={value.status === status.key ? `active ${status.key}` : ''} title={status.label} onClick={() => { setDraft((current) => ({ ...current, [student.id]: { ...value, status: status.key } })); setDirty(true); }}><b>{status.short}</b><span>{status.label}</span></button>)}
                      </div>
                      <input className="attendance-note" disabled={locked} value={value.note} onChange={(event) => { setDraft((current) => ({ ...current, [student.id]: { ...value, note: event.target.value } })); setDirty(true); }} placeholder="Observación opcional" />
                    </article>
                  );
                })}
              </div>
            ) : <EmptyState icon="search" title="Sin coincidencias" detail="Prueba con otro nombre o matrícula." />}
          </SectionCard>

          <div className="attendance-savebar">
            <div><StatusPill tone={sessionTone(session.status)}>{sessionLabel(session.status)}</StatusPill><span>{dirty ? 'Cambios pendientes' : 'Lista sincronizada'}</span></div>
            <div>
              {!locked ? <button className="button secondary" type="button" disabled={busy} onClick={() => commitMutation.mutate('save')}>{commitMutation.isPending ? 'Guardando…' : 'Guardar'}</button> : null}
              {session.status === 'open' ? <button className="button ghost" type="button" disabled={busy} onClick={() => commitMutation.mutate('paused')}>Pausar</button> : null}
              {session.status === 'paused' ? <button className="button primary" type="button" disabled={busy} onClick={() => commitMutation.mutate('open')}>Reanudar</button> : null}
              {session.status !== 'closed' ? <button className="button danger" type="button" disabled={busy} onClick={() => { if (window.confirm('¿Cerrar esta lista? Quedará protegida contra cambios accidentales.')) commitMutation.mutate('closed'); }}>Cerrar lista</button> : <button className="button primary" type="button" disabled={busy} onClick={() => { if (window.confirm('¿Reabrir esta lista para realizar correcciones?')) commitMutation.mutate('open'); }}>Reabrir lista</button>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function AttendancePage() {
  const { groupId } = useParams();
  return groupId ? <AttendanceEditor groupId={groupId} /> : <AttendanceLanding />;
}
