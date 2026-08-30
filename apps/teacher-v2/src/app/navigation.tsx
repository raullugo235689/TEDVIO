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
  { to: '/groups', label: 'Grupos', shortLabel: 'Grupos', icon: 'groups', section: 'primary', migrated: true },
  { to: '/attendance', label: 'Asistencia', shortLabel: 'Asistencia', icon: 'attendance', section: 'operation', migrated: true },
  { to: '/classroom', label: 'Modo Clase', shortLabel: 'Clase', icon: 'classroom', section: 'operation', migrated: true },
  { to: '/bank', label: 'Banco', shortLabel: 'Banco', icon: 'bank', section: 'operation', migrated: true },
  { to: '/exams', label: 'Evaluaciones', shortLabel: 'Evaluar', icon: 'exam', section: 'operation', migrated: true },
  { to: '/omr', label: 'OMR', shortLabel: 'OMR', icon: 'exam', section: 'operation', migrated: true },
  { to: '/gradebook', label: 'Calificaciones', shortLabel: 'Libro', icon: 'grades', section: 'operation', migrated: true },
  { to: '/students', label: 'Alumno 360°', shortLabel: '360°', icon: 'groups', section: 'operation', migrated: true },
  { to: '/periods', label: 'Periodos', shortLabel: 'Periodos', icon: 'periods', section: 'close', migrated: false },
  { to: '/reports', label: 'Reportes', shortLabel: 'Reportes', icon: 'reports', section: 'close', migrated: false },
];

export function navigationTitle(pathname: string): string {
  if (pathname.startsWith('/groups/')) return 'Centro de grupo';
  if (pathname.startsWith('/attendance/')) return 'Asistencia';
  if (pathname.startsWith('/classroom/')) return 'Modo Clase';
  if (pathname.startsWith('/exams/')) return 'Evaluaciones';
  if (pathname.startsWith('/omr/')) return 'OMR';
  if (pathname.startsWith('/gradebook/')) return 'Libro de calificaciones';
  if (pathname.startsWith('/students/')) return 'Alumno 360°';
  return navigation.find((item) => item.to === pathname)?.label || (pathname === '/settings' ? 'Configuración' : 'TEDVIO 2.0');
}
