import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyOnlineFormDraft, onlineFormDraftPayload, onlineFormSettingsPayload, normalizeOnlineFormState, compatibleOnlineFormQuestion } from '../src/core/online-forms-model.ts';
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
    { id: 'first', display_name: '=HYPERLINK("x")', enrollment: '0001', declared_group:'3-09', attempt_no: 1, status: 'submitted', item_ids: ['b', 'a'], started_at: '2026-11-25T10:00:00Z', submitted_at: '2026-11-25T10:10:00Z', score: 1, max_score: 2, percentage: 50, responses: [{ item_id: 'b', answer: 'Dos', is_correct: true, points: 1 }] },
    { id: 'second', display_name: 'B', enrollment: '0002', attempt_no: 1, status: 'in_progress', item_ids: ['c', 'b'], started_at: '2026-11-25T10:02:00Z', submitted_at: null, score: null, max_score: 2, percentage: null, responses: [{ item_id: 'c', answer: 'Uno', is_correct: false, points: 0 }] },
  ], server_now: '2026-11-25T11:00:00Z',
});
test('Excel alinea por ID aunque el orden del examen cambie; vacías y no asignadas son diferentes', () => {
  const sheets = onlineFormExportSheets(exportFixture()); const rows = sheets[0].rows;
  assert.deepEqual(rows[0].slice(12), ['Sin responder', 'Dos', 'No asignada']);
  assert.deepEqual(rows[1].slice(12), ['No asignada', 'Sin responder', 'Uno']);
  assert.equal(rows[0][11], '3-09'); assert.equal(rows[1][11], null);
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
  assert.equal(reopened.getWorksheet('Respuestas').getCell('L2').value, '3-09');
  assert.equal(reopened.getWorksheet('Respuestas').getCell('B2').value, '=HYPERLINK("x")');
  assert.equal(reopened.getWorksheet('Respuestas').getCell('B2').type, ExcelJS.ValueType.String);
});


test('los nuevos formularios no revelan claves por defecto', () => {
  assert.equal(emptyOnlineFormDraft().feedbackMode, 'score_only');
  assert.equal(emptyOnlineFormDraft().navigationMode, 'free');
});

test('editar configuración no necesita el banco ni envía cambios a preguntas o grupos', () => {
  const draft = { ...emptyOnlineFormDraft(), id: 'published', revision: 8, title: '  Evaluación publicada  ', questionIds: [], groupChoicesText: 'A, A', navigationMode: 'forward_only', maxAttempts: 2, timeLimitMinutes: 30 };
  const payload = onlineFormSettingsPayload(draft);
  assert.equal(payload.title, 'Evaluación publicada');
  assert.equal(payload.navigation_mode, 'forward_only');
  assert.equal(payload.time_limit_minutes, 30);
  for (const key of ['sections', 'question_count', 'group_id', 'group_choices', 'status', 'id', 'revision']) assert.equal(key in payload, false);
  assert.throws(() => onlineFormSettingsPayload({ ...draft, navigationMode: 'jump_anywhere' }), /navegación/);
  assert.throws(() => onlineFormSettingsPayload({ ...draft, maxAttempts: 0 }), /intentos/);
  assert.throws(() => onlineFormSettingsPayload({ ...draft, opensAt: '2026-11-27T11:00:00Z', closesAt: '2026-11-27T10:00:00Z' }), /posterior/);
});

test('avance secuencial conserva el cursor y los totales del servidor aunque solo llegue una pregunta', () => {
  const raw = { form: { title: 'Prueba', instructions: '', code: 'TEST' },
    attempt: { id: 'at', status: 'in_progress', navigation_mode: 'forward_only', current_position: 2, item_ids: ['q1', 'q2', 'q3'], display_name: 'Alumno', enrollment: '001', attempt_no: 1, started_at: '2026-11-25T10:00:00Z', submitted_at: null, expires_at: null, score: null, max_score: null, percentage: null },
    question_count: 3, answered_count: 1, server_now: '2026-11-25T10:10:00Z', sections: [{ id: 's', title: 'Tema' }],
    items: [{ id: 'q2', section_id: 's', prompt: 'Actual', options: ['A', 'B'], points: 1 }], answers: { q1: 'B' }, released: false, show_answers: false, feedback: [] };
  const state = normalizeOnlineFormState(raw);
  assert.equal(state.navigation_mode, 'forward_only');
  assert.equal(state.current_position, 2);
  assert.equal(state.question_count, 3);
  assert.equal(state.answered_count, 1);
  assert.deepEqual(state.items.map(item => item.id), ['q2']);
  const legacy = normalizeOnlineFormState({ ...raw, attempt: { ...raw.attempt, navigation_mode: undefined, current_position: undefined } });
  assert.equal(legacy.navigation_mode, 'free');
  assert.equal(legacy.current_position, 1);
});
