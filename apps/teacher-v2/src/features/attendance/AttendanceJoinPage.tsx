import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getPublicAttendance, registerJointAttendance, type CheckinResult, type PublicEventMeta } from '../../core/joint-attendance';

export function AttendanceJoinPage() {
  const [params] = useSearchParams();
  const token = params.get('t') || '';
  return <AttendanceJoinForm key={token} token={token} />;
}
function AttendanceJoinForm({ token }: { token: string }) {
  const [meta, setMeta] = useState<PublicEventMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [groupId, setGroupId] = useState('');
  const [enrollment, setEnrollment] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CheckinResult | null>(null);
  const [retry, setRetry] = useState(0);
  const busyRef = useRef(false);
  useEffect(() => {
    let current = true;
    setLoading(true); setError('');
    if (!/^[a-f0-9]{32}$/.test(token)) { setLoading(false); setError('Este enlace no es válido. Abre el enlace que compartió tu docente.'); return; }
    void getPublicAttendance(token).then(value => {
      if (!current) return;
      setMeta(value);
      if (value.ok && value.groups.length === 1) setGroupId(value.groups[0]!.id);
      if (!value.ok) setError(value.message || 'Este registro no está disponible.');
    }).catch(reason => { if (current) setError(reason instanceof Error ? reason.message : 'No se pudo abrir el registro. Comprueba tu conexión.'); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [token, retry]);
  async function submit() {
    if (busyRef.current || !groupId || !enrollment.trim()) return;
    busyRef.current = true; setBusy(true); setError('');
    try {
      const response = await registerJointAttendance(token, groupId, enrollment);
      if (response.ok) setResult(response);
      else setError(response.message || 'No se pudo registrar la asistencia. Revisa tus datos.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo confirmar la respuesta. Reintenta; tu registro no se duplicará.'); }
    finally { busyRef.current = false; setBusy(false); }
  }
  const selected = meta?.groups?.find(g => g.id === groupId);
  return <main className="attendance-join-shell"><section className="attendance-join-card">
    <img className="attendance-join-brand" src="/assets/tedvio_official_isotipo.svg" alt="TEDVIO" width="48" height="48" />
    <span className="eyebrow">REGISTRO DE ASISTENCIA</span>
    {result ? <div className="attendance-join-success" role="status"><span className={`join-result-icon ${result.status === 'late' ? 'late' : ''}`}>✓</span><h1>{result.message}</h1><h2>{result.student_name}</h2><p>{result.group_name}</p><p>{result.attendance_date ? new Date(`${result.attendance_date}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}</p><p className="joint-note">Tu registro quedó guardado. Puedes volver a la videollamada.</p></div> : <>
      <h1>{meta?.ok ? meta.title : 'Tu asistencia'}</h1>
      {loading ? <p role="status">Abriendo el registro…</p> : null}
      {error ? <p className="attendance-join-error" role="alert">{error}</p> : null}
      {!loading && !meta?.ok ? <button className="button secondary" type="button" onClick={() => setRetry(n => n + 1)}>Volver a consultar</button> : null}
      {!loading && meta?.ok ? <><p>Selecciona tu grupo y escribe la matrícula que tiene registrada tu docente.</p><form onSubmit={event => { event.preventDefault(); void submit(); }}>
        <label className="joint-field">Tu grupo<select required value={groupId} disabled={busy} onChange={event => { setGroupId(event.target.value); setError(''); }}><option value="">Selecciona tu grupo</option>{meta.groups.map(group => <option key={group.id} value={group.id}>{group.name}{group.subject ? ` · ${group.subject}` : ''}{group.university ? ` · ${group.university}` : ''}</option>)}</select></label>
        {selected ? <p className="join-selected-group">{selected.subject}<br />{selected.university}</p> : null}
        <label className="joint-field">Matrícula<input required maxLength={100} autoComplete="off" autoCapitalize="none" spellCheck={false} value={enrollment} disabled={busy} onChange={event => setEnrollment(event.target.value)} placeholder="Escribe tu matrícula" /></label>
        <button className="button primary joint-start" type="submit" disabled={busy || !groupId || !enrollment.trim()}>{busy ? 'Registrando…' : 'Registrar mi asistencia'}</button>
      </form><p className="joint-muted">No necesitas una cuenta de TEDVIO. Registra únicamente tu propia asistencia.</p></> : null}
    </>}
  </section></main>;
}
