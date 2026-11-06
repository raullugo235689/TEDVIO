import {test} from 'node:test';
import assert from 'node:assert/strict';
import {labEditorPayload,labCsv,newLabEditor} from '../src/core/interactive-lab-model.ts';
test('plantilla nativa separa manifiesto público de la clave y rechaza opciones ambiguas',()=>{
 const d=newLabEditor();d.title='Actividad sintética';Object.assign(d.questions[0],{prompt:'Selecciona A',options:['A','B','C','D'],correct:'0'});
 const payload=labEditorPayload(d);assert.equal(payload.manifest.questions.length,1);assert(!JSON.stringify(payload.manifest).includes('answer_key'));assert.equal(payload.answer_key[d.questions[0].id].answer,'o0');
 d.questions[0].options[1]='A';assert.throws(()=>labEditorPayload(d),/diferentes/);
});
test('cálculo admite coma decimal, conserva cero y valida tolerancia',()=>{
 const d=newLabEditor();d.title='Cálculo';Object.assign(d.questions[0],{type:'numeric',prompt:'Escribe 0',correct:'0',tolerance:'0,1'});
 assert.equal(labEditorPayload(d).answer_key[d.questions[0].id].answer,0);assert.equal(labEditorPayload(d).answer_key[d.questions[0].id].tolerance,0.1);
 d.questions[0].correct='';assert.throws(()=>labEditorPayload(d),/clave numérica/);
});
test('CSV conserva cero, no inventa notas de alumnos pendientes y neutraliza fórmulas',()=>{
 const row={recipient_id:'r',student_id:'s',group_id:'g',full_name:'=SUM(A1)',enrollment:'001',attempts:1,finished_attempts:1,selected_result:{score_percent:0,status:'verified',attempt_number:1,attempt_id:'a',submitted_at:'2026-11-06T00:00:00Z',elapsed_seconds:2,official_grade:false}};
 const csv=labCsv([row,{...row,full_name:'Persona "B"',selected_result:null}],'=cmd');
 assert(csv.startsWith('\uFEFF'));assert(csv.includes('"\'=SUM(A1)"'));assert(csv.includes('"Persona ""B"""'));assert(csv.includes('"0"'));assert(csv.includes('"No"'));assert(csv.includes('sin entrega'));
});
