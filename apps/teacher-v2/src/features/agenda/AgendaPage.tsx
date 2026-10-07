import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { agendaSnapshot, dayNames, formatTime, groupName, groupSubject } from '../../core/academic';
import { useTeacherHome } from '../../core/useTeacherHome';
import type { AgendaOccurrence } from '../../core/types';
import { ErrorPanel, LoadingScreen, PageHeader, SectionCard, StatusPill } from '../../shared/components';
import { Icon } from '../../shared/icons';
import { InstitutionIdentity } from '../../shared/InstitutionIdentity';
import { groupAccent } from '../../core/group-identity';
import { orderGroups } from '../../core/group-catalog';
import { addDays, agendaOccurrences, dateAtNoon, dateLabel, localDate, weekStart } from '../../core/agenda-model';
import { AgendaEditor } from './AgendaEditor';
import { AgendaTimetable } from './AgendaTimetable';


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
      <div className="page-actions"><Link className="button ghost compact" to={`/groups/${occurrence.slot.group_id}`}>Abrir grupo</Link><Link className="button primary compact" to={`/attendance/${occurrence.slot.group_id}${localDate(occurrence.start) === localDate(now) ? '' : `?date=${localDate(occurrence.start)}`}`}>Asistencia</Link><Link className="button ghost compact" to={`/classroom?group=${encodeURIComponent(occurrence.slot.group_id)}`}>Modo Clase</Link></div>
    </article>
  );
}

