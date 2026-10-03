import test from 'node:test';
import assert from 'node:assert/strict';
import { academicReportCsv, buildReportHtml, reportColumnBlocks } from '../src/core/report-document.ts';
const spec = (changes = {}) => ({
  type: 'roster', title: 'LISTA DE ALUMNOS', subtitle: 'Padrón activo', generatedAt: '2026-10-03T12:00:00Z',
  teacherName: 'Dr. Raúl Daniel Ascencio Lugo', groupColor: 'violet', academicYear: '2026–2027',
  institution: 'Universidad de prueba', program: 'Medicina', subject: 'Anatomía', group: '1-01', period: 'Parcial 1',
  documentCode: '', approverName: '', approverTitle: '', approvalLabel: 'Vo. Bo.', logoUrl: '',
  columns: ['N.º', 'Matrícula', 'Alumno'], rows: Array.from({ length: 95 }, (_, index) => [index + 1, `M${index + 1}`, `Alumno ${index + 1}`]),
  summary: [{ label: 'Alumnos', value: '95' }], ...changes,
});
test('CSV conserva el docente y todos los registros, incluidos los que no caben en la vista previa', () => {
  const csv = academicReportCsv(spec());
  assert.ok(csv.startsWith('\ufeff'));
  assert.match(csv, /"Docente","Dr. Raúl Daniel Ascencio Lugo"/);
  assert.match(csv, /"95","M95","Alumno 95"/);
  assert.equal(csv.split('\r\n').filter(line => /^"\d+","M\d+"/.test(line)).length, 95);
});
test('impresión incluye todos los alumnos, repetición de encabezados y orientación según el formato', () => {
  const html = buildReportHtml(spec());
  assert.equal((html.match(/<tr>/g) || []).length, 96);
  assert.match(html, /A4 portrait/);
  assert.match(html, /display:table-header-group/);
  assert.match(html, /break-inside:avoid/);
  assert.match(html, /--accent:#7650b2/);
  assert.match(buildReportHtml(spec({ type: 'grades' })), /A4 landscape/);
});
test('matrices amplias conservan cada fecha exactamente una vez y repiten matrícula, alumno y porcentaje', () => {
  const data = spec({ type: 'attendance', columns: ['Matrícula', 'Alumno', ...Array.from({ length: 31 }, (_, i) => `Día ${i + 1}`), 'Asistencia'], rows: [['M1', 'Alumno uno', ...Array(31).fill('P'), '100%']] });
  const blocks = reportColumnBlocks(data);
  assert.equal(blocks.length, 5);
  assert.deepEqual(blocks.flatMap(block => block.slice(2, -1)), Array.from({ length: 31 }, (_, i) => i + 2));
  for (const block of blocks) { assert.deepEqual(block.slice(0, 2), [0, 1]); assert.equal(block.at(-1), 33); assert.ok(block.length <= 10); }
  const html = buildReportHtml(data);
  assert.equal((html.match(/<td>M1<\/td>/g) || []).length, 5);
  assert.equal((html.match(/<th scope="col">Día 31<\/th>/g) || []).length, 1);
});
test('contenido del docente y alumnos no se ejecuta como HTML ni como fórmula en Excel', () => {
  const data = spec({ teacherName: '<script>alert(1)</script>', logoUrl: 'javascript:alert(1)', rows: [['=1+1', 'M"1', '<img src=x onerror=alert(1)>']] });
  const html = buildReportHtml(data);
  assert.doesNotMatch(html, /<script>|javascript:|<img src=x/);
  assert.match(html, /&lt;script&gt;/);
  const csv = academicReportCsv(data);
  assert.match(csv, /"'=1\+1","M""1"/);
});
test('reportes vacíos y categorías amplias siguen siendo documentos válidos', () => {
  assert.match(buildReportHtml(spec({ rows: [] })), /No hay registros/);
  const columns = Array.from({ length: 27 }, (_, index) => `Columna ${index}`);
  const blocks = reportColumnBlocks(spec({ type: 'grades', columns }));
  assert.deepEqual(blocks.flatMap(block => block.slice(2)), Array.from({ length: 25 }, (_, index) => index + 2));
});
