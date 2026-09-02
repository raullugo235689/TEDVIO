type RouteModule = Promise<Record<string, unknown>>;
type RouteLoader = () => RouteModule;

export const loadDashboardPage = () => import('../features/dashboard/DashboardPage');
export const loadAgendaPage = () => import('../features/agenda/AgendaPage');
export const loadGroupsPage = () => import('../features/groups/GroupsPage');
export const loadGroupDetailPage = () => import('../features/groups/GroupDetailPage');
export const loadAttendancePage = () => import('../features/attendance/AttendancePage');
export const loadClassroomPage = () => import('../features/classroom/ClassroomPage');
export const loadBankPage = () => import('../features/bank/BankPage');
export const loadExamsPage = () => import('../features/exams/ExamsPage');
export const loadOmrPage = () => import('../features/omr/OmrPage');
export const loadOmrSheetsPage = () => import('../features/omr/OmrSheetsPage');
export const loadGradebookPage = () => import('../features/gradebook/GradebookPage');
export const loadStudent360Page = () => import('../features/students/Student360Page');
export const loadPeriodsPage = () => import('../features/periods/PeriodsPage');
export const loadReportsPage = () => import('../features/reports/ReportsPage');
export const loadAnalyticsPage = () => import('../features/analytics/AnalyticsPage');
export const loadSettingsPage = () => import('../features/settings/SettingsPage');
export const loadSupportPage = () => import('../features/reliability/SupportPage');
export const loadPilotHealthPage = () => import('../features/reliability/PilotHealthPage');

const routeLoaders: Array<[test: (pathname: string) => boolean, loader: RouteLoader]> = [
  [(pathname) => pathname === '/', loadDashboardPage],
  [(pathname) => pathname.startsWith('/agenda'), loadAgendaPage],
  [(pathname) => pathname.startsWith('/groups/'), loadGroupDetailPage],
  [(pathname) => pathname.startsWith('/groups'), loadGroupsPage],
  [(pathname) => pathname.startsWith('/attendance'), loadAttendancePage],
  [(pathname) => /^\/classroom\/[^/]+\/health$/.test(pathname), loadPilotHealthPage],
  [(pathname) => pathname.startsWith('/classroom'), loadClassroomPage],
  [(pathname) => pathname.startsWith('/bank'), loadBankPage],
  [(pathname) => pathname.startsWith('/exams'), loadExamsPage],
  [(pathname) => /\/omr\/[^/]+\/sheets$/.test(pathname), loadOmrSheetsPage],
  [(pathname) => pathname.startsWith('/omr'), loadOmrPage],
  [(pathname) => pathname.startsWith('/gradebook'), loadGradebookPage],
  [(pathname) => pathname.startsWith('/students'), loadStudent360Page],
  [(pathname) => pathname.startsWith('/periods'), loadPeriodsPage],
  [(pathname) => pathname.startsWith('/reports'), loadReportsPage],
  [(pathname) => pathname.startsWith('/analytics'), loadAnalyticsPage],
  [(pathname) => pathname.startsWith('/settings'), loadSettingsPage],
  [(pathname) => pathname.startsWith('/support'), loadSupportPage],
];

const warmedRoutes = new Set<RouteLoader>();

export function prefetchTeacherRoute(pathname: string): void {
  const loader = routeLoaders.find(([test]) => test(pathname))?.[1];
  if (!loader || warmedRoutes.has(loader)) return;
  warmedRoutes.add(loader);
  void loader().catch(() => warmedRoutes.delete(loader));
}
