import { useMemo, useState } from 'react';
import { attendanceLabel, formatActivity, formatGrade, formatPercent, groupName, groupSubject } from '../../core/academic';
import { useTeacherHome } from '../../core/useTeacherHome';
import type { DashboardGroup } from '../../core/types';
import { EmptyState, ErrorPanel, LegacyBridge, LoadingScreen, PageHeader, StatusPill } from '../../shared/components';
import { Icon } from '../../shared/icons';

function tone(group: DashboardGroup): string {
  if (Number(group.risk_count || 0) > 0) return 'red';
  if (Number(group.watch_count || 0) > 0) return 'amber';
  if (group.today_attendance_status === 'closed') return 'green';
  return 'blue';
}

export function GroupsPage() {
  const home = useTeacherHome();
  const [query, setQuery] = useState('');
  const groups = home.data?.dashboard.groups || [];
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return groups;
    return groups.filter((group) => [groupName(group), groupSubject(group), group.university, group.term].filter(Boolean).join(' ').toLowerCase().includes(needle));
  }, [groups, query]);

  if (home.isLoading) return <LoadingScreen label="Cargando grupos…" />;
  if (home.isError) return <ErrorPanel title="No pude cargar tus grupos" detail={home.error.message} onRetry={() => home.refetch()} />;

  return (
    <div className="view-stack">
      <PageHeader eyebrow="GRUPOS" title="Centro de grupos" detail="Primera lectura del módulo reconstruido. Los datos provienen del mismo dashboard seguro." actions={<LegacyBridge label="Administrar en versión actual" />} />

      <div className="toolbar-v2">
        <label className="search-field"><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar grupo, materia o institución" aria-label="Buscar grupos" /></label>
        <StatusPill tone="blue">{filtered.length} de {groups.length}</StatusPill>
      </div>

      {filtered.length ? (
        <section className="groups-catalog">
          {filtered.map((group) => (
            <article className="group-catalog-card" key={group.id}>
              <header>
                <div><span className="eyebrow">{groupSubject(group)}</span><h2>{groupName(group)}</h2><p>{group.university || 'TEDVIO'}{group.term ? ` · ${group.term}` : ''}</p></div>
                <StatusPill tone={tone(group)}>{attendanceLabel(group)}</StatusPill>
              </header>
              <div className="group-catalog-metrics">
                <span><small>Alumnos</small><b>{Number(group.students || 0).toLocaleString('es-MX')}</b></span>
                <span><small>Asistencia</small><b>{formatPercent(group.attendance_rate)}</b></span>
                <span><small>Promedio</small><b>{formatGrade(group.grade_avg)}</b></span>
                <span><small>Alertas</small><b>{Number(group.risk_count || 0) + Number(group.watch_count || 0)}</b></span>
              </div>
              <div className="group-catalog-context">
                <span><Icon name="clock" />{formatActivity(group.last_activity)}</span>
                <span>{Number(group.attendance_sessions_count || 0)} listas históricas</span>
              </div>
              <footer>
                <p>{Number(group.risk_count || 0) ? `${group.risk_count} alumno${Number(group.risk_count) === 1 ? '' : 's'} en riesgo.` : Number(group.watch_count || 0) ? `${group.watch_count} en seguimiento.` : 'Sin alertas académicas críticas.'}</p>
                <LegacyBridge groupId={group.id} label="Abrir grupo operativo" />
              </footer>
            </article>
          ))}
        </section>
      ) : (
        <EmptyState icon="groups" title={groups.length ? 'No encontramos coincidencias' : 'Aún no tienes grupos'} detail={groups.length ? 'Prueba con otra materia, grupo o institución.' : 'La creación y edición se migrarán en la siguiente fase.'} action={<LegacyBridge />} />
      )}
    </div>
  );
}
