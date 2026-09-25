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
import { useTeacherIdentity } from '../../core/useTeacherIdentity';
import type { AgendaOccurrence, DashboardGroup } from '../../core/types';
import {
  ErrorPanel,
  LoadingScreen,
  MetricCard,
  PageHeader,
  SectionCard,
  StatusPill,
} from '../../shared/components';
import { Icon } from '../../shared/icons';
import { InstitutionIdentity } from '../../shared/InstitutionIdentity';
import { groupAccent } from '../../core/group-identity';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Buenos días';
  if (hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
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
      <div className="hero-actions">
        <Link className="button primary compact" to={`/classroom?group=${encodeURIComponent(occurrence.slot.group_id)}`}>Iniciar clase</Link>
        <Link className="button ghost compact" to={`/attendance/${occurrence.slot.group_id}`}>Preparar asistencia</Link>
      </div>
    </article>
  );
}

function GroupCard({ group }: { group: DashboardGroup }) {
  return (
    <article className="group-card-v2" data-group-color={groupAccent(group.id)}>
      <header>
        <div><span className="eyebrow">{groupSubject(group)}</span><h3><Link to={`/groups/${group.id}`}>{groupName(group)}</Link></h3><InstitutionIdentity name={group.university} logoUrl={group.institution_logo_url} detail={group.term} /></div>
        <StatusPill tone={attendanceTone(group)}>{attendanceLabel(group)}</StatusPill>
      </header>
      <div className="group-mini-metrics">
        <span><small>Alumnos</small><b>{Number(group.students || 0).toLocaleString('es-MX')}</b></span>
        <span><small>Asistencia</small><b>{formatPercent(group.attendance_rate)}</b></span>
        <span><small>Promedio</small><b>{formatGrade(group.grade_avg)}</b></span>
      </div>
      <footer><small>Última actividad: {formatActivity(group.last_activity)}</small><div><Link className="button secondary compact" to={`/groups/${group.id}`}>Abrir grupo <Icon name="arrow" /></Link><Link className="button ghost compact" to={`/attendance/${group.id}`}>Asistencia</Link><Link className="button ghost compact" to={`/classroom?group=${encodeURIComponent(group.id)}`}>Modo Clase</Link></div></footer>
    </article>
  );
}

