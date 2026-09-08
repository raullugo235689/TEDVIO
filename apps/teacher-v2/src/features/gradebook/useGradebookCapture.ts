import { useState } from 'react';
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchGradebookDetail, gradebookDetailKey, gradebookWorkspaceKey, type GradebookDetail } from '../../core/gradebook';
import { editGradebookDraft, finishGradebookDraft, gradebookDraftKey, gradebookWriteKey, sameCapture, type CaptureSnapshot, type GradebookDraft } from '../../core/gradebook-draft';
import { useAuth } from '../auth/AuthProvider';
import { useReliability } from '../reliability/ReliabilityProvider';

export function useGradebookCapture<T>({ detail, periodId, capture, snapshot, validate, write, savedMatches, editable = () => true }: {
  detail: GradebookDetail; periodId: string | null; capture: string;
  snapshot: (detail: GradebookDetail) => CaptureSnapshot<T>;
  validate: (rows: T[]) => string; write: (rows: T[]) => Promise<unknown>;
  savedMatches: (expected: T[], actual: T[]) => boolean;
  editable?: (detail: GradebookDetail) => boolean;
}) {
  const auth = useAuth(), client = useQueryClient(), { online } = useReliability();
  const key = gradebookDraftKey(auth.user?.id, detail.group.id, capture);
  const detailKey = gradebookDetailKey(auth.user?.id, detail.group.id, periodId);
  const busy = useIsMutating({ mutationKey: gradebookWriteKey(auth.user?.id, detail.group.id) }) > 0;
  const [saved, setSaved] = useState(false);
  const query = useQuery<GradebookDraft<T> | null>({ queryKey: key, queryFn: async () => null, initialData: null, enabled: false, gcTime: Infinity, staleTime: Infinity });
  const pending = query.data;
  const remote = snapshot(detail);
  const rows = pending?.rows ?? remote.rows;
  const conflict = Boolean(pending && !sameCapture(pending.base, remote) && !(pending.base.context === remote.context && savedMatches(pending.rows, remote.rows)));
  const issue = validate(rows);
  const mutation = useMutation({
    mutationKey: gradebookWriteKey(auth.user?.id, detail.group.id),
    mutationFn: async (submission: GradebookDraft<T>) => {
      if (!auth.user) throw new Error('Tu sesión expiró.');
      const issue = validate(submission.rows);
      if (issue) throw new Error(issue);
      const latest = await fetchGradebookDetail(auth.user, detail.group.id, periodId);
      if (client.getQueryState(detailKey)) client.setQueryData(detailKey, latest);
      const actual = snapshot(latest);
      if (!editable(latest)) throw new Error('La actividad o el periodo ya no permiten captura. Tus cambios se conservan.');
      if (!sameCapture(submission.base, actual) && !(submission.base.context === actual.context && savedMatches(submission.rows, actual.rows))) throw new Error('La información guardada cambió. Revisa tu captura antes de continuar.');
      await write(submission.rows);
      const confirmed = await fetchGradebookDetail(auth.user, detail.group.id, periodId);
      if (client.getQueryState(detailKey)) client.setQueryData(detailKey, confirmed);
      const result = snapshot(confirmed);
      if (actual.context !== result.context || !savedMatches(submission.rows, result.rows)) throw new Error('No se pudo confirmar toda la captura guardada. Tus cambios se conservan para revisión.');
      return submission.revision;
    },
    onSuccess: (revision) => {
      // A completed response must not restore academic data after sign-out.
      if (!client.getQueryState(detailKey)) return;
      client.setQueryData<GradebookDraft<T> | null>(key, current => finishGradebookDraft(current, revision));
      setSaved(true);
      void client.invalidateQueries({ queryKey: ['teacher-gradebook-detail', auth.user?.id, detail.group.id] });
      void client.invalidateQueries({ queryKey: gradebookWorkspaceKey(auth.user?.id) });
      void client.invalidateQueries({ queryKey: ['teacher-home', auth.user?.id] });
    },
  });
  return {
    rows, dirty: Boolean(pending), conflict, issue, busy, online, saved, error: mutation.error?.message,
    locked: !editable(detail),
    edit(next: T[]) { if (busy || !editable(detail)) return; setSaved(false); mutation.reset(); client.setQueryData<GradebookDraft<T> | null>(key, current => editGradebookDraft(current, remote, next)); },
    discard() { if (busy) return; mutation.reset(); setSaved(false); client.setQueryData(key, null); },
    save() { if (!pending || busy || !online || issue || !editable(detail)) return; setSaved(false); mutation.mutate(pending); },
  };
}
