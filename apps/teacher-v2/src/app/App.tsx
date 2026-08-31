import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './AppShell';
import { useAuth } from '../features/auth/AuthProvider';
import { LoginPage } from '../features/auth/LoginPage';
import { LoadingScreen } from '../shared/components';

const DashboardPage = lazy(() => import('../features/dashboard/DashboardPage').then((module) => ({ default: module.DashboardPage })));
const AgendaPage = lazy(() => import('../features/agenda/AgendaPage').then((module) => ({ default: module.AgendaPage })));
const GroupsPage = lazy(() => import('../features/groups/GroupsPage').then((module) => ({ default: module.GroupsPage })));
const GroupDetailPage = lazy(() => import('../features/groups/GroupDetailPage').then((module) => ({ default: module.GroupDetailPage })));
const AttendancePage = lazy(() => import('../features/attendance/AttendancePage').then((module) => ({ default: module.AttendancePage })));
const ClassroomPage = lazy(() => import('../features/classroom/ClassroomPage').then((module) => ({ default: module.ClassroomPage })));
const BankPage = lazy(() => import('../features/bank/BankPage').then((module) => ({ default: module.BankPage })));
const ExamsPage = lazy(() => import('../features/exams/ExamsPage').then((module) => ({ default: module.ExamsPage })));
const OmrPage = lazy(() => import('../features/omr/OmrPage').then((module) => ({ default: module.OmrPage })));
const OmrSheetsPage = lazy(() => import('../features/omr/OmrSheetsPage').then((module) => ({ default: module.OmrSheetsPage })));
const GradebookPage = lazy(() => import('../features/gradebook/GradebookPage').then((module) => ({ default: module.GradebookPage })));
const Student360Page = lazy(() => import('../features/students/Student360Page').then((module) => ({ default: module.Student360Page })));
const PeriodsPage = lazy(() => import('../features/periods/PeriodsPage').then((module) => ({ default: module.PeriodsPage })));
const ReportsPage = lazy(() => import('../features/reports/ReportsPage').then((module) => ({ default: module.ReportsPage })));
const SettingsPage = lazy(() => import('../features/settings/SettingsPage').then((module) => ({ default: module.SettingsPage })));

function ProtectedShell() {
  const auth = useAuth();
  if (auth.status === 'loading') return <LoadingScreen />;
  if (auth.status !== 'authenticated') return <Navigate to="/login" replace />;
  return <AppShell />;
}

export function App() {
  return (
    <Suspense fallback={<LoadingScreen label="Abriendo la herramienta…" />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="agenda" element={<AgendaPage />} />
          <Route path="groups" element={<GroupsPage />} />
          <Route path="groups/:groupId" element={<GroupDetailPage />} />
          <Route path="attendance" element={<AttendancePage />} />
          <Route path="attendance/:groupId" element={<AttendancePage />} />
          <Route path="classroom" element={<ClassroomPage />} />
          <Route path="classroom/:sessionId" element={<ClassroomPage />} />
          <Route path="bank" element={<BankPage />} />
          <Route path="exams" element={<ExamsPage />} />
          <Route path="exams/new" element={<ExamsPage />} />
          <Route path="exams/:examId" element={<ExamsPage />} />
          <Route path="omr" element={<OmrPage />} />
          <Route path="omr/:examId" element={<OmrPage />} />
          <Route path="omr/:examId/sheets" element={<OmrSheetsPage />} />
          <Route path="gradebook" element={<GradebookPage />} />
          <Route path="gradebook/:groupId" element={<GradebookPage />} />
          <Route path="students" element={<Student360Page />} />
          <Route path="students/:groupId/:studentId" element={<Student360Page />} />
          <Route path="periods" element={<PeriodsPage />} />
          <Route path="periods/:groupId" element={<PeriodsPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="reports/:groupId" element={<ReportsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}