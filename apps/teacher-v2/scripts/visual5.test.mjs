import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import {
  defaultImageLabelingLayout, normalizeImageLabelingLayout, repositionImageLabel,
  appendImageLabel, removeImageLabel, validateImageLabelingDraft,
  shuffledImageLabels, buildImageLabelingAnswer,
} from '../src/core/visual-question.ts';

const migration = readFileSync(new URL('../../../supabase/migrations/20261009162000_classroom_visual_5_0.sql', import.meta.url), 'utf8');
const source = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const layout = defaultImageLabelingLayout();
const labels = ['Hueso frontal', 'Hueso temporal'];

test('las coordenadas visibles no contienen etiquetas ni la clave de respuesta', () => {
  assert.deepEqual(layout.targets.map(t => t.id), ['z1','z2']);
  assert.equal(JSON.stringify(layout).includes('Hueso'), false);
  assert.equal(normalizeImageLabelingLayout(layout)?.targets.length, 2);
  assert.equal(normalizeImageLabelingLayout({ ...layout, correct_answer: ['secret'] })?.targets.length, 2);
  assert.equal(normalizeImageLabelingLayout({ ...layout, targets: [{ id:'z1',x:999,y:10 },layout.targets[1]] }), null);
  assert.equal(normalizeImageLabelingLayout({ ...layout, targets: [{ id:'z1',x:40,y:10 },{id:'z1',x:40,y:10}] }), null);
});

test('editor visual agrega, mueve y quita zonas sin corromper otros elementos', () => {
  const extra = appendImageLabel(layout);
  assert.equal(extra.targets.length, 3);
  const moved = repositionImageLabel(extra, 1, 42.12, 58.83);
  assert.deepEqual([moved.targets[1].x,moved.targets[1].y],[42.12,58.83]);
  const invalid = repositionImageLabel(moved, 1, 0, 0);
  assert.deepEqual(invalid,moved);
  assert.deepEqual(removeImageLabel(moved,1).targets.map(t=>t.id),['z1','z2']);
  assert.equal(removeImageLabel(layout,1),layout);
});

test('constructor exige HTTPS, entre 2-8 zonas, nombres únicos y coincidencia exacta', () => {
  assert.deepEqual(validateImageLabelingDraft(layout, labels, 'https://example.edu/craneo.png', 'image').answer,labels);
  for (const invalid of [
    [layout,labels,'javascript:alert(1)','image'],
    [layout,labels,'http://example.edu/craneo.png','image'],
    [layout,labels,'https://example.edu/craneo.png','video'],
    [layout,['Frontal','Frontal'],'https://example.edu/craneo.png','image'],
    [layout,['Frontal'],'https://example.edu/craneo.png','image'],
    [layout,['','Temporal'],'https://example.edu/craneo.png','image'],
  ]) assert.throws(()=>validateImageLabelingDraft(...invalid));
});

test('las etiquetas públicas se mezclan sin modificar el orden secreto',()=>{
  const key=[...labels];
  const publicOptions=shuffledImageLabels(key,()=>.99);
  assert.deepEqual(publicOptions,['Hueso temporal','Hueso frontal']);
  assert.deepEqual(key,labels);
  assert.notDeepEqual(publicOptions,key);
  assert.equal(buildImageLabelingAnswer({z1:labels[0],z2:labels[1]},layout,publicOptions)?.join('|'), key.join('|'));
  assert.equal(buildImageLabelingAnswer({z1:labels[0]},layout,publicOptions),null);
  assert.equal(buildImageLabelingAnswer({z1:labels[0],z2:labels[0]},layout,publicOptions),null);
});

test('Student y Projection sólo leen coordenadas públicas, sin ejecutar HTML del docente',()=>{
  const student=source('../live/student/app.jsx'), projection=source('../live/projection/app.jsx');
  const authoring=source('../src/core/bank.ts');
  for(const app of [student,projection]){
    const select = app.split('\n').filter(line=>line.includes('.select(')&&line.includes('visual_layout'));
    assert.equal(select.length,1);
    assert.doesNotMatch(select[0],/correct_answer|explanation|\*/);
    assert.doesNotMatch(app,/dangerouslySetInnerHTML/);
  }
  assert.match(authoring,/shuffledImageLabels\(visual\.answer\)/);
  assert.match(authoring,/correct_answer: correctAnswer/);
  assert.match(migration,/visual_layout jsonb/);
  assert.match(migration,/s\.teacher_id = b\.teacher_id/);
  assert.doesNotMatch(migration,/drop table|delete from|truncate table/i);
});

test('migración no destructiva: las zonas se copian únicamente desde el banco del profesor propietario',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema tedvio_private;
      create table public.v2_question_bank(id uuid primary key, teacher_id uuid not null,question_type text not null);
      create table public.v2_sessions(id uuid primary key, teacher_id uuid not null);
      create table public.v2_questions(id uuid primary key,session_id uuid,bank_id uuid,question_type text not null);
    `);
    await db.exec(migration);
    const teacher='11111111-1111-4111-8111-111111111111';
    const other='99999999-9999-4999-8999-999999999999';
    const bank='22222222-2222-4222-8222-222222222222';
    const session='33333333-3333-4333-8333-333333333333';
    const otherSession='44444444-4444-4444-8444-444444444444';
    await db.query('insert into v2_sessions(id,teacher_id) values ($1,$2),($3,$4)',[session,teacher,otherSession,other]);
    await db.query('insert into v2_question_bank(id,teacher_id,question_type,visual_layout) values($1,$2,$3,$4::jsonb)',[bank,teacher,'ordering',JSON.stringify(layout)]);
    await db.query('insert into v2_questions(id,session_id,bank_id,question_type) values($1,$2,$3,$4)', ['55555555-5555-4555-8555-555555555555',session,bank,'ordering']);
    const saved=(await db.query('select visual_layout from v2_questions where session_id=$1',[session])).rows[0];
    assert.deepEqual(saved.visual_layout,layout);
    await db.query('insert into v2_questions(id,session_id,bank_id,question_type) values($1,$2,$3,$4)',
      ['66666666-6666-4666-8666-666666666666',otherSession,bank,'ordering']);
    const foreign=(await db.query('select visual_layout from v2_questions where session_id=$1',[otherSession])).rows[0];
    assert.equal(foreign.visual_layout,null);
    await assert.rejects(db.query('insert into v2_questions(id,session_id,question_type,visual_layout) values($1,$2,$3,$4::jsonb)',
      ['77777777-7777-4777-8777-777777777777',session,'poll',JSON.stringify(layout)]));
  } finally { await db.close(); }
});
