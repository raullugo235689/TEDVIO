import test from 'node:test';
import assert from 'node:assert/strict';
import { assessExamQuality, parseQuestionImport, questionFingerprint, reorderExamOptions, selectBalancedQuestions } from '../src/core/exam-creator.ts';

function bank(id, prompt, topic = 'Tema 1', difficulty = 'media', answer = 'Correcta') {
  return {
    id, teacher_id: 'teacher', title: prompt, prompt, subject: 'Medicina', topic,
    question_type: 'multiple_choice', options: ['Correcta', 'Distractor 1', 'Distractor 2', 'Distractor 3'],
    correct_answer: answer, difficulty, bloom: 'comprender', tags: [], favorite: false, archived: false,
    created_at: '', updated_at: '',
  };
}

test('importa tablas pegadas desde Excel y resuelve claves por letra', () => {
  const report = parseQuestionImport('pregunta\topcion_a\topcion_b\topcion_c\trespuesta\ttema\nCapital de Francia\tParís\tRoma\tLima\tA\tGeografía');
  assert.equal(report.questions.length, 1);
  assert.equal(report.questions[0].draft.correctAnswers[0], 'París');
  assert.equal(report.questions[0].draft.topic, 'Geografía');
  assert.equal(report.issues.length, 0);
});

test('acepta CSV de Excel separado por punto y coma', () => {
  const report = parseQuestionImport('pregunta;opcion_a;opcion_b;respuesta\n¿Dos más dos?;4;5;A');
  assert.equal(report.questions[0].draft.correctAnswers[0], '4');
});

test('importa bloques de Word y rechaza claves inválidas', () => {
  const valid = parseQuestionImport('1. Unidad funcional del riñón\nA) Nefrona\nB) Alvéolo\nC) Neurona\nRESPUESTA: A\nTEMA: Riñón');
  assert.equal(valid.questions[0].draft.prompt, 'Unidad funcional del riñón');
  const invalid = parseQuestionImport('1. Pregunta\nA) Uno\nB) Dos\nRESPUESTA: D');
  assert.equal(invalid.questions.length, 0);
  assert.match(invalid.issues[0].message, /clave/i);
});

test('detecta duplicados contra el banco y dentro del lote', () => {
  const existing = [bank('q1', 'Capital de Francia', 'Geografía', 'media', 'París')];
  existing[0].options = ['París', 'Roma', 'Lima'];
  const source = 'pregunta,opcion_a,opcion_b,opcion_c,respuesta\nCapital de Francia,París,Roma,Lima,A\nCapital de Francia,París,Roma,Lima,A';
  const report = parseQuestionImport(source, existing);
  assert.equal(report.questions.filter((question) => question.duplicate).length, 2);
  assert.equal(questionFingerprint(report.questions[0].draft), questionFingerprint(existing[0]));
});

test('selección equilibrada alterna tema y dificultad', () => {
  const questions = [bank('a1', 'A1', 'A'), bank('a2', 'A2', 'A'), bank('b1', 'B1', 'B', 'alta'), bank('c1', 'C1', 'C', 'baja')];
  assert.deepEqual(selectBalancedQuestions(questions, 3).map((question) => question.id), ['a1', 'b1', 'c1']);
});

test('variantes redistribuyen opciones sin perder la respuesta correcta', () => {
  const original = ['Uno', 'Dos', 'Tres', 'Cuatro'];
  const versionB = reorderExamOptions(original, 1, 1);
  const versionC = reorderExamOptions(original, 1, 2);
  assert.notDeepEqual(versionB, original);
  assert.notDeepEqual(versionC, original);
  assert.deepEqual([...versionB].sort(), [...original].sort());
  assert.ok(versionB.includes('Dos'));
});

test('calidad bloquea duplicados y premia cobertura clasificada', () => {
  const questions = [bank('a', 'A', 'Uno'), bank('b', 'B', 'Dos')];
  const base = { title: 'Parcial', subject: 'Medicina', groupId: '', periodId: '', examDate: '2026-09-10', instructions: '', passingScore: 6, maxScore: 10, versions: ['A', 'B'], versionStrategy: 'balanced' };
  const good = assessExamQuality({ ...base, questions: questions.map((question) => ({ bankQuestionId: question.id, points: 1 })) }, questions);
  assert.equal(good.blockers.length, 0);
  assert.ok(good.strengths.some((value) => value.includes('2 temas')));
  const duplicate = { ...questions[1], id: 'c', prompt: 'A', options: [...questions[0].options] };
  const bad = assessExamQuality({ ...base, questions: [{ bankQuestionId: 'a', points: 1 }, { bankQuestionId: 'c', points: 1 }] }, [...questions, duplicate]);
  assert.ok(bad.blockers.some((value) => value.includes('duplicados')));
});
