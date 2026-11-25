import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyOnlineFormDraft, onlineFormDraftPayload, normalizeOnlineFormState, compatibleOnlineFormQuestion } from '../src/core/online-forms-model.ts';
import { onlineFormExportSheets, buildOnlineFormWorkbook } from '../src/core/online-forms-export.ts';

const question = (id, topic = 'Tema A') => ({ id, topic, archived: false, prompt: `Pregunta ${id}`, question_type: 'multiple_choice', options: ['Primera', 'Segunda'], correct_answer: 'Segunda' });
test('composición 70/35 conserva las cuotas 10/10/8/7 y puntos iguales', () => {
  const quotas = { Sesiones: 10, Autopsias: 10, Calidad: 8, México: 7 };
  const questions = Object.entries(quotas).flatMap(([topic, count]) => Array.from({ length: count * 2 }, (_, index) => question(`${topic}-${index}`, topic)));
  const draft = { ...emptyOnlineFormDraft(), title: 'Unidad 1', selectionMode: 'topic_quotas', questionIds: questions.map(q => q.id), topicQuotas: quotas };
  const payload = onlineFormDraftPayload(draft, questions);
  assert.equal(payload.sections.reduce((sum, section) => sum + section.items.length, 0), 70);
  assert.equal(payload.sections.reduce((sum, section) => sum + section.draw_count, 0), 35);
  assert.deepEqual(payload.sections.map(section => section.draw_count), [10, 10, 8, 7]);
  assert.ok(payload.sections.every(section => section.items.every(item => item.points === 1)));
});
test('rechaza bancos insuficientes, claves inválidas y fechas invertidas antes de guardar', () => {
  const questions = [question('a'), question('b')];
  const base = { ...emptyOnlineFormDraft(), title: 'Prueba', questionIds: ['a', 'b'], questionCount: 3 };
  assert.throws(() => onlineFormDraftPayload(base, questions), /cantidad/);
  assert.throws(() => onlineFormDraftPayload({ ...base, questionCount: 2 }, [{ ...questions[0], correct_answer: 'Inexistente' }, questions[1]]), /válida/);
  assert.throws(() => onlineFormDraftPayload({ ...base, questionCount: 2, opensAt: '2026-11-25T11:00:00Z', closesAt: '2026-11-25T10:00:00Z' }, questions), /posterior/);
  assert.equal(compatibleOnlineFormQuestion({ ...questions[0], options: ['A', 'A'], correct_answer: 'A' }), false);
  assert.equal(compatibleOnlineFormQuestion({ ...questions[0], archived: true }), false);
});
test('responder adapta la copia pública sin inferir una calificación no liberada', () => {
  const state = normalizeOnlineFormState({ form: { title: 'Prueba', instructions: '', code: 'TEST' },
    attempt: { id: 'at', status: 'submitted', display_name: 'Alumno', enrollment: '001', attempt_no: 1, started_at: '2026-11-25T10:00:00Z', submitted_at: '2026-11-25T10:10:00Z', expires_at: null, score: null, max_score: null, percentage: null },
    server_now: '2026-11-25T10:10:00Z', sections: [{ id: 's', title: 'Tema' }], items: [{ id: 'q1', section_id: 's', prompt: 'Texto', options: ['A', 'B'], points: 1 }], answers: { q1: 'B' }, released: false, show_answers: false, feedback: [] });
  assert.equal(state.items[0].section_title, 'Tema'); assert.equal(state.percentage, null); assert.equal(state.released, false);
  assert.deepEqual(state.responses, [{ item_id: 'q1', answer: 'B' }]);
});
const exportFixture = () => ({
  form: { title: 'Prueba de exportación', code: 'TEST', question_count: 2 },
  sections: [{ id: 's', title: 'Tema', position: 1 }],
  items: ['a', 'b', 'c'].map((id, index) => ({ id, bank_id: `bank-${id}`, section_id: 's', position: index + 1, prompt: `Pregunta ${id}`, options: ['Uno', 'Dos'], correct_answer: 'Dos', points: 1, topic: 'Tema', explanation: 'Manual · apartado 1.1' })),
  attempts: [
    { id: 'first', display_name: '=HYPERLINK("x")', enrollment: '0001', attempt_no: 1, status: 'submitted', item_ids: ['b', 'a'], started_at: '2026-11-25T10:00:00Z', submitted_at: '2026-11-25T10:10:00Z', score: 1, max_score: 2, percentage: 50, responses: [{ item_id: 'b', answer: 'Dos', is_correct: true, points: 1 }] },
    { id: 'second', display_name: 'B', enrollment: '0002', attempt_no: 1, status: 'in_progress', item_ids: ['c', 'b'], started_at: '2026-11-25T10:02:00Z', submitted_at: null, score: null, max_score: 2, percentage: null, responses: [{ item_id: 'c', answer: 'Uno', is_correct: false, points: 0 }] },
  ], server_now: '2026-11-25T11:00:00Z',
});
test('Excel alinea por ID aunque el orden del examen cambie; vacías y no asignadas son diferentes', () => {
  const sheets = onlineFormExportSheets(exportFixture()); const rows = sheets[0].rows;
  assert.deepEqual(rows[0].slice(11), ['Sin responder', 'Dos', 'No asignada']);
  assert.deepEqual(rows[1].slice(11), ['No asignada', 'Sin responder', 'Uno']);
  assert.equal(rows[0][9], 5); assert.equal(rows[1][9], null);
  const detail = sheets.find(sheet => sheet.name === 'Detalle');
  assert.equal(detail.rows[0][5], 1); assert.equal(detail.rows[0][7], 'b');
  assert.equal(sheets.find(sheet => sheet.name === 'Resumen').rows.find(row => row[0] === 'Promedio de entregados (%)')[1], 50);
});
test('el archivo es XLSX real; matrícula conserva ceros y texto no se interpreta como fórmula', async () => {
  const workbook = await buildOnlineFormWorkbook(exportFixture());
  const buffer = await workbook.xlsx.writeBuffer();
  assert.equal(Buffer.from(buffer).subarray(0, 2).toString(), 'PK');
  const { default: ExcelJS } = await import('exceljs'); const reopened = new ExcelJS.Workbook(); await reopened.xlsx.load(buffer);
  assert.deepEqual(reopened.worksheets.map(sheet => sheet.name), ['Respuestas', 'Detalle', 'Reactivos', 'Resumen']);
  assert.equal(reopened.getWorksheet('Respuestas').getCell('C2').value, '0001');
  assert.equal(reopened.getWorksheet('Respuestas').getCell('B2').value, '=HYPERLINK("x")');
  assert.equal(reopened.getWorksheet('Respuestas').getCell('B2').type, ExcelJS.ValueType.String);
});


test('los nuevos formularios no revelan claves por defecto', () => {
  assert.equal(emptyOnlineFormDraft().feedbackMode, 'score_only');
});
