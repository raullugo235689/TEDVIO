import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { academicDeleteLabels, deletionBlockerLabel, requestAcademicDeletion, type AcademicDeleteTarget } from '../core/academic-deletion';
import { useAuth } from '../features/auth/AuthProvider';
import { useReliability } from '../features/reliability/ReliabilityProvider';
import { ActionDialog } from './ActionDialog';

function AcademicDeleteDialog({ target, onDismiss, onDeleted }: {
  target: AcademicDeleteTarget; onDismiss: () => void; onDeleted: () => void;
}) {
  const auth = useAuth();
  const { online } = useReliability();
  const queryClient = useQueryClient();
  const [confirmation, setConfirmation] = useState('');
  const submitting = useRef(false);
  const preview = useQuery({
    queryKey: ['academic-delete-preview', auth.user?.id, target.kind, target.id],
    queryFn: () => requestAcademicDeletion(target),
    enabled: Boolean(auth.user) && online,
    retry: false, staleTime: 0, gcTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: false,
  });
  const deletion = useMutation({
    mutationFn: () => {
      if (!auth.user || !preview.data || !online || !navigator.onLine) throw new Error('Necesitas una sesión activa y conexión.');
      return requestAcademicDeletion(target, preview.data.version);
    },
    retry: false,
    // Never queue a destructive action to run unexpectedly after reconnection.
    networkMode: 'always',
    onSuccess: () => {
      onDeleted();
      onDismiss();
      // Mark server data stale, without removing any local academic drafts.
      void queryClient.invalidateQueries({ predicate: (query) => query.queryKey[1] === auth.user?.id });
    },
    onError: () => { setConfirmation(''); },
    onSettled: () => { submitting.current = false; },
  });
  const ready = preview.isSuccess && !preview.isFetching && !deletion.isError
    && preview.data.can_delete && preview.data.blockers.length === 0 && online;

  function confirm() {
    if (!ready || confirmation !== 'ELIMINAR' || submitting.current) return;
    submitting.current = true;
    deletion.mutate();
  }

  return <ActionDialog title={`Eliminar ${academicDeleteLabels[target.kind]}`} eyebrow="TEDVIO · ELIMINACIÓN SEGURA"
    detail={`«${preview.data?.label || target.label}». Esta acción es permanente y no se puede deshacer.`}
    onDismiss={onDismiss} onConfirm={confirm} confirmLabel="Eliminar definitivamente" danger busy={deletion.isPending}
    confirmDisabled={!ready || confirmation !== 'ELIMINAR'} error={deletion.error?.message || preview.error?.message}>
    <div className="academic-delete-content">
      {!online ? <p role="status">Necesitas conexión. No se programará ningún borrado para después.</p> : null}
      {preview.isFetching ? <p role="status">Revisando registros vinculados…</p> : null}
      {preview.data?.blockers.length ? <>
        <p>No se puede eliminar porque hay información vinculada:</p>
        <ul>{preview.data.blockers.map((blocker) => <li key={blocker.resource}>{deletionBlockerLabel(blocker.resource)}{blocker.resource === 'live_session' ? '' : `: ${blocker.count}`}</li>)}</ul>
        <p>{target.kind === 'question' ? 'Puedes usar «Archivar» para retirarla del banco activo sin afectar exámenes ni sesiones.' : target.kind === 'university' || target.kind === 'program' ? 'Revisa primero los grupos y programas vinculados. No borres historial académico solo para quitar esta estructura.' : 'Conserva este registro para mantener alumnos, resultados e historial. No se borrará información en cadena.'}</p>
      </> : null}
      {ready ? <>
        <p>No hay dependencias que impidan eliminar.{target.kind === 'session' ? ` Se quitarán también ${preview.data?.question_count || 0} preguntas de esta sesión y sus claves. El banco original se conserva.` : ''}</p>
        <label>Escribe ELIMINAR para confirmar<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={deletion.isPending} autoComplete="off" spellCheck={false} /></label>
      </> : null}
      {preview.isError || deletion.isError || (preview.data && !preview.data.can_delete) ? <button className="button secondary" type="button" disabled={!online || preview.isFetching || deletion.isPending} onClick={() => { deletion.reset(); setConfirmation(''); void preview.refetch(); }}>Volver a revisar</button> : null}
    </div>
  </ActionDialog>;
}

export function AcademicDeleteButton({ target, onDeleted }: { target: AcademicDeleteTarget; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  return <>
    <button className="button ghost compact danger-text" type="button" aria-label={`Eliminar ${academicDeleteLabels[target.kind]}: ${target.label}`} onClick={(event) => { event.currentTarget.focus(); setOpen(true); }}>Eliminar</button>
    {open ? <AcademicDeleteDialog target={target} onDismiss={() => setOpen(false)} onDeleted={onDeleted} /> : null}
  </>;
}
