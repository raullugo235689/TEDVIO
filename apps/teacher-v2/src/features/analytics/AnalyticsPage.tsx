import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  analyticsDataKey,
  analyticsWorkspaceKey,
  downloadAnalyticsCsv,
  fetchAnalyticsData,
  fetchAnalyticsWorkspace,
  printAnalyticsReport,
  type AnalyticsGroup,
  type AnalyticsSession,
} from '../../core/analytics';
import { groupName, groupSubject } from '../../core/academic';
import { EmptyState, ErrorPanel, LoadingScreen, MetricCard, PageHeader, SectionCard, StatusPill } from '../../shared/components';
import { Icon } from '../../shared/icons';
import { useAuth } from '../auth/AuthProvider';

function isoDay(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function defaultFrom(): string {
  const date = new Date();
  date.setDate(date.getDate() - 89);
  return isoDay(date);
}

function number(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function percent(value?: number | null): string {
  return value == null || !Number.isFinite(Number(value)) ? '—' : `${Math.round(Number(value))}%`;
}

function dateShort(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

function dateLong(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
}

function tone(value?: number | null, threshold = 60): string {
  if (value == null) return 'neutral';
  if (Number(value) < threshold) return 'amber';
  return Number(value) >= 80 ? 'green' : 'blue';
}

function TrendChart({ sessions }: { sessions: AnalyticsSession[] }) {
  const width = 820;
  const height = 250;
  const insetX = 42;
  const insetY = 24;
  const plotWidth = width - insetX * 2;
  const plotHeight = height - insetY * 2;
  const x = (index: number) => insetX + (sessions.length <= 1 ? plotWidth / 2 : plotWidth * index / (sessions.length - 1));
  const y = (value: number) => insetY + plotHeight * (1 - Math.max(0, Math.min(100, value)) / 100);
  const series = (key: 'accuracy' | 'participation') => sessions
    .map((session, index) => ({ index, value: session[key] }))
    .filter((point): point is { index: number; value: number } => point.value != null && Number.isFinite(Number(point.value)))
    .map((point) => `${x(point.index)},${y(Number(point.value))}`)
    .join(' ');
  const accuracy = series('accuracy');
  const participation = series('participation');

  if (!sessions.length) return <EmptyState icon="analytics" title="Sin sesiones en este corte" detail="Amplía las fechas o finaliza una sesión para comenzar a visualizar tendencias." />;

  return (
    <div className="analytics-trend-chart">
      <div className="analytics-legend"><span className="accuracy"><i /> Acierto</span><span className="participation"><i /> Participación</span></div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Tendencia de acierto y participación por sesión">
        {[0, 50, 100].map((value) => <g key={value}><line x1={insetX} x2={width - insetX} y1={y(value)} y2={y(value)} /><text x={8} y={y(value) + 4}>{value}%</text></g>)}
        {accuracy ? <polyline className="accuracy-line" points={accuracy} /> : null}
        {participation ? <polyline className="participation-line" points={participation} /> : null}
        {sessions.map((session, index) => (
          <g key={session.id} className="trend-points">
            {session.accuracy != null ? <circle className="accuracy-dot" cx={x(index)} cy={y(number(session.accuracy))} r="4"><title>{session.title}: {percent(session.accuracy)} de acierto</title></circle> : null}
            {session.participation != null ? <circle className="participation-dot" cx={x(index)} cy={y(number(session.participation))} r="4"><title>{session.title}: {percent(session.participation)} de participación</title></circle> : null}
          </g>
        ))}
      </svg>
      <div className="analytics-axis-labels"><span>{dateShort(sessions[0]?.created_at)}</span><span>{sessions.length} sesión{sessions.length === 1 ? '' : 'es'}</span><span>{dateShort(sessions.at(-1)?.created_at)}</span></div>
    </div>
  );
}

function GroupComparison({ groups, search }: { groups: AnalyticsGroup[]; search: string }) {
  return (
    <div className="analytics-group-list">
      {groups.map((group) => (
        <article key={group.id}>
          <header><div><b>{group.subject}</b><span>{group.name} · {group.sessions} sesiones</span></div><Link className="button ghost compact" to={{ pathname: `/analytics/${group.id}`, search }}>Analizar</Link></header>
          <div className="analytics-bar-row"><span>Acierto</span><div><i className="accuracy" style={{ width: `${Math.max(0, Math.min(100, number(group.accuracy)))}%` }} /></div><b>{percent(group.accuracy)}</b></div>
          <div className="analytics-bar-row"><span>Participación</span><div><i className="participation" style={{ width: `${Math.max(0, Math.min(100, number(group.participation)))}%` }} /></div><b>{percent(group.participation)}</b></div>
        </article>
      ))}
    </div>
  );
}

export function AnalyticsPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const { groupId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialFrom = useMemo(defaultFrom, []);
  const initialTo = useMemo(() => isoDay(new Date()), []);
  const urlFrom = searchParams.get('from') || initialFrom;
  const urlTo = searchParams.get('to') || initialTo;
  const [from, setFrom] = useState(urlFrom);
  const [to, setTo] = useState(urlTo);
  const [accuracyThreshold, setAccuracyThreshold] = useState(60);
  const [participationThreshold, setParticipationThreshold] = useState(60);
  const periodId = searchParams.get('period') || '';
  const [notice, setNotice] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);

  useEffect(() => {
    setFrom(urlFrom);
    setTo(urlTo);
  }, [urlFrom, urlTo]);

  const workspace = useQuery({
    queryKey: analyticsWorkspaceKey(auth.user?.id),
    queryFn: () => {
      if (!auth.user) throw new Error('Tu sesión expiró.');
      return fetchAnalyticsWorkspace(auth.user);
    },
    enabled: Boolean(auth.user),
  });

  const selectedGroupInWorkspace = workspace.data?.groups.find((group) => group.id === groupId) || null;
  const periodIsValid = !periodId || Boolean(selectedGroupInWorkspace && workspace.data?.periods.some((period) => period.id === periodId && period.group_id === selectedGroupInWorkspace.id));

  useEffect(() => {
    if (!workspace.data || !periodId || periodIsValid) return;
    const params = new URLSearchParams(searchParams);
    params.delete('period');
    setSearchParams(params, { replace: true });
    setNotice({ message: 'El periodo anterior no pertenece a este grupo; se restableció el rango personalizado.', tone: 'success' });
  }, [periodId, periodIsValid, searchParams, setSearchParams, workspace.data]);

  const filters = useMemo(() => ({
    groupId: groupId || null,
    periodId: periodId || null,
    from: urlFrom,
    to: urlTo,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    accuracyThreshold,
    participationThreshold,
  }), [accuracyThreshold, groupId, participationThreshold, periodId, urlFrom, urlTo]);

  const validRange = Boolean(periodIsValid && (periodId || (urlFrom && urlTo && urlFrom <= urlTo)));
  const draftRangeValid = Boolean(from && to && from <= to);
  const analytics = useQuery({
    queryKey: analyticsDataKey(auth.user?.id, filters),
    queryFn: () => {
      if (!auth.user) throw new Error('Tu sesión expiró.');
      return fetchAnalyticsData(auth.user, filters);
    },
    enabled: Boolean(auth.user && workspace.data && validRange),
  });

  if (workspace.isLoading) return <LoadingScreen label="Preparando Analytics 2.x…" />;
  if (workspace.isError) return <ErrorPanel title="No pude cargar Analítica" detail={workspace.error.message} onRetry={() => workspace.refetch()} />;
  if (!workspace.data) return null;
  if (!workspace.data.groups.length) return <div className="view-stack analytics-page"><PageHeader eyebrow="TEDVIO ANALYTICS 2.x" title="Analítica académica" detail="Convierte la evidencia de tus clases en decisiones explicables." /><EmptyState icon="groups" title="Primero crea un grupo" detail="La analítica comienza cuando existe un grupo con sesiones vinculadas." action={<Link className="button primary" to="/groups">Crear grupo</Link>} /></div>;

  const selectedGroup = selectedGroupInWorkspace;
  if (groupId && !selectedGroup) return <ErrorPanel title="Grupo no disponible" detail="Este grupo no pertenece a tu cuenta docente." />;
  if (periodId && !periodIsValid) return <LoadingScreen label="Restableciendo el periodo del grupo…" />;
  if (!validRange) return <div className="view-stack analytics-page"><PageHeader eyebrow="TEDVIO ANALYTICS 2.x" title="Analítica académica" /><ErrorPanel title="Rango de fechas no válido" detail="La fecha inicial debe ser anterior o igual a la fecha final." /></div>;
  if (analytics.isLoading) return <LoadingScreen label="Calculando tendencias y alertas…" />;
  if (analytics.isError) return <ErrorPanel title="No pude calcular la analítica" detail={analytics.error.message} onRetry={() => analytics.refetch()} />;
  if (!analytics.data) return null;

  const data = analytics.data;
  const periods = selectedGroup ? workspace.data.periods.filter((period) => period.group_id === selectedGroup.id) : [];
  const selectedPeriod = periods.find((period) => period.id === periodId) || null;
  const scopeLabel = selectedGroup ? `${groupSubject(selectedGroup)} · ${groupName(selectedGroup)}` : 'Todos los grupos';
  const sessions = [...data.sessions].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const difficult = data.questions.filter((question) => question.accuracy != null).sort((a, b) => number(a.accuracy) - number(b.accuracy)).slice(0, 8);
  const weakTopics = data.topics.filter((topic) => topic.accuracy != null).sort((a, b) => number(a.accuracy) - number(b.accuracy)).slice(0, 6);
  const allAlerts = data.students.filter((student) => student.alert_sessions > 0);
  const visibleAlerts = allAlerts.slice(0, 12);
  const repeatedAlerts = allAlerts.filter((student) => student.alert_sessions >= 2).length;
  const latest = [...sessions].reverse().slice(0, 10);
  const groupLabels = new Map(data.groups.map((group) => [group.id, `${group.subject} · ${group.name}`]));
  const sharedSearchParams = new URLSearchParams(searchParams);
  sharedSearchParams.delete('period');
  const sharedSearch = sharedSearchParams.toString() ? `?${sharedSearchParams.toString()}` : '';

  function changeGroup(nextGroupId: string) {
    navigate({ pathname: nextGroupId ? `/analytics/${nextGroupId}` : '/analytics', search: sharedSearch });
  }

  function changePeriod(next: string) {
    const params = new URLSearchParams(searchParams);
    if (next) params.set('period', next); else params.delete('period');
    setSearchParams(params, { replace: true });
  }

  function applyDates() {
    const params = new URLSearchParams(searchParams);
    params.delete('period');
    params.set('from', from);
    params.set('to', to);
    setSearchParams(params, { replace: true });
    setNotice({ message: 'Corte actualizado.', tone: 'success' });
  }

  function exportCsv() {
    downloadAnalyticsCsv(data, scopeLabel);
    setNotice({ message: 'Resumen CSV generado con sesiones, reactivos y seguimiento.', tone: 'success' });
  }

  function printReport() {
    try {
      printAnalyticsReport(data, scopeLabel);
      setNotice({ message: 'Vista de impresión abierta; puedes guardarla como PDF.', tone: 'success' });
    } catch (error) {
      setNotice({ message: error instanceof Error ? error.message : 'No se pudo abrir la impresión.', tone: 'error' });
    }
  }

  return (
    <div className="view-stack analytics-page">
      <PageHeader
        eyebrow="TEDVIO ANALYTICS 2.x"
        title={selectedGroup ? scopeLabel : 'Analítica académica'}
        detail={selectedGroup ? 'Tendencias, reactivos difíciles y seguimiento explicable del grupo.' : 'Compara tus grupos y detecta dónde conviene profundizar.'}
        actions={<><button className="button secondary" type="button" disabled={!data.sessions.length} onClick={exportCsv}><Icon name="reports" /> Exportar CSV</button><button className="button secondary" type="button" disabled={!data.sessions.length} onClick={printReport}>Imprimir / PDF</button><button className="button ghost" type="button" onClick={() => void analytics.refetch()}><Icon name="refresh" /> Actualizar</button></>}
      />

      {notice ? <div className={`success-strip analytics-notice${notice.tone === 'error' ? ' error' : ''}`} role={notice.tone === 'error' ? 'alert' : 'status'}><Icon name={notice.tone === 'error' ? 'alert' : 'check'} /><span>{notice.message}</span><button type="button" aria-label="Cerrar aviso" onClick={() => setNotice(null)}>×</button></div> : null}

      <SectionCard className="analytics-filter-card">
        <div className="analytics-filters">
          <label>Grupo<select value={groupId} onChange={(event) => changeGroup(event.target.value)}><option value="">Todos los grupos</option>{workspace.data.groups.map((group) => <option key={group.id} value={group.id}>{groupSubject(group)} · {groupName(group)}</option>)}</select></label>
          <label className={!selectedGroup ? 'control-disabled' : ''}>Periodo<select value={periodId} disabled={!selectedGroup} onChange={(event) => changePeriod(event.target.value)}><option value="">Rango personalizado</option>{periods.map((period) => <option key={period.id} value={period.id}>{period.name}</option>)}</select></label>
          <label className={periodId ? 'control-disabled' : ''}>Desde<input type="date" value={selectedPeriod?.starts_on || from} disabled={Boolean(periodId)} onChange={(event) => setFrom(event.target.value)} /></label>
          <label className={periodId ? 'control-disabled' : ''}>Hasta<input type="date" value={selectedPeriod?.ends_on || to} disabled={Boolean(periodId)} onChange={(event) => setTo(event.target.value)} /></label>
          <button className="button primary" type="button" disabled={Boolean(periodId) || !draftRangeValid} onClick={applyDates}>Aplicar corte</button>
        </div>
        {selectedGroup ? <details className="analytics-thresholds"><summary>Configurar umbrales de seguimiento</summary><div><label>Acierto mínimo<input type="number" min="0" max="100" step="5" value={accuracyThreshold} onChange={(event) => setAccuracyThreshold(Math.max(0, Math.min(100, Number(event.target.value))))} /><span>%</span></label><label>Participación mínima<input type="number" min="0" max="100" step="5" value={participationThreshold} onChange={(event) => setParticipationThreshold(Math.max(0, Math.min(100, Number(event.target.value))))} /><span>%</span></label><p>Las alertas son descriptivas: TEDVIO muestra qué umbral se incumplió y en cuántas sesiones.</p></div></details> : null}
      </SectionCard>

      <section className="metrics-grid">
        <MetricCard icon="classroom" label="Sesiones" value={String(data.overview.sessions || 0)} detail={`${data.overview.active_groups || 0} grupo${data.overview.active_groups === 1 ? '' : 's'} con evidencia`} tone="blue" />
        <MetricCard icon="attendance" label="Participación" value={percent(data.overview.participation)} detail={`${data.overview.participations || 0} participaciones activas`} tone={tone(data.overview.participation, participationThreshold)} />
        <MetricCard icon="check" label="Acierto" value={percent(data.overview.accuracy)} detail="Respuestas calificables acumuladas" tone={tone(data.overview.accuracy, accuracyThreshold)} />
        <MetricCard icon="reports" label="Respuestas" value={String(data.overview.responses || 0)} detail={selectedGroup ? `${allAlerts.length} alumnos con seguimiento` : 'Evidencia incluida en el corte'} tone={selectedGroup && allAlerts.length ? 'amber' : 'violet'} />
      </section>

      {selectedGroup ? <SectionCard className="analytics-trend-card">
        <div className="section-heading"><div><span className="eyebrow">TENDENCIA</span><h2>Acierto y participación por sesión</h2><p>Los cambios entre clases permiten distinguir un resultado aislado de una tendencia sostenida.</p></div><StatusPill tone="blue">{dateLong(data.meta.from)} — {dateLong(data.meta.to)}</StatusPill></div>
        <TrendChart sessions={sessions} />
      </SectionCard> : null}

      {!selectedGroup ? (
        <SectionCard>
          <div className="section-heading"><div><span className="eyebrow">COMPARACIÓN</span><h2>Desempeño entre grupos</h2><p>La comparación es descriptiva y conserva el contexto de cada asignatura.</p></div><StatusPill>{data.groups.length} grupos</StatusPill></div>
          {data.groups.length ? <GroupComparison groups={data.groups} search={sharedSearch} /> : <EmptyState icon="analytics" title="Sin evidencia comparable" detail="Finaliza al menos una sesión vinculada a un grupo dentro del rango seleccionado." />}
        </SectionCard>
      ) : (
        <>
          <section className="analytics-insight-strip">
            <Icon name={repeatedAlerts ? 'alert' : 'check'} />
            <div><span className="eyebrow">LECTURA EJECUTIVA</span><h2>{repeatedAlerts ? `${repeatedAlerts} alumno${repeatedAlerts === 1 ? '' : 's'} con alertas repetidas` : 'Sin alertas repetidas en el corte'}</h2><p>{difficult[0]?.accuracy != null ? `El reactivo con menor dominio registró ${percent(difficult[0].accuracy)} de acierto.` : 'No hay reactivos calificables suficientes para identificar dificultad.'}</p></div>
          </section>

          <div className="analytics-two-column">
            <SectionCard>
              <div className="section-heading compact"><div><span className="eyebrow">REACTIVOS DIFÍCILES</span><h2>Prioridades de refuerzo</h2><p>Ordenadas por menor porcentaje de acierto.</p></div><StatusPill tone={difficult.some((row) => number(row.accuracy) < accuracyThreshold) ? 'amber' : 'green'}>{difficult.filter((row) => number(row.accuracy) < accuracyThreshold).length} bajo umbral</StatusPill></div>
              <div className="analytics-question-list">{difficult.length ? difficult.map((question) => <article key={question.id}><span className={number(question.accuracy) < accuracyThreshold ? 'risk' : 'ok'}>{percent(question.accuracy)}</span><div><b>{question.prompt}</b><small>{question.session_title} · {question.correct_responses}/{question.scored_responses} correctas</small></div><Link className="button ghost compact" to={`/classroom/${question.session_id}`}>Sesión</Link></article>) : <p className="muted-copy">Las encuestas y respuestas abiertas se conservan como evidencia, pero no se clasifican por acierto.</p>}</div>
            </SectionCard>

            <SectionCard>
              <div className="section-heading compact"><div><span className="eyebrow">SEGUIMIENTO EXPLICABLE</span><h2>Alertas acumuladas</h2><p>Cada alerta señala el motivo y la recurrencia.{allAlerts.length > visibleAlerts.length ? ` Mostrando los ${visibleAlerts.length} casos prioritarios.` : ''}</p></div><StatusPill tone={allAlerts.length ? 'amber' : 'green'}>{allAlerts.length} alumnos</StatusPill></div>
              <div className="analytics-student-list">{visibleAlerts.length ? visibleAlerts.map((student) => <article key={student.student_id}><div className="analytics-student-avatar">{student.full_name.slice(0, 2).toUpperCase()}</div><div><b>{student.full_name}</b><small>{student.enrollment} · {percent(student.accuracy)} acierto · {percent(student.participation)} participación</small><p>{student.low_participation_sessions ? `${student.low_participation_sessions} sesión${student.low_participation_sessions === 1 ? '' : 'es'} con baja participación` : ''}{student.low_participation_sessions && student.low_accuracy_sessions ? ' · ' : ''}{student.low_accuracy_sessions ? `${student.low_accuracy_sessions} con bajo acierto` : ''}</p></div><StatusPill tone={student.alert_sessions >= 2 ? 'amber' : 'neutral'}>{student.alert_sessions} alerta{student.alert_sessions === 1 ? '' : 's'}</StatusPill><Link className="button ghost compact" to={`/students/${student.group_id}/${student.student_id}`}>Alumno 360°</Link></article>) : <div className="analytics-positive-state"><Icon name="check" /><div><b>Todos alcanzaron los umbrales</b><p>No hay estudiantes con baja participación o acierto en el corte seleccionado.</p></div></div>}</div>
            </SectionCard>
          </div>

          <div className="analytics-two-column">
            <SectionCard>
              <div className="section-heading compact"><div><span className="eyebrow">DOMINIO POR TEMA</span><h2>Contenido que conviene retomar</h2><p>El tema procede del banco de reactivos vinculado.</p></div><StatusPill>{data.topics.length} temas</StatusPill></div>
              <div className="analytics-topic-list">{weakTopics.length ? weakTopics.map((topic) => <article key={topic.topic}><div><b>{topic.topic}</b><small>{topic.questions} reactivos · {topic.responses} respuestas</small></div><div><i className={number(topic.accuracy) < accuracyThreshold ? 'risk' : ''} style={{ width: `${Math.max(0, Math.min(100, number(topic.accuracy)))}%` }} /></div><strong>{percent(topic.accuracy)}</strong></article>) : <p className="muted-copy">Asigna temas en el Banco para obtener esta lectura longitudinal.</p>}</div>
            </SectionCard>
            <SectionCard>
              <div className="section-heading compact"><div><span className="eyebrow">COBERTURA DE DATOS</span><h2>Calidad de la evidencia</h2><p>Estas señales ayudan a interpretar los porcentajes con prudencia.</p></div><StatusPill tone={data.coverage.unmatched_participants || data.coverage.sessions_without_responses ? 'amber' : 'green'}>Verificada</StatusPill></div>
              <div className="analytics-coverage-grid"><article><span>Sin vincular</span><b>{data.coverage.unmatched_participants}</b><small>Participantes fuera del padrón</small></article><article><span>Sesiones vacías</span><b>{data.coverage.sessions_without_responses}</b><small>Sin respuestas recibidas</small></article><article><span>Sin tema</span><b>{data.coverage.questions_without_topic}</b><small>Reactivos sin clasificación</small></article><article><span>No calificables</span><b>{data.coverage.non_scorable_responses}</b><small>Encuestas o respuestas abiertas</small></article></div>
            </SectionCard>
          </div>
        </>
      )}

      <SectionCard>
        <div className="section-heading"><div><span className="eyebrow">EVIDENCIA</span><h2>Sesiones incluidas</h2><p>{sessions.length > latest.length ? `Mostrando las ${latest.length} sesiones más recientes; la exportación incluye las ${sessions.length}.` : 'Abre cualquier sesión para consultar respuestas, ranking y resumen postclase.'}</p></div><StatusPill>{latest.length < sessions.length ? `${latest.length} de ${sessions.length}` : `${sessions.length} sesiones`}</StatusPill></div>
        {latest.length ? <div className="analytics-session-table"><div className="analytics-session-head"><span>Sesión</span><span>Participación</span><span>Acierto</span><span>Respuestas</span><span /></div>{latest.map((session) => <article key={session.id}><div><b>{session.title}</b><small>{!selectedGroup ? `${groupLabels.get(session.group_id) || 'Grupo'} · ` : ''}{dateLong(session.created_at)} · Código {session.code}</small></div><strong>{percent(session.participation)}</strong><strong>{percent(session.accuracy)}</strong><strong>{session.responses}</strong><Link className="button ghost compact" to={`/classroom/${session.id}`}>Abrir</Link></article>)}</div> : <EmptyState icon="classroom" title="Aún no hay sesiones finalizadas" detail="Las sesiones cerradas aparecerán aquí sin borrar su evidencia." action={<Link className="button primary" to={selectedGroup ? `/classroom?group=${selectedGroup.id}` : '/classroom'}>Iniciar clase</Link>} />}
      </SectionCard>

      <SectionCard className="analytics-reliability-card"><div><Icon name="shield" /><span><b>Acceso protegido</b><small>El cálculo sólo utiliza grupos del docente autenticado.</small></span></div><div><Icon name="route" /><span><b>Datos agregados</b><small>Supabase calcula tendencias sin descargar miles de filas.</small></span></div><div><Icon name="alert" /><span><b>Alertas explicables</b><small>Sin diagnósticos automáticos ni decisiones ocultas.</small></span></div><div><Icon name="reports" /><span><b>Exportación local</b><small>El CSV se genera sólo cuando el docente lo solicita.</small></span></div></SectionCard>
    </div>
  );
}
