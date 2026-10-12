import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthProvider';
import { useTeacherHome } from '../core/useTeacherHome';
import { classroomSessionsKey, fetchActiveClassroomSessions } from '../core/classroom';
import { classShortcut, workflowContext, workflowLink } from '../core/workflow-navigation';
import { fetchPeriodWorkspace, periodWorkspaceKey } from '../core/periods';
import { Icon } from './icons';

/** Only offer contextual links when the group belongs to the loaded account. */
export function useWorkflowContext() {
  const location = useLocation();
  const { user } = useAuth();
  const home = useTeacherHome();
  const context = workflowContext(location.pathname, location.search);
  const group = home.data?.dashboard.groups?.find(item => item.id === context.groupId);
  const periods = useQuery({ queryKey: periodWorkspaceKey(user?.id), queryFn: () => { if (!user) throw new Error('Tu sesión expiró.'); return fetchPeriodWorkspace(user); }, enabled: Boolean(user && group && context.periodId && context.periodId !== 'course'), staleTime: 30_000 });
  const periodValid = context.periodId === 'course' || periods.data?.periods.some(item => item.id === context.periodId && item.group_id === group?.id);
  return group ? { groupId: group.id, periodId: periodValid ? context.periodId : '' } : { groupId: '', periodId: '' };
}
export function ClassLauncher({ className = '', groupId = '', suggestedGroupId = '' }: { className?: string; groupId?: string; suggestedGroupId?: string }) {
  const { user } = useAuth();
  const location = useLocation();
  const context = useWorkflowContext();
  const current = /^\/classroom\/[^/]+$/.test(location.pathname);
  const scope = groupId || context.groupId;
  const sessions = useQuery({
    queryKey: [...classroomSessionsKey(user?.id), 'shortcut', scope],
    queryFn: () => { if (!user) throw new Error('No hay una sesión docente activa.'); return fetchActiveClassroomSessions(user, scope); },
    enabled: Boolean(user && !current), staleTime: 30_000, refetchOnWindowFocus: true,
  });
  const shortcut = current ? { to: location.pathname, label: 'Volver a la clase' }
    : classShortcut(sessions.data || [], scope);
  if (!current && shortcut.label === 'Iniciar clase' && suggestedGroupId) shortcut.to = workflowLink('/classroom', { groupId: suggestedGroupId, periodId: '' });
  if (!current && sessions.isError) shortcut.label = 'Abrir Modo Clase';
  return <Link className={`button primary product-class-launch ${className}`} to={shortcut.to}>
    <Icon name="classroom" /><span>{shortcut.label}</span><Icon name="arrow" />
  </Link>;
}
export function WorkflowSectionNavigation() {
  const { pathname } = useLocation();
  const context = useWorkflowContext();
  const attendance = /^\/attendance(?:\/|-|$)/.test(pathname);
  const results = /^\/(?:reports|analytics)(?:\/|$)/.test(pathname);
  const evaluation = /^\/(?:evaluate|exams|omr|gradebook|periods)(?:\/|$)/.test(pathname);
  if (!attendance && !results && !evaluation) return null;
  if (/\/(?:print|sheets)$/.test(pathname)) return null;
  const links = attendance ? [
    ['/attendance', 'Tomar lista / historial'], ['/attendance-justifications', 'Justificar faltas'], ['/attendance-joint', 'Registro conjunto QR'],
  ] : results ? [['/reports', 'Documentos y reportes'], ['/analytics', 'Participación y aprendizaje']]
    : [['/evaluate', 'Guía de evaluación'], ['/exams', 'Exámenes'], ['/omr', 'Calificar hojas'], ['/gradebook', 'Calificaciones'], ['/periods', 'Periodos']];
  return <nav className="product-section-nav" aria-label={attendance ? 'Herramientas de asistencia' : results ? 'Herramientas de resultados' : 'Herramientas de evaluación'}>
    {links.map(([to, label]) => <Link key={to} to={workflowLink(to!, context)}
      aria-current={pathname === to || pathname.startsWith(`${to}/`) ? 'page' : undefined}>{label}</Link>)}
  </nav>;
}