export function AgendaPage() {
  const home = useTeacherHome();
  const [now, setNow] = useState(() => new Date());
  const [selectedWeek, setSelectedWeek] = useState(() => weekStart(localDate(new Date())));
  const [todayOnly, setTodayOnly] = useState(false);
  const [view, setView] = useState<'timetable' | 'list'>('timetable');
  const [editor, setEditor] = useState<{ occurrence: AgendaOccurrence | null; date: string } | null>(null);
  const [notice, setNotice] = useState('');
  const groups = home.data?.dashboard.groups || [];
  const snapshot = useMemo(() => agendaSnapshot(home.data?.schedule || [], groups, now, 60, home.data?.scheduleExceptions || []), [home.data?.schedule, home.data?.scheduleExceptions, groups, now]);

  useEffect(() => {
    const updateClock = () => setNow(new Date());
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const boundaries = snapshot.today.flatMap((item) => [item.start.getTime(), item.end.getTime()]).filter((time) => time > now.getTime());
    // Update the current-time line locally, without fetching data.
    const nextChange = Math.min(midnight.getTime(), Math.floor(now.getTime() / 60_000) * 60_000 + 60_000, ...boundaries);
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

  const agendaWarning = home.data.warnings.find(item => item.startsWith('Agenda:'));
  if (agendaWarning) return <ErrorPanel title="No pude cargar todos tus horarios" detail="Actualiza la agenda para consultar y editar tus clases con los datos completos." onRetry={() => home.refetch()} />;
  const days = Array.from({ length: 7 }, (_, index) => addDays(selectedWeek, index));
  const occurrences = agendaOccurrences(home.data.schedule, home.data.scheduleExceptions || [], groups, selectedWeek, days[6]!, true);
  const scheduledGroups = orderGroups(groups.filter(group => occurrences.some(item => item.slot.group_id === group.id)));
  const scheduledCount = occurrences.filter(item => item.status !== 'cancelled').length;
  const openEditor = (occurrence: AgendaOccurrence | null, date = localDate(now)) => { setNotice(''); setEditor({ occurrence, date }); };
  const goToToday = () => { setSelectedWeek(weekStart(localDate(now))); setTodayOnly(true); };

  return (
    <div className="view-stack agenda-workspace">
      <PageHeader eyebrow="AGENDA ACADÉMICA" title="Tu agenda" detail="Organiza tus clases y ajusta cada fecha sin perder el resto del horario." actions={<button className="button primary" type="button" disabled={!groups.length} onClick={() => openEditor(null, selectedWeek > localDate(now) ? selectedWeek : localDate(now))}><Icon name="calendar" />Programar clase</button>} />
      {notice ? <div className="success-strip" role="status">{notice}</div> : null}
      <SectionCard className="agenda-week-card">
        <div className="section-heading"><div><span className="eyebrow">{dateLabel(selectedWeek)} — {dateLabel(days[6]!)}</span><h2>{todayOnly ? 'Tus clases de hoy' : 'Tu semana'}</h2><p>Un mismo color para reconocer cada grupo.</p></div><StatusPill tone="neutral">{scheduledCount} clase{scheduledCount === 1 ? '' : 's'} esta semana</StatusPill></div>
        <div className="agenda-week-toolbar"><div className="agenda-week-buttons"><button className="button ghost compact" type="button" aria-label="Semana anterior" onClick={() => { setSelectedWeek(addDays(selectedWeek, -7)); setTodayOnly(false); }}>←</button><button className="button ghost compact" type="button" onClick={goToToday} aria-pressed={todayOnly}>Ver hoy</button><button className="button ghost compact" type="button" onClick={() => setTodayOnly(false)} aria-pressed={!todayOnly}>Semana</button><button className="button ghost compact" type="button" aria-label="Semana siguiente" onClick={() => { setSelectedWeek(addDays(selectedWeek, 7)); setTodayOnly(false); }}>→</button></div><label>Ir a una fecha<input type="date" value={selectedWeek} onChange={event => { if (event.target.value) { setSelectedWeek(weekStart(event.target.value)); setTodayOnly(false); } }} /></label></div>
        <div className="agenda-view-switch" role="group" aria-label="Vista de agenda"><button type="button" aria-pressed={view === 'timetable'} onClick={() => setView('timetable')}><Icon name="calendar" />Horario</button><button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}><Icon name="layout" />Lista</button></div>
        {view === 'timetable' ? <AgendaTimetable days={days} occurrences={occurrences} now={now} todayOnly={todayOnly} canCreate={groups.length > 0} onEdit={openEditor} /> : <div className="weekly-schedule">
          {days.filter(date => !todayOnly || date === localDate(now)).map(date => {
            const classes = occurrences.filter(item => localDate(item.start) === date);
            const today = date === localDate(now);
            if (!classes.length && !today && !todayOnly) return null;
            return <section className={`schedule-day${today ? ' is-today' : ''}`} key={date} aria-label={dayNames[dateAtNoon(date).getDay()]}>
              <header aria-current={today ? 'date' : undefined}><div><span>{dayNames[dateAtNoon(date).getDay()]}</span><time dateTime={date}>{dateLabel(date)}</time><small>{classes.filter(item => item.status !== 'cancelled').length} clases</small></div>{today ? <b className="agenda-today-badge">Hoy</b> : null}</header>
              <div>{!classes.length ? <div className="agenda-day-empty"><Icon name="calendar" /><span>No hay clases programadas.</span>{groups.length ? <button className="button ghost compact" type="button" onClick={() => openEditor(null, date)}>Añadir clase</button> : null}</div> : null}
                {classes.map(item => {
                  const { slot, group } = item;
                  const current = item.status !== 'cancelled' && item.start <= now && now < item.end;
                  return <article className={`schedule-slot${current ? ' is-current' : ''}${item.status === 'cancelled' ? ' is-cancelled' : ''}`} key={`${slot.id}:${item.originalDate}`} data-group-color={groupAccent(slot.group_id)} aria-label={`${groupSubject(group)} · ${groupName(group)} · ${formatTime(slot.start_time)} a ${formatTime(slot.end_time)}`}>
                    <div className="schedule-time"><time dateTime={slot.start_time}>{formatTime(slot.start_time)}</time><span>a {formatTime(slot.end_time)}</span></div>
                    <div className="schedule-info"><div className="schedule-slot-topline"><span className="agenda-group-badge">{groupName(group)}</span>{current ? <span className="agenda-current-badge"><i aria-hidden="true" />En curso</span> : null}{item.status === 'cancelled' ? <StatusPill tone="amber">Suspendida</StatusPill> : item.status === 'moved' ? <StatusPill tone="blue">Reprogramada</StatusPill> : null}</div><h3>{groupSubject(group)}</h3><InstitutionIdentity name={group?.university} logoUrl={group?.institution_logo_url} /><small className="agenda-location">{[slot.room, slot.modality].filter(Boolean).join(' · ') || 'Ubicación sin especificar'}</small>{item.status === 'moved' && item.originalDate !== date ? <small className="agenda-location">Antes: {dateLabel(item.originalDate)}</small> : null}{item.note ? <p className="agenda-class-note">{item.note}</p> : null}</div>
                    <div className="page-actions">{item.status !== 'cancelled' ? <><Link className="button ghost compact" to={`/groups/${slot.group_id}`}>Grupo</Link><Link className="button primary compact" to={`/attendance/${slot.group_id}${date === localDate(now) ? '' : `?date=${date}`}`}>Asistencia</Link><Link className="button ghost compact" to={`/classroom?group=${encodeURIComponent(slot.group_id)}`}>Modo Clase</Link></> : null}<button className="button ghost compact" type="button" onClick={() => openEditor(item, date)}>{item.status === 'cancelled' ? 'Restaurar o editar' : 'Editar clase'}</button></div>
                  </article>;
                })}
              </div>
            </section>;
          })}
        </div>}
        {scheduledGroups.length ? <nav className="agenda-color-key" aria-label="Grupos en tu agenda">{scheduledGroups.map(group => <Link key={group.id} data-group-color={groupAccent(group.id)} to={`/groups/${group.id}`}><i aria-hidden="true" /><span>{groupSubject(group)} · {groupName(group)}</span></Link>)}</nav> : null}
        {!occurrences.length && !days.includes(localDate(now)) ? <div className="empty-state inline"><div className="empty-icon"><Icon name="calendar" /></div><h3>Semana disponible</h3><p>Aquí aparecerán tus clases programadas.</p><button className="button secondary" type="button" disabled={!groups.length} onClick={() => openEditor(null, selectedWeek)}>Programar en esta semana</button></div> : null}
        {!groups.length ? <p className="agenda-scope-note">Crea un grupo para programar tus primeras clases. <Link to="/groups">Ir a mis grupos</Link></p> : null}
        <p className="agenda-timezone-note">Horarios en la hora local de tu dispositivo. Cambiar la agenda no modifica las listas de asistencia.</p>
      </SectionCard>
      <section className="agenda-page-focus-grid" aria-label="Próximas clases">
        <OccurrenceCard occurrence={snapshot.current || snapshot.next} label={snapshot.current ? 'AHORA' : 'SIGUIENTE CLASE'} now={now} />
        <OccurrenceCard occurrence={snapshot.current ? snapshot.next : snapshot.after} label={snapshot.current ? 'DESPUÉS' : 'A CONTINUACIÓN'} now={now} />
      </section>
      {editor ? <AgendaEditor key={`${editor.occurrence?.source.id || 'new'}:${editor.occurrence?.originalDate || editor.date}`} data={home.data} occurrence={editor.occurrence} initialDate={editor.date} onClose={() => setEditor(null)} onSaved={message => { setEditor(null); setNotice(message); }} /> : null}
    </div>
  );
}
