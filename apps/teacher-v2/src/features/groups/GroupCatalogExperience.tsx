import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { attendanceLabel, formatActivity, formatGrade, formatPercent } from '../../core/academic';
import { universitySections } from '../../core/group-catalog';
import { groupAccent } from '../../core/group-identity';
import type { DashboardGroup, GroupRecord } from '../../core/types';
import { AcademicDeleteButton } from '../../shared/AcademicDeleteButton';
import { EmptyState, StatusPill } from '../../shared/components';
import { useGroupCatalog } from '../../shared/GroupCatalogFilters';
import { InstitutionIdentity } from '../../shared/InstitutionIdentity';
import { Icon } from '../../shared/icons';
import coversUrl from './group-covers.webp';
import '../../styles/groups-premium.css';

type Bucket = 'all' | 'today' | 'pending' | 'alerts';
type Sort = 'academic' | 'activity' | 'attendance' | 'alerts';
const buckets = [
  { id: 'all', label: 'Todos', icon: 'groups' },
  { id: 'today', label: 'Con lista hoy', icon: 'attendance' },
  { id: 'pending', label: 'Sin lista hoy', icon: 'clock' },
  { id: 'alerts', label: 'Con alertas', icon: 'alert' },
] as const;

function finite(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) ? value : null;
}
function alertCount(group?: DashboardGroup): number | null {
  return group ? Math.max(0, finite(group.risk_count) ?? 0) + Math.max(0, finite(group.watch_count) ?? 0) : null;
}
function matchesBucket(group: DashboardGroup | undefined, bucket: Bucket): boolean {
  const hasList = ['open', 'paused', 'closed'].includes(group?.today_attendance_status || '');
  if (bucket === 'today') return hasList;
  if (bucket === 'pending') return Boolean(group) && !hasList;
  if (bucket === 'alerts') return (alertCount(group) ?? 0) > 0;
  return true;
}

/** Decorative subject art only. It never supplies logos, academic data or a diagnosis. */
function subjectCover(subject: string): string {
  const text = subject.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  if (/farmacocinet|biofarm/.test(text)) return 'kinetics';
  if (/farmaco/.test(text)) return 'pharmacology';
  if (/embrio/.test(text)) return 'embryology';
  if (/anatom|anfiteat|disecc|ortodon/.test(text)) return 'anatomy';
  if (/propedeut|semiolog|practica clinica/.test(text)) return 'clinical';
  if (/fisiop|cardio|patolog/.test(text)) return 'physiology';
  return 'academic';
}

