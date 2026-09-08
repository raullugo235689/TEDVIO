import test from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient } from '@tanstack/react-query';
import { gradebookDraftKey, categoryIssue, categorySnapshot, categoriesSaved, scoreSnapshot, scoreIssue, scorePayload, scoresSaved, sameCapture, editGradebookDraft, finishGradebookDraft } from '../src/core/gradebook-draft.ts';
import { hasPendingGradebook } from '../src/core/useGradebookDraftGuard.ts';
const category = (id, name, weight) => ({ id, name, kind: 'manual', weight });
const detail = () => ({ group: { id: 'group' }, categories: [category('c', 'Actividades', 100)], items: [{ id: 'item', category_id: 'c', max_score: 10, period_id: 'p', source_type: 'manual' }], periods: [{ id: 'p', status: 'open' }], students: [{ id: 'a' }, { id: 'b' }], scores: [{ item_id: 'item', student_id: 'a', score: 7, note: 'Original' }] });
test('valida porcentajes, rangos, duplicados y límites de categorías', () => {
  assert.equal(categoryIssue([category('c', 'Examen', 60), category('d', 'Prácticas', 40)]), '');
  for (const rows of [[category('c', '', 100)], [category('c', 'A', NaN)], [category('c', 'A', -1), category('d', 'B', 101)], [category('c', 'A', 50), category('d', ' a ', 50)], Array.from({ length: 13 }, (_, i) => category(String(i), String(i), 100/13))]) assert.ok(categoryIssue(rows));
  assert.match(categoryIssue([category('c', 'A', 90)]), /Falta distribuir 10.0%/);
  assert.match(categoryIssue([category('c', 'A', 70), category('d', 'B', 50)]), /Reduce 20.0%/);
});
test('distingue cero y vacío; acepta coma y rechaza valores inválidos sin corregirlos silenciosamente', () => {
  for (const value of ['', '0', '7,25', '10.00']) assert.equal(scoreIssue(value, 10), '');
  for (const value of ['11', '-1', 'NaN', '1e1', '2.345', '2,3,4']) assert.ok(scoreIssue(value, 10));
  assert.deepEqual(scorePayload([{ studentId: 'a', score: '', note: '' }, { studentId: 'b', score: '0', note: '' }]).map(row => row.score), [null, 0]);
  assert.equal(scorePayload([{ studentId: 'a', score: '7,25', note: ' listo ' }])[0].score, 7.25);
});
test('conserva el punto de partida del borrador y protege ediciones posteriores', () => {
  const base = scoreSnapshot(detail(), 'item');
  const draft = editGradebookDraft(null, base, base.rows.map(row => ({ ...row, score: '8' })));
  const next = editGradebookDraft(draft, { ...base, context: 'changed' }, draft.rows.map(row => ({ ...row, note: 'Nueva' })));
  assert.equal(next.base.context, base.context); assert.equal(next.revision, 2);
  assert.equal(finishGradebookDraft(next, 1), next); assert.equal(finishGradebookDraft(next, 2), null);
});
test('aísla borradores por docente, grupo y actividad, y los elimina al cerrar sesión', () => {
  const client = new QueryClient(); client.setQueryDefaults(['gradebook-draft'], { gcTime: Infinity });
  client.setQueryData(gradebookDraftKey('teacher', 'group', 'scores:item'), { rows: [] });
  assert.equal(hasPendingGradebook(client, 'teacher'), true); assert.equal(hasPendingGradebook(client, 'other'), false);
  for (const key of [gradebookDraftKey('other', 'group', 'scores:item'), gradebookDraftKey('teacher', 'other', 'scores:item'), gradebookDraftKey('teacher', 'group', 'categories'), gradebookDraftKey('teacher', 'group', 'scores:other')]) assert.equal(client.getQueryData(key), undefined);
  client.clear(); assert.equal(hasPendingGradebook(client, 'teacher'), false);
});
test('detecta cambios de notas, escala, padrón y cierre, sin depender del orden ni timestamps', () => {
  const data = detail(), base = scoreSnapshot(data, 'item');
  data.students.reverse(); data.scores[0].updated_at = 'new'; assert.equal(sameCapture(base, scoreSnapshot(data, 'item')), true);
  for (const change of [data => data.scores[0].score = 8, data => data.items[0].max_score = 20, data => data.periods[0].status = 'closed', data => data.students.pop()]) { const fresh = detail(); change(fresh); assert.equal(sameCapture(base, scoreSnapshot(fresh, 'item')), false); }
});
test('la confirmación de guardado reconoce normalización numérica y nuevos IDs de categorías', () => {
  assert.equal(scoresSaved([{ studentId: 'a', score: '7,50', note: ' Bien ' }], [{ studentId: 'a', score: '7.5', note: 'Bien' }]), true);
  assert.equal(scoresSaved([{ studentId: 'a', score: '', note: '' }], [{ studentId: 'a', score: '0', note: '' }]), false);
  assert.equal(categoriesSaved([category(null, 'Nueva', 100)], [category('generated-id', 'Nueva', 100)]), true);
  const data = detail(); const base = categorySnapshot(data); data.categories[0].weight = 90; assert.equal(sameCapture(base, categorySnapshot(data)), false);
});
