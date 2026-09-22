import { Link } from 'react-router-dom';
import { PageHeader } from '../../shared/components';
import { Icon, type IconName } from '../../shared/icons';

const tools: Array<{ to: string; icon: IconName; label: string; detail: string; action: string }> = [
  { to: '/bank', icon: 'bank', label: 'Banco de preguntas', detail: 'Crea, importa y organiza tus preguntas. Reutilízalas en clase y en tus exámenes.', action: 'Abrir banco' },
  { to: '/exams/new', icon: 'exam', label: 'Crear un examen', detail: 'Selecciona preguntas, revisa la calidad y prepara versiones con sus claves.', action: 'Preparar examen' },
  { to: '/exams', icon: 'layout', label: 'Mis evaluaciones', detail: 'Retoma borradores, imprime cuadernillos y genera hojas de respuesta por alumno.', action: 'Ver evaluaciones' },
  { to: '/omr', icon: 'attendance', label: 'Calificar hojas', detail: 'Escanea respuestas, revisa las marcas dudosas y confirma los resultados.', action: 'Abrir calificador' },
];

export function PreparePage() {
  return <div className="view-stack prepare-workspace">
    <PageHeader eyebrow="PREPARA TU SIGUIENTE CLASE" title="De la pregunta al resultado." detail="Tus herramientas de evaluación, juntas y en el orden en que las necesitas." actions={<Link className="button primary" to="/exams/new"><Icon name="exam" />Crear examen</Link>} />
    <section className="prepare-tools" aria-label="Preguntas y exámenes">
      {tools.map((tool, index) => <Link className="prepare-tool" to={tool.to} key={tool.to}>
        <header><span className="workspace-tool-icon"><Icon name={tool.icon} /></span><span className="prepare-step">0{index + 1}</span></header>
        <div><h2>{tool.label}</h2><p>{tool.detail}</p></div>
        <footer><span>{tool.action}</span><Icon name="arrow" /></footer>
      </Link>)}
    </section>
    <section className="workspace-hint"><Icon name="groups" /><div><h2>¿Trabajas con un grupo específico?</h2><p>Abre el grupo y elige «Crear examen» para llevarlo seleccionado. Las preguntas de tu banco siguen disponibles para todos tus grupos.</p></div><Link className="button secondary" to="/groups">Ir a mis grupos</Link></section>
  </div>;
}
