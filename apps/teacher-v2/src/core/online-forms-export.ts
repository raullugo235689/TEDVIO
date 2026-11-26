import type { OnlineFormDetail, OnlineFormResults, OnlineFormItem } from './online-forms-model';

type Cell = string | number | null;
export interface FormExportSheet { name: string; headers: string[]; rows: Cell[][]; widths: number[] }
const emptyAnswer = 'Sin responder';
const unassigned = 'No asignada';

/** Columns identify the snapshot, never the shuffled position shown to a student. */
export function onlineFormExportSheets(results: OnlineFormResults): FormExportSheet[] {
  const { form, attempts } = results;
  const sectionOrder = new Map(results.sections.map(section => [section.id, section.position]));
  const sectionNames = new Map(results.sections.map(section => [section.id, section.title]));
  const items = [...results.items].sort((a, b) => (sectionOrder.get(a.section_id) || 0) - (sectionOrder.get(b.section_id) || 0) || a.position - b.position || a.id.localeCompare(b.id));
  const labels = new Map(items.map((item, index) => [item.id, `P${String(index + 1).padStart(3, '0')}`]));
  const ordered = [...attempts].sort((a, b) => a.started_at.localeCompare(b.started_at) || a.id.localeCompare(b.id));
  const responseHeaders = ['Marca temporal de entrega (UTC)', 'Alumno', 'Matrícula', 'Intento', 'Estado', 'Inicio (UTC)', 'Puntaje', 'Puntos posibles', 'Porcentaje', 'Calificación / 10', 'ID del intento', 'Grupo', ...items.map(item => `${labels.get(item.id)} · ${item.prompt}`)];
  const responseRows = ordered.map(attempt => {
    const assigned = new Set(attempt.item_ids);
    const responses = new Map(attempt.responses.map(response => [response.item_id, response]));
    const submitted = attempt.status === 'submitted';
    return [attempt.submitted_at, attempt.display_name, attempt.enrollment, attempt.attempt_no,
      submitted ? (attempt.auto_submitted ? 'Entregado al cierre' : 'Entregado') : 'En curso', attempt.started_at,
      submitted ? attempt.score : null, attempt.max_score, submitted ? attempt.percentage : null,
      submitted && attempt.percentage != null ? Math.round(attempt.percentage * 10) / 100 : null, attempt.id, attempt.declared_group || form.group_name || null,
      ...items.map(item => !assigned.has(item.id) ? unassigned : responses.get(item.id)?.answer ?? emptyAnswer)] as Cell[];
  });
  const detailRows: Cell[][] = [];
  const byId = new Map(items.map(item => [item.id, item]));
  for (const attempt of ordered) {
    const responses = new Map(attempt.responses.map(response => [response.item_id, response]));
    attempt.item_ids.forEach((itemId, index) => {
      const item = byId.get(itemId); if (!item) throw new Error('El resultado contiene una pregunta sin su copia original. Actualiza antes de exportar.');
      const response = responses.get(itemId);
      detailRows.push([attempt.id, attempt.display_name, attempt.enrollment, attempt.attempt_no,
        attempt.status === 'submitted' ? 'Entregado' : 'En curso', index + 1, labels.get(itemId) || '', item.id,
        sectionNames.get(item.section_id) || '', item.topic, item.prompt, response?.answer ?? emptyAnswer,
        item.correct_answer, !response ? 'Sin responder' : response.is_correct === true ? 'Correcta' : response.is_correct === false ? 'Incorrecta' : 'Sin calificar',
        response?.points ?? 0, item.points, attempt.declared_group || form.group_name || null]);
    });
  }
  const completed = attempts.filter(attempt => attempt.status === 'submitted');
  const percentages = completed.map(attempt => attempt.percentage).filter((value): value is number => value != null);
  const mean = percentages.length ? percentages.reduce((sum, value) => sum + value, 0) / percentages.length : null;
  const questionRows = items.map((item: OnlineFormItem) => [labels.get(item.id) || '', item.id, item.bank_id,
    sectionNames.get(item.section_id) || '', item.topic, item.prompt, ...Array.from({ length: 10 }, (_, i) => item.options[i] || null),
    item.correct_answer, item.points, item.explanation || '', item.media_url || ''] as Cell[]);
  return [
    { name: 'Respuestas', headers: responseHeaders, rows: responseRows, widths: [28, 30, 20, 10, 22, 28, 12, 16, 14, 20, 38, 20, ...items.map(() => 44)] },
    { name: 'Detalle', headers: ['ID del intento', 'Alumno', 'Matrícula', 'Intento', 'Estado', 'Posición en su examen', 'Reactivo', 'ID de la pregunta', 'Sección', 'Tema', 'Pregunta', 'Respuesta del alumno', 'Respuesta correcta', 'Resultado', 'Puntos obtenidos', 'Puntos posibles', 'Grupo'], rows: detailRows, widths: [38, 30, 20, 10, 18, 20, 12, 38, 24, 24, 60, 42, 42, 18, 18, 18, 20] },
    { name: 'Reactivos', headers: ['Reactivo', 'ID de la pregunta', 'ID en el banco', 'Sección', 'Tema', 'Pregunta', ...Array.from({ length: 10 }, (_, i) => `Opción ${i + 1}`), 'Respuesta correcta', 'Puntos', 'Justificación y referencia', 'Recurso'], rows: questionRows, widths: [12, 38, 38, 24, 24, 60, ...Array(10).fill(36), 42, 12, 70, 50] },
    { name: 'Resumen', headers: ['Campo', 'Valor'], rows: [
      ['Formulario', form.title], ['Código', form.code], ['Preguntas por intento', form.question_count],
      ['Preguntas en el conjunto', items.length], ['Total de intentos', attempts.length], ['Entregados', completed.length],
      ['En curso', attempts.length - completed.length], ['Promedio de entregados (%)', mean == null ? null : Math.round(mean * 100) / 100],
      ['Exportación (UTC)', results.server_now || new Date().toISOString()],
      ['No asignada', 'La pregunta no formó parte del examen de este alumno. No cuenta como error.'],
      ['Sin responder', 'La pregunta sí se asignó y no tiene una respuesta guardada. Al entregar vale 0 puntos.'],
      ['Identificación', 'Nombre y matrícula declarados; un grupo vinculado valida matrícula contra su padrón. La lista de grupos declarados no acredita pertenencia al padrón. Grupo vacío significa que no se registró.'],
      ['Columnas', 'P001, P002… identifican la misma pregunta para todos. Las opciones se exportan como texto, no como letras que cambian al mezclarlas.'],
      ['Intentos', 'Una fila por intento. Si se permiten varios, todos se conservan; no se selecciona automáticamente la nota más alta.'],
      ['Fechas', 'Las marcas temporales se conservan en UTC (ISO 8601).'],
    ], widths: [34, 105] },
  ];
}

