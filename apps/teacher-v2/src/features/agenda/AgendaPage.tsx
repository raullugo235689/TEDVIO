import { useMemo } from 'react';
import { agendaSnapshot, dayNames, formatTime, groupName, groupSubject, untilLabel } from '../../core/academic';
import { useTeacherHome } from '../../core/useTeacherHome';
import type { AgendaOccurrence, ScheduleSlot } from '../../core/types';
import { ErrorPanel, LegacyBridge, LoadingScreen, PageHeader, SectionCard, StatusPill } from '../../shared/components';
import { Icon } from '../../shared/icons';

const orderedDays = [1, 2, 3, 4, 5, 6, 0];

function OccurrenceCard({ occurrence, label }: { occurrence: AgendaOccurrence | null; label: string }) {
  if (!occurrence) {
    return <article className="agenda-page-focus empty"><span className="eyebrow">{label}</span><h3>Sin clase programada</h3><p>No existe otra franja cercana.</p></article>;
  }
  return (
    <article className="agenda-page-focus">
      <header><span className="eyebrow">{label}</span><StatusPill tone={occurrence.start <= new Date() ? 'green' : 'blue'}>{untilLabel(occurrence)}</StatusPill></header>
      <h3>{groupSubject(occurrence.group)}</h3>
      <p>{groupName(occurrence.group)} · {formatTime(occurrence.slot.start_time)}–{formatTime(occurrence.slot.end_time)}</p>
      <small>{[occurrence.slot.room, occurrence.slot.modality].filter(Boolean).join(' · ') || 'Ubicación sin especificar'}</small>
      <LegacyBridge groupId={occurrence.slot.group_id} compact label="Continuar en versión actual" />
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
  const groups = home.data?.dashboard.groups || [];
  const snapshot = useMemo(() => agendaSnapshot(home.data?.schedule || [], groups), [home.data?.schedule, groups]);

  if (home.isLoading) return <LoadingScreen label="Cargando agenda unificada…" />;
  if (home.isError) return <ErrorPanel title="No pude cargar la agenda" detail={home.error.message} onRetry={() => home.refetch()} />;
  if (!home.data) return null;

  return (
    <div className="view-stack">
      <PageHeader eyebrow="AGENDA ACADÉMICA" title="Tu semana docente" detail="Lectura directa del horario existente, sin decoradores ni observadores sobre el DOM." actions={<LegacyBridge label="Editar en versión actual" />} />

      <section className="agenda-page-focus-grid">
        <OccurrenceCard occurrence={snapshot.current || snapshot.next} label={snapshot.current ? 'AHORA' : 'SIGUIENTE'} />
        <OccurrenceCard occurrence={snapshot.current ? snapshot.next : snapshot.after} label={snapshot.current ? 'DESPUÉS' : 'A CONTINUACIÓN'} />
      </section>

      <SectionCard>
        <div className="section-heading"><div><span className="eyebrow">HORARIO SEMANAL</span><h2>Franjas configuradas</h2><p>Las horas se interpretan con la zona horaria local del dispositivo.</p></div><StatusPill tone="blue">{home.data.schedule.length} franjas</StatusPill></div>
        {home.data.schedule.length ? (
          <div className="weekly-schedule">
            {orderedDays.map((day) => {
              const slots = slotsForDay(home.data.schedule, day);
              if (!slots.length) return null;
              return (
                <section className="schedule-day" key={day}>
                  <header><span>{dayNames[day]}</span><small>{slots.length} clase{slots.length === 1 ? '' : 's'}</small></header>
                  <div>
                    {slots.map((slot) => {
                      const group = groups.find((item) => String(item.id) === String(slot.group_id));
                      return (
                        <article key={slot.id}>
                          <div className="schedule-time"><b>{formatTime(slot.start_time)}</b><span>{formatTime(slot.end_time)}</span></div>
                          <div className="schedule-info"><h3>{groupSubject(group)}</h3><p>{groupName(group)}</p><small>{[slot.room, slot.modality].filter(Boolean).join(' · ') || 'Sin ubicación'}</small></div>
                          <LegacyBridge groupId={slot.group_id} compact label="Abrir" />
                        </article>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <div className="empty-state inline"><div className="empty-icon"><Icon name="calendar" /></div><h3>Aún no hay horarios</h3><p>La edición del horario se migrará después de validar el nuevo shell.</p><LegacyBridge label="Configurar en versión actual" /></div>
        )}
      </SectionCard>
    </div>
  );
}
