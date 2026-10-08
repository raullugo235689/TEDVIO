import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAnalyticsCsvRows } from '../src/core/analytics-export.ts';

const data = {
  meta: { from:'2026-10-01',to:'2026-10-08',accuracy_threshold:60,participation_threshold:60 },
  overview: { sessions:1,active_groups:1,responses:2,participations:1 },
  groups: [{id:'g1',subject:'Anatomía',name:'Grupo A',sessions:1,responses:2}],
  sessions: [{id:'s1',group_id:'g1',created_at:'2026-10-02T12:00:00Z',
    title:'Clase',code:'SECRET-CLASS-CODE',questions:1,active_participants:1,
    expected_participants:2,responses:2,accuracy:50,participation:50}],
  questions: [{id:'q1',topic:'Sistema óseo',session_title:'Clase',position:1,
    prompt:'Reactivo 1',question_type:'multiple_choice',responses:2,scored_responses:2,
    correct_responses:1,accuracy:50}],
  topics: [{topic:'Sistema óseo',questions:1,responses:2,scored_responses:2,correct_responses:1,accuracy:50}],
  students: [{student_id:'PRIVATE-ID',group_id:'g1',full_name:'Alumno Privado',
    enrollment:'MATRICULA-PRIVADA',sessions_total:1,sessions_answered:1,
    responses:2,scored_responses:2,correct_responses:1,accuracy:50,
    participation:100,alert_sessions:0}],
  coverage:{unmatched_participants:0,sessions_without_responses:0,
    questions_without_topic:0,non_scorable_responses:0},
};
const flatten = rows => rows.flat().map(String).join(' | ');

test('la exportación por defecto no incluye nombres, matrículas, IDs ni códigos de acceso',()=>{
  const csv=flatten(buildAnalyticsCsvRows(data,'Anatomía'));
  for(const secret of ['Alumno Privado','MATRICULA-PRIVADA','PRIVATE-ID','SECRET-CLASS-CODE']) {
    assert.equal(csv.includes(secret),false,secret);
  }
  assert.ok(csv.includes('Sistema óseo'));
  assert.ok(csv.includes('CALIDAD DE LA EVIDENCIA'));
});
test('el docente debe elegir expresamente incluir datos personales',()=>{
  const rows=buildAnalyticsCsvRows(data,'Anatomía','identified');
  const csv=flatten(rows);
  assert.ok(csv.includes('Alumno Privado'));
  assert.ok(csv.includes('MATRICULA-PRIVADA'));
  assert.ok(!csv.includes('SECRET-CLASS-CODE'));
});
test('porcentajes sin evidencia permanecen como valores no calificables',()=>{
  const rows=buildAnalyticsCsvRows({
    ...data,
    questions:[{...data.questions[0],accuracy:null,scored_responses:0,correct_responses:0}],
    topics:[{...data.topics[0],accuracy:null,scored_responses:0,correct_responses:0}],
  },'Anatomía');
  assert.ok(flatten(rows).includes('No calificable'));
  assert.ok(flatten(rows).includes('—'));
});
