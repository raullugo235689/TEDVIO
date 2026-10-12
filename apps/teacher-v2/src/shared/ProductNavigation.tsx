import { useLocation } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../features/auth/AuthProvider';
import { useTeacherHome } from '../core/useTeacherHome';
import { classroomSessionsKey, fetchClassroomSessions } from '../core/classroom';
import { classEntry, navigationScope, scopedDestination } from '../core/navigation-context';
import { groupName, groupSubject } from '../core/academic';
import { Icon } from './icons';

export function useNavigationScope() {
  const location = useLocation();
  const home = useTeacherHome();
  const scope = navigationScope(location.pathname, location.search);
  const group = home.data?.dashboard.groups?.find(item => item.id === scope.groupId);
  return { group, groupId: group?.id || '', periodId: group ? scope.periodId : '' };
}

/** Read-only shortcut: entering a room never starts, closes or reveals a question. */
export function ClassEntryShortcut() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const { group, groupId } = useNavigationScope();
  const sessions = useQuery({
    queryKey: classroomSessionsKey(user?.id),
    queryFn: () => { if (!user) throw new Error('Tu sesión expiró.'); return fetchClassroomSessions(user); },
    enabled: Boolean(user), staleTime: 30_000,
  });
  if (/^\/classroom\//.test(pathname) || pathname.startsWith('/enarm-2027')) return null;
  const target = classEntry(sessions.data || [], groupId);
  return <div className="product-class-entry">
    <div>{group ? <><span>TRABAJANDO CON</span><Link to={`/groups/${encodeURIComponent(groupId)}`}>{groupSubject(group)} · {groupName(group)}</Link></> : <><span>TU ESPACIO DOCENTE</span><p>Prepara, imparte y evalúa.</p></>}</div>
    <Link className="button primary compact" to={target.to}><Icon name="classroom" />{target.label}</Link>
  </div>;
}

/** Secondary tasks stay in their area; old deep links continue to work. */
export function ProductTaskNavigation() {
  const { pathname, search } = useLocation();
  const { groupId, periodId } = useNavigationScope();
  const attendance = pathname.startsWith('/attendance') || (pathname.startsWith('/groups/') && new URLSearchParams(search).get('tab') === 'attendance');
  const evaluation = /^\/(?:evaluate|exams|omr|gradebook|periods)(?:\/|$)/.test(pathname);
  const results = /^\/(?:reports|analytics)(?:\/|$)/.test(pathname);
  const items: { to: string; label: string; active: boolean }[] = attendance ? [
    { to: '/attendance', label: 'Tomar lista', active: /^\/attendance(?:\/|$)/.test(pathname) },
    ...(groupId ? [{ to: `/groups/${encodeURIComponent(groupId)}?tab=attendance`, label: 'Historial', active: pathname.startsWith('/groups/') }] : []),
    { to: '/attendance-justifications', label: 'Justificar faltas', active: pathname === '/attendance-justifications' },
    { to: '/attendance-joint', label: 'Registro conjunto', active: pathname.startsWith('/attendance-joint') },
  ] : evaluation ? [
    { to: '/evaluate', label: 'Vista general', active: pathname === '/evaluate' },
    { to: '/exams', label: 'Exámenes', active: pathname.startsWith('/exams') },
    { to: '/omr', label: 'Calificar hojas', active: pathname.startsWith('/omr') },
    { to: '/gradebook', label: 'Calificaciones', active: pathname.startsWith('/gradebook') },
    { to: '/periods', label: 'Periodos', active: pathname.startsWith('/periods') },
  ] : results ? [
    { to: '/reports', label: 'Reportes', active: pathname.startsWith('/reports') },
    { to: '/analytics', label: 'Analítica', active: pathname.startsWith('/analytics') },
  ] : [];
  if (!items.length) return null;
  return <nav className="product-task-nav" aria-label={attendance ? 'Herramientas de asistencia' : evaluation ? 'Proceso de evaluación' : 'Consultar resultados'}>
    {items.map(item => <Link key={item.to} to={scopedDestination(item.to, groupId, periodId)} aria-current={item.active ? 'page' : undefined}>{item.label}</Link>)}
  </nav>;
}
