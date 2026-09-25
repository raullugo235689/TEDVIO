import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { agendaSnapshot, dayNames, formatTime, groupName, groupSubject } from '../../core/academic';
import { useTeacherHome } from '../../core/useTeacherHome';
import type { AgendaOccurrence, ScheduleSlot } from '../../core/types';
import { ErrorPanel, LegacyBridge, LoadingScreen, PageHeader, SectionCard, StatusPill } from '../../shared/components';
import { Icon } from '../../shared/icons';
import { InstitutionIdentity } from '../../shared/InstitutionIdentity';
import { groupAccent } from '../../core/group-identity';

const orderedDays = [1, 2, 3, 4, 5, 6, 0];

function OccurrenceCard({ occurrence, label, now }: { occurrence: AgendaOccurrence | null; label: string; now: Date }) {
  if (!occurrence) {
    return <article className="agenda-page-focus empty"><span className="eyebrow">{label}</span><h3>Sin clase programada</h3><p>Aquí aparecerá tu próxima clase.</p></article>;
  }
  const current = occurrence.start <= now && now < occurrence.end;
  return (
    <article className="agenda-page-focus" data-group-color={groupAccent(occurrence.slot.group_id)}>
      <header><span className="eyebrow">{label}</span><StatusPill tone={current ? 'green' : 'neutral'}>{current ? 'En curso' : occurrence.start.toDateString() === now.toDateString() ? 'Hoy' : occurrence.start.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })}</StatusPill></header>
      <h3>{groupSubject(occurrence.group)}</h3>
      <div className="agenda-focus-details"><span className="agenda-group-badge">{groupName(occurrence.group)}</span><span>{formatTime(occurrence.slot.start_time)}–{formatTime(occurrence.slot.end_time)}</span></div>
      <InstitutionIdentity name={occurrence.group?.university} logoUrl={occurrence.group?.institution_logo_url} />
      <small className="agenda-location">{[occurrence.slot.room, occurrence.slot.modality].filter(Boolean).join(' · ') || 'Ubicación sin especificar'}</small>
      <div className="page-actions"><Link className="button ghost compact" to={`/groups/${occurrence.slot.group_id}`}>Abrir grupo</Link><Link className="button primary compact" to={`/attendance/${occurrence.slot.group_id}`}>Asistencia</Link></div>
    </article>
  );
}

function slotsForDay(schedule: ScheduleSlot[], day: number) {
  return schedule
    .filter((slot) => slot.active !== false && Number(slot.weekday) === day)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
}

