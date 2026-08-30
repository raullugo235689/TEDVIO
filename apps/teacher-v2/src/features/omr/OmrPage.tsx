import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { examDetailKey, examWorkspaceKey, fetchExamDetail, fetchExamWorkspace } from '../../core/exams';
import { ErrorPanel, LoadingScreen } from '../../shared/components';
import { useAuth } from '../auth/AuthProvider';
import { OmrHome } from './OmrHome';
import { OmrWorkspace } from './OmrWorkspace';

export function OmrPage() {
  const auth = useAuth();
  const { examId } = useParams();

  const workspace = useQuery({
    queryKey: examWorkspaceKey(auth.user?.id),
    queryFn: () => {
      if (!auth.user) throw new Error('No hay una sesión docente activa.');
      return fetchExamWorkspace(auth.user);
    },
    enabled: Boolean(auth.user),
  });

  const detail = useQuery({
    queryKey: examDetailKey(auth.user?.id, examId),
    queryFn: () => {
      if (!auth.user || !examId) throw new Error('No se puede abrir la evaluación.');
      return fetchExamDetail(auth.user, examId);
    },
    enabled: Boolean(auth.user && examId),
  });

  if (workspace.isLoading) return <LoadingScreen label="Abriendo OMR…" />;
  if (workspace.isError) return <ErrorPanel title="No pude cargar OMR" detail={workspace.error.message} onRetry={() => workspace.refetch()} />;
  if (!workspace.data) return <ErrorPanel title="OMR no disponible" detail="No se recibió el espacio de evaluaciones." />;
  if (!examId) return <OmrHome workspace={workspace.data} />;
  if (detail.isLoading) return <LoadingScreen label="Preparando la evaluación OMR…" />;
  if (detail.isError) return <ErrorPanel title="No pude abrir la evaluación" detail={detail.error.message} onRetry={() => detail.refetch()} />;
  if (!detail.data) return <ErrorPanel title="Evaluación no disponible" detail="No se encontró la evaluación solicitada." />;
  return <OmrWorkspace detail={detail.data} />;
}

export { OmrPrintPage } from './OmrPrintPage';