function GroupActions({ group, onEdit, onDeleted }: {
  group: GroupRecord; onEdit: (group: GroupRecord) => void; onDeleted: (group: GroupRecord) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const name = group.group_name || group.name;
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      // Never unmount/hide the existing destructive confirmation while it is open.
      if (root.current?.querySelector('dialog[open]')) return;
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  return <div className={`pg-card-more${open ? ' is-open' : ''}`} ref={root}
    onBlur={event => {
      if (root.current?.querySelector('dialog[open]')) return;
      if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}
    onKeyDown={event => {
      if ((event.target as HTMLElement).closest('dialog')) return;
      if (event.key === 'Escape' && open) {
        event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus();
      }
      if (open && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        const buttons = [...(panel.current?.querySelectorAll<HTMLButtonElement>(':scope > button:not(:disabled)') || [])];
        if (!buttons.length) return;
        event.preventDefault();
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[index]?.focus();
      }
    }}>
    <button ref={trigger} type="button" className="pg-more-trigger" aria-label={`Opciones del grupo ${name}`} aria-expanded={open} aria-controls={id}
      onClick={() => setOpen(value => !value)} onKeyDown={event => { if (event.key === 'ArrowDown' && !open) { event.preventDefault(); setOpen(true); } }}><Icon name="more" /></button>
    <div ref={panel} id={id} className="pg-action-panel" role="group" aria-label={`Acciones de ${name}`} hidden={!open}>
      <button className="button ghost compact" type="button" onClick={() => { setOpen(false); onEdit(group); }}>Editar</button>
      <AcademicDeleteButton target={{ kind: 'group', id: group.id, label: name }} onDeleted={() => onDeleted(group)} />
    </div>
  </div>;
}

function GroupCard({ group, dashboard, onEdit, onDeleted }: {
  group: GroupRecord; dashboard?: DashboardGroup; onEdit: (group: GroupRecord) => void; onDeleted: (group: GroupRecord) => void;
}) {
  const id = useId();
  const subject = group.subject || 'Grupo';
  const cover = subjectCover(subject);
  const rate = finite(dashboard?.attendance_rate);
  const clampedRate = rate === null ? 0 : Math.min(100, Math.max(0, rate));
  const alerts = alertCount(dashboard);
  const state = dashboard?.today_attendance_status;
  const tone = state === 'closed' ? 'green' : state === 'open' ? 'blue' : state === 'paused' ? 'amber' : 'neutral';
  return <article className="group-catalog-card pg-card" data-group-id={group.id} data-group-color={groupAccent(group.id)} data-cover={cover} aria-labelledby={id}>
    <div className="pg-cover">
      <div className="pg-cover-art" aria-hidden="true">{cover === 'academic' ? <Icon name="bank" /> : <img src={coversUrl} width="320" height="528" alt="" loading="lazy" decoding="async" draggable={false} />}</div>
      <div className="pg-cover-controls"><StatusPill tone={tone}>{dashboard ? attendanceLabel(dashboard) : 'Sin resumen'}</StatusPill><GroupActions group={group} onEdit={onEdit} onDeleted={onDeleted} /></div>
    </div>
    <header className="pg-card-identity">
      <span className="eyebrow">{subject}</span>
      <h2 id={id}>{group.group_name || group.name}</h2>
      <InstitutionIdentity name={group.university_name || group.university} logoUrl={dashboard?.institution_logo_url} detail={[group.program_name || group.program, group.term || group.school_cycle].filter(Boolean).join(' · ')} />
    </header>
    <div className="group-catalog-metrics">
      <span><span className="pg-metric-value"><Icon name="groups" /><b>{dashboard ? (finite(dashboard.students) ?? 0).toLocaleString('es-MX') : '—'}</b></span><small>Alumnos</small></span>
      <span className="pg-attendance-metric"><span className="pg-rate-ring"><svg viewBox="0 0 48 48" aria-hidden="true"><circle className="pg-ring-track" cx="24" cy="24" r="20" /><circle className="pg-ring-progress" cx="24" cy="24" r="20" pathLength="100" strokeDasharray={`${clampedRate} 100`} /></svg><b>{formatPercent(rate)}</b></span><small>Asistencia</small></span>
      <span><span className="pg-metric-value"><Icon name="grades" /><b>{formatGrade(dashboard?.grade_avg)}</b></span><small>Promedio</small></span>
      <span data-attention={(alerts ?? 0) > 0 ? 'true' : 'false'}><span className="pg-metric-value"><Icon name="alert" /><b>{alerts === null ? '—' : alerts.toLocaleString('es-MX')}</b></span><small>Alertas</small></span>
    </div>
    <div className="group-catalog-context"><span><Icon name="clock" />{formatActivity(dashboard?.last_activity)}</span><span>{dashboard ? (finite(dashboard.attendance_sessions_count) ?? 0).toLocaleString('es-MX') : '—'} listas históricas</span></div>
    <footer><Link className="button primary pg-open" to={`/groups/${group.id}`}><Icon name="arrow" />Abrir grupo</Link><Link className="button secondary pg-attendance" to={`/attendance/${group.id}`}><Icon name="attendance" />Asistencia</Link></footer>
  </article>;
}

export function GroupCatalogExperience({ catalog, dashboardById, onEdit, onDeleted, onCreate }: {
  catalog: ReturnType<typeof useGroupCatalog<GroupRecord>>;
  dashboardById: ReadonlyMap<string, DashboardGroup>;
  onEdit: (group: GroupRecord) => void;
  onDeleted: (group: GroupRecord) => void;
  onCreate: () => void;
}) {
  const [bucket, setBucket] = useState<Bucket>('all');
  const [sort, setSort] = useState<Sort>('academic');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const counts = buckets.map(item => catalog.filtered.filter(group => matchesBucket(dashboardById.get(group.id), item.id)).length);
  const sections = useMemo(() => {
    const visible = catalog.filtered.filter(group => matchesBucket(dashboardById.get(group.id), bucket));
    return universitySections(visible).map(section => ({ ...section, groups: [...section.groups].sort((a, b) => {
      const left = dashboardById.get(a.id), right = dashboardById.get(b.id);
      if (sort === 'attendance') return (finite(right?.attendance_rate) ?? -1) - (finite(left?.attendance_rate) ?? -1);
      if (sort === 'alerts') return (alertCount(right) ?? -1) - (alertCount(left) ?? -1);
      if (sort === 'activity') return (Date.parse(right?.last_activity || '') || 0) - (Date.parse(left?.last_activity || '') || 0);
      return 0; // The shared catalogue already provides stable, natural academic order.
    }) }));
  }, [catalog.filtered, dashboardById, bucket, sort]);
  const visibleCount = sections.reduce((total, section) => total + section.groups.length, 0);
  function clear() { catalog.clear(); setBucket('all'); }

  return <div className="pg-catalog" data-view={view}>
    {catalog.total ? <>
      <div className="group-catalog-filters pg-filters">
        <label className="catalog-search">Buscar grupos<div><Icon name="search" /><input type="search" value={catalog.query} onChange={event => catalog.change('q', event.target.value)} placeholder="Grupo, materia o universidad" /></div></label>
        <label>Universidad<select aria-label="Universidad" value={catalog.university} onChange={event => catalog.change('university', event.target.value)}><option value="">Todas las universidades</option>{catalog.universities.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
        <label>Materia<select aria-label="Materia" value={catalog.subject} onChange={event => catalog.change('subject', event.target.value)}><option value="">Todas las materias</option>{catalog.subjects.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
      </div>
      <div className="pg-toolbar">
        <div className="pg-status-filters" role="group" aria-label="Filtrar por actividad">{buckets.map((item, index) => <button key={item.id} type="button" aria-pressed={bucket === item.id} onClick={() => setBucket(item.id)}><Icon name={item.icon} /><span>{item.label}</span><b>{counts[index]}</b></button>)}</div>
        <div className="pg-display-controls"><label>Ordenar por<select aria-label="Ordenar grupos" value={sort} onChange={event => setSort(event.target.value as Sort)}><option value="academic">Orden académico</option><option value="activity">Última actividad</option><option value="attendance">Mayor asistencia</option><option value="alerts">Más alertas</option></select></label><div className="pg-view-switch" role="group" aria-label="Vista de grupos"><button type="button" aria-label="Vista de tarjetas" title="Vista de tarjetas" aria-pressed={view === 'grid'} onClick={() => setView('grid')}><Icon name="layout" /></button><button type="button" aria-label="Vista de lista" title="Vista de lista" aria-pressed={view === 'list'} onClick={() => setView('list')}><Icon name="menu" /></button></div></div>
      </div>
      <div className="pg-result-summary"><span role="status">{visibleCount} de {catalog.total} grupos</span>{catalog.active || bucket !== 'all' ? <button type="button" className="button ghost compact" onClick={clear}>Limpiar filtros</button> : null}</div>
    </> : null}
    {sections.length ? <div className="catalog-universities">{sections.map(section => <section className="catalog-university" key={section.name} aria-label={section.name}>
      <header className="catalog-university-heading"><h3>{section.name}</h3><span>{section.groups.length} {section.groups.length === 1 ? 'grupo' : 'grupos'}</span></header>
      <div className="groups-catalog">{section.groups.map(group => <GroupCard key={group.id} group={group} dashboard={dashboardById.get(group.id)} onEdit={onEdit} onDeleted={onDeleted} />)}</div>
    </section>)}</div> : <EmptyState icon="groups" title={catalog.total ? 'No encontramos coincidencias' : 'Aún no tienes grupos'} detail={catalog.total ? 'Prueba con otra búsqueda o limpia los filtros para ver todos tus grupos.' : 'Crea la estructura académica y después registra el primer grupo.'} action={catalog.total ? <button className="button secondary" type="button" onClick={clear}>Ver todos los grupos</button> : <button className="button primary" type="button" onClick={onCreate}>Crear grupo</button>} />}
  </div>;
}
