import test from 'node:test';
import assert from 'node:assert/strict';
import { navigationScope, scopedDestination, classEntry } from '../src/core/navigation-context.ts';

test('el contexto proviene de rutas y parámetros explícitos, no de almacenamiento global', () => {
  for (const path of ['/groups/a','/students/a/student','/attendance/a','/gradebook/a','/reports/a']) assert.equal(navigationScope(path).groupId,'a');
  assert.deepEqual(navigationScope('/prepare','?group=b&period=partial'),{groupId:'b',periodId:'partial'});
  assert.deepEqual(navigationScope('/','?group=b&period=partial'),{groupId:'',periodId:''});
  assert.deepEqual(navigationScope('/groups/%E0%A4%A'),{groupId:'',periodId:''});
});
test('el registro conjunto no hereda un grupo ni un periodo individual', () => {
  assert.deepEqual(navigationScope('/attendance-joint','?group=a&period=p'),{groupId:'',periodId:''});
  assert.deepEqual(navigationScope('/attendance-joint/event','?group=a'),{groupId:'',periodId:''});
  assert.equal(scopedDestination('/attendance-joint','a','p'),'/attendance-joint');
});
test('biblioteca y evaluación conservan el grupo; cambiar al catálogo lo libera', () => {
  assert.equal(scopedDestination('/prepare','a'),'/prepare?group=a');
  assert.equal(scopedDestination('/evaluate','a','p'),'/evaluate?group=a&period=p');
  assert.equal(scopedDestination('/groups','a'),'/groups');
  assert.equal(scopedDestination('/','a'),'/');
});
test('selección de preguntas, creación y escaneo reciben el grupo sin perder su acción', () => {
  assert.equal(scopedDestination('/bank?launch=1','a'),'/bank?launch=1&group=a');
  assert.equal(scopedDestination('/exams/new','a'),'/exams/new?group=a');
  assert.equal(scopedDestination('/omr','a'),'/omr?group=a');
  assert.equal(scopedDestination('/attendance-justifications','a'),'/attendance-justifications?group=a');
});
test('reportes y calificaciones conservan el periodo pero una lista no hereda esa fecha', () => {
  assert.equal(scopedDestination('/reports','a','p'),'/reports/a?period=p');
  assert.equal(scopedDestination('/gradebook','a','p'),'/gradebook/a?period=p');
  assert.equal(scopedDestination('/attendance','a','p'),'/attendance/a');
  assert.equal(scopedDestination('/students','a'),'/groups/a?tab=students');
});
test('los identificadores se codifican y los enlaces ya específicos no cambian de grupo', () => {
  assert.equal(scopedDestination('/attendance','a/b'),'/attendance/a%2Fb');
  assert.equal(scopedDestination('/reports/b?period=q','a','p'),'/reports/b?period=q');
  assert.equal(scopedDestination('/bank?subject=x'),'/bank?subject=x');
});
test('volver a clase solo elige una sesión real activa y nunca inicia operaciones', () => {
  const rows=[{id:'demo',status:'live',is_demo:true},{id:'closed',status:'closed'},{id:'active',status:'live',group_id:'a'}];
  assert.deepEqual(classEntry(rows),{to:'/classroom/active',label:'Volver a la clase'});
  assert.deepEqual(classEntry(rows,'b'),{to:'/classroom?group=b',label:'Iniciar clase'});
  assert.deepEqual(classEntry([], 'a'),{to:'/classroom?group=a',label:'Iniciar clase'});
});
test('más de una clase activa exige elegir, nunca abre una al azar', () => {
  assert.deepEqual(classEntry([{id:'a',status:'live'},{id:'b',status:'live'}]),{to:'/classroom',label:'Ver clases activas'});
});

test('varios grupos y editores con selección interna no aparentan un contexto único', () => {
 assert.deepEqual(navigationScope('/attendance-justifications','?group=a&group=b'),{groupId:'',periodId:''});
 assert.deepEqual(navigationScope('/exams/new','?group=a'),{groupId:'',periodId:''});
});
