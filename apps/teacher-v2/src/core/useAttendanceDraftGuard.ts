import { useEffect } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';

export function hasPendingAttendance(client: QueryClient, userId?: string): boolean {
  if (!userId) return false;
  return client.getQueriesData({ queryKey: ['attendance-draft', userId] }).some(([, draft]) => Boolean(draft))
    || client.isMutating({ mutationKey: ['attendance-write', userId] }) > 0;
}

/** Remains mounted while navigating so drafts on other attendance dates are covered. */
export function useAttendanceDraftGuard(userId?: string) {
  const client = useQueryClient();
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!hasPendingAttendance(client, userId)) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [client, userId]);
}
