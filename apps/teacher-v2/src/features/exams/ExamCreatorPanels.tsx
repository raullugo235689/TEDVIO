import { useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { saveBankQuestions, type BankQuestion, type BankQuestionDraft } from '../../core/bank';
import { assessExamQuality, parseQuestionImport, type ExamQualityReport } from '../../core/exam-creator';
import type { ExamDraft } from '../../core/exams';
import { StatusPill } from '../../shared/components';

const sample = `pregunta\topcion_a\topcion_b\topcion_c\topcion_d\trespuesta\ttema\tdificultad\tbloom
¿Cuál es la unidad funcional del riñón?\tNefrona\tAlvéolo\tNeurona\tHepatocito\tA\tSistema urinario\tmedia\tcomprender`;

export function ExamImportPanel({ user, existing, subject, disabled, onImported, destination = 'exam', maxImport = 500 }: {
  user: User;
  existing: BankQuestion[];
  subject: string;
  disabled: boolean;
  onImported: (questions: BankQuestion[]) => void | Promise<void>;
  destination?: 'bank' | 'exam';
  maxImport?: number;
}) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const savingRef = useRef(false);
  const fileRequest = useRef(0);
  const [edits, setEdits] = useState<Record<number, BankQuestionDraft>>({});
  const report = useMemo(() => parseQuestionImport(source, existing), [existing, source]);
  const reviewed = useMemo(() => source.trim() ? parseQuestionImport(JSON.stringify(report.questions.map((item) => edits[item.row] || item.draft)), existing) : report, [source, report, edits, existing]);
  const pending = reviewed.questions.filter((question) => !question.duplicate);
  const batchSize = Math.max(0, Math.min(500, maxImport));
  const ready = pending.slice(0, batchSize);
  const incompatible = destination === 'exam' && pending.some(({ draft }) => draft.questionType !== 'multiple_choice' || draft.options.length > 5);
  const blocked = incompatible || report.issues.some((issue) => issue.severity === 'error') || reviewed.issues.some((issue) => issue.severity === 'error');
  function changeSource(value: string) { fileRequest.current += 1; setSource(value); setEdits({}); setError(''); }

  async function importQuestions() {
    if (!ready.length || savingRef.current || disabled || blocked) return;
    if (!navigator.onLine) { setError('Sin conexión. Conéctate y vuelve a importar.'); return; }
    savingRef.current = true;
    setSaving(true); setError('');
    try {
      const saved = await saveBankQuestions(user, ready.map((item) => ({ ...item.draft, subject: item.draft.subject || subject })));
      await onImported(saved);
      if (pending.length <= batchSize) { changeSource(''); setOpen(false); }
    } catch (reason) {
      setError((reason as Error).message || 'No se pudieron importar los reactivos.');
    } finally { savingRef.current = false; setSaving(false); }
  }

  async function loadFile(file?: File) {
    if (!file) return;
    if (!/\.(csv|txt|json)$/i.test(file.name)) { setError('Usa CSV, TXT o JSON. Para Excel, selecciona las celdas y pégalas directamente.'); return; }
    if (file.size > 2_000_000) { setError('El archivo supera 2 MB. Divídelo en partes de hasta 500 preguntas.'); return; }
    const request = ++fileRequest.current;
    try { const contents = await file.text(); if (request !== fileRequest.current) return; changeSource(contents); setOpen(true); }
    catch { setError('No se pudo leer el archivo. Intenta cargarlo de nuevo.'); }
  }

  return <div className="exam-import-panel">
    <div className="exam-import-actions">
      <button className="button secondary compact" type="button" disabled={disabled || saving} onClick={() => setOpen((value) => !value)}>＋ Importar preguntas</button>
      <label className="button ghost compact exam-file-button">Cargar CSV/TXT/JSON<input aria-label="Cargar preguntas" type="file" accept=".csv,.txt,.json,text/csv,text/plain,application/json" disabled={disabled || saving} onChange={(event) => { void loadFile(event.target.files?.[0]); event.target.value = ''; }} /></label>
    </div>
    {error ? <p className="field-error" role="alert">{error}</p> : null}
    {open ? <div className="exam-import-workspace">
      <div><b>Importar y revisar</b><p>Pega celdas desde Excel/Sheets, texto estructurado o un respaldo JSON. Corrige las filas con errores en el texto. Los duplicados se omiten. Máximo 500 preguntas.</p></div>
      <textarea aria-label="Preguntas para importar" rows={8} value={source} disabled={saving} maxLength={2_000_000} onChange={(event) => changeSource(event.target.value)} placeholder={sample} />
      <div className="exam-import-report">
        {pending.length > batchSize ? <span>Hay {pending.length} preguntas nuevas. Se importarán {batchSize} en este lote según el espacio disponible.</span> : null}
        {incompatible ? <span className="error">La evaluación impresa admite opción múltiple con 2 a 5 opciones. Importa los demás tipos desde Banco.</span> : null}
        <StatusPill tone={ready.length ? 'green' : 'neutral'}>{ready.length} listas</StatusPill>
        <StatusPill tone={report.issues.some((issue) => issue.severity === 'error') ? 'red' : 'amber'}>{report.issues.length} avisos</StatusPill>
        {report.issues.map((issue, index) => <span key={`${issue.row}-${index}`} className={issue.severity}>Fila {issue.row || '—'}: {issue.message}</span>)}
        {Object.keys(edits).length ? reviewed.issues.map((issue, index) => <span key={`review-${index}`} className={issue.severity}>Revisión {issue.row}: {issue.message}</span>) : null}
      </div>
      <div className="bank-import-preview">{report.questions.map((item) => {
        const draft = edits[item.row] || item.draft;
        const update = (changes: Partial<BankQuestionDraft>) => setEdits((current) => ({ ...current, [item.row]: { ...draft, ...changes } }));
        return <details key={item.row}><summary>Fila {item.row}: {draft.prompt.slice(0, 90)}{item.duplicate ? ' · Posible duplicado' : ''}</summary><fieldset disabled={saving}><label>Revisar enunciado<textarea value={draft.prompt} onChange={(event) => update({ prompt: event.target.value })} /></label><div className="form-grid two"><label>Materia<input value={draft.subject} onChange={(event) => update({ subject: event.target.value })} /></label><label>Tema<input value={draft.topic} onChange={(event) => update({ topic: event.target.value })} /></label><label>Carpeta<input value={draft.folder} onChange={(event) => update({ folder: event.target.value })} /></label></div>{draft.options.map((option, index) => <label key={index}>Opción {index + 1}<input value={option} disabled={['true_false','scale_5'].includes(draft.questionType)} onChange={(event) => update({ options: draft.options.map((old, at) => at === index ? event.target.value : old), correctAnswers: draft.correctAnswers.map((answer) => answer === option ? event.target.value : answer) })} /></label>)}{['multiple_choice','true_false'].includes(draft.questionType) ? <label>Respuesta correcta<select value={draft.correctAnswers[0] || ''} onChange={(event) => update({ correctAnswers: [event.target.value] })}>{draft.options.map((option, index) => <option key={index} value={option}>{option}</option>)}</select></label> : <p>Clave: {draft.correctAnswers.join(' · ') || 'Sin clave'}. Para cambiarla, edita el texto de importación.</p>}<label>Explicación<textarea value={draft.explanation} onChange={(event) => update({ explanation: event.target.value })} /></label></fieldset></details>;
      })}</div>
      <div className="exam-import-footer"><button className="button ghost compact" type="button" disabled={saving} onClick={() => changeSource(sample)}>Ver ejemplo</button><button className="button primary compact" type="button" disabled={!ready.length || saving || disabled || blocked} onClick={importQuestions}>{saving ? 'Importando…' : `Importar ${ready.length}${destination === 'bank' ? ' al banco' : ' y agregar'}`}</button></div>
    </div> : null}
  </div>;
}

export function ExamQualityPanel({ report }: { report: ExamQualityReport }) {
  const tone = report.blockers.length ? 'red' : report.warnings.length ? 'amber' : 'green';
  return <section className={`exam-quality-card quality-${tone}`} aria-label="Control de calidad del examen">
    <div className="exam-quality-score"><span>Calidad</span><b>{report.score}</b><small>/ 100</small></div>
    <div><div className="exam-quality-title"><b>{report.blockers.length ? 'Requiere correcciones' : report.warnings.length ? 'Lista con recomendaciones' : 'Lista para aplicar'}</b><StatusPill tone={tone}>{report.blockers.length ? `${report.blockers.length} bloqueos` : `${report.warnings.length} avisos`}</StatusPill></div>
      <ul>{[...report.blockers, ...report.warnings, ...report.strengths].slice(0, 5).map((message) => <li key={message}>{message}</li>)}</ul>
      {!report.blockers.length && !report.warnings.length && !report.strengths.length ? <p>Agrega reactivos para iniciar la revisión automática.</p> : null}
    </div>
  </section>;
}

export function useExamQuality(draft: ExamDraft, questions: BankQuestion[]) {
  return useMemo(() => assessExamQuality(draft, questions), [draft, questions]);
}