export function AgendaPage() {
  const home = useTeacherHome();
  const [now, setNow] = useState(() => new Date());
  const groups = home.data?.dashboard.groups || [];
  const snapshot = useMemo(() => agendaSnapshot(home.data?.schedule || [], groups, now), [home.data?.schedule, groups, now]);

  useEffect(() => {
    const updateClock = () => setNow(new Date());
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const boundaries = snapshot.today.flatMap((item) => [item.start.getTime(), item.end.getTime()]).filter((time) => time > now.getTime());
    // Advance only at a class boundary or midnight; this clock never fetches data.
    const nextChange = Math.min(midnight.getTime(), ...boundaries);
    const timer = window.setTimeout(updateClock, Math.max(0, nextChange - Date.now()) + 100);
    document.addEventListener('visibilitychange', updateClock);
    window.addEventListener('focus', updateClock);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', updateClock);
      window.removeEventListener('focus', updateClock);
    };
  }, [now, snapshot]);

  if (home.isLoading) return <LoadingScreen label="Cargando agenda unificada…" />;
  if (home.isError) return <ErrorPanel title="No pude cargar la agenda" detail={home.error.message} onRetry={() => home.refetch()} />;
  if (!home.data) return null;

  const schedule = home.data.schedule.filter((slot) => slot.active !== false);
  const scheduledGroups = groups.filter((group) => schedule.some((slot) => slot.group_id === group.id));
  const currentSlots = new Set(snapshot.today.filter((item) => item.start <= now && now < item.end).map((item) => item.slot.id));
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const shortDate = (date: Date) => date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });

  return (
    <div className="view-stack agenda-workspace">
      <PageHeader eyebrow="AGENDA ACADÉMICA" title="Tu agenda" detail="Tus clases, con el color de cada grupo y todo a la vista." actions={<LegacyBridge label="Editar horario" />} />

      <section className="agenda-page-focus-grid">
        <OccurrenceCard occurrence={snapshot.current || snapshot.next} label={snapshot.current ? 'AHORA' : 'SIGUIENTE CLASE'} now={now} />
        <OccurrenceCard occurrence={snapshot.current ? snapshot.next : snapshot.after} label={snapshot.current ? 'DESPUÉS' : 'A CONTINUACIÓN'} now={now} />
      </section>

      <SectionCard className="agenda-week-card">
        <div className="section-heading"><div><span className="eyebrow">{shortDate(monday)} — {shortDate(sunday)}</span><h2>Tu semana</h2><p>Un mismo color para reconocer cada grupo.</p></div><StatusPill tone="neutral">{schedule.length} clase{schedule.length === 1 ? '' : 's'} por semana</StatusPill></div>
        {scheduledGroups.length ? <nav className="agenda-color-key" aria-label="Grupos en tu agenda">{scheduledGroups.map((group) => <Link key={group.id} data-group-color={groupAccent(group.id)} to={`/groups/${group.id}`}><i aria-hidden="true" /><span>{groupSubject(group)} · {groupName(group)}</span></Link>)}</nav> : null}
        {schedule.length ? (
          <div className="weekly-schedule">
            {orderedDays.map((day) => {
              const slots = slotsForDay(schedule, day);
              const today = day === now.getDay();
              if (!slots.length && !today) return null;
              const date = new Date(monday);
              date.setDate(monday.getDate() + orderedDays.indexOf(day));
              return (
                <section className={`schedule-day${today ? ' is-today' : ''}`} key={day} aria-label={dayNames[day]}>
                  <header aria-current={today ? 'date' : undefined}><div><span>{dayNames[day]}</span><time dateTime={`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`}>{shortDate(date)}</time><small>{slots.length} clase{slots.length === 1 ? '' : 's'}</small></div>{today ? <b className="agenda-today-badge">Hoy</b> : null}</header>
                  <div>
                    {!slots.length ? <div className="agenda-day-empty"><Icon name="calendar" /><span>Hoy no tienes clases programadas.</span></div> : null}
                    {slots.map((slot) => {
                      const group = groups.find((item) => String(item.id) === String(slot.group_id));
                      const current = currentSlots.has(slot.id);
                      return (
                        <article className={`schedule-slot${current ? ' is-current' : ''}`} key={slot.id} data-group-color={groupAccent(slot.group_id)} aria-label={`${groupSubject(group)} · ${groupName(group)} · ${formatTime(slot.start_time)} a ${formatTime(slot.end_time)}`}>
                          <div className="schedule-time"><time dateTime={slot.start_time}>{formatTime(slot.start_time)}</time><span>a {formatTime(slot.end_time)}</span></div>
                          <div className="schedule-info"><div className="schedule-slot-topline"><span className="agenda-group-badge">{groupName(group)}</span>{current ? <span className="agenda-current-badge"><i aria-hidden="true" />En curso</span> : null}</div><h3>{groupSubject(group)}</h3><InstitutionIdentity name={group?.university} logoUrl={group?.institution_logo_url} /><small className="agenda-location">{[slot.room, slot.modality].filter(Boolean).join(' · ') || 'Ubicación sin especificar'}</small></div>
                          <div className="page-actions"><Link className="button ghost compact" to={`/groups/${slot.group_id}`}>Grupo</Link><Link className="button primary compact" to={`/attendance/${slot.group_id}`}>Asistencia</Link></div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <div className="empty-state inline"><div className="empty-icon"><Icon name="calendar" /></div><h3>Aún no hay horarios</h3><p>Agrega los días y las horas de tus clases para organizar tu semana.</p><LegacyBridge label="Configurar horario" /></div>
        )}
        <p className="agenda-timezone-note">Horarios en la hora local de tu dispositivo.</p>
      </SectionCard>
    </div>
  );
}
