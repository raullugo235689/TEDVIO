import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import { useAcademicDraft } from '../../core/useAcademicDraft';
import { useAuth } from '../auth/AuthProvider';
import { createLabOnce, type LabVersion } from '../../core/interactive-lab-api';
import { labEditorPayload, newLabEditor, newLabQuestion, type LabQuestionDraft } from '../../core/interactive-lab-model';
import { PageHeader } from '../../shared/components';

export function LabEditor() {
  const { user } = useAuth(); const client = useQueryClient(); const navigate = useNavigate(); const [initial] = useState(newLabEditor);
  const draft = useAcademicDraft(['lab-draft', user?.id, 'editor'], initial, { persistInSession: true });
  const [error, setError] = useState(''); const [locked, setLocked] = useState(false);
  const save = useMutation({ mutationKey: ['lab-write', user?.id], retry: false,
    mutationFn: () => { const payload = labEditorPayload(draft.value); setLocked(true); return createLabOnce<LabVersion>(draft.value.requestId, 'create_activity', payload); },
    onSuccess: async () => { draft.clear(); await client.invalidateQueries({queryKey:['interactive-lab',user?.id]}); navigate('/interactive-lab'); }, onError: e => { setError(e.message); const code = (e as Error & { code?: string }).code || ''; if (/^(22|23|42501)/.test(code)) setLocked(false); },
  });
  function patchQuestion(index: number, update: Partial<LabQuestionDraft>) { draft.set(v => ({ ...v, questions: v.questions.map((q, i) => i === index ? { ...q, ...update } : q) })); }
  return <div className="lab-panel view-stack">
    <PageHeader eyebrow="INTERACTIVE LAB · PLANTILLA NATIVA" title="Crea una actividad" detail="Preguntas de opción o cálculo. La clave queda en el servidor; la puntuación no es una nota oficial." actions={<Link className="button secondary" to="/interactive-lab">Volver a la biblioteca</Link>} />
    <form className="lab-editor" onSubmit={e => { e.preventDefault(); setError(''); save.mutate(); }}>
      <fieldset disabled={save.isPending || locked} className="lab-fields">
        <legend>Identidad de la actividad</legend>
        <label>Título<input required maxLength={160} value={draft.value.title} onChange={e => draft.set(v => ({ ...v, title: e.target.value }))} /></label>
        <label>Materia<input maxLength={160} value={draft.value.subject} onChange={e => draft.set(v => ({ ...v, subject: e.target.value }))} /></label>
        <label className="lab-span">Instrucciones<textarea maxLength={4000} rows={3} value={draft.value.instructions} onChange={e => draft.set(v => ({ ...v, instructions: e.target.value }))} /></label>
      </fieldset>
      {draft.value.questions.map((q, i) => <fieldset key={q.id} disabled={save.isPending || locked} className="lab-question-editor">
        <legend>Pregunta {i + 1}</legend>
        <div className="lab-question-top"><label>Tipo<select value={q.type} onChange={e => patchQuestion(i, { type: e.target.value as LabQuestionDraft['type'], correct: '0' })}><option value="choice">Opción múltiple</option><option value="numeric">Respuesta numérica</option></select></label><button type="button" className="button ghost" disabled={draft.value.questions.length === 1} onClick={() => draft.set(v => ({ ...v, questions: v.questions.filter((_, j) => j !== i) }))}>Quitar pregunta {i + 1}</button></div>
        <label>Enunciado {i + 1}<textarea required maxLength={2000} rows={2} value={q.prompt} onChange={e => patchQuestion(i, { prompt: e.target.value })} /></label>
        {q.type === 'choice' ? <div className="lab-options-editor"><p>Marca la opción correcta. Todas las preguntas valen un punto.</p>{q.options.map((option, j) => <div className="lab-option-edit" key={j}><input type="radio" name={`key-${q.id}`} aria-label={`Correcta ${String.fromCharCode(65+j)}, pregunta ${i+1}`} checked={q.correct === String(j)} onChange={() => patchQuestion(i, { correct: String(j) })} /><label>Opción {String.fromCharCode(65+j)}<input required maxLength={1000} value={option} onChange={e => patchQuestion(i, { options: q.options.map((value, k) => k === j ? e.target.value : value) })} /></label></div>)}</div>
        : <div className="lab-fields"><label>Respuesta correcta<input required inputMode="decimal" value={q.correct} onChange={e => patchQuestion(i, { correct: e.target.value })} /></label><label>Tolerancia absoluta<input required inputMode="decimal" value={q.tolerance} onChange={e => patchQuestion(i, { tolerance: e.target.value })} /></label></div>}
      </fieldset>)}
      {error ? <p role="alert" className="lab-error">{error}</p> : null}
      {locked && error ? <p className="lab-note">La solicitud conserva los mismos datos para evitar duplicados. Reintenta el guardado; no vuelvas a crearla desde otra pestaña.</p> : null}
      <footer className="lab-actions"><button type="button" className="button secondary" disabled={save.isPending || locked || draft.value.questions.length >= 100} onClick={() => draft.set(v => ({ ...v, questions: [...v.questions, newLabQuestion()] }))}>Añadir pregunta</button><button className="button primary" disabled={save.isPending}>{save.isPending ? 'Guardando…' : locked ? 'Reintentar guardado' : 'Guardar actividad'}</button></footer>
      <p className="lab-note">Se guardará como borrador. Publicarla y asignarla son decisiones separadas. Tu captura se conserva en esta pestaña mientras la editas.</p>
    </form>
  </div>;
}
