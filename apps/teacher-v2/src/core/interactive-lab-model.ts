import type { LabManifest, LabResultRow } from './interactive-lab-api';
export interface LabQuestionDraft { id: string; type: 'choice' | 'numeric'; prompt: string; options: string[]; correct: string; tolerance: string }
export interface LabEditorDraft { title: string; subject: string; instructions: string; questions: LabQuestionDraft[]; requestId: string }
export function newLabQuestion(): LabQuestionDraft { return { id: `q_${crypto.randomUUID().replaceAll('-', '')}`, type: 'choice', prompt: '', options: ['', '', '', ''], correct: '0', tolerance: '0' }; }
export function newLabEditor(): LabEditorDraft { return { title: '', subject: '', instructions: '', questions: [newLabQuestion()], requestId: crypto.randomUUID() }; }
export function labEditorPayload(draft: LabEditorDraft) {
  if (!draft.title.trim() || draft.title.trim().length > 160) throw new Error('Escribe un título de hasta 160 caracteres.');
  if (!draft.questions.length || draft.questions.length > 100) throw new Error('Incluye entre 1 y 100 preguntas.');
  const answer_key: Record<string, { answer: string | number; weight: number; tolerance?: number }> = {};
  const manifest: LabManifest = { protocol: 'tedvio.lab/1', title: draft.title.trim(), instructions: draft.instructions.trim(), questions: draft.questions.map((q, i) => {
    if (!q.prompt.trim()) throw new Error(`Escribe el enunciado de la pregunta ${i + 1}.`);
    if (q.type === 'choice') {
      const options = q.options.map((label, j) => ({ id: `o${j}`, label: label.trim() }));
      if (options.some(o => !o.label) || new Set(options.map(o => o.label.toLocaleLowerCase('es-MX'))).size !== options.length) throw new Error(`Completa opciones diferentes en la pregunta ${i + 1}.`);
      const index = Number(q.correct);
      if (!Number.isInteger(index) || !options[index]) throw new Error(`Selecciona la respuesta correcta de la pregunta ${i + 1}.`);
      answer_key[q.id] = { answer: `o${index}`, weight: 1 };
      return { id: q.id, type: q.type, prompt: q.prompt.trim(), options };
    }
    const answer = Number(q.correct.replace(',', '.')), tolerance = Number(q.tolerance.replace(',', '.'));
    if (!q.correct.trim() || !q.tolerance.trim() || !Number.isFinite(answer) || !Number.isFinite(tolerance) || tolerance < 0) throw new Error(`Revisa la clave numérica y la tolerancia de la pregunta ${i + 1}.`);
    answer_key[q.id] = { answer, weight: 1, tolerance };
    return { id: q.id, type: q.type, prompt: q.prompt.trim() };
  }) };
  return { manifest, answer_key, evaluator: 'answer-key-v1' as const, subject: draft.subject.trim() };
}
export function labCsv(rows: LabResultRow[], title: string): string {
  const cell = (value: unknown) => { let text = value == null ? '' : String(value); if (/^[\s\u0000-\u001f]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`; return `"${text.replaceAll('"', '""')}"`; };
  const headings = ['Asignación', 'Matrícula', 'Alumno', 'Grupo ID', 'Estado', 'Intentos', 'Intento seleccionado', 'Puntuación /100', 'Segundos', 'Fecha de entrega', 'Intento ID', 'Nota oficial'];
  return '\uFEFF' + [headings, ...rows.map(row => [title, row.enrollment, row.full_name, row.group_id, row.selected_result ? row.selected_result.status === 'verified' ? 'Verificado' : 'Pendiente de revisión' : row.attempts ? 'En proceso / sin entrega' : 'Sin iniciar', row.attempts, row.selected_result?.attempt_number, row.selected_result?.score_percent, row.selected_result?.elapsed_seconds, row.selected_result?.submitted_at, row.selected_result?.attempt_id, 'No'])].map(row => row.map(cell).join(',')).join('\r\n');
}
export function localLabDate(date: Date): string { const offset = date.getTimezoneOffset() * 60000; return new Date(date.getTime() - offset).toISOString().slice(0, 16); }
export function labDownloadCsv(rows: LabResultRow[], title: string): void {
  const url = URL.createObjectURL(new Blob([labCsv(rows, title)], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a'); link.href = url; link.download = 'TEDVIO_Interactive_Lab_resultados.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
