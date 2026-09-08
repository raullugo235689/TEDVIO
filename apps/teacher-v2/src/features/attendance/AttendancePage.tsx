import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { attendanceLabel, groupName, groupSubject } from '../../core/academic';
import {
  attendanceDayKey,
  createAttendanceSession,
  fetchAttendanceDay,
  localDateKey,
  saveAttendanceRecords,
  updateAttendanceOptions,
  updateAttendanceState,
  type AttendanceSessionOptions,
} from '../../core/attendance';
import { attendanceDraftKey, attendanceWriteKey, attendanceSnapshot, sameAttendanceSnapshot, missingAttendanceRecords, editAttendanceDraft, finishAttendanceSave, validAttendanceDate, type AttendanceDraft, type AttendanceValues, type AttendanceSnapshot } from '../../core/attendance-draft';
import { ActionDialog } from '../../shared/ActionDialog';
import { useReliability } from '../reliability/ReliabilityProvider';
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
      <PageHeader eyebrow="ASISTENCIA PRO" title="Selecciona un grupo" detail="Consulta tus listas, registra la asistencia y revisa las observaciones de cada grupo." />
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

function AttendanceEditor({ groupId, date }: { groupId: string; date: string }) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [, setSearchParams] = useSearchParams();
  const { online } = useReliability();
  const dayKey = attendanceDayKey(auth.user?.id, groupId, date);
  const draftKey = attendanceDraftKey(auth.user?.id, groupId, date);
  const writeKey = attendanceWriteKey(auth.user?.id, groupId, date);
  const busy = useIsMutating({ mutationKey: writeKey }) > 0;
  const [dialog, setDialog] = useState<'closed' | 'reopen' | 'discard' | 'absent' | null>(null);
  const draftQuery = useQuery<AttendanceDraft | null>({
    queryKey: draftKey, queryFn: async () => null, enabled: false,
    initialData: null, staleTime: Infinity, gcTime: Infinity,
  });
  const pending = draftQuery.data ?? null;
  const [query, setQuery] = useState('');
  const dirty = Boolean(pending);
  const [notice, setNotice] = useState('');

  const day = useQuery({
    queryKey: attendanceDayKey(auth.user?.id, groupId, date),
    gcTime: Infinity,
    queryFn: () => {
      if (!auth.user) throw new Error('Tu sesión expiró.');
      return fetchAttendanceDay(auth.user, groupId, date);
    },
    enabled: Boolean(auth.user && groupId),
  });

  const snapshot = useMemo(() => day.data ? attendanceSnapshot(day.data) : null, [day.data]);
  const draft = pending?.values.records ?? snapshot?.records ?? {};
  const options = pending?.values.options ?? snapshot?.options ?? { lateAfterMinutes: 10, autoMarkAbsent: true, notes: '' };
  const conflict = Boolean(pending && snapshot && !sameAttendanceSnapshot(pending.base, snapshot)
    && !sameAttendanceSnapshot({ ...pending.base, ...pending.values }, snapshot));

  function edit(update: (values: AttendanceValues) => AttendanceValues) {
    if (!snapshot || busy || snapshot.status === 'closed') return;
    queryClient.setQueryData<AttendanceDraft | null>(draftKey, (current) => editAttendanceDraft(current, snapshot, update));
  }

  function setDraft(update: (records: AttendanceValues['records']) => AttendanceValues['records']) {
    edit((values) => ({ ...values, records: update(values.records) }));
  }

  function setOptions(next: AttendanceSessionOptions) {
    edit((values) => ({ ...values, options: next }));
  }

  async function invalidate() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: groupDetailKey(auth.user?.id, groupId) }),
      queryClient.invalidateQueries({ queryKey: groupWorkspaceKey(auth.user?.id) }),
      queryClient.invalidateQueries({ queryKey: ['teacher-home', auth.user?.id] }),
    ]);
  }

  function receiveSavedDay(saved: Awaited<ReturnType<typeof fetchAttendanceDay>>, revision: number, clear = true) {
    // Auth clears the cache on sign-out. A late response must not repopulate it.
    if (!queryClient.getQueryState(dayKey)) return;
    queryClient.setQueryData(dayKey, saved);
    if (clear) queryClient.setQueryData<AttendanceDraft | null>(draftKey, (current) => finishAttendanceSave(current, revision));
  }

  const createMutation = useMutation({
    mutationKey: writeKey,
    mutationFn: async (submission: { options: AttendanceSessionOptions; revision: number }) => {
      if (!auth.user) throw new Error('Tu sesión expiró.');
      await createAttendanceSession(auth.user, groupId, date, submission.options);
      return { saved: await fetchAttendanceDay(auth.user, groupId, date), revision: submission.revision };
    },
    onSuccess: async ({ saved, revision }) => {
      receiveSavedDay(saved, revision);
      setNotice('Lista creada. Marca las excepciones y guarda.');
      await invalidate();
    },
  });

  const commitMutation = useMutation({
    mutationKey: writeKey,
    mutationFn: async (submission: { action: 'save' | AttendanceSessionState; base: AttendanceSnapshot; values: AttendanceValues; revision: number }) => {
      if (!auth.user || !submission.base.sessionId) throw new Error('La lista todavía no existe.');
      const latest = await fetchAttendanceDay(auth.user, groupId, date);
      const remote = attendanceSnapshot(latest);
      const reopening = submission.action === 'open' && submission.base.status === 'closed';
      const unchanged = sameAttendanceSnapshot(submission.base, remote);
      const alreadySaved = sameAttendanceSnapshot({ ...submission.base, ...submission.values }, remote);
      if (remote.sessionId !== submission.base.sessionId || remote.status !== submission.base.status
        || (!reopening && !unchanged && !alreadySaved)) {
        if (queryClient.getQueryState(dayKey)) queryClient.setQueryData(dayKey, latest);
        throw new Error('La lista guardada cambió. Tus cambios siguen visibles; revísalos antes de continuar.');
      }
      if (remote.status === 'closed' && !reopening) throw new Error('Reabre la lista antes de guardar cambios.');
      if (!reopening) {
        const rows = Object.entries(submission.values.records).map(([studentId, row]) => ({ studentId, ...row }));
        await saveAttendanceRecords(auth.user, submission.base.sessionId, rows);
        await updateAttendanceOptions(auth.user, submission.base.sessionId, submission.values.options);
      }
      if (submission.action !== 'save') await updateAttendanceState(auth.user, submission.base.sessionId, submission.action);
      return { ...submission, reopening, saved: await fetchAttendanceDay(auth.user, groupId, date) };
    },
    onSuccess: async ({ action, saved, revision, reopening }) => {
      receiveSavedDay(saved, revision, !reopening);
      const labels: Record<string, string> = { save: 'Lista guardada.', open: 'Lista abierta.', paused: 'Lista pausada.', closed: 'Lista cerrada.' };
      setNotice(labels[action] || 'Cambios guardados.');
      setDialog(null);
      await invalidate();
    },
  });

  function commit(action: 'save' | AttendanceSessionState) {
    if (!snapshot || busy || !online) return;
    const reopening = action === 'open' && snapshot.status === 'closed';
    commitMutation.mutate({ action, base: reopening ? snapshot : pending?.base ?? snapshot,
      values: pending?.values ?? snapshot, revision: pending?.revision ?? 0 });
  }

  function confirm(kind: NonNullable<typeof dialog>) {
    commitMutation.reset();
    setDialog(kind);
  }

  function changeDate(next: string) {
    if (busy || !validAttendanceDate(next) || next === date) return;
    setSearchParams({ date: next });
    setNotice('');
  }

  function setAll(status: AttendanceRecordStatus) {
    setDraft((current) => Object.fromEntries(Object.entries(current).map(([id, value]) => [id, { ...value, status }])));
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
  if (day.isError && !day.data) return <ErrorPanel title="No pude abrir la asistencia" detail={day.error.message} onRetry={() => day.refetch()} />;
  if (!day.data) return <ErrorPanel title="Lista no disponible en esta pestaña" detail="Conéctate para consultar esta fecha. La captura pendiente de las otras listas se conserva durante esta sesión." onRetry={() => day.refetch()} />;

  const { group, session, students } = day.data;
  const locked = session?.status === 'closed';
  const unsavedDefaults = Boolean(session && !locked && missingAttendanceRecords(day.data) > 0);
  const needsSave = dirty || unsavedDefaults;

  return (
    <div className="view-stack attendance-editor">
      <PageHeader
        eyebrow="ASISTENCIA PRO"
        title={group.group_name || group.name}
        detail={`${group.subject || 'Grupo'} · ${dateLabel(date)}`}
        actions={<div className="page-actions"><Link className="button ghost" to="/attendance">← Grupos</Link><Link className="button ghost" to={`/groups/${groupId}`}>Centro del grupo</Link></div>}
      />

      {notice ? <div className="success-strip" role="status"><Icon name="check" /><span>{notice}</span><button type="button" aria-label="Cerrar aviso" onClick={() => setNotice('')}>×</button></div> : null}
      {createMutation.isError || commitMutation.isError ? <ErrorPanel title="No se pudo guardar la asistencia" detail={(createMutation.error || commitMutation.error)?.message || 'Intenta nuevamente.'} /> : null}
      {day.isError ? <ErrorPanel title="No se pudo actualizar la lista" detail="Se conserva la información disponible y tu captura pendiente. Comprueba la conexión y vuelve a intentarlo." onRetry={() => day.refetch()} /> : null}

      <div className={`attendance-work-status${!online || conflict ? ' warning' : ''}`} role="status">
        <div><b>{!online ? 'Sin conexión' : conflict ? 'La lista guardada cambió' : dirty ? 'Captura pendiente de guardar' : unsavedDefaults ? 'Lista por guardar' : locked ? 'Lista cerrada' : session ? 'Lista guardada' : 'Prepara una nueva lista'}</b>
          <p>{dirty ? 'Tu captura se conserva al navegar dentro de TEDVIO en esta pestaña. Guarda antes de recargar o cerrar sesión.' : unsavedDefaults ? 'Los estados propuestos todavía no se han registrado. Revisa la lista y pulsa Guardar.' : !online ? 'Puedes revisar la información disponible. El guardado requiere conexión.' : 'Selecciona la fecha que deseas consultar.'}</p>
          {conflict ? <p>Revisa tus cambios visibles. Para usar la versión guardada, descarta esta captura.</p> : null}</div>
        {dirty ? <button type="button" className="button ghost" disabled={busy} onClick={() => confirm('discard')}>Descartar cambios</button> : null}
      </div>

      <SectionCard className="attendance-date-card">
        <div className="attendance-date-controls">
          <button className="icon-button" type="button" disabled={busy} onClick={() => changeDate(moveDate(date, -1))} aria-label="Día anterior">←</button>
          <label>Fecha<input type="date" disabled={busy} value={date} onChange={(event) => changeDate(event.target.value)} /></label>
          <button className="icon-button" type="button" disabled={busy} onClick={() => changeDate(moveDate(date, 1))} aria-label="Día siguiente">→</button>
          <button className="button ghost compact" type="button" disabled={busy} onClick={() => changeDate(localDateKey())}>Hoy</button>
          <StatusPill tone={sessionTone(session?.status)}>{sessionLabel(session?.status)}</StatusPill>
        </div>
      </SectionCard>

      {!session ? (
        <section className="attendance-create-panel">
          <div><span className="eyebrow">NUEVA LISTA</span><h2>No existe asistencia para esta fecha</h2><p>{students.length ? `TEDVIO preparará ${students.length} alumnos activos con estado Presente por defecto.` : 'El grupo todavía no tiene alumnos activos.'}</p></div>
          <div className="attendance-options compact-options">
            <label>Retardo después de<input type="number" min="0" max="120" disabled={busy} value={options.lateAfterMinutes} onChange={(event) => setOptions({ ...options, lateAfterMinutes: Number(event.target.value) })} /><span>minutos</span></label>
            <label className="toggle-field"><input type="checkbox" disabled={busy} checked={options.autoMarkAbsent} onChange={(event) => setOptions({ ...options, autoMarkAbsent: event.target.checked })} /> Completar ausencias al cierre</label>
          </div>
          <button className="button primary" type="button" disabled={!students.length || busy || !online} onClick={() => createMutation.mutate({ options, revision: pending?.revision ?? 0 })}>{createMutation.isPending ? 'Creando lista…' : 'Crear lista de asistencia'}</button>
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
              <div><span className="eyebrow">CAPTURA</span><h2>{students.length} alumnos activos</h2><p>{locked ? 'La lista está cerrada. Reábrela para corregir registros.' : needsSave ? 'Hay cambios pendientes de guardar.' : 'La captura visible está guardada.'}</p></div>
              <div className="page-actions">
                {!locked ? <><button className="button ghost compact" type="button" disabled={busy} onClick={() => setAll('present')}>Todos presentes</button><button className="button ghost compact" type="button" disabled={busy} onClick={() => confirm('absent')}>Todos falta</button></> : null}
              </div>
            </div>

            <div className="attendance-options">
              <label>Retardo después de <input type="number" min="0" max="120" disabled={locked || busy} value={options.lateAfterMinutes} onChange={(event) => { setOptions({ ...options, lateAfterMinutes: Number(event.target.value) }); }} /> minutos</label>
              <label className="toggle-field"><input type="checkbox" disabled={locked || busy} checked={options.autoMarkAbsent} onChange={(event) => { setOptions({ ...options, autoMarkAbsent: event.target.checked }); }} /> Completar ausencias al cierre</label>
              <label className="attendance-general-note">Nota de la lista<input disabled={locked || busy} value={options.notes} onChange={(event) => { setOptions({ ...options, notes: event.target.value }); }} placeholder="Tema, actividad o incidencia general" /></label>
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
                        {statuses.map((status) => <button key={status.key} type="button" disabled={locked || busy} className={value.status === status.key ? `active ${status.key}` : ''} aria-pressed={value.status === status.key} title={status.label} onClick={() => { setDraft((current) => ({ ...current, [student.id]: { ...value, status: status.key } })); }}><b>{status.short}</b><span>{status.label}</span></button>)}
                      </div>
                      <input aria-label={`Observación de ${student.full_name}`} className="attendance-note" disabled={locked || busy} value={value.note} onChange={(event) => { setDraft((current) => ({ ...current, [student.id]: { ...value, note: event.target.value } })); }} placeholder="Observación opcional" />
                    </article>
                  );
                })}
              </div>
            ) : <EmptyState icon="search" title="Sin coincidencias" detail="Prueba con otro nombre o matrícula." />}
          </SectionCard>

          <div className="attendance-savebar">
            <div><StatusPill tone={sessionTone(session.status)}>{sessionLabel(session.status)}</StatusPill><span>{busy ? 'Guardando…' : needsSave ? 'Cambios pendientes' : 'Lista guardada'}</span></div>
            <div>
              {!locked ? <button className="button secondary" type="button" disabled={busy || !online || conflict} onClick={() => commit('save')}>{commitMutation.isPending ? 'Guardando…' : 'Guardar'}</button> : null}
              {session.status === 'open' ? <button className="button ghost" type="button" disabled={busy || !online || conflict} onClick={() => commit('paused')}>Pausar</button> : null}
              {session.status === 'paused' ? <button className="button primary" type="button" disabled={busy || !online || conflict} onClick={() => commit('open')}>Reanudar</button> : null}
              {session.status !== 'closed' ? <button className="button danger" type="button" disabled={busy || !online || conflict} onClick={() => confirm('closed')}>Cerrar lista</button> : <button className="button primary" type="button" disabled={busy || !online} onClick={() => confirm('reopen')}>Reabrir lista</button>}
            </div>
          </div>
        </>
      )}
      {dialog ? <ActionDialog eyebrow="TEDVIO · ASISTENCIA" title={dialog === 'closed' ? '¿Guardar y cerrar esta lista?' : dialog === 'reopen' ? '¿Reabrir la lista?' : dialog === 'absent' ? '¿Marcar falta a todo el grupo?' : '¿Descartar esta captura?'}
        detail={dialog === 'closed' ? 'Se guardarán los estados y observaciones visibles. Después, la lista quedará protegida hasta que la reabras.' : dialog === 'reopen' ? 'Podrás corregir estados y observaciones. Los registros guardados se conservarán.' : dialog === 'absent' ? `Cambiará el estado de los ${students.length} alumnos, incluidos los que no aparecen en la búsqueda. Las observaciones se conservarán.` : 'Se quitarán tus cambios pendientes de esta fecha y se mostrará la versión guardada. Esta acción no se puede deshacer.'}
        confirmLabel={dialog === 'closed' ? 'Guardar y cerrar' : dialog === 'reopen' ? 'Reabrir lista' : dialog === 'absent' ? 'Marcar todos falta' : 'Descartar cambios'}
        busy={busy} danger={dialog !== 'reopen'} error={commitMutation.error?.message}
        onDismiss={() => setDialog(null)} onConfirm={() => {
          if (busy) return;
          if (dialog === 'discard') { queryClient.setQueryData(draftKey, null); setDialog(null); setNotice('Se muestra la versión guardada.'); }
          else if (dialog === 'absent') { setAll('absent'); setDialog(null); }
          else commit(dialog === 'reopen' ? 'open' : 'closed');
        }} /> : null}
    </div>
  );
}

export function AttendancePage() {
  const { groupId } = useParams();
  const auth = useAuth();
  const [params] = useSearchParams();
  const requestedDate = params.get('date') || '';
  const date = validAttendanceDate(requestedDate) ? requestedDate : localDateKey();
  return groupId ? <AttendanceEditor key={`${auth.user?.id}:${groupId}:${date}`} groupId={groupId} date={date} /> : <AttendanceLanding />;
}
