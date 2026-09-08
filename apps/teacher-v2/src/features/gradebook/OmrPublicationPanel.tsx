import { useState } from 'react';
import { useIsMutating, useMutation, useQueryClient } from '@tanstack/react-query';
import { calculateGradebook, fetchGradebookDetail, gradebookDetailKey, linkOmrExamToGradebook, type GradebookDetail } from '../../core/gradebook';
import { omrPublication } from '../../core/omr-publication';
import { ActionDialog } from '../../shared/ActionDialog';
import { useAuth } from '../auth/AuthProvider';
import { useReliability } from '../reliability/ReliabilityProvider';

export function OmrPublicationPanel({ detail, periodId, examId, categoryId }: { detail: GradebookDetail; periodId: string | null; examId: string; categoryId?: string }) {
  const auth = useAuth(), client = useQueryClient(), { online } = useReliability();
  const busy = useIsMutating({ mutationKey: ['gradebook-write', auth.user?.id, detail.group.id] }) > 0;
  const [preview, setPreview] = useState<ReturnType<typeof omrPublication> | null>(null);
  const [notice, setNotice] = useState('');
  const key = gradebookDetailKey(auth.user?.id, detail.group.id, periodId);
  const exam = detail.exams.find(row => row.id === examId)!;
  const linkedCategory = detail.items.find(row => row.id === exam.grade_item_id)?.category_id;
  const destination = detail.categories.find(row => row.id === linkedCategory && row.kind === 'omr') || detail.categories.find(row => row.id === categoryId);
  const state = omrPublication(detail, exam);
  const signature = (value: ReturnType<typeof omrPublication>) => JSON.stringify([value.metadata, value.pending, value.unmatched, value.duplicates, value.rows.map(row => [row.studentId, row.expected?.id, row.expected?.score, row.saved?.score, row.saved?.source_id, row.saved?.source_type])]);
  const mutation = useMutation({
    mutationKey: ['gradebook-write', auth.user?.id, detail.group.id],
    mutationFn: async () => {
      if (!auth.user || !destination || !preview) throw new Error('Selecciona una categoría OMR.');
      const latest = await fetchGradebookDetail(auth.user, detail.group.id, periodId);
      const currentExam = latest.exams.find(row => row.id === examId);
      if (client.getQueryState(key)) client.setQueryData(key, latest);
      if (!currentExam || !calculateGradebook(latest, periodId).editable) throw new Error('La evaluación o el periodo ya no permiten publicar.');
      const current = omrPublication(latest, currentExam);
      if (signature(current) !== signature(preview)) { setPreview(current); throw new Error('Los resultados cambiaron. Revisa el resumen actualizado antes de confirmar.'); }
      const result = await linkOmrExamToGradebook(auth.user, examId, destination.id);
      const confirmed = await fetchGradebookDetail(auth.user, detail.group.id, periodId);
      if (client.getQueryState(key)) client.setQueryData(key, confirmed);
      const confirmedExam = confirmed.exams.find(row => row.id === examId);
      if (!confirmedExam || !omrPublication(confirmed, confirmedExam).current) throw new Error('La publicación respondió, pero aún hay diferencias. Revisa el estado antes de continuar.');
      return result;
    },
    onSuccess: result => { setPreview(null); setNotice(`${result.linked} alumnos publicados y verificados.`); void client.invalidateQueries({ queryKey: ['teacher-gradebook-detail', auth.user?.id, detail.group.id] }); void client.invalidateQueries({ queryKey: ['teacher-gradebook-workspace', auth.user?.id] }); },
  });
  return <div className="omr-publication"><span className={`status-pill ${state.current ? 'green' : 'amber'}`}>{state.status}</span>
    <button className="button secondary compact" disabled={busy || !online || !categoryId || !calculateGradebook(detail, periodId).editable} onClick={() => { mutation.reset(); setNotice(''); setPreview(state); }}>{state.linked ? 'Revisar publicación' : 'Publicar en Libro'}</button>
    {notice ? <small role="status">{notice}</small> : null}
    {preview ? <ActionDialog eyebrow="TEDVIO · OMR → LIBRO" title="Revisar publicación de resultados" detail="Se actualizarán las calificaciones de esta evaluación con los resultados confirmados. Los resultados pendientes no se publican." confirmLabel="Publicar y verificar" busy={busy} error={mutation.error?.message} onDismiss={() => setPreview(null)} onConfirm={() => mutation.mutate()}>
      <dl className="omr-publication-summary"><div><dt>Alumnos con resultado confirmado</dt><dd>{preview.students}</dd></div><div><dt>Lecturas pendientes de revisión</dt><dd>{preview.pending}</dd></div><div><dt>Resultados sin alumno asociado</dt><dd>{preview.unmatched}</dd></div><div><dt>Calificaciones que se retirarán por falta de resultado confirmado</dt><dd>{preview.clear}</dd></div></dl>
      <p>Categoría: {destination?.name}</p>
      {preview.duplicates ? <p>{preview.duplicates} alumnos tienen más de un resultado confirmado. Se utilizará el revisado más recientemente.</p> : null}
    </ActionDialog> : null}
  </div>;
}
