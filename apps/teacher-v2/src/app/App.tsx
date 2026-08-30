import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './AppShell';
import { useAuth } from '../features/auth/AuthProvider';
import { LoginPage } from '../features/auth/LoginPage';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { AgendaPage } from '../features/agenda/AgendaPage';
import { GroupsPage } from '../features/groups/GroupsPage';
import { GroupDetailPage } from '../features/groups/GroupDetailPage';
import { AttendancePage } from '../features/attendance/AttendancePage';
import { ClassroomPage } from '../features/classroom/ClassroomPage';
import { BankPage } from '../features/bank/BankPage';
import { ExamsPage } from '../features/exams/ExamsPage';
import { OmrPage, OmrPrintPage } from '../features/omr/OmrPage';
import { ExamOmrBridge } from '../features/omr/ExamOmrBridge';
import { MigrationPage } from '../features/migration/MigrationPage';
import { LoadingScreen } from '../shared/components';

function ProtectedShell() {
  const auth = useAuth();
  if (auth.status === 'loading') return <LoadingScreen />;
  if (auth.status !== 'authenticated') return <Navigate to="/login" replace />;
  return <AppShell />;
}

function ProtectedPrint() {
  const auth = useAuth();
  if (auth.status === 'loading') return <LoadingScreen label="Preparando impresión OMR…" />;
  if (auth.status !== 'authenticated') return <Navigate to="/login" replace />;
  return <OmrPrintPage />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/omr/:examId/print" element={<ProtectedPrint />} />
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
        <Route path="exams/:examId" element={<><ExamsPage /><ExamOmrBridge /></>} />
        <Route path="omr" element={<OmrPage />} />
        <Route path="omr/:examId" element={<OmrPage />} />
        <Route path="gradebook" element={<MigrationPage module="gradebook" />} />
        <Route path="periods" element={<MigrationPage module="periods" />} />
        <Route path="reports" element={<MigrationPage module="reports" />} />
        <Route path="settings" element={<MigrationPage module="settings" />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
