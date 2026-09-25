import { useEffect, useRef, type ReactNode } from 'react';
import { Link, matchPath, useLocation } from 'react-router-dom';
import { groupName, groupSubject } from '../core/academic';
import { groupAccent } from '../core/group-identity';
import { useTeacherHome } from '../core/useTeacherHome';
import { InstitutionIdentity } from './InstitutionIdentity';
import { Icon, type IconName } from './icons';

type Section = 'summary' | 'students' | 'attendance' | 'grades' | 'reports';
const groupRoutes: [string, Section][] = [
  ['/groups/:groupId', 'summary'],
  ['/attendance/:groupId', 'attendance'],
  ['/gradebook/:groupId', 'grades'],
  ['/periods/:groupId', 'grades'],
  ['/reports/:groupId', 'reports'],
  ['/analytics/:groupId', 'reports'],
  ['/students/:groupId/:studentId', 'students'],
];

function GroupNavigation({ groupId, active }: { groupId: string; active: Section }) {
  const ref = useRef<HTMLElement>(null);
  const id = encodeURIComponent(groupId);
  const items: { section: Section; label: string; to: string; icon: IconName }[] = [
    { section: 'summary', label: 'Resumen', to: `/groups/${id}`, icon: 'layout' },
    { section: 'students', label: 'Alumnos', to: `/groups/${id}?tab=students`, icon: 'groups' },
    { section: 'attendance', label: 'Asistencia', to: `/attendance/${id}`, icon: 'attendance' },
    { section: 'grades', label: 'Calificaciones', to: `/gradebook/${id}`, icon: 'grades' },
    { section: 'reports', label: 'Reportes', to: `/reports/${id}`, icon: 'reports' },
  ];

  useEffect(() => {
    const nav = ref.current;
    const selected = nav?.querySelector<HTMLElement>('[aria-current]');
    if (nav && selected) nav.scrollLeft = selected.offsetLeft - (nav.clientWidth - selected.offsetWidth) / 2;
  }, [active, groupId]);

  return <nav className="group-section-nav" ref={ref} aria-label="Secciones del grupo">
    {items.map((item) => <Link key={item.section} to={item.to} aria-current={active === item.section ? 'page' : undefined}>
      <Icon name={item.icon} /><span>{item.label}</span>
    </Link>)}
  </nav>;
}

function GroupWorkspaceFrame({ groupId, section, children }: { groupId: string; section: Section; children: ReactNode }) {
  const home = useTeacherHome();
  const group = home.data?.dashboard.groups?.find((item) => item.id === groupId);

  return <div className="group-workspace" data-group-color={groupAccent(groupId)}>
    {group ? <>
      <section className="group-identity-banner" aria-label="Identidad del grupo">
        <div className="group-identity-topline"><Link to="/groups"><Icon name="arrow" /> Todos los grupos</Link><span>ESPACIO DEL GRUPO</span></div>
        <div className="group-identity-heading"><strong>{groupSubject(group)}</strong><span className="group-identity-name">{groupName(group)}</span></div>
        <InstitutionIdentity name={group.university} logoUrl={group.institution_logo_url} detail={[group.program, group.term].filter(Boolean).join(' · ')} />
      </section>
      <GroupNavigation groupId={groupId} active={section} />
    </> : null}
    <div className="group-workspace-content">{children}</div>
  </div>;
}

export function GroupWorkspace({ children }: { children: ReactNode }) {
  const { pathname, search } = useLocation();
  for (const [path, section] of groupRoutes) {
    const match = matchPath(path, pathname);
    if (!match?.params.groupId) continue;
    const tab = new URLSearchParams(search).get('tab');
    const active = section === 'summary' && (tab === 'students' || tab === 'attendance') ? tab : section;
    return <GroupWorkspaceFrame groupId={match.params.groupId} section={active}>{children}</GroupWorkspaceFrame>;
  }
  return children;
}
