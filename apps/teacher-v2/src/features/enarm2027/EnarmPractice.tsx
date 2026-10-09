import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  ENARM_AREAS, saveEnarmNote, submitEnarmAnswer,
  type EnarmAnswerResult, type EnarmArea, type EnarmCase, type EnarmMode, type EnarmWorkspace,
} from '../../core/enarm2027';
import { dueReviewCases, needsReinforcement, orderPracticeCases } from '../../core/enarm2027-model';
import { useAuth } from '../auth/AuthProvider';
import { Icon } from '../../shared/icons';
import { EnarmQuestionCard } from './EnarmQuestionCard';

export function EnarmPractice({ workspace, mode, onProgress }: {
  workspace: EnarmWorkspace;
  mode: Exclude<EnarmMode, 'simulador'>;
  onProgress: () => Promise<unknown>;
}) {
  const auth = useAuth();
  const [area, setArea] = useState<EnarmArea | 'all'>('all');
  const [difficulty, setDifficulty] = useState<'all' | EnarmCase['difficulty']>('all');
  const [questionId, setQuestionId] = useState<string | null>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<EnarmAnswerResult | null>(null);
  const [started, setStarted] = useState(Date.now());
  const [answeredHere, setAnsweredHere] = useState(0);
  const [note, setNote] = useState('');
  const [noteSaved, setNoteSaved] = useState(false);

  const pool = useMemo(() => {
    const byMode = mode === 'repaso'
      ? (dueReviewCases(workspace.cases, workspace.reviews).length
        ? dueReviewCases(workspace.cases, workspace.reviews)
        : needsReinforcement(workspace.cases, workspace.attempts))
      : orderPracticeCases(workspace.cases, workspace.attempts, workspace.reviews);
    return byMode.filter(q => (area === 'all' || q.area === area)
      && (difficulty === 'all' || q.difficulty === difficulty));
  }, [workspace,mode,area,difficulty]);

  const question = (questionId ? workspace.cases.find(q => q.id === questionId) : null) || pool[0] || null;

  const submit = useMutation({
    mutationFn: async () => {
      if (!question || chosen == null) throw new Error('Selecciona una respuesta.');
      return submitEnarmAnswer(question.id, chosen, mode, Math.round((Date.now()-started)/1000));
    },
    onSuccess: (result) => {
      setFeedback(result);
      setAnsweredHere(x => x+1);
      void onProgress();
    },
  });
  const saveNote = useMutation({
    mutationFn: async () => {
      if (!auth.user || !question) throw new Error('Inicia sesión para guardar notas.');
      return saveEnarmNote(auth.user, question.id, note);
    },
    onSuccess: () => { setNoteSaved(true); void onProgress(); },
  });

  useEffect(() => {
    if (!question) return;
    setNote(workspace.notes.find(n => n.question_id === question.id)?.note || '');
  }, [question?.id]);
  useEffect(() => {
    setQuestionId(null);
    setChosen(null);
    setFeedback(null);
    setStarted(Date.now());
  }, [area, difficulty, mode]);

  function next() {
    const candidates = pool.filter(q => q.id !== question?.id);
    setQuestionId(candidates[0]?.id || pool[0]?.id || null);
    setChosen(null);
    setFeedback(null);
    setStarted(Date.now());
    setNoteSaved(false);
    submit.reset();
    saveNote.reset();
  }

  return <div className="enarm-practice" data-enarm-mode={mode}>
    <div className="enarm-section-heading">
      <div><span className="enarm-eyebrow">{mode === 'repaso' ? 'MEMORIA A LARGO PLAZO' : 'ENTRENAMIENTO CLÍNICO'}</span>
        <h2>{mode === 'repaso' ? 'Repaso inteligente' : 'Entrenamiento por casos'}</h2>
        <p>{mode === 'repaso' ? 'Vuelve sobre tus respuestas anteriores. Las preguntas falladas se programan para nuevos repasos.' : 'Lee el caso, elige una conducta y analiza el razonamiento después de responder.'}</p></div>
      <span className="enarm-round-count">{answeredHere} resuelto{answeredHere===1?'':'s'} aquí</span>
    </div>
    <div className="enarm-filters">
      <label>Especialidad
        <select aria-label="Filtrar especialidad ENARM" value={area} onChange={e => setArea(e.target.value as typeof area)}>
          <option value="all">Todas las áreas</option>
          {ENARM_AREAS.map(a=><option key={a.key} value={a.key}>{a.label}</option>)}
        </select>
      </label>
      <label>Nivel
        <select aria-label="Filtrar dificultad ENARM" value={difficulty} onChange={e=>setDifficulty(e.target.value as typeof difficulty)}>
          <option value="all">Todos los niveles</option>
          <option value="basico">Fundamentos</option>
          <option value="intermedio">Intermedio</option>
          <option value="avanzado">Avanzado</option>
        </select>
      </label>
      <span className="enarm-filter-total">{pool.length} casos disponibles</span>
    </div>
    {question ? <div className="enarm-training-layout">
      <div>
        <EnarmQuestionCard question={question} chosen={chosen} onChoose={setChosen} disabled={submit.isPending || Boolean(feedback)}
          feedback={feedback}/>
        <div className="enarm-practice-buttons">
          {submit.isError ? <p role="alert" className="enarm-error">{submit.error.message}</p> : null}
          {!feedback
            ? <button className="enarm-primary" type="button" disabled={chosen === null || submit.isPending} onClick={()=>{setQuestionId(question.id);submit.mutate();}}>
                {submit.isPending ? 'Verificando respuesta…' : 'Confirmar respuesta'} <Icon name="arrow"/>
              </button>
            : <button className="enarm-primary" type="button" onClick={next}>Siguiente caso <Icon name="arrow"/></button>}
        </div>
      </div>
      <aside className="enarm-practice-side">
        <div className="enarm-sidebar-card">
          <Icon name="clock"/>
          <h3>Tu sesión de estudio</h3>
          <p>Resuelve cada caso antes de consultar la explicación. La clave solo se revela después de que TEDVIO verifica tu respuesta.</p>
          <div className="enarm-side-stat"><span>Sesiones registradas</span><strong>{workspace.attempts.length}</strong></div>
          <div className="enarm-side-stat"><span>Casos pendientes de repaso</span><strong>{workspace.reviews.filter(r=>new Date(r.due_at).getTime()<=Date.now()).length}</strong></div>
        </div>
        <div className="enarm-sidebar-card enarm-note-card">
          <Icon name="bank"/>
          <h3>Mi cuaderno clínico</h3>
          <p>Una nota privada por caso, conservada en tu cuenta para futuras revisiones.</p>
          <label htmlFor="enarm-case-note">Apunte personal</label>
          <textarea id="enarm-case-note" rows={5} maxLength={4000} value={note}
            onChange={e=>{setNote(e.target.value);setNoteSaved(false);}}
            placeholder="Algoritmo, perla clínica, diagnóstico diferencial…"/>
          <button className="enarm-secondary" type="button" disabled={saveNote.isPending || !auth.user} onClick={()=>saveNote.mutate()}>
            {saveNote.isPending ? 'Guardando…' : 'Guardar nota'}
          </button>
          {saveNote.isError ? <p className="enarm-error" role="alert">{saveNote.error.message}</p>:null}
          {noteSaved ? <span className="enarm-note-confirm"><Icon name="check"/> Nota guardada en tu cuenta</span>:null}
        </div>
      </aside>
    </div> : <div className="enarm-empty">
      <Icon name="check"/><h3>{mode === 'repaso' ? 'Aún no tienes repasos pendientes' : 'No encontramos casos'}</h3>
      <p>{mode === 'repaso' ? 'Primero resuelve casos. TEDVIO recordará tus errores y te propondrá revisarlos después.' : 'Ajusta el área o el nivel para volver a practicar.'}</p>
      {mode === 'repaso' ? <p>También puedes anticipar el repaso de errores, incluso antes de su fecha sugerida.</p> : null}
    </div>}
  </div>;
}
