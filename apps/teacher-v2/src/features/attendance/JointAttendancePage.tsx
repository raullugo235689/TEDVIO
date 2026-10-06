import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthProvider';
import { useReliability } from '../reliability/ReliabilityProvider';
import { useTeacherHome } from '../../core/useTeacherHome';
import { useAcademicDraft } from '../../core/useAcademicDraft';
import { localDateKey } from '../../core/attendance';
import { groupName, groupSubject } from '../../core/academic';
import { groupAccent } from '../../core/group-identity';
import { createJointAttendance, closeJointAttendance, fetchJointAttendance, recentJointAttendance, jointEventKey, jointAttendanceUrl, subscribeJointAttendance, type JointAttendanceDraft } from '../../core/joint-attendance';
import { ErrorPanel, LoadingScreen, PageHeader, SectionCard, StatusPill } from '../../shared/components';
import { InstitutionIdentity } from '../../shared/InstitutionIdentity';
import { ActionDialog } from '../../shared/ActionDialog';

function useClock() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = window.setTimeout(() => setNow(Date.now()), 1000); return () => window.clearTimeout(timer); }, [now]);
  return now;
}
function QRCode({ url }: { url: string }) {
  const [image, setImage] = useState('');
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    setImage(''); setError(false);
    void import('qrcode').then(qr => qr.toDataURL(url, { width: 480, margin: 3, errorCorrectionLevel: 'M', color: { dark: '#102044', light: '#ffffff' } })).then(value => { if (active) setImage(value); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [url]);
  return <div className="joint-qr">{image ? <img src={image} width="480" height="480" alt="Código QR para registrar asistencia" /> : <p role="status">{error ? 'No se pudo generar el QR. Comparte el enlace de abajo.' : 'Preparando QR…'}</p>}</div>;
}
function EventCreator() {
  const auth = useAuth();
  const home = useTeacherHome();
  const { online } = useReliability();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [params] = useSearchParams();
  const [initial] = useState<JointAttendanceDraft>(() => ({ requestId: crypto.randomUUID(), title: 'Clase en línea', date: localDateKey(), groupIds: params.get('group') ? [params.get('group')!] : [], duration: 15, lateAfter: 10, autoAbsent: true }));
  const persisted = useAcademicDraft(['joint-attendance-draft', auth.user?.id], initial, { persistInSession: true });
  const [draft, setDraft] = useState(persisted.value);
  const [search, setSearch] = useState('');
  const busyRef = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const groups = home.data?.dashboard.groups || [];
  const selected = groups.filter(g => draft.groupIds.includes(g.id));
  const filtered = useMemo(() => groups.filter(g => `${groupName(g)} ${groupSubject(g)} ${g.university || ''}`.toLocaleLowerCase('es-MX').includes(search.trim().toLocaleLowerCase('es-MX'))), [groups, search]);
  const recent = useQuery({ queryKey: ['joint-attendance-list', auth.user?.id], queryFn: () => recentJointAttendance(auth.user!.id), enabled: Boolean(auth.user) });
  const mutation = useMutation({ mutationKey: ['joint-attendance-write', auth.user?.id], mutationFn: createJointAttendance,
    onSuccess: async (id) => {
      persisted.clear();
      await Promise.all([client.invalidateQueries({ queryKey: ['joint-attendance-list', auth.user?.id] }), client.invalidateQueries({ queryKey: ['teacher-home', auth.user?.id] }), client.invalidateQueries({ queryKey: ['attendance-day', auth.user?.id] })]);
      if (mounted.current) navigate(`/attendance-joint/${id}`, { replace: true });
    }, onSettled: () => { busyRef.current = false; },
  });
  function edit(patch: Partial<JointAttendanceDraft>) {
    if (busyRef.current) return;
    const next = { ...draft, ...patch, requestId: crypto.randomUUID() };
    setDraft(next); persisted.set(next); mutation.reset();
  }
  const valid = draft.title.trim().length > 0 && draft.title.trim().length <= 120 && selected.length > 0 && selected.length <= 12 && selected.length === draft.groupIds.length && selected.every(g => Number(g.students) > 0) && draft.date === localDateKey() && draft.lateAfter >= 0 && draft.lateAfter <= 120;
  if (home.isLoading) return <LoadingScreen label="Preparando tus grupos…" />;
  if (home.isError) return <ErrorPanel title="No pude cargar tus grupos" detail={home.error.message} onRetry={() => home.refetch()} />;
  return <div className="view-stack joint-attendance">
    <PageHeader eyebrow="ASISTENCIA · QR Y ENLACE" title="Asistencia conjunta" detail="Una entrada para tu clase. Cada alumno queda registrado en su grupo." actions={<Link className="button ghost" to="/attendance">Listas por grupo</Link>} />
    {recent.data?.length ? <SectionCard className="joint-recent"><h2>Registros recientes</h2><div>{recent.data.map(event => <Link key={event.id} to={`/attendance-joint/${event.id}`}><span><strong>{event.title}</strong><small>{event.attendance_date}</small></span><StatusPill tone={event.status === 'closed' ? 'neutral' : 'teal'}>{event.status === 'closed' ? 'Cerrada' : Date.parse(event.expires_at) <= Date.now() ? 'Por cerrar' : 'Abierta'}</StatusPill></Link>)}</div></SectionCard> : null}
    {recent.isError ? <ErrorPanel title="No pude consultar las asistencias recientes" detail={recent.error.message} onRetry={() => recent.refetch()} /> : null}
    <form onSubmit={event => { event.preventDefault(); if (!valid || !online || busyRef.current) return; busyRef.current = true; persisted.set(draft); mutation.mutate(draft); }}>
      <div className="joint-setup-grid">
        <SectionCard><div className="section-heading"><div><span className="eyebrow">01 · PARTICIPANTES</span><h2>Selecciona tus grupos</h2><p>Puedes incluir de 1 a 12 grupos.</p></div><StatusPill tone="teal">{selected.length} seleccionados</StatusPill></div>
          <label className="joint-field">Buscar grupo<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Materia, grupo o universidad" /></label>
          <div className="joint-group-picker">{filtered.map(group => <label className={`joint-group-option${draft.groupIds.includes(group.id) ? ' selected' : ''}`} data-group-color={groupAccent(group.id)} key={group.id}>
            <input type="checkbox" aria-label={`${groupName(group)} · ${groupSubject(group)}`} checked={draft.groupIds.includes(group.id)} disabled={mutation.isPending || Number(group.students) < 1 || (!draft.groupIds.includes(group.id) && draft.groupIds.length >= 12)} onChange={event => edit({ groupIds: event.target.checked ? [...draft.groupIds, group.id] : draft.groupIds.filter(id => id !== group.id) })} />
            <div><strong>{groupSubject(group)}</strong><span>{groupName(group)} · {Number(group.students || 0)} alumnos</span><InstitutionIdentity name={group.university} logoUrl={group.institution_logo_url} /></div>
          </label>)}</div>{!filtered.length ? <p className="joint-muted">No hay grupos que coincidan. Agrega alumnos desde Grupos para habilitar el registro.</p> : null}
        </SectionCard>
        <SectionCard><span className="eyebrow">02 · REGISTRO</span><h2>Configura la entrada</h2><div className="joint-fields">
          <label className="joint-field">Nombre de la clase<input required maxLength={120} value={draft.title} disabled={mutation.isPending} onChange={event => edit({ title: event.target.value })} /></label>
          <div className="joint-date"><span>Fecha de asistencia</span><strong>{new Date(`${draft.date}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}</strong></div>
          {draft.date !== localDateKey() ? <p role="alert">Este borrador es de otra fecha. <button type="button" className="button ghost compact" onClick={() => edit({ date: localDateKey() })}>Usar fecha de hoy</button></p> : null}
          <label className="joint-field">Tiempo para registrarse<select value={draft.duration} disabled={mutation.isPending} onChange={event => edit({ duration: Number(event.target.value) })}>{[5,10,15,30,60,120,180].map(n => <option key={n} value={n}>{n} minutos</option>)}</select><small>El enlace deja de aceptar registros al terminar este tiempo.</small></label>
          <label className="joint-field">Retardo después de (minutos)<input type="number" required min={0} max={120} value={draft.lateAfter} disabled={mutation.isPending} onChange={event => edit({ lateAfter: Number(event.target.value) })} /><small>Se cuenta desde que inicias este registro.</small></label>
          <label className="joint-toggle"><input type="checkbox" checked={draft.autoAbsent} disabled={mutation.isPending} onChange={event => edit({ autoAbsent: event.target.checked })} /><span>Marcar faltas al cerrar<small>Solo a alumnos que todavía no tengan un registro en su lista.</small></span></label>
          <p className="joint-note">Las asistencias y justificaciones ya guardadas se conservan. Si una lista está cerrada o pausada, reábrela antes de incluirla.</p>
          {!online ? <p role="status" className="joint-note">Sin conexión. Tu configuración se conserva; vuelve a conectarte para iniciar.</p> : null}
          {mutation.isError ? <ErrorPanel title="No se pudo iniciar el registro" detail={mutation.error.message} /> : null}
          <button className="button primary joint-start" disabled={!valid || !online || mutation.isPending} type="submit">{mutation.isPending ? 'Preparando registro…' : 'Iniciar asistencia conjunta'}</button>
        </div></SectionCard>
      </div>
    </form>
  </div>;
}
function EventControl({ eventId }: { eventId: string }) {
  const auth = useAuth(); const client = useQueryClient(); const { online } = useReliability();
  const [closing, setClosing] = useState(false); const [projecting, setProjecting] = useState(false); const [notice, setNotice] = useState('');
  const now = useClock();
  const query = useQuery({ queryKey: jointEventKey(auth.user?.id, eventId), queryFn: () => fetchJointAttendance(eventId), refetchOnWindowFocus: true, enabled: Boolean(auth.user) });
  const [connected, setConnected] = useState(false);
  const isOpen = query.data?.event.status === 'open';
  useEffect(() => {
    if (!auth.user || !online || !isOpen) return;
    return subscribeJointAttendance(eventId, () => { void client.invalidateQueries({ queryKey: jointEventKey(auth.user?.id, eventId) }); }, setConnected);
  }, [auth.user?.id, eventId, client, online, isOpen]);
  const [offset, setOffset] = useState(0);
  useEffect(() => { if (query.data) setOffset(Date.parse(query.data.server_now) - Date.now()); }, [query.data]);
  const mutation = useMutation({ mutationFn: () => closeJointAttendance(eventId), onSuccess: async () => {
    await Promise.all([query.refetch(), client.invalidateQueries({ queryKey: ['joint-attendance-list', auth.user?.id] }), client.invalidateQueries({ queryKey: ['attendance-day', auth.user?.id] }), client.invalidateQueries({ queryKey: ['teacher-home', auth.user?.id] }), client.invalidateQueries({ queryKey: ['group-detail', auth.user?.id] })]); setClosing(false); setNotice('Asistencia cerrada. Las listas quedaron guardadas por grupo.');
  } });
  if (query.isLoading) return <LoadingScreen label="Abriendo el registro conjunto…" />;
  if (!query.data) return <ErrorPanel title="No pude abrir la asistencia" detail={query.error?.message || 'Comprueba tu conexión.'} onRetry={() => query.refetch()} />;
  const { event, groups, recent } = query.data;
  const closed = event.status === 'closed'; const seconds = Math.max(0, Math.ceil((Date.parse(event.expires_at) - now - offset) / 1000));
  const active = !closed && seconds > 0; const url = jointAttendanceUrl(event.token);
  const total = groups.reduce((n,g) => n + g.total, 0); const registered = groups.reduce((n,g) => n + g.registered, 0);
  const time = `${String(Math.floor(seconds / 60)).padStart(2,'0')}:${String(seconds % 60).padStart(2,'0')}`;
  async function copyLink() { try { await navigator.clipboard.writeText(url); setNotice('Enlace copiado. Pégalo en el chat de tu clase.'); } catch { setNotice('Selecciona el enlace y cópialo para compartirlo.'); } }
  const qrPanel = <><div className="joint-qr-heading"><StatusPill tone={active ? 'green' : 'neutral'}>{closed ? 'Asistencia cerrada' : active ? 'Registro abierto' : 'Tiempo agotado'}</StatusPill><span className="joint-countdown" aria-label="Tiempo restante">{time}</span></div>{active ? <QRCode url={url} /> : <div className="joint-finished"><strong>{closed ? 'Listas guardadas' : 'Terminó el registro'}</strong><p>{closed ? 'Puedes revisar y corregir cada lista desde Asistencia.' : 'El enlace ya no acepta entradas. Cierra la asistencia para finalizar las listas.'}</p></div>}<p className="joint-muted">{event.attendance_date} · {groups.length} grupos · Retardo después de {event.late_after_minutes} min</p>{active ? <><label className="joint-field">Enlace para alumnos<input readOnly value={url} onFocus={e => e.currentTarget.select()} /></label><button className="button secondary" type="button" onClick={() => void copyLink()}>Copiar enlace</button></> : null}</>;
  return <div className="view-stack joint-attendance">
    <PageHeader eyebrow="ASISTENCIA CONJUNTA" title={event.title} detail="Comparte el QR o pega el enlace en el chat de Zoom o Teams." actions={<><button className="button secondary" type="button" disabled={!online || query.isFetching} onClick={() => query.refetch()}>Actualizar</button><Link className="button ghost" to="/attendance-joint">Todos los registros</Link></>} />
    {notice ? <p className="success-strip" role="status">{notice}</p> : null}
    {!online || query.isError ? <ErrorPanel title="Sin actualización en vivo" detail="Los datos visibles pueden estar desactualizados. Comprueba tu conexión; el registro de alumnos depende de la conexión de cada uno." onRetry={() => query.refetch()} /> : null}
    {!closed ? <p className="joint-muted" role="status">{connected && online ? 'Actualización en vivo activa.' : 'Conectando actualización en vivo. Puedes pulsar Actualizar para consultar las entradas.'}</p> : null}
    <div className="joint-live-grid"><SectionCard className="joint-qr-panel">{qrPanel}<div className="joint-actions">{active ? <button className="button ghost" type="button" onClick={() => setProjecting(true)}>Mostrar solo QR</button> : null}{!closed ? <button className="button danger" type="button" disabled={!online || mutation.isPending} onClick={() => { mutation.reset(); setClosing(true); }}>Cerrar asistencia</button> : null}</div></SectionCard>
    <div className="view-stack"><SectionCard><div className="joint-total"><span>REGISTRADOS POR ESTE ENLACE</span><strong>{registered}<small> / {total}</small></strong><p>Los registros previos se conservan en las listas de cada grupo.</p></div><div className="joint-live-groups">{groups.map(group => <article key={group.group_id} data-group-color={groupAccent(group.group_id)}><div><span>{group.subject}</span><h2>{group.name}</h2><p>{group.university}</p></div><strong>{group.registered} <small>/ {group.total}</small></strong><progress value={group.registered} max={group.total || 1} aria-label={`Registrados de ${group.name}`} /><p className="joint-group-stats">En lista: {group.present} presentes · {group.late} retardos · {group.absent} faltas · {group.justified} justificadas</p><Link to={`/attendance/${group.group_id}?date=${event.attendance_date}`}>Ver lista del grupo →</Link>{group.session_status !== 'open' && !closed ? <p role="status">La lista de este grupo está {group.session_status === 'closed' ? 'cerrada' : 'pausada'} y no acepta registros.</p> : null}</article>)}</div></SectionCard>
      <SectionCard><h2>Últimos registros</h2>{recent.length ? <ol className="joint-arrivals">{recent.map((entry,index) => <li key={`${entry.registered_at}-${index}`}><div><strong>{entry.full_name}</strong><small>{entry.group_name}</small></div><time>{new Date(entry.registered_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</time></li>)}</ol> : <p className="joint-muted">Los alumnos aparecerán aquí al confirmar su matrícula.</p>}</SectionCard>
    </div></div>
    {closing ? <ActionDialog eyebrow="ASISTENCIA CONJUNTA" title="¿Cerrar la asistencia de todos los grupos?" detail={event.auto_mark_absent ? 'El enlace dejará de aceptar entradas. Se guardará Falta a los alumnos que no tengan registro; las asistencias y justificaciones existentes se conservan.' : 'El enlace dejará de aceptar entradas. Las listas se cerrarán con los registros existentes; los alumnos pendientes seguirán sin registro.'} confirmLabel="Cerrar y guardar listas" danger busy={mutation.isPending} error={mutation.error?.message} onDismiss={() => setClosing(false)} onConfirm={() => mutation.mutate()} /> : null}
    {projecting ? <ActionDialog eyebrow="TEDVIO · REGISTRO DE ASISTENCIA" title={event.title} detail="Escanea el QR o abre el enlace del chat. Selecciona tu grupo y escribe tu matrícula." onDismiss={() => setProjecting(false)}><div className="joint-projection">{qrPanel}<p className="joint-muted">{groups.map(g => g.name).join(' · ')}</p>{notice ? <p role="status">{notice}</p> : null}</div></ActionDialog> : null}
  </div>;
}
export function JointAttendancePage() { const { eventId } = useParams(); return eventId ? <EventControl key={eventId} eventId={eventId} /> : <EventCreator />; }
