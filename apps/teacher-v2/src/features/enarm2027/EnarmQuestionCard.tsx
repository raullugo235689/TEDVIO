import type { EnarmAnswerResult, EnarmCase } from '../../core/enarm2027';
import { ENARM_AREAS } from '../../core/enarm2027-areas';
import { Icon } from '../../shared/icons';

export function EnarmQuestionCard({
  question, chosen, onChoose, disabled = false, feedback, index, count, simulation = false,
}: {
  question: EnarmCase;
  chosen: number | null;
  onChoose: (index: number) => void;
  disabled?: boolean;
  feedback?: EnarmAnswerResult | null;
  index?: number;
  count?: number;
  simulation?: boolean;
}) {
  const specialty = ENARM_AREAS.find(area => area.key === question.area);
  return <article className="enarm-question-card" data-question-id={question.id}>
    <header className="enarm-question-meta">
      <div>
        <span className="enarm-question-area"><i style={{ background: specialty?.accent || '#4b74cf' }}/>{specialty?.label}</span>
        <span className="enarm-question-topic">{question.topic}</span>
      </div>
      <span className="enarm-question-number">{index && count ? `Caso ${index} de ${count}` : 'Caso clínico'}</span>
    </header>
    <div className="enarm-case-body">
      <span className="enarm-eyebrow">CASO CLÍNICO · {question.difficulty === 'avanzado' ? 'ALTO NIVEL' : question.difficulty === 'basico' ? 'FUNDAMENTOS' : 'RAZONAMIENTO'}</span>
      <p className="enarm-vignette">{question.vignette}</p>
      <h2>{question.prompt}</h2>
    </div>
    <fieldset className="enarm-answers" disabled={disabled}>
      <legend>Selecciona una sola respuesta</legend>
      {question.options.map((option, i) => {
        const selected = chosen === i;
        const right = feedback?.correct_index === i;
        const wrong = feedback && selected && !right;
        const show = Boolean(feedback) && !simulation;
        return <label key={i} className={`enarm-answer${selected ? ' chosen' : ''}${show && right ? ' correct' : ''}${show && wrong ? ' incorrect' : ''}`}>
          <input type="radio" name={`enarm-answer-${question.id}`} value={i} checked={selected}
            onChange={() => onChoose(i)} aria-label={`Opción ${String.fromCharCode(65+i)}: ${option}`}/>
          <span className="enarm-option-letter">{String.fromCharCode(65+i)}</span>
          <span className="enarm-option-text">{option}</span>
          {show && right ? <Icon name="check" /> : null}
        </label>;
      })}
    </fieldset>
    {feedback && !simulation ? <section className={`enarm-feedback${feedback.correct ? ' success' : ' review'}`} role="status">
      <div className="enarm-feedback-header">
        <Icon name={feedback.correct ? 'check' : 'alert'}/>
        <strong>{feedback.correct ? 'Respuesta correcta' : 'Respuesta para reforzar'}</strong>
        <span>Clave {String.fromCharCode(65 + feedback.correct_index)}</span>
      </div>
      <h3>Razonamiento clínico</h3>
      <p>{feedback.rationale}</p>
      <div className="enarm-reference"><Icon name="bank"/><span>{feedback.reference_hint}</span></div>
      <small>Este caso es de práctica original y no reproduce una pregunta oficial del ENARM.</small>
    </section> : null}
  </article>;
}
