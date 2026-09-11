import { useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { saveBankQuestions, type BankQuestion } from '../../core/bank';
import { assessExamQuality, parseQuestionImport, type ExamQualityReport } from '../../core/exam-creator';
import type { ExamDraft } from '../../core/exams';
import { StatusPill } from '../../shared/components';

const sample = `pregunta\topcion_a\topcion_b\topcion_c\topcion_d\trespuesta\ttema\tdificultad\tbloom
¿Cuál es la unidad funcional del riñón?\tNefrona\tAlvéolo\tNeurona\tHepatocito\tA\tSistema urinario\tmedia\tcomprender`;

export function ExamImportPanel({ user, existing, subject, disabled, onImported }: {
  user: User;
  existing: BankQuestion[];
  subject: string;
  disabled: boolean;
  onImported: (questions: BankQuestion[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const report = useMemo(() => parseQuestionImport(source, existing), [existing, source]);
  const ready = report.questions.filter((question) => !question.duplicate);

  async function importQuestions() {
    if (!ready.length || saving) return;
    setSaving(true); setError('');
    try {
      const saved = await saveBankQuestions(user, ready.map((item) => ({ ...item.draft, subject: item.draft.subject || subject })));
      onImported(saved);
      setSource(''); setOpen(false);
    } catch (reason) {
      setError((reason as Error).message || 'No se pudieron importar los reactivos.');
    } finally { setSaving(false); }
  }

  async function loadFile(file?: File) {
    if (!file) return;
    if (!/\.(csv|txt)$/i.test(file.name)) { setError('Usa CSV o TXT. Para Excel, selecciona las celdas y pégalas directamente.'); return; }
    setSource(await file.text()); setError(''); setOpen(true);
  }

  return <div className="exam-import-panel">
    <div className="exam-import-actions">
      <button className="button secondary compact" type="button" disabled={disabled} onClick={() => setOpen((value) => !value)}>＋ Importar preguntas</button>
      <label className="button ghost compact exam-file-button">Cargar CSV/TXT<input type="file" accept=".csv,.txt,text/csv,text/plain" disabled={disabled} onChange={(event) => loadFile(event.target.files?.[0])} /></label>
    </div>
    {open ? <div className="exam-import-workspace">
      <div><b>Importación rápida</b><p>Pega celdas desde Excel/Sheets o preguntas estructuradas desde Word. Los duplicados se omiten.</p></div>
      <textarea aria-label="Preguntas para importar" rows={8} value={source} onChange={(event) => setSource(event.target.value)} placeholder={sample} />
      <div className="exam-import-report">
        <StatusPill tone={ready.length ? 'green' : 'neutral'}>{ready.length} listas</StatusPill>
        <StatusPill tone={report.issues.some((issue) => issue.severity === 'error') ? 'red' : 'amber'}>{report.issues.length} avisos</StatusPill>
        {report.issues.slice(0, 4).map((issue, index) => <span key={`${issue.row}-${index}`} className={issue.severity}>Fila {issue.row || '—'}: {issue.message}</span>)}
      </div>
      {error ? <p className="field-error" role="alert">{error}</p> : null}
      <div className="exam-import-footer"><button className="button ghost compact" type="button" onClick={() => { setSource(sample); setError(''); }}>Ver ejemplo</button><button className="button primary compact" type="button" disabled={!ready.length || saving || disabled} onClick={importQuestions}>{saving ? 'Importando…' : `Importar ${ready.length} y agregar`}</button></div>
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
