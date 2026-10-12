import { Link, useSearchParams } from 'react-router-dom';
import { useTeacherHome } from '../../core/useTeacherHome';
import { scopedDestination } from '../../core/navigation-context';
import { groupName, groupSubject } from '../../core/academic';
import { PageHeader, ErrorPanel, LoadingScreen } from '../../shared/components';
import { Icon, type IconName } from '../../shared/icons';
import { useNavigationScope } from '../../shared/ProductNavigation';

type WorkspaceKind = 'library' | 'evaluate';
const libraryTools: { to: string; icon: IconName; label: string; detail: string; action: string }[] = [
  { to: '/bank', icon: 'bank', label: 'Banco de preguntas', detail: 'Crea, importa y organiza tus preguntas por materia y tema. Tu banco se puede reutilizar entre grupos.', action: 'Abrir banco' },
  { to: '/bank?launch=1', icon: 'classroom', label: 'Preparar una clase', detail: 'Selecciona preguntas revisadas y prepara una sesión. Nada se proyecta hasta que tú lo decidas.', action: 'Elegir preguntas' },
];
const evaluationTools: typeof libraryTools = [
  { to: '/exams/new', icon: 'exam', label: 'Crear un examen', detail: 'Elige preguntas, revisa la composición y prepara las versiones y claves.', action: 'Crear examen' },
  { to: '/exams', icon: 'layout', label: 'Mis evaluaciones', detail: 'Retoma un borrador, imprime un examen o consulta una evaluación aplicada.', action: 'Ver evaluaciones' },
  { to: '/omr', icon: 'attendance', label: 'Calificar hojas', detail: 'Escanea respuestas y revisa las marcas dudosas antes de confirmar resultados.', action: 'Abrir calificador' },
  { to: '/gradebook', icon: 'grades', label: 'Calificaciones', detail: 'Revisa evidencias, ponderaciones y calificaciones por grupo y periodo.', action: 'Abrir calificaciones' },
];

export function ProductWorkspacePage({ kind }: { kind: WorkspaceKind }) {
  const [params, setParams] = useSearchParams();
  const home = useTeacherHome();
  const { groupId, periodId, group } = useNavigationScope();
  const library = kind === 'library';
  const tools = library ? libraryTools : evaluationTools;
  const path = (to: string) => scopedDestination(to, groupId, periodId);
  if (home.isLoading) return <LoadingScreen label="Preparando tu espacio de trabajo…" />;
  if (home.isError) return <ErrorPanel title="No pude cargar tus grupos" detail={home.error.message} onRetry={() => home.refetch()} />;
  const groups = home.data?.dashboard.groups || [];
  function selectGroup(id: string) {
    const next = new URLSearchParams(params);
    if (id) next.set('group', id); else next.delete('group');
    next.delete('period'); // A period must never follow a change to another group.
    setParams(next);
  }
  return <div className={`view-stack product-hub ${library ? 'prepare-workspace' : 'evaluation-workspace'}`}>
    <PageHeader eyebrow={library ? 'MATERIAL REUTILIZABLE' : 'DE LA EVALUACIÓN AL REGISTRO'} title={library ? 'Biblioteca' : 'Evaluar'}
      detail={library ? 'Tus preguntas y actividades, listas para la siguiente clase.' : 'Prepara, aplica, califica y revisa sin perder el contexto del grupo.'}
      actions={<Link className="button primary" to={path(library ? '/bank' : '/exams/new')}><Icon name={library ? 'bank' : 'exam'} />{library ? 'Abrir mi banco' : 'Crear examen'}</Link>} />
    <section className="product-scope" aria-label="Contexto de trabajo">
      <div><b>{group ? `${groupSubject(group)} · ${groupName(group)}` : 'Vista general'}</b><p>{library ? 'El grupo se conserva al preparar la clase; tu banco no cambia de propietario.' : 'Los accesos llevan este grupo seleccionado. Siempre puedes cambiarlo.'}</p></div>
      <label>Trabajar con un grupo<select value={groupId} onChange={event => selectGroup(event.target.value)}><option value="">Todos mis grupos</option>{groups.map(item => <option key={item.id} value={item.id}>{groupSubject(item)} · {groupName(item)}</option>)}</select></label>
    </section>
    {params.get('group') && !group ? <p role="status" className="product-scope-warning">El grupo del enlace no está disponible en tu cuenta. Selecciona uno antes de continuar.</p> : null}
    <section className="prepare-tools product-tool-grid" aria-label={library ? 'Herramientas de biblioteca' : 'Herramientas de evaluación'}>
      {tools.map((tool, index) => <Link className="prepare-tool" to={path(tool.to)} key={tool.to}>
        <header><span className="workspace-tool-icon"><Icon name={tool.icon} /></span><span className="prepare-step">{String(index + 1).padStart(2, '0')}</span></header>
        <div><h2>{tool.label}</h2><p>{tool.detail}</p></div><footer><span>{tool.action}</span><Icon name="arrow" /></footer>
      </Link>)}
    </section>
    <section className="workspace-hint product-next-step"><Icon name={library ? 'exam' : 'reports'} /><div><h2>{library ? '¿Vas a aplicar un examen?' : 'Cierra el ciclo con resultados'}</h2><p>{library ? 'Crear exámenes, calificar hojas y registrar notas ahora están reunidos en Evaluar.' : 'Consulta reportes y analítica, sin volver a elegir el mismo grupo.'}</p></div><Link className="button secondary" to={path(library ? '/evaluate' : '/reports')}>{library ? 'Ir a Evaluar' : 'Ver resultados'}</Link></section>
    {!groups.length ? <p className="muted-copy">Todavía no tienes grupos. <Link to="/groups">Crea tu primer grupo</Link> para trabajar con tu lista real.</p> : null}
  </div>;
}

export function EvaluationWorkspacePage() { return <ProductWorkspacePage kind="evaluate" />; }
