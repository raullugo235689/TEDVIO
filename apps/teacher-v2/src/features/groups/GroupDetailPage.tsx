import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthProvider';
import {
  fetchGroupDetail,
  groupDetailKey,
  groupWorkspaceKey,
  importStudents,
  parseRosterText,
  saveStudent,
  setStudentActive,
  type StudentDraft,
} from '../../core/groups';
import type { AttendanceRecordRow, AttendanceSessionRecord, StudentRecord } from '../../core/types';
import { EmptyState, ErrorPanel, LoadingScreen, MetricCard, PageHeader, SectionCard, StatusPill } from '../../shared/components';
import { Icon } from '../../shared/icons';

function formatDate(value: string): string {
  return new Date(`${value}T12:00:00`).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function sessionTone(status: string): string {
  if (status === 'open') return 'green';
  if (status === 'paused') return 'amber';
  return 'blue';
}

function sessionLabel(status: string): string {
  if (status === 'open') return 'Abierta';
  if (status === 'paused') return 'Pausada';
  return 'Cerrada';
}

function studentAttendanceRate(studentId: string, records: AttendanceRecordRow[]): number | null {
  const rows = records.filter((record) => record.student_id === studentId);
  if (!rows.length) return null;
  const attended = rows.filter((record) => record.status === 'present' || record.status === 'late' || record.status === 'justified').length;
  return Math.round((attended / rows.length) * 100);
}

function SessionRow({ session, records, groupId }: { session: AttendanceSessionRecord; records: AttendanceRecordRow[]; groupId: string }) {
  const rows = records.filter((record) => record.attendance_session_id === session.id);
  const count = (status: string) => rows.filter((record) => record.status === status).length;
  return (
    <article className="attendance-history-card">
      <header>
        <div><span className="eyebrow">{formatDate(session.attendance_date)}</span><h3>{rows.length} registros</h3></div>
        <StatusPill tone={sessionTone(session.status)}>{sessionLabel(session.status)}</StatusPill>
      </header>
      <div className="attendance-history-metrics">
        <span><small>Presentes</small><b>{count('present')}</b></span>
        <span><small>Retardos</small><b>{count('late')}</b></span>
        <span><small>Faltas</small><b>{count('absent')}</b></span>
        <span><small>Justificadas</small><b>{count('justified')}</b></span>
      </div>
      <footer>
        <small>{session.notes || 'Sin nota general.'}</small>
        <Link className="button ghost compact" to={`/attendance/${groupId}?date=${session.attendance_date}`}>Abrir lista <Icon name="arrow" /></Link>
      </footer>
    </article>
  );
}

export function GroupDetailPage() {
  const { groupId = '' } = useParams();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'students' | 'attendance'>('students');
  const [query, setQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [studentDraft, setStudentDraft] = useState<StudentDraft | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [notice, setNotice] = useState('');

  const detail = useQuery({
    queryKey: groupDetailKey(auth.user?.id, groupId),
    queryFn: () => {
      if (!auth.user || !groupId) throw new Error('No hay un grupo válido.');
      return fetchGroupDetail(auth.user, groupId);
    },
    enabled: Boolean(auth.user && groupId),
  });

  async function refreshRelated() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: groupDetailKey(auth.user?.id, groupId) }),
      queryClient.invalidateQueries({ queryKey: groupWorkspaceKey(auth.user?.id) }),
      queryClient.invalidateQueries({ queryKey: ['teacher-home', auth.user?.id] }),
    ]);
  }

  const saveMutation = useMutation({
    mutationFn: (draft: StudentDraft) => {
      if (!auth.user) throw new Error('Tu sesión expiró.');
      return saveStudent(auth.user, groupId, draft);
    },
    onSuccess: async () => {
      setStudentDraft(null);
      setNotice('Alumno guardado correctamente.');
      await refreshRelated();
    },
  });

  const importMutation = useMutation({
    mutationFn: () => {
      if (!auth.user) throw new Error('Tu sesión expiró.');
      return importStudents(auth.user, groupId, parseRosterText(bulkText));
    },
    onSuccess: async (count) => {
      setBulkText('');
      setBulkOpen(false);
      setNotice(`${count} alumno${count === 1 ? '' : 's'} importado${count === 1 ? '' : 's'}.`);
      await refreshRelated();
    },
  });

  const activeMutation = useMutation({
    mutationFn: ({ student, active }: { student: StudentRecord; active: boolean }) => {
      if (!auth.user) throw new Error('Tu sesión expiró.');
      return setStudentActive(auth.user, groupId, student.id, active);
    },
    onSuccess: async (_, variables) => {
      setNotice(variables.active ? 'Alumno reactivado.' : 'Alumno retirado de la lista activa.');
      await refreshRelated();
    },
  });

  const data = detail.data;
  const visibleStudents = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('es-MX');
    return (data?.students || []).filter((student) => {
      if (!showInactive && !student.active) return false;
      if (!needle) return true;
      return `${student.enrollment} ${student.full_name}`.toLocaleLowerCase('es-MX').includes(needle);
    });
  }, [data?.students, query, showInactive]);

  const attendanceAverage = useMemo(() => {
    const values = (data?.students || [])
      .filter((student) => student.active)
      .map((student) => studentAttendanceRate(student.id, data?.attendance_records || []))
      .filter((value): value is number => value !== null);
    return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
  }, [data?.students, data?.attendance_records]);

  if (detail.isLoading) return <LoadingScreen label="Abriendo el grupo…" />;
  if (detail.isError) return <ErrorPanel title="No pude abrir el grupo" detail={detail.error.message} onRetry={() => detail.refetch()} />;
  if (!data) return null;

  const activeStudents = data.students.filter((student) => student.active);
  const groupTitle = data.group.group_name || data.group.name;

  return (
    <div className="view-stack">
      <PageHeader
        eyebrow="CENTRO DE GRUPO"
        title={groupTitle}
        detail={[data.group.university, data.group.program, data.group.subject, data.group.term].filter(Boolean).join(' · ')}
        actions={
          <div className="page-actions">
            <Link className="button ghost" to="/groups">← Grupos</Link>
            <Link className="button primary" to={`/attendance/${groupId}`}>✓ Tomar asistencia</Link>
          </div>
        }
      />

      {notice ? <div className="success-strip"><Icon name="check" /><span>{notice}</span><button type="button" onClick={() => setNotice('')}>×</button></div> : null}
      {saveMutation.isError || importMutation.isError || activeMutation.isError ? (
        <ErrorPanel title="No se pudo completar la operación" detail={(saveMutation.error || importMutation.error || activeMutation.error)?.message || 'Intenta nuevamente.'} />
      ) : null}

      <section className="metrics-grid group-detail-metrics">
        <MetricCard icon="groups" label="Alumnos activos" value={String(activeStudents.length)} detail={`${data.students.length - activeStudents.length} inactivos`} tone="blue" />
        <MetricCard icon="attendance" label="Asistencia" value={attendanceAverage === null ? '—' : `${attendanceAverage}%`} detail="Promedio de las últimas 20 listas" tone={attendanceAverage !== null && attendanceAverage < 80 ? 'amber' : 'green'} />
        <MetricCard icon="calendar" label="Listas" value={String(data.attendance_sessions.length)} detail="Historial reciente disponible" tone="violet" />
        <MetricCard icon="clock" label="Última lista" value={data.attendance_sessions[0] ? formatDate(data.attendance_sessions[0].attendance_date) : '—'} detail={data.attendance_sessions[0] ? sessionLabel(data.attendance_sessions[0].status) : 'Sin registros'} tone="neutral" />
      </section>

      <div className="module-tabs" role="tablist" aria-label="Secciones del grupo">
        <button type="button" className={tab === 'students' ? 'active' : ''} onClick={() => setTab('students')}>Alumnos</button>
        <button type="button" className={tab === 'attendance' ? 'active' : ''} onClick={() => setTab('attendance')}>Historial de asistencia</button>
      </div>

      {tab === 'students' ? (
        <SectionCard>
          <div className="section-heading">
            <div><span className="eyebrow">PADRÓN</span><h2>Alumnos del grupo</h2><p>Agrega, corrige, importa o desactiva alumnos sin salir del frontend unificado.</p></div>
            <div className="page-actions"><button className="button ghost" type="button" onClick={() => setBulkOpen((value) => !value)}>Importar lista</button><button className="button primary" type="button" onClick={() => setStudentDraft({ enrollment: '', fullName: '', active: true })}>＋ Alumno</button></div>
          </div>

          {studentDraft ? (
            <form className="editor-panel" onSubmit={(event) => { event.preventDefault(); saveMutation.mutate(studentDraft); }}>
              <header><div><span className="eyebrow">{studentDraft.id ? 'EDITAR ALUMNO' : 'NUEVO ALUMNO'}</span><h3>{studentDraft.id ? 'Actualizar padrón' : 'Agregar al grupo'}</h3></div><button type="button" className="icon-button" onClick={() => setStudentDraft(null)} aria-label="Cerrar">×</button></header>
              <div className="form-grid two">
                <label>Matrícula<input value={studentDraft.enrollment} onChange={(event) => setStudentDraft({ ...studentDraft, enrollment: event.target.value })} required /></label>
                <label>Nombre completo<input value={studentDraft.fullName} onChange={(event) => setStudentDraft({ ...studentDraft, fullName: event.target.value })} required /></label>
              </div>
              <footer><button className="button ghost" type="button" onClick={() => setStudentDraft(null)}>Cancelar</button><button className="button primary" type="submit" disabled={saveMutation.isPending}>{saveMutation.isPending ? 'Guardando…' : 'Guardar alumno'}</button></footer>
            </form>
          ) : null}

          {bulkOpen ? (
            <div className="editor-panel bulk-panel">
              <header><div><span className="eyebrow">IMPORTACIÓN RÁPIDA</span><h3>Pega matrícula y nombre</h3><p>Una fila por alumno, separados por coma, punto y coma o tabulador.</p></div><button type="button" className="icon-button" onClick={() => setBulkOpen(false)} aria-label="Cerrar">×</button></header>
              <textarea rows={8} value={bulkText} onChange={(event) => setBulkText(event.target.value)} placeholder={'20260001, Ana López García\n20260002, Carlos Pérez Soto'} />
              <footer><span>{parseRosterText(bulkText).length} filas válidas</span><button className="button primary" type="button" disabled={importMutation.isPending} onClick={() => importMutation.mutate()}>{importMutation.isPending ? 'Importando…' : 'Importar alumnos'}</button></footer>
            </div>
          ) : null}

          <div className="toolbar-v2">
            <label className="search-field"><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar nombre o matrícula" aria-label="Buscar alumnos" /></label>
            <label className="toggle-field"><input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} /> Mostrar inactivos</label>
            <StatusPill tone="blue">{visibleStudents.length} alumnos</StatusPill>
          </div>

          {visibleStudents.length ? (
            <div className="data-table-wrap">
              <table className="data-table roster-table">
                <thead><tr><th>Matrícula</th><th>Alumno</th><th>Asistencia</th><th>Estado</th><th /></tr></thead>
                <tbody>
                  {visibleStudents.map((student) => {
                    const rate = studentAttendanceRate(student.id, data.attendance_records);
                    return (
                      <tr key={student.id} className={student.active ? '' : 'inactive-row'}>
                        <td data-label="Matrícula"><strong>{student.enrollment}</strong></td>
                        <td data-label="Alumno">{student.full_name}</td>
                        <td data-label="Asistencia">{rate === null ? '—' : `${rate}%`}</td>
                        <td data-label="Estado"><StatusPill tone={student.active ? 'green' : 'neutral'}>{student.active ? 'Activo' : 'Inactivo'}</StatusPill></td>
                        <td className="row-actions">
                          <button className="button ghost compact" type="button" onClick={() => setStudentDraft({ id: student.id, enrollment: student.enrollment, fullName: student.full_name, active: student.active })}>Editar</button>
                          <button className="button ghost compact" type="button" disabled={activeMutation.isPending} onClick={() => {
                            if (student.active && !window.confirm(`¿Retirar a ${student.full_name} de la lista activa?`)) return;
                            activeMutation.mutate({ student, active: !student.active });
                          }}>{student.active ? 'Desactivar' : 'Reactivar'}</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <EmptyState icon="groups" title="No encontramos alumnos" detail={data.students.length ? 'Ajusta la búsqueda o activa la visualización de inactivos.' : 'Agrega el primer alumno o importa la lista completa.'} />}
        </SectionCard>
      ) : (
        <SectionCard>
          <div className="section-heading"><div><span className="eyebrow">ASISTENCIA</span><h2>Últimas listas</h2><p>Consulta el estado y vuelve a abrir cualquier fecha dentro del módulo nuevo.</p></div><Link className="button primary" to={`/attendance/${groupId}`}>Nueva lista</Link></div>
          {data.attendance_sessions.length ? <div className="attendance-history-grid">{data.attendance_sessions.map((session) => <SessionRow key={session.id} session={session} records={data.attendance_records} groupId={groupId} />)}</div> : <EmptyState icon="attendance" title="Sin listas todavía" detail="Crea la primera asistencia para comenzar el historial del grupo." action={<Link className="button primary" to={`/attendance/${groupId}`}>Tomar asistencia</Link>} />}
        </SectionCard>
      )}
    </div>
  );
}