export async function buildOnlineFormWorkbook(results: OnlineFormResults) {
  // Loaded only when the teacher requests the export, not in the student bundle.
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TEDVIO'; workbook.title = results.form.title; workbook.created = new Date();
  for (const sheet of onlineFormExportSheets(results)) {
    const worksheet = workbook.addWorksheet(sheet.name, { views: [{ state: 'frozen', ySplit: 1, xSplit: sheet.name === 'Respuestas' ? 3 : 0 }] });
    worksheet.columns = sheet.headers.map((header, index) => ({ header, width: sheet.widths[index] || 25 }));
    // Plain strings remain text cells, including strings beginning with '='.
    worksheet.addRows(sheet.rows);
    worksheet.getRow(1).height = 44;
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF153A57' } };
    worksheet.getRow(1).alignment = { vertical: 'middle', wrapText: true };
    worksheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, sheet.rows.length + 1), column: sheet.headers.length } };
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      row.alignment = { vertical: 'top', wrapText: true };
      row.eachCell(cell => { if (typeof cell.value === 'number') cell.numFmt = '0.##'; });
    });
  }
  return workbook;
}
export async function exportOnlineFormResults(detail: OnlineFormDetail): Promise<void> {
  const workbook = await buildOnlineFormWorkbook(detail.results);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([new Uint8Array(buffer).buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = `TEDVIO_${detail.form.title.replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 90)}_resultados.xlsx`;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
