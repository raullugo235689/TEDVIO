/** Presentation-only routing. Never stores or changes academic selections invisibly. */
export interface WorkflowContext { groupId: string; periodId: string }
const groupPaths = /^\/(?:groups|attendance|gradebook|periods|reports|analytics|students)\/([^/]+)(?:\/|$)/;
const queryPaths = new Set(['/prepare', '/evaluate', '/bank', '/classroom', '/exams', '/attendance-justifications']);
export function workflowContext(pathname: string, search: string): WorkflowContext {
  const params = new URLSearchParams(search);
  const match = pathname.match(groupPaths);
  let groupId = '';
  try { groupId = match ? decodeURIComponent(match[1]!) : queryPaths.has(pathname) ? params.get('group') || '' : ''; } catch { /* Invalid URL: no implicit scope. */ }
  const periodId = groupId && (/^\/(?:gradebook|reports)\//.test(pathname) || pathname === '/evaluate' || pathname === '/prepare') ? params.get('period') || '' : '';
  return { groupId, periodId };
}
export function workflowLink(destination: string, context: WorkflowContext): string {
  if (!context.groupId) return destination;
  const id = encodeURIComponent(context.groupId);
  const [path, search = ''] = destination.split('?');
  const params = new URLSearchParams(search);
  let target = path!;
  if (['/attendance', '/gradebook', '/reports', '/analytics', '/students', '/periods'].includes(target)) {
    target = target === '/students' ? `/groups/${id}` : `${target}/${id}`;
    if (path === '/students') params.set('tab', 'students');
  } else if (['/prepare', '/evaluate', '/bank', '/classroom', '/exams', '/exams/new', '/attendance-justifications'].includes(target)) {
    params.set('group', context.groupId);
  } else return destination; // Multi-group QR, scanner and account are intentionally unscoped.
  if (context.periodId && ['/prepare', '/evaluate', '/gradebook', '/reports'].includes(path!)) {
    if (!(path === '/reports' && context.periodId === 'course')) params.set('period', context.periodId);
  }
  const query = params.toString();
  return `${target}${query ? `?${query}` : ''}`;
}
export function classShortcut(sessions: Array<{ id: string; status: string; group_id?: string | null; is_demo?: boolean }>, groupId = '') {
  const live = sessions.filter(session => session.status === 'live' && !session.is_demo && (!groupId || session.group_id === groupId));
  if (live.length === 1) return { label: 'Volver a la clase', to: `/classroom/${encodeURIComponent(live[0]!.id)}` };
  return { label: live.length > 1 ? 'Clases en curso' : 'Iniciar clase', to: workflowLink('/classroom', { groupId, periodId: '' }) };
}
