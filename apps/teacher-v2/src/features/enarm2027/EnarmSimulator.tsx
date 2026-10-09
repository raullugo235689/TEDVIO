import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { balancedEnarmSimulation, enarmPercent } from '../../core/enarm2027-model';
import { submitEnarmAnswer, type EnarmAnswerResult, type EnarmCase, type EnarmWorkspace } from '../../core/enarm2027';
import { Icon } from '../../shared/icons';
import { EnarmQuestionCard } from './EnarmQuestionCard';

interface Completed { question: EnarmCase; selected: number; feedback: EnarmAnswerResult; }

export function EnarmSimulator({ workspace, onProgress }: {
  workspace: EnarmWorkspace;
  onProgress: () => Promise<unknown>;
}) {
  const [cases, setCases] = useState<EnarmCase[]>([]);
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<number|null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [questionStart, setQuestionStart] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [results, setResults] = useState<Completed[]>([]);
  const [finished, setFinished] = useState(false);
  const question = cases[index] || null;

  useEffect(() => {
    if (!cases.length || finished) return;
    const timer = window.setInterval(() => setElapsed(Math.max(0, Math.floor((Date.now()-startedAt)/1000))),1000);
    return () => window.clearInterval(timer);
  }, [cases.length, finished, startedAt]);

  const submit = useMutation({
    mutationFn: async () => {
      if (!question || chosen == null) throw new Error('Selecciona una respuesta.');
      return submitEnarmAnswer(question.id,chosen,'simulador',Math.round((Date.now()-questionStart)/1000));
    },
    onSuccess: (feedback) => {
      setResults(previous => [...previous,{question:question!,selected:chosen!,feedback}]);
      if (index === cases.length-1) setFinished(true);
      else { setIndex(i=>i+1);setChosen(null);setQuestionStart(Date.now()); }
      void onProgress();
    },
  });

  const totalCorrect = useMemo(()=>results.filter(r=>r.feedback.correct).length,[results]);
  function start() {
    const subset=balancedEnarmSimulation(workspace.cases,Math.min(10,workspace.cases.length));
    setCases(subset);setIndex(0);setResults([]);setChosen(null);
    setStartedAt(Date.now());setQuestionStart(Date.now());setElapsed(0);setFinished(false);
    submit.reset();
  }

  return <div className="enarm-simulation" data-enarm-mode="simulador">
    <div className="enarm-section-heading">
      <div><span className="enarm-eyebrow">CONCENTRACIÓN Y TIEMPO</span><h2>Simulador clínico</h2>
      <p>Practica bajo presión de tiempo. La explicación se guarda hasta finalizar la serie.</p></div>
      <span className="enarm-round-count">Simulador piloto · {Math.min(10,workspace.cases.length)} casos</span>
    </div>
    {!cases.length ? <section className="enarm-sim-intro">
      <div className="enarm-sim-emblem"><Icon name="clock"/></div>
      <h3>Entrena como si estuvieras frente a un caso real.</h3>
      <p>Diez reactivos distribuidos entre las siete áreas clínicas. Cada respuesta se confirma en tu cuenta, pero las soluciones se revelan al finalizar el ejercicio.</p>
      <div className="enarm-sim-rules">
        <span><Icon name="check"/> 4 opciones por pregunta</span>
        <span><Icon name="clock"/> Tiempo de resolución visible</span>
        <span><Icon name="shield"/> Calificación verificada en el servidor</span>
      </div>
      <button type="button" className="enarm-primary" disabled={!workspace.cases.length} onClick={start}>
        Iniciar simulador de 10 casos <Icon name="arrow"/>
      </button>
      <small>No es una reproducción, escala o predictor del examen oficial.</small>
    </section> : finished ? <section className="enarm-sim-complete">
      <div className="enarm-sim-finished-icon"><Icon name="check"/></div>
      <span className="enarm-eyebrow">SIMULACIÓN TERMINADA</span>
      <h3>Resultados de tu práctica</h3>
      <div className="enarm-sim-result-number">{enarmPercent(totalCorrect,cases.length)}<span>%</span></div>
      <p>{totalCorrect} aciertos de {cases.length} · Tiempo {Math.floor(elapsed/60)}m {elapsed%60}s</p>
      <div className="enarm-sim-results-list">
        {results.map((r,i)=><article key={r.question.id} className={r.feedback.correct?'correct':'incorrect'}>
          <span>{i+1}</span>
          <div><b>{r.question.topic}</b><p>{r.question.prompt}</p>
            <small>Tu respuesta: {String.fromCharCode(65+r.selected)} · Correcta: {String.fromCharCode(65+r.feedback.correct_index)}</small>
            <details><summary>Revisar razonamiento clínico</summary><p>{r.feedback.rationale}</p><small>{r.feedback.reference_hint}</small></details>
          </div><Icon name={r.feedback.correct?'check':'alert'}/>
        </article>)}
      </div>
      <button className="enarm-primary" type="button" onClick={start}>Nuevo simulador <Icon name="refresh"/></button>
      <p className="enarm-sim-caution">Tu porcentaje describe esta muestra educativa de {cases.length} casos, no un puntaje oficial ni una probabilidad de ingreso.</p>
    </section> : question ? <div className="enarm-sim-session">
      <div className="enarm-sim-progress">
        <span><strong>{index+1}</strong> de {cases.length}</span>
        <div className="enarm-progress-track"><i style={{width:`${((index+1)/cases.length)*100}%`}}/></div>
        <span><Icon name="clock"/> {Math.floor(elapsed/60).toString().padStart(2,'0')}:{(elapsed%60).toString().padStart(2,'0')}</span>
      </div>
      <EnarmQuestionCard question={question} chosen={chosen} onChoose={setChosen} disabled={submit.isPending}
        simulation index={index+1} count={cases.length}/>
      {submit.isError ? <p className="enarm-error" role="alert">{submit.error.message}</p>:null}
      <button className="enarm-primary" disabled={chosen==null||submit.isPending} type="button" onClick={()=>submit.mutate()}>
        {submit.isPending?'Registrando…':index===cases.length-1?'Finalizar simulador':'Guardar y continuar'} <Icon name="arrow"/>
      </button>
      <small className="enarm-sim-note">No se muestran respuestas correctas durante la simulación.</small>
    </div> : null}
  </div>;
}
