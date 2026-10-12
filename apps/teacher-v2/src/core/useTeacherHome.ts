import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../features/auth/AuthProvider';
import { fetchTeacherHome, fetchTeacherAccount } from './api';

export function useTeacherHome() {
  const auth = useAuth();
  const client = useQueryClient();
  return useQuery({
    queryKey: ['teacher-home', auth.user?.id],
    queryFn: () => {
      if (!auth.user) throw new Error('No hay una sesión docente activa.');
      const user = auth.user;
      return fetchTeacherHome(user, () => client.fetchQuery({
        queryKey: ['teacher-account-summary', user.id],
        queryFn: () => fetchTeacherAccount(user), staleTime: 5 * 60_000,
      }));
    },
    enabled: Boolean(auth.user),
  });
}
