import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  agendaSnapshot,
  attendanceLabel,
  formatActivity,
  formatGrade,
  formatPercent,
  formatTime,
  groupName,
  groupSubject,
  recommendedAction,
  untilLabel,
} from '../../core/academic';
import { useTeacherHome } from '../../core/useTeacherHome';
import type { AgendaOccurrence, DashboardGroup } from '../../core/types';
import {
  ErrorPanel,
  LegacyBridge,
  LoadingScreen,
  MetricCard,
  PageHeader,
  SectionCard,
  StatusPill,
} from '../../shared/components';
import { Icon } from '../../shared/icons';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Buenos días';
  if (hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

function firstName(email?: string): string {
  const raw = String(email || '').split('@')[0] || 'docente';
  return raw.split(/[._-]/).filter(Boolean)[0] || 'docente';
}

function attendanceTone(group: DashboardGroup): string {
  const state = String(group.today_attendance_status || '');
  if (state === 'open') return 'green';
  if (state === 'paused') return 'amber';
  if (state === 'closed') return 'blue';
  return 'neutral';
}

function AgendaFocus({ occurrence, label }: { occurrence: AgendaOccurrence | null; label: string }) {
  if (!occurrence) {
    return (
      <article className="agenda-focus empty">
        <span className="eyebrow">{label}</span>
        <h3>Sin otra clase programada</h3>
        <p>Configura el horario cuando estés listo.</p>
      </article>
    );
  }

  return (
    <article className="agenda-focus">
      <div className="agenda-focus-top"><span className="eyebrow">{label}</span><StatusPill tone={occurrence.start <= new Date() ? 'green' : 'blue'}>{untilLabel(occurrence)}</StatusPill></div>
      <h3>{groupSubject(occurrence.group)}</h3>
      <p>{groupName(occurrence.group)} · {formatTime(occurrence.slot.start_time)}–{formatTime(occurrence.slot.end_time)}</p>
      <small>{[occurrence.slot.room, occurrence.slot.modality].filter(Boolean).join(' · ') || 'Ubicación sin especificar'}</small>
      <Link className="button ghost compact" to={`/attendance/${occurrence.slot.group_id}`}>Preparar asistencia</Link>
    </article>
  );
}

function GroupCard({ group }: { group: DashboardGroup }) {
  return (
    <article className="group-card-v2">
      <header>
        <div><span className="eyebrow">{groupSubject(group)}</span><h3>{groupName(group)}</h3><p>{group.university || 'TEDVIO'}{group.term ? ` · ${group.term}` : ''}</p></div>
        <StatusPill tone={attendanceTone(group)}>{attendanceLabel(group)}</StatusPill>
      </header>
      <div className="group-mini-metrics">
        <span><small>Alumnos</small><b>{Number(group.students || 0).toLocaleString('es-MX')}</b></span>
        <span><small>Asistencia</small><b>{formatPercent(group.attendance_rate)}</b></span>
        <span><small>Promedio</small><b>{formatGrade(group.grade_avg)}</b></span>
      </div>
      <footer><small>Última actividad: {formatActivity(group.last_activity)}</small><div><Link className="button ghost compact" to={`/groups/${group.id}`}>Abrir grupo</Link><Link className="button primary compact" to={`/attendance/${group.id}`}>Asistencia</Link></div></footer>
    </article>
  );
}

export function DashboardPage() {
  const home = useTeacherHome();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const data = home.data;
  const groups = data?.dashboard.groups || [];
  const agenda = useMemo(() => agendaSnapshot(data?.schedule || [], groups), [data?.schedule, groups]);
  const action = useMemo(() => recommendedAction(data?.dashboard || {}), [data?.dashboard]);

  if (home.isLoading) return <LoadingScreen label="Preparando el nuevo centro docente…" />;
  if (home.isError) return <ErrorPanel title="No pude cargar TEDVIO 2.0" detail={home.error.message} onRetry={() => home.refetch()} />;
  if (!data) return null;

  if (data.profile.status === 'suspended') {
    return <ErrorPanel title="Acceso suspendido" detail="Contacta al administrador de tu institución para recuperar el acceso." />;
  }

  const currentOrNext = agenda.current || agenda.next;
  const plan = data.entitlements?.display_name || data.entitlements?.plan || data.profile.plan || 'Free';
  const risk = Number(data.dashboard.risk_students || 0);
  const watch = Number(data.dashboard.watch_students || 0);
  const pending = Number(data.dashboard.pending_attendance || 0);

  return (
    <div className="view-stack">
      <PageHeader
        eyebrow="TEDVIO 2.0 · CENTRO DOCENTE"
        title={`${greeting()}, ${firstName(data.user.email)}.`}
        detail="Inicio, Agenda, Grupos, padrón y Asistencia ya operan dentro de un solo shell persistente."
        actions={
          <button className="button secondary" type="button" onClick={() => queryClient.invalidateQueries({ queryKey: ['teacher-home'] })}>
            <Icon name="refresh" />Actualizar
          </button>
        }
      />

      {data.warnings.length ? (
        <div className="warning-strip"><Icon name="alert" /><span>Algunos datos complementarios no pudieron cargarse: {data.warnings.join(' · ')}</span></div>
      ) : null}

      <section className={`hero-command tone-${action.tone}`}>
        <div className="hero-copy">
          <span className="eyebrow">{action.eyebrow}</span>
          <h2>{action.title}</h2>
          <p>{action.detail}</p>
          <div className="hero-actions">
            {action.groupId ? <button className="button primary" type="button" onClick={() => navigate(`/attendance/${action.groupId}`)}>Abrir siguiente acción</button> : <button className="button primary" type="button" onClick={() => navigate('/groups')}>Ver grupos</button>}
            <button className="button ghost" type="button" onClick={() => navigate('/agenda')}>Abrir agenda</button>
          </div>
        </div>
        <div className="hero-context">
          <span>PLAN ACTIVO</span><b>TEDVIO {String(plan).toUpperCase()}</b>
          <small>{currentOrNext ? `${untilLabel(currentOrNext)} · ${groupName(currentOrNext.group)}` : 'Sin clase programada en la agenda'}</small>
        </div>
      </section>

      <section className="metrics-grid">
        <MetricCard icon="groups" label="Grupos" value={String(data.dashboard.groups_count ?? groups.length)} detail="Activos en tu espacio" tone="blue" />
        <MetricCard icon="attendance" label="Asistencias pendientes" value={String(pending)} detail={pending ? 'Requieren revisión hoy' : 'Sin pendientes detectados'} tone={pending ? 'amber' : 'green'} />
        <MetricCard icon="alert" label="En riesgo" value={String(risk)} detail={risk ? 'Requieren atención' : 'Sin alertas críticas'} tone={risk ? 'red' : 'neutral'} />
        <MetricCard icon="shield" label="Seguimiento" value={String(watch)} detail="Vigilancia preventiva" tone={watch ? 'violet' : 'neutral'} />
      </section>

      <SectionCard className="agenda-section">
        <div className="section-heading"><div><span className="eyebrow">AGENDA ACADÉMICA</span><h2>{agenda.current ? 'Clase en curso' : 'Tu jornada'}</h2><p>{agenda.today.length ? `${agenda.today.length} clase${agenda.today.length === 1 ? '' : 's'} programada${agenda.today.length === 1 ? '' : 's'} hoy.` : 'No hay clases programadas para hoy.'}</p></div><button className="button ghost" type="button" onClick={() => navigate('/agenda')}>Ver semana <Icon name="arrow" /></button></div>
        <div className="agenda-focus-grid"><AgendaFocus occurrence={agenda.current || agenda.next} label={agenda.current ? 'AHORA' : 'SIGUIENTE'} /><AgendaFocus occurrence={agenda.current ? agenda.next : agenda.after} label={agenda.current ? 'DESPUÉS' : 'A CONTINUACIÓN'} /></div>
      </SectionCard>

      <div className="dashboard-columns">
        <SectionCard>
          <div className="section-heading"><div><span className="eyebrow">OPERACIÓN ACADÉMICA</span><h2>Tus grupos</h2><p>Resumen y acceso directo al padrón y la asistencia.</p></div><button className="button ghost" type="button" onClick={() => navigate('/groups')}>Ver todos</button></div>
          <div className="groups-grid-v2">
            {groups.length ? groups.slice(0, 4).map((group) => <GroupCard group={group} key={group.id} />) : <div className="empty-inline"><Icon name="groups" /><div><b>Aún no hay grupos</b><span>Crea la estructura y el primer grupo desde TEDVIO 2.0.</span></div><button className="button primary compact" type="button" onClick={() => navigate('/groups')}>Crear grupo</button></div>}
          </div>
        </SectionCard>

        <div className="side-column">
          <SectionCard>
            <div className="section-heading compact"><div><span className="eyebrow">PRIORIDADES</span><h2>Necesitan atención</h2></div></div>
            <div className="priority-list-v2">
              {(data.dashboard.priority_students || []).length ? (data.dashboard.priority_students || []).slice(0, 5).map((student, index) => (
                <article key={student.student_id || `${student.group_id}-${index}`}>
                  <span className={`priority-dot ${student.status === 'risk' ? 'risk' : 'watch'}`} />
                  <div><b>{student.full_name || 'Alumno'}</b><small>{[student.attendance_rate != null ? `Asistencia ${formatPercent(student.attendance_rate)}` : '', student.grade != null ? `Promedio ${formatGrade(student.grade)}` : ''].filter(Boolean).join(' · ') || 'Señal académica detectada'}</small></div>
                  {student.group_id ? <Link className="button ghost compact" to={`/groups/${student.group_id}`}>Abrir</Link> : null}
                </article>
              )) : <div className="empty-compact"><Icon name="check" /><div><b>Sin alertas prioritarias</b><span>TEDVIO mostrará aquí las señales relevantes.</span></div></div>}
            </div>
          </SectionCard>

          <SectionCard>
            <div className="section-heading compact"><div><span className="eyebrow">ÚLTIMA EVALUACIÓN</span><h2>{data.dashboard.latest_evaluation?.title || 'Sin evaluación reciente'}</h2></div></div>
            {data.dashboard.latest_evaluation ? <div className="latest-eval-v2"><div><span>PROMEDIO</span><b>{formatGrade(data.dashboard.latest_evaluation.average)}</b></div><p>Los resultados y Assessment Intelligence se migrarán en la siguiente etapa.</p><LegacyBridge groupId={data.dashboard.latest_evaluation.group_id || undefined} compact /></div> : <p className="muted-copy">Cuando registres una evaluación aparecerá en este espacio.</p>}
          </SectionCard>
        </div>
      </div>

      <section className="migration-note">
        <div className="migration-note-icon"><Icon name="layout" /></div>
        <div><span className="eyebrow">RECONSTRUCCIÓN CONTROLADA</span><h2>Fase 2 activa: Grupos, alumnos y Asistencia Pro.</h2><p>La operación diaria ya funciona dentro del frontend unificado. Modo Clase, Banco, OMR, Libro y Periodos continúan en migración.</p></div>
        <LegacyBridge label="Abrir módulos todavía no migrados" />
      </section>
    </div>
  );
}
