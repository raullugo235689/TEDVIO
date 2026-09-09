import { useEffect } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
export interface AcademicDraft<T> { value: T; revision: number }
export interface AcademicDraftOptions<T> {
  persistInSession?: boolean;
  prepareForStorage?: (value: T) => T;
}
const ACADEMIC_DRAFT_PREFIX = 'tedvio-academic-draft|';

export function academicDraftStorageKey(key: readonly (string | undefined)[]): string {
  return `${ACADEMIC_DRAFT_PREFIX}${key.map((part) => encodeURIComponent(part || '')).join('|')}`;
}

function sessionStorageAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return Boolean(window.sessionStorage);
  } catch {
    return false;
  }
}

function readAcademicDraft<T>(storageKey: string): AcademicDraft<T> | null {
  if (!sessionStorageAvailable()) return null;
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(storageKey) || 'null') as AcademicDraft<T> | null;
    return parsed && typeof parsed === 'object' && Number.isFinite(parsed.revision) && 'value' in parsed ? parsed : null;
  } catch {
    try { window.sessionStorage.removeItem(storageKey); } catch { /* Memory fallback remains available. */ }
    return null;
  }
}

function storedAcademicWork(userId?: string): boolean {
  if (!userId || !sessionStorageAvailable()) return false;
  const encodedUser = encodeURIComponent(userId);
  try {
    return Array.from({ length: window.sessionStorage.length }, (_, index) => window.sessionStorage.key(index))
      .some((key) => key?.startsWith(ACADEMIC_DRAFT_PREFIX) && key.split('|')[2] === encodedUser);
  } catch {
    return false;
  }
}

export function clearAcademicDraftStorage(userId?: string): void {
  if (!sessionStorageAvailable()) return;
  const encodedUser = userId ? encodeURIComponent(userId) : null;
  try {
    const keys = Array.from({ length: window.sessionStorage.length }, (_, index) => window.sessionStorage.key(index))
      .filter((key): key is string => Boolean(key?.startsWith(ACADEMIC_DRAFT_PREFIX)))
      .filter((key) => !encodedUser || key.split('|')[2] === encodedUser);
    keys.forEach((key) => window.sessionStorage.removeItem(key));
  } catch {
    // Storage can be disabled by browser privacy settings; query memory remains available.
  }
}

export function hasPendingAcademicWork(client: QueryClient, userId?: string): boolean {
  return Boolean(userId && (storedAcademicWork(userId) || ['omr', 'exam'].some(kind => client.getQueriesData({ queryKey: [`${kind}-draft`, userId] }).some(([, value]) => Boolean(value)) || client.isMutating({ mutationKey: [`${kind}-write`, userId] }))));
}
export function useAcademicDraftGuard(userId?: string) {
  const client = useQueryClient();
  useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (hasPendingAcademicWork(client, userId)) { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [client, userId]);
}
export function useAcademicDraft<T>(key: readonly (string | undefined)[], initial: T, options: AcademicDraftOptions<T> = {}) {
  const client = useQueryClient();
  const storageKey = options.persistInSession ? academicDraftStorageKey(key) : null;
  const query = useQuery<AcademicDraft<T> | null>({ queryKey: key, queryFn: async () => null, initialData: () => storageKey ? readAcademicDraft<T>(storageKey) : null, enabled: false, staleTime: Infinity, gcTime: Infinity });
  return {
    value: query.data?.value ?? initial, dirty: Boolean(query.data), revision: query.data?.revision ?? 0,
    set(update: T | ((value: T) => T)) {
      if (!client.getQueryState(key)) return;
      client.setQueryData<AcademicDraft<T> | null>(key, current => {
        const previous = current?.value ?? initial;
        const next = typeof update === 'function' ? (update as (value: T) => T)(previous) : update;
        if (Object.is(previous, next)) return current ?? null;
        const draft = { value: next, revision: (current?.revision ?? 0) + 1 };
        if (storageKey && sessionStorageAvailable()) {
          try {
            const stored = options.prepareForStorage ? options.prepareForStorage(next) : next;
            window.sessionStorage.setItem(storageKey, JSON.stringify({ ...draft, value: stored }));
          } catch {
            // Large or blocked storage must not interrupt the in-memory draft.
          }
        }
        return draft;
      });
    },
    clear(revision?: number) {
      if (!client.getQueryState(key)) return;
      let removed = false;
      client.setQueryData<AcademicDraft<T> | null>(key, current => {
        if (revision != null && current && current.revision !== revision) return current;
        removed = true;
        return null;
      });
      if (removed && storageKey && sessionStorageAvailable()) {
        try { window.sessionStorage.removeItem(storageKey); } catch { /* The in-memory draft was still cleared. */ }
      }
    },
  };
}
