import { useEffect } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
export interface AcademicDraft<T> { value: T; revision: number }
export function hasPendingAcademicWork(client: QueryClient, userId?: string): boolean {
  return Boolean(userId && ['omr', 'exam'].some(kind => client.getQueriesData({ queryKey: [`${kind}-draft`, userId] }).some(([, value]) => Boolean(value)) || client.isMutating({ mutationKey: [`${kind}-write`, userId] })));
}
export function useAcademicDraftGuard(userId?: string) {
  const client = useQueryClient();
  useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (hasPendingAcademicWork(client, userId)) { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [client, userId]);
}
export function useAcademicDraft<T>(key: readonly (string | undefined)[], initial: T) {
  const client = useQueryClient();
  const query = useQuery<AcademicDraft<T> | null>({ queryKey: key, queryFn: async () => null, initialData: null, enabled: false, staleTime: Infinity, gcTime: Infinity });
  return {
    value: query.data?.value ?? initial, dirty: Boolean(query.data), revision: query.data?.revision ?? 0,
    set(update: T | ((value: T) => T)) {
      if (!client.getQueryState(key)) return;
      client.setQueryData<AcademicDraft<T> | null>(key, current => { const previous = current?.value ?? initial; const next = typeof update === 'function' ? (update as (value: T) => T)(previous) : update; return Object.is(previous, next) ? current ?? null : { value: next, revision: (current?.revision ?? 0) + 1 }; });
    },
    clear(revision?: number) { if (!client.getQueryState(key)) return; client.setQueryData<AcademicDraft<T> | null>(key, current => revision != null && current && current.revision !== revision ? current : null); },
  };
}
