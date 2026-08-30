import { Link, useParams } from 'react-router-dom';
import { Icon } from '../../shared/icons';

export function ExamOmrBridge() {
  const { examId } = useParams();
  if (!examId || examId === 'new') return null;
  return (
    <aside className="omr-exam-bridge" aria-label="Continuar a captura OMR">
      <Icon name="layout" />
      <div><span className="eyebrow">ETAPA 4B</span><b>Imprimir y capturar OMR</b><small>Revisa marcas dudosas antes de confirmar.</small></div>
      <Link className="button primary compact" to={`/omr/${examId}`}>Abrir OMR</Link>
    </aside>
  );
}
