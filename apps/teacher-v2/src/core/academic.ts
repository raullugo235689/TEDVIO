import type {
  AgendaOccurrence,
  AgendaSnapshot,
  DashboardGroup,
  RecommendedAction,
  ScheduleSlot,
  TeacherDashboard,
} from './types';

const dayOrder = [1, 2, 3, 4, 5, 6, 0];

export const dayNames = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
] as const;

export function groupName(group?: DashboardGroup | null): string {
  return group?.name || group?.group_name || 'Grupo';
}

export function groupSubject(group?: DashboardGroup | null): string {
  return group?.subject || group?.program || 'Asignatura';
}

export function formatPercent(value?: number | null): string {
  return value == null || Number.isNaN(Number(value)) ? '—' : `${Math.round(Number(value))}%`;
}

export function formatGrade(value?: number | null): string {
  return value == null || Number.isNaN(Number(value)) ? '—' : Number(value).toFixed(1);
}

export function formatTime(value?: string | null): string {
  return value ? String(value).slice(0, 5) : '—';
}

export function formatActivity(value?: string | null): string {
  if (!value) return 'Sin actividad';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin actividad';
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return `Hoy · ${date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`;
  }
  return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

export function attendanceLabel(group?: DashboardGroup | null): string {
  const state = String(group?.today_attendance_status || '');
  if (state === 'open') return 'Asistencia abierta';
  if (state === 'paused') return 'Asistencia pausada';
  if (state === 'closed') return 'Lista de hoy cerrada';
  return 'Sin lista hoy';
}

function minutes(value: string): number {
  const [hours = 0, mins = 0] = value.split(':').map(Number);
  return hours * 60 + mins;
}

function occurrence(slot: ScheduleSlot, date: Date, groups: DashboardGroup[]): AgendaOccurrence {
  const start = new Date(date);
  const end = new Date(date);
  const startMinutes = minutes(slot.start_time);
  const endMinutes = minutes(slot.end_time);
  start.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
  end.setHours(Math.floor(endMinutes / 60), endMinutes % 60, 0, 0);
  return {
    slot,
    start,
    end,
    group: groups.find((group) => String(group.id) === String(slot.group_id)) || null,
  };
}

export function agendaSnapshot(
  schedule: ScheduleSlot[],
  groups: DashboardGroup[],
  now = new Date(),
  days = 8,
): AgendaSnapshot {
  const occurrences: AgendaOccurrence[] = [];
  const active = schedule
    .filter((slot) => slot.active !== false)
    .sort(
      (a, b) =>
        dayOrder.indexOf(Number(a.weekday)) - dayOrder.indexOf(Number(b.weekday)) ||
        minutes(a.start_time) - minutes(b.start_time),
    );

  for (let delta = 0; delta < days; delta += 1) {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + delta);
    active
      .filter((slot) => Number(slot.weekday) === date.getDay())
      .forEach((slot) => occurrences.push(occurrence(slot, date, groups)));
  }

  occurrences.sort((a, b) => a.start.getTime() - b.start.getTime());
  const current = occurrences.find((item) => item.start <= now && now < item.end) || null;
  const future = occurrences.filter((item) => item.start > now);

  return {
    current,
    next: future[0] || null,
    after: future[1] || null,
    today: occurrences.filter((item) => item.start.toDateString() === now.toDateString()),
  };
}

export function recommendedAction(dashboard: TeacherDashboard): RecommendedAction {
  const groups = dashboard.groups || [];
  if (!groups.length) {
    return {
      eyebrow: 'PRIMER PASO',
      title: 'Crea tu primer grupo',
      detail: 'Agrega un grupo para empezar a registrar asistencia, interacción y evaluación.',
      tone: 'blue',
    };
  }

  const active = groups.find((group) => ['open', 'paused'].includes(String(group.today_attendance_status || '')));
  if (active) {
    return {
      eyebrow: 'ASISTENCIA EN CURSO',
      title: `${groupName(active)} · ${attendanceLabel(active)}`,
      detail: `${groupSubject(active)} · Conviene cerrar o continuar la lista antes de cambiar de grupo.`,
      groupId: active.id,
      tone: 'green',
    };
  }

  const missing = groups.find((group) => Number(group.students || 0) > 0 && !group.today_attendance_status);
  if (missing) {
    return {
      eyebrow: 'SIGUIENTE ACCIÓN',
      title: `${groupName(missing)} · Tomar asistencia`,
      detail: `${groupSubject(missing)} · Todavía no existe una lista registrada hoy.`,
      groupId: missing.id,
      tone: 'blue',
    };
  }

  const priority = (dashboard.priority_students || []).find((student) => student.status === 'risk') ||
    (dashboard.priority_students || [])[0];
  if (priority) {
    return {
      eyebrow: priority.status === 'risk' ? 'ALUMNO EN RIESGO' : 'SEGUIMIENTO',
      title: `Revisar a ${priority.full_name || 'un alumno'}`,
      detail: [
        priority.attendance_rate != null ? `Asistencia ${formatPercent(priority.attendance_rate)}` : '',
        priority.grade != null ? `Promedio ${formatGrade(priority.grade)}` : '',
      ].filter(Boolean).join(' · ') || 'Existe una señal académica que conviene revisar.',
      groupId: priority.group_id || undefined,
      tone: priority.status === 'risk' ? 'red' : 'amber',
    };
  }

  if (dashboard.latest_evaluation?.group_id) {
    return {
      eyebrow: 'EVALUACIÓN RECIENTE',
      title: `Revisar ${dashboard.latest_evaluation.title || 'la última evaluación'}`,
      detail: `Promedio ${formatGrade(dashboard.latest_evaluation.average)} · Conviene cerrar el ciclo de retroalimentación.`,
      groupId: dashboard.latest_evaluation.group_id,
      tone: 'violet',
    };
  }

  const first = groups[0];
  return {
    eyebrow: 'CONTINUAR TRABAJO',
    title: `Abrir ${groupName(first)}`,
    detail: `${groupSubject(first)} · Última actividad: ${formatActivity(first?.last_activity)}.`,
    groupId: first?.id,
    tone: 'blue',
  };
}

export function untilLabel(occurrence?: AgendaOccurrence | null, now = new Date()): string {
  if (!occurrence) return '';
  const minutesAway = Math.round((occurrence.start.getTime() - now.getTime()) / 60_000);
  if (minutesAway <= 0) return 'Ahora';
  if (minutesAway < 60) return `En ${minutesAway} min`;
  if (occurrence.start.toDateString() === now.toDateString()) {
    return `Hoy · ${formatTime(occurrence.slot.start_time)}`;
  }
  return `${dayNames[occurrence.start.getDay()]} · ${formatTime(occurrence.slot.start_time)}`;
}
