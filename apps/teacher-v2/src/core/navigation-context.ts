/** URL context is explicit, never carried secretly between accounts or groups.
 * Callers validate groupId against the authenticated teacher's groups before use. */
export function navigationScope(pathname: string, search = ''): { groupId: string; periodId: string } {
  const params = new URLSearchParams(search);
  if (/^\/attendance-joint(?:\/|$)/.test(pathname)) return { groupId: '', periodId: '' };
  const match = /^\/(?:groups|attendance|gradebook|periods|reports|analytics|students)\/([^/]+)/.exec(pathname);
  const queryScope = ['/prepare', '/evaluate', '/bank', '/classroom', '/exams', '/omr', '/attendance-justifications'].includes(pathname);
  let groupId = queryScope && params.getAll('group').length === 1 ? params.get('group') || '' : '';
  if (match?.[1]) { try { groupId = decodeURIComponent(match[1]); } catch { groupId = ''; } }
  return { groupId, periodId: groupId ? params.get('period') || '' : '' };
}

export function scopedDestination(destination: string, groupId = '', periodId = ''): string {
  if (!groupId) return destination;
  const [pathname = '/', search = ''] = destination.split('?');
  const params = new URLSearchParams(search);
  let path = pathname;
  if (['/attendance', '/gradebook', '/reports', '/analytics', '/periods'].includes(path)) {
    path += `/${encodeURIComponent(groupId)}`;
    if (periodId && ['/gradebook', '/reports', '/analytics', '/periods'].includes(pathname)) params.set('period', periodId);
  } else if (pathname === '/students') {
    path = `/groups/${encodeURIComponent(groupId)}`;
    params.set('tab', 'students');
  } else if (['/prepare', '/evaluate', '/bank', '/classroom', '/exams', '/exams/new', '/omr', '/attendance-justifications'].includes(path)) {
    params.set('group', groupId);
    if (periodId && pathname === '/evaluate') params.set('period', periodId);
  }
  const query = params.toString();
  return `${path}${query ? `?${query}` : ''}`;
}

export interface NavigableSession { id: string; status: string; group_id?: string | null; is_demo?: boolean; }
export function classEntry(sessions: NavigableSession[], groupId = ''): { to: string; label: string } {
  const live = sessions.filter(session => session.status === 'live' && !session.is_demo && (!groupId || session.group_id === groupId));
  if (live.length === 1 && live[0]) return { to: `/classroom/${encodeURIComponent(live[0].id)}`, label: 'Volver a la clase' };
  return { to: scopedDestination('/classroom', groupId), label: live.length > 1 ? 'Ver clases activas' : 'Iniciar clase' };
}
