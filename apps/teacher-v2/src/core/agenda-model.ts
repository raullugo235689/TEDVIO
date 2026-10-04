import type { AgendaOccurrence, DashboardGroup, ScheduleException, ScheduleSlot } from './types';

// Calendar dates stay local: parsing YYYY-MM-DD as UTC shifts a day in Mexico.
export function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function dateAtNoon(value: string): Date { return new Date(`${value}T12:00:00`); }
export function addDays(value: string, days: number): string {
  const date = dateAtNoon(value); date.setDate(date.getDate() + days); return localDate(date);
}
export function weekStart(value: string): string { return addDays(value, -((dateAtNoon(value).getDay() + 6) % 7)); }
export function dateLabel(value: string): string {
  return dateAtNoon(value).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
}
export function agendaOccurrences(schedule: ScheduleSlot[], exceptions: ScheduleException[], groups: DashboardGroup[], from: string, to: string, includeCancelled = false): AgendaOccurrence[] {
  const result: AgendaOccurrence[] = [];
  const byException = new Map(exceptions.map(item => [`${item.slot_id}:${item.original_date}`, item]));
  const byGroup = new Map(groups.map(group => [group.id, group]));
  const append = (source: ScheduleSlot, originalDate: string, change?: ScheduleException) => {
    if (change?.status === 'cancelled' && !includeCancelled) return;
    const day = change?.status === 'moved' ? change.class_date! : originalDate;
    if (day < from || day > to) return;
    const slot = change?.status === 'moved' ? { ...source, start_time: change.start_time!, end_time: change.end_time!, room: change.room, modality: change.modality } : source;
    result.push({ source, slot, originalDate, status: change?.status || 'scheduled', note: change?.note,
      start: new Date(`${day}T${slot.start_time}`), end: new Date(`${day}T${slot.end_time}`), group: byGroup.get(slot.group_id) || null });
  };
  for (const slot of schedule) {
    if (slot.active === false) continue;
    // At most two years per requested window; edits and UI use bounded ranges.
    for (let day = from, count = 0; day <= to && count < 733; day = addDays(day, 1), count++) {
      if (slot.starts_on && day < slot.starts_on || slot.ends_on && day > slot.ends_on) continue;
      if (dateAtNoon(day).getDay() !== Number(slot.weekday)) continue;
      if (slot.recurrence === 'once' && day !== slot.starts_on) continue;
      const change = byException.get(`${slot.id}:${day}`);
      if (change?.status !== 'moved') append(slot, day, change);
    }
    // Include a moved class even when its original date lies outside this week.
    for (const change of exceptions) {
      if (change.slot_id === slot.id && change.status === 'moved' && (!slot.starts_on || change.original_date >= slot.starts_on) && (!slot.ends_on || change.original_date <= slot.ends_on)) append(slot, change.original_date, change);
    }
  }
  return result.sort((a, b) => a.start.getTime() - b.start.getTime() || a.slot.id.localeCompare(b.slot.id));
}

export interface AgendaDraft {
  group_id: string; class_date: string; end_date: string; start_time: string; end_time: string;
  room: string; modality: string; recurrence: 'weekly' | 'once'; scope: 'one' | 'future';
  action: 'save' | 'suspend' | 'restore'; note: string;
}
export function validateAgendaDraft(draft: AgendaDraft, editing?: AgendaOccurrence | null): string | null {
  if (!draft.group_id) return 'Selecciona un grupo.';
  if (draft.action !== 'save') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.class_date) || Number.isNaN(dateAtNoon(draft.class_date).getTime())) return 'Selecciona una fecha válida.';
  if (!/^\d{2}:\d{2}$/.test(draft.start_time) || !/^\d{2}:\d{2}$/.test(draft.end_time) || draft.end_time <= draft.start_time) return 'La hora de salida debe ser posterior a la de entrada.';
  if ((!editing || draft.scope === 'future') && draft.recurrence === 'weekly' && (!draft.end_date || draft.end_date < draft.class_date || draft.end_date > addDays(draft.class_date, 730))) return 'Elige una fecha final posterior o igual al inicio, dentro de los próximos dos años.';
  if (editing && draft.scope === 'future' && draft.class_date < editing.originalDate) return 'La nueva serie debe comenzar en la fecha seleccionada o después.';
  return null;
}
export function draftOccurrences(draft: AgendaDraft, editing?: AgendaOccurrence | null): AgendaOccurrence[] {
  if (validateAgendaDraft(draft, editing) || draft.action !== 'save') return [];
  const weekly = draft.recurrence === 'weekly' && (!editing || draft.scope === 'future');
  return agendaOccurrences([{ id: 'draft', group_id: draft.group_id, weekday: dateAtNoon(draft.class_date).getDay(), start_time: draft.start_time, end_time: draft.end_time, starts_on: draft.class_date, ends_on: weekly ? draft.end_date : draft.class_date, recurrence: weekly ? 'weekly' : 'once' }], [], [], draft.class_date, weekly ? draft.end_date : draft.class_date);
}
export function agendaConflicts(draft: AgendaDraft, editing: AgendaOccurrence | null, schedule: ScheduleSlot[], exceptions: ScheduleException[], groups: DashboardGroup[]): AgendaOccurrence[] {
  const candidates = draftOccurrences(draft, editing);
  if (!candidates.length) return [];
  const others = agendaOccurrences(schedule, exceptions, groups, localDate(candidates[0]!.start), localDate(candidates.at(-1)!.start)).filter(item => !editing || item.source.id !== editing.source.id || (draft.scope === 'future' ? item.originalDate < editing.originalDate : item.originalDate !== editing.originalDate));
  return others.filter(item => candidates.some(candidate => candidate.start < item.end && candidate.end > item.start)).slice(0, 5);
}
