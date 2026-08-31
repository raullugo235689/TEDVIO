import { lazy, Suspense, type ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './AppShell';
import { useAuth } from '../features/auth/AuthProvider';
import { AuthCallbackPage } from '../features/auth/AuthCallbackPage';
import { LegalConsentGate } from '../features/auth/LegalConsentGate';
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
const SupportPage = lazy(() => import('../features/reliability/SupportPage').then((module) => ({ default: module.SupportPage })));

function ProtectedShell() {
  const auth = useAuth();
  if (auth.status === 'loading') return <LoadingScreen />;
  if (auth.status !== 'authenticated') return <Navigate to="/login" replace />;
  return (
    <LegalConsentGate>
      <AppShell />
    </LegalConsentGate>
  );
}

function tool(element: ReactElement, label: string): ReactElement {
  return <Suspense fallback={<LoadingScreen label={label} />}>{element}</Suspense>;
}

export function App() {
  const physicalPath = window.location.pathname.replace(/\/+$/, '') || '/';
  if (physicalPath === '/auth/confirm') return <AuthCallbackPage kind="confirmation" />;
  if (physicalPath === '/auth/recovery') return <AuthCallbackPage kind="recovery" />;

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedShell />}>
        <Route index element={tool(<DashboardPage />, 'Preparando tu centro docente…')} />
        <Route path="agenda" element={tool(<AgendaPage />, 'Abriendo Agenda…')} />
        <Route path="groups" element={tool(<GroupsPage />, 'Abriendo Grupos…')} />
        <Route path="groups/:groupId" element={tool(<GroupDetailPage />, 'Abriendo el grupo…')} />
        <Route path="attendance" element={tool(<AttendancePage />, 'Abriendo Asistencia…')} />
        <Route path="attendance/:groupId" element={tool(<AttendancePage />, 'Abriendo Asistencia…')} />
        <Route path="classroom" element={tool(<ClassroomPage />, 'Preparando Modo Clase…')} />
        <Route path="classroom/:sessionId" element={tool(<ClassroomPage />, 'Abriendo la sesión…')} />
        <Route path="bank" element={tool(<BankPage />, 'Abriendo Question Studio…')} />
        <Route path="exams" element={tool(<ExamsPage />, 'Abriendo Evaluaciones…')} />
        <Route path="exams/new" element={tool(<ExamsPage />, 'Preparando la evaluación…')} />
        <Route path="exams/:examId" element={tool(<ExamsPage />, 'Abriendo la evaluación…')} />
        <Route path="omr" element={tool(<OmrPage />, 'Abriendo OMR…')} />
        <Route path="omr/:examId" element={tool(<OmrPage />, 'Abriendo OMR…')} />
        <Route path="omr/:examId/sheets" element={tool(<OmrSheetsPage />, 'Preparando hojas OMR…')} />
        <Route path="gradebook" element={tool(<GradebookPage />, 'Abriendo Calificaciones…')} />
        <Route path="gradebook/:groupId" element={tool(<GradebookPage />, 'Abriendo el Libro…')} />
        <Route path="students" element={tool(<Student360Page />, 'Abriendo Alumno 360°…')} />
        <Route path="students/:groupId/:studentId" element={tool(<Student360Page />, 'Abriendo el expediente…')} />
        <Route path="periods" element={tool(<PeriodsPage />, 'Abriendo Periodos…')} />
        <Route path="periods/:groupId" element={tool(<PeriodsPage />, 'Abriendo Periodos…')} />
        <Route path="reports" element={tool(<ReportsPage />, 'Abriendo Reportes…')} />
        <Route path="reports/:groupId" element={tool(<ReportsPage />, 'Preparando el reporte…')} />
        <Route path="settings" element={tool(<SettingsPage />, 'Abriendo Configuración…')} />
        <Route path="support" element={tool(<SupportPage />, 'Abriendo Soporte…')} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
