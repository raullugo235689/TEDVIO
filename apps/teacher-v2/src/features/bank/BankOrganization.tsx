import { useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { organizeBankQuestions, type BankQuestion } from '../../core/bank';
import { bankBackup } from '../../core/exam-creator';

export function downloadBankBackup(questions: BankQuestion[]) {
  const url = URL.createObjectURL(new Blob([bankBackup(questions)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url; link.download = `tedvio-banco-${new Date().toISOString().slice(0,10)}.json`;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function BankOrganization({ user, questions, onSaved }: { user: User; questions: BankQuestion[]; onSaved: (message: string) => Promise<void> }) {
  const [field, setField] = useState<'subject' | 'topic' | 'folder' | 'archived'>('folder');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const locked = useRef(false);
  async function apply() {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError('');
    const count = questions.length;
    try {
      const updated = await organizeBankQuestions(user, questions.map((question) => question.id), { [field]: field === 'archived' ? value !== 'restore' : value });
      await onSaved(`${updated} de ${count} preguntas actualizadas.${updated !== count ? ' Algunas ya no estaban disponibles; revisa el banco.' : ''}`);
    } catch (reason) { setError((reason as Error).message); }
    finally { locked.current = false; setBusy(false); }
  }
  return <section className="editor-panel" aria-label="Organizar selección"><h2>Organizar {questions.length} preguntas</h2><p>El cambio se aplicará a toda la selección, incluidas las preguntas ocultas por filtros. Archivar conserva las preguntas y permite restaurarlas.</p><fieldset disabled={busy}><div className="form-grid two"><label>Cambiar<select value={field} onChange={(event) => { setField(event.target.value as typeof field); setValue(''); }}><option value="folder">Carpeta</option><option value="subject">Materia</option><option value="topic">Tema</option><option value="archived">Archivo</option></select></label>{field === 'archived' ? <label>Acción<select value={value} onChange={(event) => setValue(event.target.value)}><option value="">Archivar</option><option value="restore">Restaurar</option></select></label> : <label>Nuevo valor<input value={value} onChange={(event) => setValue(event.target.value)} placeholder="Vacío para quitar la clasificación" /></label>}</div><button className="button secondary" type="button" onClick={() => downloadBankBackup(questions)}>Exportar selección JSON</button><button className="button primary" type="button" onClick={() => void apply()} disabled={questions.length > 500}>{busy ? 'Aplicando…' : `Aplicar a ${questions.length} preguntas`}</button></fieldset>{error ? <p role="alert" className="field-error">{error}</p> : null}</section>;
}
