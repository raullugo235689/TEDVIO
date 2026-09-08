import test from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient } from '@tanstack/react-query';
import { omrPublication } from '../src/core/omr-publication.ts';
import { createOmrReview, omrExamSignature, omrResultSignature } from '../src/core/omr-review.ts';
import { hasPendingAcademicWork } from '../src/core/useAcademicDraft.ts';
import { omrLayout, buildOmrPayload, parseOmrPayload } from '../src/core/omr-engine.ts';
const exam = () => ({ id: 'exam', title: 'Parcial', question_count: 4, option_count: 4, versions: ['A', 'B'], answer_keys: { A: ['A', 'B', 'C', 'D'], B: ['D', 'C', 'B', 'A'] }, status: 'ready', max_score: 10, period_id: 'period', exam_date: '2026-09-08', grade_item_id: 'item' });
const result = (overrides = {}) => ({ id: 'r1', exam_id: 'exam', student_id: 's1', answers: ['A', 'B', 'C', 'D'], version: 'A', score: 10, reviewed: true, review_status: 'confirmed', reviewed_at: '2026-09-08T10:00:00Z', updated_at: '2026-09-08T10:00:00Z', ...overrides });
function fixture() { return { exam: exam(), period: { status: 'open' }, results: [result()], students: [{ id: 's1', full_name: 'Alumno', enrollment: '001' }], items: [{ id: 'item', title: 'Parcial', source_type: 'omr', source_id: 'exam', max_score: 10, period_id: 'period', item_date: '2026-09-08' }], scores: [{ item_id: 'item', student_id: 's1', score: 10, source_id: 'r1', source_type: 'omr' }], omrResults: [result()] }; }
test('publicación exige nota, origen y metadatos reales; enlazar no basta', () => {
  const data = fixture(); assert.equal(omrPublication(data, data.exam).current, true);
  for (const change of [{ score: 9 }, { source_id: 'older' }, { source_type: 'manual' }, { score: null }]) { const copy = structuredClone(data); Object.assign(copy.scores[0], change); assert.equal(omrPublication(copy, copy.exam).status, 'Cambios pendientes'); }
  data.items[0].title = 'Otro nombre'; assert.equal(omrPublication(data, data.exam).current, false);
  data.exam.grade_item_id = null; assert.equal(omrPublication(data, data.exam).status, 'Por publicar');
});
test('duplicados usan la última revisión, no la nota máxima ni una captura pendiente', () => {
  const data = fixture(); data.omrResults.push(result({ id: 'r2', score: 4, reviewed_at: '2026-09-09T10:00:00Z' }), result({ id: 'pending', score: 10, reviewed: false, review_status: 'needs_review', reviewed_at: '2026-09-10T10:00:00Z' }));
  const state = omrPublication(data, data.exam); assert.equal(state.rows[0].expected.id, 'r2'); assert.equal(state.duplicates, 1); assert.equal(state.pending, 1); assert.equal(state.students, 1); assert.equal(state.current, false);
});
test('archivar o dejar pendiente avisa si se retirará una calificación', () => {
  const data = fixture(); data.omrResults[0].review_status = 'archived';
  const state = omrPublication(data, data.exam); assert.equal(state.students, 0); assert.equal(state.clear, 1);
  data.scores[0].score = null; data.scores[0].source_id = null; assert.equal(omrPublication(data, data.exam).current, true);
});
test('matrícula solo identifica cuando no hay ID; resultados ajenos no se publican', () => {
  const data = fixture(); data.omrResults = [result({ student_id: null, enrollment: ' 001 ' }), result({ id: 'other', student_id: 'outside', enrollment: '001' })];
  const state = omrPublication(data, data.exam); assert.equal(state.students, 1); assert.equal(state.unmatched, 1); assert.equal(state.duplicates, 0);
});
test('reabrir una revisión conserva las dudas y las confirmaciones individuales', () => {
  const data = fixture(); const row = result({ reviewed: false, review_status: 'needs_review', scan_warnings: 2, scan_quality: { marks: [{ status: 'ok' }, { status: 'blank', reviewed: true }, { status: 'ambiguous' }, { status: 'ok' }] } });
  const draft = createOmrReview(data, row); assert.deepEqual(draft.warningIndexes, [1, 2]); assert.deepEqual(draft.reviewedWarnings, [1]); assert.equal(draft.previewDataUrl, '');
  const legacy = createOmrReview(data, { ...row, scan_quality: {} }); assert.deepEqual(legacy.warningIndexes, [0, 1, 2, 3]);
  assert.deepEqual(createOmrReview(data).warningIndexes, [0, 1, 2, 3]);
});
test('las firmas detectan cambios de clave, periodo y resultado sin alterar el borrador', () => {
  const data = fixture(), draft = createOmrReview(data, data.results[0]);
  data.exam.answer_keys.A[0] = 'D'; assert.notEqual(omrExamSignature(data), draft.baseExam);
  data.results[0].answers[0] = 'D'; assert.notEqual(omrResultSignature(data.results[0]), draft.baseResults.r1);
  assert.deepEqual(draft.answers, ['A', 'B', 'C', 'D']);
});
test('avisos de salida aíslan cuenta, examen y revisión; limpiar sesión elimina datos', () => {
  const client = new QueryClient(); client.setQueryData(['omr-draft', 'u1', 'exam', 'new'], { value: { answers: ['A'] }, revision: 1 }); client.setQueryData(['exam-draft', 'u2', 'other'], null);
  assert.equal(hasPendingAcademicWork(client, 'u1'), true); assert.equal(hasPendingAcademicWork(client, 'u2'), false); assert.equal(hasPendingAcademicWork(client), false);
  client.clear(); assert.equal(hasPendingAcademicWork(client, 'u1'), false);
});
test('geometría conserva 1–60 reactivos y 2–5 opciones dentro de las cuatro marcas', () => {
  for (let count = 1; count <= 60; count++) for (let options = 2; options <= 5; options++) { const rows = omrLayout(count, options); assert.equal(rows.length, count); rows.forEach((row, index) => { assert.equal(row.number, index + 1); assert.equal(row.answerXs.length, options); assert.ok(row.y > .045 && row.y < .955); assert.ok(row.answerXs.every(x => x > .055 && x < .945)); }); }
});
test('QR conserva identidad y versión; rechaza códigos ajenos o incompletos', () => {
  assert.deepEqual(parseOmrPayload(buildOmrPayload('exam', 'B', 'student', '001')), { examId: 'exam', version: 'B', studentId: 'student', enrollment: '001' });
  assert.equal(parseOmrPayload('OTHER|exam|A'), null); assert.equal(parseOmrPayload('TEDVIO-OMR||A'), null); assert.equal(parseOmrPayload('TEDVIO-OMR|exam|Z'), null);
});
