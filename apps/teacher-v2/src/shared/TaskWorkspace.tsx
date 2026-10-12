import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthProvider';
import { useTeacherHome } from '../core/useTeacherHome';
import { fetchPeriodWorkspace, periodWorkspaceKey } from '../core/periods';
import { groupName, groupSubject } from '../core/academic';
import { workflowLink } from '../core/workflow-navigation';
import { ErrorPanel, LoadingScreen, PageHeader } from './components';
import { Icon, type IconName } from './icons';

const library = [
  { to: '/bank', icon: 'bank', title: 'Banco de preguntas', text: 'Crea, importa y organiza tus preguntas por materia y tema.', action: 'Abrir banco', step: 'ORGANIZAR' },
  { to: '/classroom', icon: 'classroom', title: 'Preparar una actividad', text: 'Elige preguntas de tu banco y llévalas a una clase interactiva.', action: 'Preparar clase', step: 'ENSEÑAR' },
  { to: '/exams/new', icon: 'exam', title: 'Reutilizar en un examen', text: 'Usa el mismo banco en una evaluación, sin capturar todo de nuevo.', action: 'Crear examen', step: 'REUTILIZAR' },
];
const evaluation = [
  { to: '/exams/new', icon: 'exam', title: 'Crear examen', text: 'Selecciona preguntas y prepara las versiones y sus claves.', action: 'Crear examen', step: '01 · PREPARAR' },
  { to: '/exams', icon: 'layout', title: 'Mis evaluaciones', text: 'Retoma un borrador, revisa e imprime un examen y sus hojas.', action: 'Ver evaluaciones', step: '02 · APLICAR' },
  { to: '/omr', icon: 'attendance', title: 'Calificar hojas', text: 'Elige el examen, escanea las respuestas y revisa las marcas dudosas.', action: 'Abrir calificador', step: '03 · REVISAR' },
  { to: '/gradebook', icon: 'grades', title: 'Calificaciones', text: 'Consulta evidencias, captura resultados y revisa ponderaciones.', action: 'Abrir calificaciones', step: '04 · REGISTRAR' },
];
export function TaskWorkspace({ area }: { area: 'library' | 'evaluation' }) {
  const home = useTeacherHome();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const requested = params.get('group') || '';
  const groups = home.data?.dashboard.groups || [];
  const group = groups.find(item => item.id === requested);
  const periodQuery = useQuery({ queryKey: periodWorkspaceKey(user?.id), queryFn: () => {
    if (!user) throw new Error('Tu sesión expiró.'); return fetchPeriodWorkspace(user);
  }, enabled: Boolean(user && group), staleTime: 30_000 });
  const periods = (periodQuery.data?.periods || []).filter(item => item.group_id === group?.id);
  const requestedPeriod = params.get('period') || '';
  const period = periods.find(item => item.id === requestedPeriod);
  const context = { groupId: group?.id || '', periodId: requestedPeriod === 'course' ? 'course' : period?.id || '' };
  const isLibrary = area === 'library';
  if (home.isLoading) return <LoadingScreen label="Preparando tu espacio…" />;
  if (home.isError) return <ErrorPanel title="No se pudieron cargar tus grupos" detail={home.error.message} onRetry={() => home.refetch()} />;
  return <div className={`view-stack product-workspace ${isLibrary ? 'prepare-workspace' : 'evaluate-workspace'}`}>
    <section className="product-workspace-hero">
      <PageHeader eyebrow={isLibrary ? 'TU CONTENIDO, CONECTADO' : 'DE LA PREGUNTA A LA CALIFICACIÓN'}
        title={isLibrary ? 'Biblioteca' : 'Evaluar'}
        detail={isLibrary ? 'Prepara una vez. Reutiliza en tus clases y evaluaciones.' : 'Prepara, aplica, revisa y registra. Cada paso, en su lugar.'} />
      <div className="product-hero-symbol" aria-hidden="true"><Icon name={isLibrary ? 'bank' : 'exam'} /></div>
    </section>
    <section className="product-scope" aria-label="Contexto de trabajo" data-has-group={Boolean(group)}>
      <div><span className="eyebrow">ESTÁS TRABAJANDO CON</span><strong>{group ? `${groupSubject(group)} · ${groupName(group)}` : 'Todos mis grupos'}</strong><p>{group ? group.university || 'Grupo seleccionado' : isLibrary ? 'Tu biblioteca es compartida. Elige un grupo para preparar su próxima clase.' : 'Elige un grupo para preparar exámenes y consultar sus resultados.'}</p></div>
      <div className="product-scope-selectors">
        <label>Grupo de trabajo<select value={group?.id || ''} onChange={event => setParams(previous => {
          const next = new URLSearchParams(previous); next.delete('period');
          event.target.value ? next.set('group', event.target.value) : next.delete('group'); return next;
        })}><option value="">Todos mis grupos</option>{groups.map(item => <option value={item.id} key={item.id}>{groupSubject(item)} · {groupName(item)}</option>)}</select></label>
        {group ? <label>Periodo de consulta<select value={period?.id || (requestedPeriod === 'course' ? 'course' : '')} disabled={periodQuery.isLoading || periodQuery.isError}
          onChange={event => setParams(previous => { const next = new URLSearchParams(previous); event.target.value ? next.set('period', event.target.value) : next.delete('period'); return next; })}>
          <option value="">Elegir al abrir la herramienta</option><option value="course">Curso completo</option>
          {periods.map(item => <option key={item.id} value={item.id}>{item.name}{item.status === 'closed' ? ' · cerrado' : ''}</option>)}
        </select></label> : null}
      </div>
      {requested && !group ? <p className="product-scope-warning" role="status">El grupo del enlace no está disponible en esta cuenta. Selecciona uno antes de continuar.</p> : null}
      {group && requestedPeriod && requestedPeriod !== 'course' && !period && !periodQuery.isLoading && !periodQuery.isError ? <p className="product-scope-warning" role="status">Ese periodo no pertenece al grupo seleccionado. No se aplicará a las siguientes tareas.</p> : null}
      {periodQuery.isError ? <p className="product-scope-warning" role="status">No pudimos comprobar los periodos. Puedes elegirlo al abrir la herramienta.</p> : null}
    </section>
    <section className={`product-task-grid prepare-tools ${isLibrary ? 'library-tasks' : ''}`} aria-label={isLibrary ? 'Herramientas de biblioteca' : 'Recorrido de evaluación'}>
      {(isLibrary ? library : evaluation).map(tool => <Link className="product-task-card" to={workflowLink(tool.to, context)} key={tool.to}>
        <header><span className="product-task-icon"><Icon name={tool.icon as IconName} /></span><span>{tool.step}</span></header>
        <div><h2>{tool.title}</h2><p>{tool.text}</p></div><footer>{tool.action}<Icon name="arrow" /></footer>
      </Link>)}
    </section>
    <section className="product-next-step">
      <Icon name={isLibrary ? 'shield' : 'reports'} /><div><h2>{isLibrary ? 'Tu material sigue siendo tuyo' : 'Cierra el ciclo con resultados'}</h2>
        <p>{isLibrary ? 'Las preguntas se conservan en el banco existente. No se publica ni comparte tu contenido por cambiar de sección.' : 'El periodo elegido acompaña a Calificaciones y Reportes. El examen conserva su propia fecha y periodo; el escaneo te pide elegir un examen.'}</p></div>
      <Link className="button secondary" to={workflowLink(isLibrary ? '/evaluate' : '/reports', context)}>{isLibrary ? 'Ir a Evaluar' : 'Ver resultados'}<Icon name="arrow" /></Link>
    </section>
    {!groups.length ? <section className="product-first-group"><h2>Empieza con tu primer grupo</h2><p>Puedes preparar preguntas desde ahora. Para registrar asistencia y resultados, crea un grupo y agrega alumnos.</p><Link className="button primary" to="/groups">Crear mi primer grupo</Link></section> : null}
  </div>;
}
