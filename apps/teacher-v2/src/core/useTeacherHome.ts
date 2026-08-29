import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../features/auth/AuthProvider';
import { fetchTeacherHome } from './api';

export function useTeacherHome() {
  const auth = useAuth();
  return useQuery({
    queryKey: ['teacher-home', auth.user?.id],
    queryFn: () => {
      if (!auth.user) throw new Error('No hay una sesión docente activa.');
      return fetchTeacherHome(auth.user);
    },
    enabled: Boolean(auth.user),
  });
}
