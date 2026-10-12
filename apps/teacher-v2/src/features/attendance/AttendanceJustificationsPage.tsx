import { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthProvider';
import { useReliability } from '../reliability/ReliabilityProvider';
import { useTeacherHome } from '../../core/useTeacherHome';
import { localDateKey } from '../../core/attendance';
import { validAttendanceDate } from '../../core/attendance-draft';
import { changeJustifications, previewJustifications, type JustificationFilters } from '../../core/attendance-justifications';
import { ActionDialog } from '../../shared/ActionDialog';
import { EmptyState, ErrorPanel, PageHeader, SectionCard, StatusPill } from '../../shared/components';
import '../../styles/attendance-justifications.css';

export function AttendanceJustificationsPage() {
  const auth = useAuth();
  const { online } = useReliability();
  const home = useTeacherHome();
  const client = useQueryClient();
  const [params] = useSearchParams();
  const today = localDateKey();
  const [groupIds, setGroupIds] = useState<string[]>(params.get('group') ? [params.get('group')!] : []);
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const [search, setSearch] = useState(params.get('search') || '');
  const [status, setStatus] = useState<'absent' | 'justified'>('absent');
  const [filters, setFilters] = useState<JustificationFilters | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState('');
  const [dialog, setDialog] = useState(false);
  const [allowClosed, setAllowClosed] = useState(false);
  const [notice, setNotice] = useState('');
  const attempt = useRef<{ fingerprint: string; id: string } | null>(null);
  const preview = useQuery({
    queryKey: ['attendance-justifications', auth.user?.id, filters],
    enabled: Boolean(auth.user && filters),
    queryFn: () => previewJustifications(filters!),
    staleTime: 0,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
  const rows = preview.data?.rows || [];
  const chosen = rows.filter(row => selected.has(row.id));
  const hasClosed = chosen.some(row => row.session_status === 'closed');
  const eligible = rows.filter(row => !row.period_closed && !row.qr_active);
  const action = filters?.status === 'justified' ? 'revoke' : 'justify';
  const validDates = validAttendanceDate(from) && validAttendanceDate(to) && from <= to && (Date.parse(to) - Date.parse(from)) / 86_400_000 <= 366;
  const currentFilters = { groupIds, from, to, search, status };
  const changedFilters = filters && JSON.stringify(filters) !== JSON.stringify(currentFilters);
  const mutation = useMutation({
    mutationKey: ['attendance-write', auth.user?.id, 'justifications'],
    mutationFn: async () => {
      if (!online || !chosen.length || changedFilters) throw new Error('Consulta y selecciona las faltas antes de confirmar.');
      const input = { action: action as 'justify' | 'revoke', rows: chosen.map(({ id, revision }) => ({ id, revision })).sort((a, b) => a.id.localeCompare(b.id)), reason: reason.trim(), allowClosed };
      const fingerprint = JSON.stringify(input);
      if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, id: crypto.randomUUID() };
      return changeJustifications({ ...input, requestId: attempt.current.id });
    },
    onSuccess: async result => {
      const verb = action === 'justify' ? 'justificadas' : 'restablecidas como faltas';
      setNotice(`${result.changed} ausencias ${verb}. Operación ${result.request_id.slice(0, 8)} registrada.`);
      setDialog(false); setSelected(new Set()); setReason(''); setAllowClosed(false); attempt.current = null;
      // Existing drafts remain intact; the attendance editor detects their new
      // remote revision instead of silently clearing or overwriting them.
      await Promise.all([
        client.invalidateQueries({ queryKey: ['attendance-day', auth.user?.id] }),
        client.invalidateQueries({ queryKey: ['group-detail', auth.user?.id] }),
        client.invalidateQueries({ queryKey: ['teacher-home', auth.user?.id] }),
        client.invalidateQueries({ queryKey: ['attendance-justifications', auth.user?.id] }),
        client.invalidateQueries({ predicate: q => q.queryKey[1] === auth.user?.id && ['teacher-report-data','teacher-student360','teacher-student360-directory','teacher-gradebook-detail'].includes(String(q.queryKey[0])) }),
      ]);
    },
  });
  const busy = mutation.isPending;
  function consult() {
    if (!validDates || busy) return;
    setSelected(new Set()); setAllowClosed(false); mutation.reset(); setNotice('');
    if (JSON.stringify(filters) === JSON.stringify(currentFilters)) void preview.refetch();
    else setFilters(currentFilters);
  }
  function toggle(id: string) { setSelected(previous => { const next = new Set(previous); next.has(id) ? next.delete(id) : next.add(id); return next; }); }
  const groups = home.data?.dashboard.groups || [];

  return <div className="view-stack justification-page">
    <PageHeader eyebrow="ASISTENCIA · CORRECCIONES" title="Justificar faltas"
      detail="Revisa varias fechas y confirma las ausencias de uno o varios alumnos en una sola operación."
      actions={<Link className="button secondary" to="/attendance">Volver a asistencia</Link>} />
    {notice ? <div className="success-strip" role="status">{notice}</div> : null}
    <SectionCard>
      <fieldset className="justification-filters" disabled={busy}>
        <details className="justification-groups"><summary>Grupos incluidos: {groupIds.length ? groupIds.length : 'todos mis grupos'}</summary>
          <label><input type="checkbox" checked={!groupIds.length} onChange={() => setGroupIds([])} />Todos mis grupos</label>
          <div>{groups.map(group => <label key={group.id}><input type="checkbox" checked={groupIds.includes(group.id)} onChange={() => setGroupIds(previous => previous.includes(group.id) ? previous.filter(id => id !== group.id) : [...previous, group.id].sort())} />{group.subject} · {group.group_name || group.name}</label>)}</div>
        </details>
        <label>Desde<input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
        <label>Hasta<input type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
        <label className="justification-search">Alumno o matrícula<input value={search} maxLength={120} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre o matrícula" /></label>
        <label>Consultar<select value={status} onChange={e => setStatus(e.target.value as 'absent' | 'justified')}><option value="absent">Faltas por justificar</option><option value="justified">Justificadas para revisar</option></select></label>
        <button type="button" className="button primary" disabled={!validDates || !online || preview.isFetching} onClick={consult}>{preview.isFetching ? 'Consultando…' : 'Consultar faltas'}</button>
      </fieldset>
      {!validDates ? <p role="status">Selecciona un periodo válido de hasta 366 días.</p> : null}
      {!online ? <p role="status">El guardado requiere conexión. No se aplicarán cambios mientras estés desconectado.</p> : null}
      {changedFilters ? <p role="status">Cambiaste los filtros. Pulsa Consultar faltas para revisar los resultados nuevos.</p> : null}
    </SectionCard>
    {preview.isError ? <ErrorPanel title="No se pudieron consultar las faltas" detail={preview.error.message} onRetry={consult} /> : null}
    {preview.data && !changedFilters ? <SectionCard>
      <div className="section-heading"><div><h2>{rows.length} {filters?.status === 'justified' ? 'justificadas' : 'faltas'} encontradas</h2><p>Solo aparecen registros existentes. Un día sin lista o sin registro no se convierte en falta.</p></div><StatusPill>{chosen.length} seleccionadas</StatusPill></div>
      {preview.data.truncated ? <p role="alert">Hay más de 500 resultados. Reduce las fechas o busca un alumno; no se permite confirmar un listado incompleto.</p> : null}
      {rows.length ? <>
        <label className="justification-select-all"><input type="checkbox" disabled={busy || preview.data.truncated || !eligible.length} checked={eligible.length > 0 && selected.size === eligible.length} onChange={() => setSelected(selected.size === eligible.length ? new Set() : new Set(eligible.map(row => row.id)))} />Seleccionar todas las elegibles</label>
        <div className="justification-rows">{rows.map(row => <label key={row.id} className={`justification-row${selected.has(row.id) ? ' selected' : ''}`}>
          <input type="checkbox" aria-label={`Seleccionar ${row.full_name}, ${row.attendance_date}, ${row.group_name}`} checked={selected.has(row.id)} disabled={busy || row.period_closed || row.qr_active || preview.data?.truncated} onChange={() => toggle(row.id)} />
          <span><b>{row.full_name}</b><small>{row.enrollment} · {row.subject} · {row.group_name}</small><small>{row.attendance_date} · {row.session_status === 'closed' ? 'Lista cerrada' : 'Lista abierta'}</small>{row.note ? <small>Observación conservada: {row.note}</small> : null}</span>
          <StatusPill tone={row.period_closed || row.qr_active ? 'amber' : 'neutral'}>{row.period_closed ? 'Periodo cerrado' : row.qr_active ? 'QR en curso' : row.status === 'justified' ? 'Justificada' : 'Falta'}</StatusPill>
        </label>)}</div>
        <div className="justification-summary"><label>Motivo de la corrección<textarea maxLength={1000} rows={2} disabled={busy} value={reason} onChange={e => setReason(e.target.value)} placeholder="Ejemplo: justificante institucional recibido, folio 123. No incluyas diagnósticos médicos." /></label>
          <p>Se conserva la regla actual de TEDVIO: las justificadas cuentan a favor del porcentaje de asistencia, pero permanecen identificadas como J, no como presencia física.</p>
          <button type="button" className={`button ${action === 'revoke' ? 'danger' : 'primary'}`} disabled={!chosen.length || reason.trim().length < 3 || busy || !online || preview.data.truncated} onClick={() => { mutation.reset(); setAllowClosed(false); setDialog(true); }}>{action === 'justify' ? 'Revisar justificación' : 'Revisar revocación'} · {chosen.length}</button>
        </div>
      </> : <EmptyState icon="attendance" title="Sin coincidencias" detail="Prueba con otro periodo, grupo o alumno." />}
    </SectionCard> : !filters ? <EmptyState icon="attendance" title="Consulta las ausencias" detail="Elige el periodo y busca al alumno. No es necesario abrir las listas día por día." /> : null}
    {dialog ? <ActionDialog eyebrow="TEDVIO · CORRECCIÓN AUDITADA" title={action === 'justify' ? `¿Justificar ${chosen.length} faltas?` : `¿Revocar ${chosen.length} justificaciones?`}
      detail={`${new Set(chosen.map(row => row.student_id)).size} alumnos · ${new Set(chosen.map(row => row.group_id)).size} grupos. Se aplicará todo el lote o ninguno si un registro cambió. Las observaciones no se borrarán.`}
      confirmLabel={action === 'justify' ? 'Confirmar justificación' : 'Confirmar revocación'} danger={action === 'revoke'} busy={busy}
      error={mutation.error?.message} confirmDisabled={!online || (hasClosed && !allowClosed)} onDismiss={() => setDialog(false)} onConfirm={() => mutation.mutate()}>
      <p><b>Motivo:</b> {reason}</p>
      {hasClosed ? <label className="justification-closed-confirm"><input type="checkbox" checked={allowClosed} disabled={busy} onChange={e => setAllowClosed(e.target.checked)} />Autorizo corregir estos registros de listas cerradas, manteniendo las listas cerradas. No se modificarán periodos académicos cerrados.</label> : null}
    </ActionDialog> : null}
  </div>;
}
