import test from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient } from '@tanstack/react-query';
import jsQR from 'jsqr';
import QRCode from 'qrcode';
import { omrPublication } from '../src/core/omr-publication.ts';
import { createOmrReview, omrExamSignature, omrResultSignature } from '../src/core/omr-review.ts';
import { hasPendingAcademicWork } from '../src/core/useAcademicDraft.ts';
import { assessOmrPhoto, omrLayout, buildOmrPayload, parseOmrPayload } from '../src/core/omr-engine.ts';
import { omrBatchProgress, omrOperationalMetrics, summarizeOmrValidation } from '../src/core/omr-premium.ts';
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

test('lector QR local decodifica una hoja sin red ni runtime externo', () => {
  const payload = buildOmrPayload('exam', 'B', 'student', '001');
  const qr = QRCode.create(payload, { errorCorrectionLevel: 'M' });
  const margin = 4, scale = 5, size = (qr.modules.size + margin * 2) * scale;
  const pixels = new Uint8ClampedArray(size * size * 4); pixels.fill(255);
  for (let row = 0; row < qr.modules.size; row++) for (let column = 0; column < qr.modules.size; column++) if (qr.modules.get(row, column)) {
    for (let y = (row + margin) * scale; y < (row + margin + 1) * scale; y++) for (let x = (column + margin) * scale; x < (column + margin + 1) * scale; x++) {
      const pixel = (y * size + x) * 4; pixels[pixel] = 0; pixels[pixel + 1] = 0; pixels[pixel + 2] = 0;
    }
  }
  assert.equal(jsQR(pixels, size, size, { inversionAttempts: 'attemptBoth' })?.data, payload);
});

function syntheticPaper(width = 700, height = 900) {
  const data = new Uint8ClampedArray(width * height * 4); data.fill(255);
  const black = (x0, y0, x1, y1) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const pixel = (y * width + x) * 4; data[pixel] = 0; data[pixel + 1] = 0; data[pixel + 2] = 0; } };
  for (let y = 80; y < height - 80; y += 45) black(100, y, width - 100, y + 2);
  for (const [x, y] of [[.055, .045], [.945, .045], [.945, .955], [.055, .955]]) black(Math.round(x * width) - 10, Math.round(y * height) - 10, Math.round(x * width) + 10, Math.round(y * height) + 10);
  const corner = (x, y) => ({ x: x * width, y: y * height, darkness: 1, score: 1, radius: 8 });
  return { data, corners: { topLeft: corner(.055, .045), topRight: corner(.945, .045), bottomRight: corner(.945, .955), bottomLeft: corner(.055, .955) } };
}

test('control fotográfico acepta una hoja nítida y detiene baja resolución, giro y recorte', () => {
  const { data, corners } = syntheticPaper();
  const accepted = assessOmrPhoto(data, 700, 900, corners); assert.equal(accepted.accepted, true); assert.ok(accepted.metrics.pageCoverage > .75);
  assert.ok(assessOmrPhoto(data, 700, 900, corners, { width: 320, height: 480 }).issues.includes('resolution'));
  assert.ok(assessOmrPhoto(data, 700, 900, corners, { width: 1000, height: 700 }).issues.includes('orientation'));
  const cropped = { ...corners, topLeft: { ...corners.topLeft, x: 210, y: 270 }, topRight: { ...corners.topRight, x: 490, y: 270 }, bottomRight: { ...corners.bottomRight, x: 490, y: 630 }, bottomLeft: { ...corners.bottomLeft, x: 210, y: 630 } };
  assert.ok(assessOmrPhoto(data, 700, 900, cropped).issues.includes('crop'));
  const angled = { ...corners, topLeft: { ...corners.topLeft, x: 245 }, topRight: { ...corners.topRight, x: 455 } };
  assert.ok(assessOmrPhoto(data, 700, 900, angled).issues.includes('perspective'));
  const flat = new Uint8ClampedArray(700 * 900 * 4); flat.fill(180); for (let pixel = 3; pixel < flat.length; pixel += 4) flat[pixel] = 255;
  const flatIssues = assessOmrPhoto(flat, 700, 900).issues; assert.ok(flatIssues.includes('contrast')); assert.ok(flatIssues.includes('blur'));
  const shadow = new Uint8ClampedArray(data); for (let y = 0; y < 900; y++) for (let x = 0; x < 280; x++) { const pixel = (y * 700 + x) * 4; shadow[pixel] *= .2; shadow[pixel + 1] *= .2; shadow[pixel + 2] *= .2; }
  assert.ok(assessOmrPhoto(shadow, 700, 900, corners).issues.includes('lighting'));
});

test('lote cuenta alumnos únicos, pendientes y duplicados sin inflar cobertura', () => {
  const data = fixture(); data.roster = [{ id: 's1', enrollment: '001', full_name: 'Alumno Uno' }, { id: 's2', enrollment: '002', full_name: 'Alumno Dos' }];
  data.results = [result({ capture_method: 'camera' }), result({ id: 'r2', version: 'B', capture_method: 'camera' })];
  const progress = omrBatchProgress(data); assert.equal(progress.captured, 1); assert.equal(progress.remaining, 1); assert.equal(progress.duplicates, 1); assert.equal(progress.nextStudentId, 's2');
  data.results[1].student_id = 's2'; data.results[1].reviewed = false; data.results[1].review_status = 'needs_review';
  const updated = omrBatchProgress(data); assert.equal(updated.captured, 2); assert.equal(updated.confirmed, 1); assert.equal(updated.pending, 1);
});

test('métricas premium separan muestra medida y resumen de validación', () => {
  const rows = [
    result({ capture_method: 'camera', manual_corrections: 1, scan_quality: { photo: { accepted: true }, identity: { confirmed: true }, qr: 'QR', duration_ms: 8000 } }),
    result({ id: 'r2', student_id: 's2', capture_method: 'upload', manual_corrections: 0, scan_quality: { photo: { accepted: false }, identity: { confirmed: true }, qr: null, duration_ms: 12000 } }),
    result({ id: 'legacy', capture_method: 'legacy', manual_corrections: 4, scan_quality: {} }),
  ];
  const metrics = omrOperationalMetrics(rows, 4); assert.equal(metrics.measuredScans, 2); assert.equal(metrics.photoAcceptance, .5); assert.equal(metrics.verifiedIdentity, 1); assert.equal(metrics.qrRecognition, .5); assert.equal(metrics.correctionRate, .125); assert.equal(metrics.medianDurationMs, 10000);
  const summary = summarizeOmrValidation([{ id: '1', accepted: true, qrRead: true, correct: 4, questions: 4, durationMs: 7000, issues: [], quality: null, message: '' }, { id: '2', accepted: false, qrRead: false, correct: 0, questions: 0, durationMs: 9000, issues: ['blur'], quality: null, message: '' }]);
  assert.equal(summary.photoAcceptance, .5); assert.equal(summary.bubbleAccuracy, 1); assert.equal(summary.qrRecognition, .5); assert.equal(summary.medianDurationMs, 8000);
});