export function DashboardPage() {
  const home = useTeacherHome();
  const identity = useTeacherIdentity();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const data = home.data;
  const groups = data?.dashboard.groups || [];
  const agenda = useMemo(() => agendaSnapshot(data?.schedule || [], groups), [data?.schedule, groups]);
  const action = useMemo(() => recommendedAction(data?.dashboard || {}), [data?.dashboard]);

  if (home.isLoading) return <LoadingScreen label="Preparando tu centro docente…" />;
  if (home.isError) return <ErrorPanel title="No pude cargar tu espacio docente" detail={home.error.message} onRetry={() => home.refetch()} />;
  if (!data) return null;

  if (data.profile.status === 'suspended') {
    return <ErrorPanel title="Acceso suspendido" detail="Contacta al administrador de tu institución para recuperar el acceso." />;
  }

  const currentOrNext = agenda.current || agenda.next;
  const risk = Number(data.dashboard.risk_students || 0);
  const watch = Number(data.dashboard.watch_students || 0);
  const pending = Number(data.dashboard.pending_attendance || 0);
  const nextActionPath = action.groupId
    ? (action.eyebrow === 'ASISTENCIA EN CURSO' || action.eyebrow === 'SIGUIENTE ACCIÓN' ? `/attendance/${action.groupId}` : `/groups/${action.groupId}`)
    : '/groups';

  return (
    <div className="view-stack dashboard-workspace">
      <section className="dashboard-hero" aria-label="Panorama de tu jornada">
        <PageHeader
          eyebrow={new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()).toUpperCase()}
          title={<><span className="dashboard-greeting">{greeting()}, </span><span className="dashboard-teacher-name">{identity.displayName}</span></>}
          detail="Tu jornada, tus grupos y lo que sigue. Todo en su lugar."
          actions={
            <div className="hero-actions">
              <button className="button primary" type="button" onClick={() => navigate(currentOrNext ? `/classroom?group=${encodeURIComponent(currentOrNext.slot.group_id)}` : '/classroom')}>
                <Icon name="classroom" />Iniciar clase
              </button>
              <button className="button secondary" type="button" aria-label="Actualizar" onClick={() => queryClient.invalidateQueries({ queryKey: ['teacher-home'] })}>
                <Icon name="refresh" /><span>Actualizar</span>
              </button>
            </div>
          }
        />
        <div className="dashboard-hero-agenda">
          <span className="dashboard-hero-label"><Icon name="calendar" />{agenda.current ? 'CLASE EN CURSO' : 'EN TU AGENDA'}</span>
          <strong>{currentOrNext ? groupSubject(currentOrNext.group) : 'Día sin clases'}</strong>
          {currentOrNext ? <p>{groupName(currentOrNext.group)} · {formatTime(currentOrNext.slot.start_time)}–{formatTime(currentOrNext.slot.end_time)}</p> : null}
          <Link to={currentOrNext ? `/groups/${currentOrNext.slot.group_id}` : '/agenda'}>{currentOrNext ? 'Abrir grupo' : 'Ver agenda'} <Icon name="arrow" /></Link>
        </div>
      </section>

      {data.warnings.length ? (
        <div className="warning-strip"><Icon name="alert" /><span>Algunos datos complementarios no pudieron cargarse: {data.warnings.join(' · ')}</span></div>
      ) : null}

      <nav className="workspace-quick-actions" aria-label="Acciones rápidas">
        <Link to={currentOrNext ? `/attendance/${currentOrNext.slot.group_id}` : '/attendance'}><Icon name="attendance" /><span>Tomar asistencia<small>Comienza con tu grupo</small></span><Icon name="arrow" /></Link>
        <Link to="/bank"><Icon name="bank" /><span>Banco de preguntas<small>Organiza y reutiliza</small></span><Icon name="arrow" /></Link>
        <Link to="/exams/new"><Icon name="exam" /><span>Crear examen<small>Prepara tu evaluación</small></span><Icon name="arrow" /></Link>
        <Link to="/omr"><Icon name="grades" /><span>Calificar hojas<small>Escanea y revisa</small></span><Icon name="arrow" /></Link>
      </nav>

      <section className="metrics-grid">
        <MetricCard icon="groups" label="Grupos" value={String(data.dashboard.groups_count ?? groups.length)} detail="Activos en tu espacio" tone="blue" />
        <MetricCard icon="attendance" label="Asistencias pendientes" value={String(pending)} detail={pending ? 'Requieren revisión hoy' : 'Sin pendientes detectados'} tone={pending ? 'amber' : 'green'} />
        <MetricCard icon="alert" label="En riesgo" value={String(risk)} detail={risk ? 'Requieren atención' : 'Sin alertas críticas'} tone={risk ? 'red' : 'neutral'} />
        <MetricCard icon="shield" label="Seguimiento" value={String(watch)} detail="Vigilancia preventiva" tone={watch ? 'violet' : 'neutral'} />
      </section>

      <div className="dashboard-columns">
        <SectionCard className="dashboard-groups-section">
          <div className="section-heading"><div><span className="eyebrow">TU AULA, A UN CLIC</span><h2>Mis grupos</h2><p>Continúa donde lo dejaste.</p></div><Link className="button ghost" to="/groups">Ver todos <Icon name="arrow" /></Link></div>
          <div className={`workspace-next-action tone-${action.tone}`}><Icon name={pending ? 'clock' : 'check'} /><div><b>{action.title}</b><p>{action.detail}</p></div><Link to={nextActionPath} className="button ghost compact">{action.groupId ? 'Revisar' : 'Ver grupos'}</Link></div>
          <div className="groups-grid-v2">
            {groups.length ? groups.slice(0, 4).map((group) => <GroupCard group={group} key={group.id} />) : <div className="empty-inline"><Icon name="groups" /><div><b>Aún no hay grupos</b><span>Crea la estructura y el primer grupo para comenzar.</span></div><button className="button primary compact" type="button" onClick={() => navigate('/groups')}>Crear grupo</button></div>}
          </div>
        </SectionCard>

        <div className="side-column">
          <SectionCard className="agenda-section">
            <div className="section-heading"><div><span className="eyebrow">EN TU AGENDA</span><h2>{agenda.current ? 'Clase en curso' : 'Tu próxima clase'}</h2><p>{agenda.today.length ? `${agenda.today.length} clase${agenda.today.length === 1 ? '' : 's'} hoy.` : 'Hoy no tienes clases programadas.'}</p></div><Link className="button ghost compact" to="/agenda">Ver agenda</Link></div>
            <AgendaFocus occurrence={currentOrNext} label={agenda.current ? 'AHORA' : 'SIGUIENTE'} />
          </SectionCard>
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
            {data.dashboard.latest_evaluation ? <div className="latest-eval-v2"><div><span>PROMEDIO</span><b>{formatGrade(data.dashboard.latest_evaluation.average)}</b></div><p>Consulta resultados, reactivos y seguimiento desde Evaluaciones.</p><Link className="button ghost compact" to="/exams">Abrir evaluaciones</Link></div> : <div><p className="muted-copy">Cuando registres una evaluación aparecerá en este espacio.</p><Link className="button ghost compact" to="/exams/new">Crear evaluación</Link></div>}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
