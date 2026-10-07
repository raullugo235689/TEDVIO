import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { dayNames, formatTime, groupName, groupSubject } from '../../core/academic';
import { dateAtNoon, dateLabel, localDate } from '../../core/agenda-model';
import { layoutTimetableDay, timeMinutes, timetableBounds, timetablePixelsPerMinute } from '../../core/agenda-timetable';
import { groupAccent } from '../../core/group-identity';
import type { AgendaOccurrence } from '../../core/types';
import { ActionDialog } from '../../shared/ActionDialog';
import { InstitutionIdentity } from '../../shared/InstitutionIdentity';
import { Icon } from '../../shared/icons';

const occurrenceKey = (item: AgendaOccurrence) => `${item.slot.id}:${item.originalDate}`;

export function AgendaTimetable({ days, occurrences, now, todayOnly, canCreate, onEdit }: {
  days: string[];
  occurrences: AgendaOccurrence[];
  now: Date;
  todayOnly: boolean;
  canCreate: boolean;
  onEdit: (occurrence: AgendaOccurrence | null, date: string) => void;
}) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const today = localDate(now);
  const visibleDays = todayOnly ? [today] : days.filter((date, index) => index < 5 || date === today || occurrences.some(item => localDate(item.start) === date));
  const activeDate = selectedDate && visibleDays.includes(selectedDate) ? selectedDate : visibleDays.includes(today) ? today : visibleDays[0];
  const visibleOccurrences = occurrences.filter(item => visibleDays.includes(localDate(item.start)));
  const { start, end } = timetableBounds(visibleOccurrences);
  const hours = Array.from({ length: (end - start) / 60 }, (_, index) => start / 60 + index);
  const height = (end - start) * timetablePixelsPerMinute;
  const currentMinute = now.getHours() * 60 + now.getMinutes();
  const selected = occurrences.find(item => occurrenceKey(item) === selectedKey);
  const firstClass = visibleOccurrences.find(item => localDate(item.start) === activeDate);
  const firstMinute = firstClass ? timeMinutes(firstClass.slot.start_time) : start;

  useEffect(() => {
    const mobile = window.matchMedia('(max-width: 680px)');
    const revealDay = () => {
      // A day with afternoon classes should not open on several empty morning hours.
      if (mobile.matches && scroller.current) scroller.current.scrollTop = Math.max(0, (firstMinute - start - 30) * timetablePixelsPerMinute);
    };
    revealDay();
    mobile.addEventListener('change', revealDay);
    return () => mobile.removeEventListener('change', revealDay);
  }, [activeDate, firstMinute, start, todayOnly]);

  return <>
    {!todayOnly ? <div className="timetable-day-picker" role="group" aria-label="Día del horario">
      {visibleDays.map(date => <button type="button" key={date} aria-label={dateLabel(date)} aria-pressed={date === activeDate} aria-current={date === today ? 'date' : undefined} onClick={() => setSelectedDate(date)}>
        <span>{dayNames[dateAtNoon(date).getDay()]?.slice(0, 3)}</span><b>{dateAtNoon(date).getDate()}</b><i className={occurrences.some(item => localDate(item.start) === date && item.status !== 'cancelled') ? 'has-classes' : ''} aria-hidden="true" />
      </button>)}
    </div> : null}
    <p className="timetable-hint"><Icon name="calendar" />Selecciona una clase para ver detalles y acciones.</p>
    <div ref={scroller} className={`timetable-scroll${todayOnly ? ' is-single-day' : ''}`} role="region" aria-label="Horario de clases" tabIndex={0}>
      <div className="timetable-grid" style={{ '--day-count': visibleDays.length, '--hour-height': `${60 * timetablePixelsPerMinute}px` } as CSSProperties}>
        <div className="timetable-axis" aria-hidden="true"><div className="timetable-heading">Hora</div><div className="timetable-axis-body" style={{ height }}>{hours.map(hour => <span key={hour} style={{ top: (hour * 60 - start) * timetablePixelsPerMinute }}>{String(hour).padStart(2, '0')}:00</span>)}</div></div>
        {visibleDays.map(date => {
          const classes = visibleOccurrences.filter(item => localDate(item.start) === date);
          const todayColumn = date === today;
          return <section key={date} className={`timetable-day${todayColumn ? ' is-today' : ''}${date === activeDate ? ' is-selected' : ''}`} aria-label={dateLabel(date)}>
            <header className="timetable-heading" aria-current={todayColumn ? 'date' : undefined}><span>{dayNames[dateAtNoon(date).getDay()]}</span><time dateTime={date}>{dateAtNoon(date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}</time>{todayColumn ? <b>Hoy</b> : null}</header>
            <div className="timetable-day-body" style={{ height }}>
              {!classes.length ? <div className="timetable-empty"><span>Sin clases</span>{canCreate ? <button type="button" onClick={() => onEdit(null, date)} aria-label={`Añadir clase: ${dateLabel(date)}`}>+ Añadir clase</button> : null}</div> : null}
              {layoutTimetableDay(classes).map(({ occurrence: item, start: from, end: to, lane, lanes }) => {
                const { slot, group } = item;
                const current = item.status !== 'cancelled' && item.start <= now && now < item.end;
                const description = `${groupSubject(group)} · ${groupName(group)} · ${formatTime(slot.start_time)} a ${formatTime(slot.end_time)}${slot.room ? ` · ${slot.room}` : ''}${item.status === 'cancelled' ? ' · Suspendida' : item.status === 'moved' ? ' · Reprogramada' : ''}`;
                return <button type="button" key={occurrenceKey(item)} className={`timetable-event${current ? ' is-current' : ''}${item.status === 'cancelled' ? ' is-cancelled' : ''}${to - from < 50 ? ' is-short' : ''}${to - from < 35 ? ' is-tiny' : ''}`} data-group-color={groupAccent(slot.group_id)} data-occurrence={occurrenceKey(item)} aria-label={`Ver clase: ${description}`} title={description} onClick={() => setSelectedKey(occurrenceKey(item))}
                  style={{ top: (from - start) * timetablePixelsPerMinute + 4, height: (to - from) * timetablePixelsPerMinute - 8, left: `calc(${lane / lanes * 100}% + 4px)`, width: `calc(${100 / lanes}% - 8px)` }}>
                  <span className="timetable-event-time"><Icon name="clock" />{formatTime(slot.start_time)}–{formatTime(slot.end_time)}</span>
                  <strong>{groupSubject(group)}</strong>
                  <span className="timetable-event-group">{groupName(group)}</span>
                  <span className="timetable-event-location">{[slot.room, slot.modality].filter(Boolean).join(' · ') || 'Sin aula asignada'}</span>
                  {current || item.status !== 'scheduled' ? <span className="timetable-event-status">{item.status === 'cancelled' ? 'Suspendida' : item.status === 'moved' ? 'Reprogramada' : 'En curso'}</span> : null}
                </button>;
              })}
              {todayColumn && currentMinute >= start && currentMinute < end ? <div className="timetable-now" style={{ top: (currentMinute - start) * timetablePixelsPerMinute }} aria-label={`Hora actual: ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`}><i /><span>{String(now.getHours()).padStart(2, '0')}:{String(now.getMinutes()).padStart(2, '0')}</span></div> : null}
            </div>
          </section>;
        })}
      </div>
    </div>
    {selected ? <ActionDialog title={groupSubject(selected.group)} detail={`${dateLabel(localDate(selected.start))} · ${formatTime(selected.slot.start_time)}–${formatTime(selected.slot.end_time)}`} eyebrow="AGENDA · DETALLE DE CLASE" className="agenda-class-dialog" onDismiss={() => setSelectedKey(null)} focusStart>
      <div className="agenda-class-detail" data-group-color={groupAccent(selected.slot.group_id)}>
        <span className="agenda-group-badge">{groupName(selected.group)}</span>
        <InstitutionIdentity name={selected.group?.university} logoUrl={selected.group?.institution_logo_url} />
        <p>{[selected.slot.room, selected.slot.modality].filter(Boolean).join(' · ') || 'Ubicación sin especificar'}</p>
        {selected.status !== 'scheduled' ? <p className="agenda-detail-status">{selected.status === 'cancelled' ? 'Clase suspendida' : `Reprogramada · fecha original: ${dateLabel(selected.originalDate)}`}</p> : null}
        {selected.note ? <p className="agenda-class-note">{selected.note}</p> : null}
        <div className="page-actions">
          {selected.status !== 'cancelled' ? <><Link className="button primary" to={`/attendance/${selected.slot.group_id}${localDate(selected.start) === today ? '' : `?date=${localDate(selected.start)}`}`}>Asistencia</Link><Link className="button ghost" to={`/groups/${selected.slot.group_id}`}>Abrir grupo</Link><Link className="button ghost" to={`/classroom?group=${encodeURIComponent(selected.slot.group_id)}`}>Modo Clase</Link></> : null}
          <button className="button ghost" type="button" onClick={() => { setSelectedKey(null); onEdit(selected, localDate(selected.start)); }}>{selected.status === 'cancelled' ? 'Restaurar o editar' : 'Editar clase'}</button>
        </div>
      </div>
    </ActionDialog> : null}
  </>;
}
