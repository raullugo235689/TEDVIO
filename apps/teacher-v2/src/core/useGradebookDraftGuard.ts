import { useEffect } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';

export function hasPendingGradebook(client: QueryClient, userId?: string): boolean {
  return Boolean(userId && (client.getQueriesData({ queryKey: ['gradebook-draft', userId] }).some(([, value]) => Boolean(value)) || client.isMutating({ mutationKey: ['gradebook-write', userId] })));
}
export function useGradebookDraftGuard(userId?: string) {
  const client = useQueryClient();
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (hasPendingGradebook(client, userId)) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [client, userId]);
}
