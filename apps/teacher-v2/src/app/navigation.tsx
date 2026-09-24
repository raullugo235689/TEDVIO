import type { IconName } from '../shared/icons';

export interface NavigationItem {
  to: string;
  label: string;
  shortLabel: string;
  icon: IconName;
  section: 'primary' | 'operation' | 'close';
  migrated: boolean;
}

export const navigation: NavigationItem[] = [
  { to: '/', label: 'Inicio', shortLabel: 'Inicio', icon: 'home', section: 'primary', migrated: true },
  { to: '/agenda', label: 'Agenda', shortLabel: 'Agenda', icon: 'calendar', section: 'primary', migrated: true },
  { to: '/groups', label: 'Mis grupos', shortLabel: 'Grupos', icon: 'groups', section: 'primary', migrated: true },
  { to: '/attendance', label: 'Asistencia', shortLabel: 'Asistencia', icon: 'attendance', section: 'operation', migrated: true },
  { to: '/classroom', label: 'Modo Clase', shortLabel: 'Clase', icon: 'classroom', section: 'operation', migrated: true },
  { to: '/bank', label: 'Banco de preguntas', shortLabel: 'Preguntas', icon: 'bank', section: 'operation', migrated: true },
  { to: '/exams', label: 'Evaluaciones', shortLabel: 'Evaluar', icon: 'exam', section: 'operation', migrated: true },
  { to: '/omr', label: 'Calificar hojas', shortLabel: 'Calificar', icon: 'exam', section: 'operation', migrated: true },
  { to: '/gradebook', label: 'Calificaciones', shortLabel: 'Libro', icon: 'grades', section: 'operation', migrated: true },
  { to: '/students', label: 'Perfil del alumno', shortLabel: 'Alumnos', icon: 'groups', section: 'operation', migrated: true },
  { to: '/analytics', label: 'Analítica', shortLabel: 'Analítica', icon: 'analytics', section: 'close', migrated: true },
  { to: '/periods', label: 'Periodos', shortLabel: 'Periodos', icon: 'periods', section: 'close', migrated: true },
  { to: '/reports', label: 'Reportes', shortLabel: 'Reportes', icon: 'reports', section: 'close', migrated: true },
  { to: '/prepare', label: 'Preguntas y exámenes', shortLabel: 'Preparar', icon: 'bank', section: 'primary', migrated: true },
  { to: '/settings', label: 'Configuración', shortLabel: 'Ajustes', icon: 'settings', section: 'close', migrated: true },
];

export const navigationGroups = [
  { to: '/', children: ['/agenda'] },
  { to: '/groups', children: ['/attendance', '/classroom', '/gradebook', '/students', '/periods'] },
  { to: '/prepare', children: ['/bank', '/exams', '/omr'] },
  { to: '/reports', children: ['/analytics'] },
  { to: '/settings', children: [] },
].map((group) => ({
  ...navigation.find((item) => item.to === group.to)!,
  children: group.children.map((path) => navigation.find((item) => item.to === path)!),
}));

export type NavigationGroup = (typeof navigationGroups)[number];

export type NavigationArea = 'home' | 'groups' | 'prepare' | 'reports' | 'settings';

const areaByRoute: Record<string, NavigationArea> = {
  '/': 'home',
  '/groups': 'groups',
  '/prepare': 'prepare',
  '/reports': 'reports',
  '/settings': 'settings',
};

export function navigationArea(pathname: string): NavigationArea {
  if (pathname === '/support') return 'settings';
  const group = navigationGroups.find((entry) => isNavigationGroupActive(entry, pathname));
  return group ? areaByRoute[group.to] ?? 'home' : 'home';
}

export const navigationAreaLabel: Record<NavigationArea, string> = {
  home: 'Inicio',
  groups: 'Mis grupos',
  prepare: 'Preguntas y exámenes',
  reports: 'Reportes',
  settings: 'Configuración',
};

export function isNavigationGroupActive(group: NavigationGroup, pathname: string): boolean {
  return [group, ...group.children].some((item) => pathname === item.to || (item.to !== '/' && pathname.startsWith(`${item.to}/`)));
}

export function navigationTitle(pathname: string): string {
  if (/^\/classroom\/[^/]+\/health$/.test(pathname)) return 'Salud del piloto';
  if (pathname.startsWith('/groups/')) return 'Centro de grupo';
  if (pathname.startsWith('/attendance/')) return 'Asistencia';
  if (pathname.startsWith('/classroom/')) return 'Modo Clase';
  if (pathname.startsWith('/exams/')) return 'Evaluaciones';
  if (pathname.startsWith('/omr/')) return 'Calificar hojas';
  if (pathname.startsWith('/gradebook/')) return 'Libro de calificaciones';
  if (pathname.startsWith('/students/')) return 'Perfil del alumno';
  if (pathname.startsWith('/analytics/')) return 'Analítica académica';
  if (pathname.startsWith('/periods/')) return 'Periodos académicos';
  if (pathname.startsWith('/reports/')) return 'Centro de reportes';
  if (pathname === '/settings') return 'Configuración';
  if (pathname === '/support') return 'Soporte';
  return navigation.find((item) => item.to === pathname)?.label || 'TEDVIO';
}
