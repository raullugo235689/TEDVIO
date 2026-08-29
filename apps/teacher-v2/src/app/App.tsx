import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './AppShell';
import { useAuth } from '../features/auth/AuthProvider';
import { LoginPage } from '../features/auth/LoginPage';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { AgendaPage } from '../features/agenda/AgendaPage';
import { GroupsPage } from '../features/groups/GroupsPage';
import { MigrationPage } from '../features/migration/MigrationPage';
import { LoadingScreen } from '../shared/components';

function ProtectedShell() {
  const auth = useAuth();
  if (auth.status === 'loading') return <LoadingScreen />;
  if (auth.status !== 'authenticated') return <Navigate to="/login" replace />;
  return <AppShell />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="agenda" element={<AgendaPage />} />
        <Route path="groups" element={<GroupsPage />} />
        <Route path="attendance" element={<MigrationPage module="attendance" />} />
        <Route path="classroom" element={<MigrationPage module="classroom" />} />
        <Route path="bank" element={<MigrationPage module="bank" />} />
        <Route path="exams" element={<MigrationPage module="exams" />} />
        <Route path="gradebook" element={<MigrationPage module="gradebook" />} />
        <Route path="periods" element={<MigrationPage module="periods" />} />
        <Route path="reports" element={<MigrationPage module="reports" />} />
        <Route path="settings" element={<MigrationPage module="settings" />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
