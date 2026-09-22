import test from 'node:test';
import assert from 'node:assert/strict';
import { assessExamQuality, bankBackup, parseQuestionImport, questionFingerprint, reorderExamOptions, selectBalancedQuestions } from '../src/core/exam-creator.ts';

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

test('preserva las letras con columnas desordenadas y bloquea huecos o repetidos', () => {
  const report = parseQuestionImport('pregunta,opcion_b,opcion_a,respuesta\nCapital,Roma,París,A');
  assert.equal(report.questions[0].draft.correctAnswers[0], 'París');
  for (const row of ['Pregunta,Uno,,Tres,C', 'Pregunta,Uno,Uno,Tres,C']) {
    const invalid = parseQuestionImport(`pregunta,a,b,c,respuesta\n${row}`);
    assert.equal(invalid.questions.length, 0);
    assert.match(invalid.issues[0].message, /vacías|repetidas/);
  }
  assert.equal(parseQuestionImport('Pregunta\nA) Uno\nC) Tres\nCLAVE: C').questions.length, 0);
});

test('respaldo JSON conserva contenido y clasificación sin identificadores privados', () => {
  const question = { ...bank('q1', 'Pregunta con "comillas"\ny líneas'), folder: 'Unidad 2', tags: ['repaso'], explanation: 'Explicación', archived: true, favorite: true, media_url: 'https://example.test/img.png', media_type: 'image' };
  const source = bankBackup([question]);
  const stored = JSON.parse(source).questions[0];
  assert.equal(stored.teacher_id, undefined);
  assert.equal(stored.id, undefined);
  const parsed = parseQuestionImport(source);
  assert.deepEqual(parsed.issues, []);
  assert.equal(parsed.questions[0].draft.id, undefined);
  for (const field of ['prompt','folder','tags','archived','favorite','explanation']) assert.deepEqual(parsed.questions[0].draft[field], question[field]);
  assert.equal(parsed.questions[0].draft.mediaUrl, question.media_url);
  assert.equal(parseQuestionImport(source, [question]).questions[0].duplicate, true);
});

test('CSV conserva saltos de línea y comillas dentro de celdas', () => {
  const parsed = parseQuestionImport('pregunta,a,b,respuesta\n"Caso clínico:\nDijo ""hola""",Sí,No,A');
  assert.equal(parsed.questions[0].draft.prompt, 'Caso clínico:\nDijo "hola"');
  assert.equal(parsed.questions[0].draft.correctAnswers[0], 'Sí');
  assert.equal(parseQuestionImport('pregunta,a,b,respuesta\n"Texto sin cerrar,Sí,No,A').questions.length, 0);
});

test('JSON inválido, claves ajenas y tipos desconocidos no se guardan silenciosamente', () => {
  const base = bank('a', 'Pregunta');
  for (const change of [{ correct_answer: 'Inexistente' }, { question_type: 'otro' }, { archived: 'false' }, { options: { a: 'Texto' } }, { correct_answer: { x: 1 } }]) {
    const report = parseQuestionImport(JSON.stringify([{ ...base, ...change }]));
    assert.equal(report.questions.length, 0);
    assert.equal(report.issues[0].severity, 'error');
  }
  assert.equal(parseQuestionImport('{mal').questions.length, 0);
  assert.equal(parseQuestionImport(JSON.stringify({ format: 'tedvio-question-bank', version: 2, questions: [base] })).questions.length, 0);
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
