import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../features/auth/AuthProvider';
import { supabase } from './supabase';
import { teacherDisplayName, teacherIdentityKey, teacherInitials } from './teacher-identity';

export function useTeacherIdentity() {
  const { user } = useAuth();
  const identity = useQuery({
    queryKey: teacherIdentityKey(user?.id),
    queryFn: async () => {
      if (!user) throw new Error('No hay una sesión docente activa.');
      const [profile, account] = await Promise.all([
        supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle(),
        supabase.from('tedvio_user_profiles').select('full_name').eq('user_id', user.id).maybeSingle(),
      ]);
      if (profile.error) throw profile.error;
      return { displayName: profile.data?.display_name, accountName: account.data?.full_name };
    },
    enabled: Boolean(user),
  });
  const displayName = teacherDisplayName(user, identity.data?.displayName, identity.data?.accountName);
  return { displayName, initials: teacherInitials(displayName) };
}
