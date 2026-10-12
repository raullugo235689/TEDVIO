import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { attendanceLabel, formatActivity, formatGrade, formatPercent } from '../../core/academic';
import { groupAccent } from '../../core/group-identity';
import type { DashboardGroup, GroupRecord } from '../../core/types';
import { AcademicDeleteButton } from '../../shared/AcademicDeleteButton';
import { InstitutionIdentity } from '../../shared/InstitutionIdentity';
import { Icon } from '../../shared/icons';

/** Decorative subject artwork only; never used to infer academic status or scores. */
export function groupCover(subject: string): string {
  const value = subject.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/farmacocinet|biofarmac/.test(value)) return 'kinetics';
  if (/farmacolog|terapeut/.test(value)) return 'pharmacology';
  if (/embrio|obstetri/.test(value)) return 'embryology';
  if (/propedeut|semiolog/.test(value)) return 'clinical';
  if (/fisiopat|fisiolog|cardio/.test(value)) return 'physiology';
  if (/anatom|anfiteatro|ortodon/.test(value)) return 'anatomy';
  return 'general';
}

function attendanceTone(group?: DashboardGroup): string {
  if (group?.today_attendance_status === 'open') return 'open';
  if (group?.today_attendance_status === 'paused') return 'paused';
  if (group?.today_attendance_status === 'closed') return 'closed';
  return 'none';
}

function count(value?: number | null): string {
  return value == null || !Number.isFinite(Number(value)) ? '—' : Number(value).toLocaleString('es-MX');
}

function GroupCardOptions({ group, onEdit, onDeleted }: {
  group: GroupRecord; onEdit: () => void; onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const label = group.group_name || group.name;

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>('.group-options-panel > button')?.focus());
    const outside = (event: PointerEvent) => {
      const node = root.current;
      // Never unmount a deletion confirmation or an in-flight destructive action.
      if (node && !node.querySelector('dialog[open]') && event.target instanceof Node && !node.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => { cancelAnimationFrame(frame); document.removeEventListener('pointerdown', outside); };
  }, [open]);

  return <div className="group-card-options" ref={root} data-open={open || undefined}
    onBlur={event => {
      if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget) && !event.currentTarget.querySelector('dialog[open]')) setOpen(false);
    }}
    onKeyDown={event => {
      if (event.key === 'Escape' && !event.defaultPrevented && !(event.target instanceof Element && event.target.closest('dialog'))) {
        event.preventDefault(); setOpen(false); trigger.current?.focus();
      }
    }}>
    <button ref={trigger} className="group-options-trigger" type="button" aria-expanded={open} aria-controls={id}
      aria-label={`Opciones del grupo ${label}: ${group.subject || 'Grupo'}`} onClick={() => setOpen(value => !value)}>
      <Icon name="more" />
    </button>
    {open ? <div id={id} className="group-options-panel" role="group" aria-label={`Acciones de ${label}`}>
      <button className="button ghost compact" type="button" onClick={() => { setOpen(false); onEdit(); }}>Editar</button>
      <AcademicDeleteButton target={{ kind: 'group', id: group.id, label }} onDeleted={onDeleted} />
    </div> : null}
  </div>;
}

export function GroupCatalogCard({ group, dashboard, onEdit, onDeleted }: {
  group: GroupRecord; dashboard?: DashboardGroup; onEdit: () => void; onDeleted: () => void;
}) {
  const id = useId();
  const rate = dashboard?.attendance_rate;
  const validRate = rate != null && Number.isFinite(Number(rate));
  const progress = validRate ? Math.min(100, Math.max(0, Number(rate))) : 0;
  const alerts = dashboard ? Number(dashboard.risk_count || 0) + Number(dashboard.watch_count || 0) : null;

  return <article className="group-catalog-card" data-group-id={group.id} data-group-color={groupAccent(group.id)}
    data-cover={groupCover(group.subject || '')} aria-labelledby={`${id}-subject ${id}-name`}>
    <div className="group-card-cover" aria-hidden="true"><Icon name="bank" /></div>
    <div className="group-card-topline">
      <span className="group-attendance-badge" data-status={attendanceTone(dashboard)}><i aria-hidden="true" />{attendanceLabel(dashboard)}</span>
      <GroupCardOptions group={group} onEdit={onEdit} onDeleted={onDeleted} />
    </div>
    <header className="group-card-identity">
      <div>
        <span className="eyebrow" id={`${id}-subject`}>{group.subject || 'Grupo'}</span>
        <h2 id={`${id}-name`}>{group.group_name || group.name}</h2>
        <InstitutionIdentity name={group.university_name || group.university} logoUrl={dashboard?.institution_logo_url}
          detail={[group.program_name || group.program, group.term].filter(Boolean).join(' · ')} />
      </div>
    </header>
    <div className="group-catalog-metrics">
      <span><span className="group-stat-value"><Icon name="groups" /><b>{count(dashboard?.students)}</b></span><small>Alumnos</small></span>
      <span className="group-attendance-stat"><span className="group-stat-value">
        <svg viewBox="0 0 48 48" aria-hidden="true"><circle className="group-ring-track" cx="24" cy="24" r="21" /><circle className="group-ring-value" cx="24" cy="24" r="21" pathLength="100" strokeDasharray={`${progress} 100`} transform="rotate(-90 24 24)" /></svg>
        <b>{formatPercent(validRate ? rate : null)}</b>
      </span><small>Asistencia</small></span>
      <span><span className="group-stat-value"><Icon name="grades" /><b>{formatGrade(dashboard?.grade_avg)}</b></span><small>Promedio</small></span>
      <span data-alerts={alerts != null && alerts > 0 || undefined}><span className="group-stat-value"><Icon name="alert" /><b>{count(alerts)}</b></span><small>Alertas</small></span>
    </div>
    <div className="group-catalog-context">
      <span><Icon name="clock" />{formatActivity(dashboard?.last_activity)}</span>
      <span>{count(dashboard?.attendance_sessions_count)} listas históricas</span>
    </div>
    <footer>
      <Link className="button group-open-button" to={`/groups/${group.id}`}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 3.5v13L16 10Z" fill="currentColor" /></svg>Abrir grupo</Link>
      <Link className="button group-attendance-button" to={`/attendance/${group.id}`}><Icon name="attendance" />Asistencia</Link>
    </footer>
  </article>;
}
