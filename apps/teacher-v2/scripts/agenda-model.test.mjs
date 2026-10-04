import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, agendaOccurrences, agendaConflicts, localDate, weekStart, validateAgendaDraft } from '../src/core/agenda-model.ts';
process.env.TZ = 'America/Mazatlan';
const slot = { id:'a',group_id:'g',weekday:1,start_time:'08:00:00',end_time:'09:00:00',starts_on:'2026-10-05',ends_on:'2026-10-26',recurrence:'weekly',revision:1 };
const draft = { group_id:'g',class_date:'2026-10-05',end_date:'2026-10-26',start_time:'08:00',end_time:'09:00',room:'',modality:'Presencial',recurrence:'weekly',scope:'one',action:'save',note:'' };
test('fechas locales, cambio de mes y semana de domingo conservan el día',()=>{
  assert.equal(localDate(new Date('2026-10-05T08:00:00')), '2026-10-05');
  assert.equal(weekStart('2026-11-01'),'2026-10-26'); assert.equal(addDays('2026-12-31',1),'2027-01-01');
});
test('recurrencia acotada, horario heredado y clase única se distinguen',()=>{
  assert.equal(agendaOccurrences([slot],[],[],'2026-09-28','2026-11-02').length,4);
  assert.equal(agendaOccurrences([{...slot,starts_on:null,ends_on:null}],[],[],'2026-09-28','2026-11-02').length,6);
  assert.equal(agendaOccurrences([{...slot,recurrence:'once',ends_on:slot.starts_on}],[],[],'2026-10-01','2026-11-02').length,1);
});
test('mover a otra semana elimina el original y aparece una sola vez en el destino',()=>{
  const changes=[{slot_id:'a',original_date:'2026-10-05',status:'moved',class_date:'2026-10-13',start_time:'12:00:00',end_time:'13:00:00',room:'Nueva aula'}];
  assert.equal(agendaOccurrences([slot],changes,[],'2026-10-05','2026-10-11').length,0);
  const next=agendaOccurrences([slot],changes,[],'2026-10-12','2026-10-18');
  assert.equal(next.length,2); assert.equal(next[1].originalDate,'2026-10-05'); assert.equal(next[1].slot.room,'Nueva aula');
});
test('suspender no aparece en la próxima clase, pero se puede consultar y restaurar',()=>{
  const changes=[{slot_id:'a',original_date:'2026-10-05',status:'cancelled'}];
  assert.equal(agendaOccurrences([slot],changes,[],'2026-10-05','2026-10-05').length,0);
  assert.equal(agendaOccurrences([slot],changes,[],'2026-10-05','2026-10-05',true)[0].status,'cancelled');
});
test('empalmes reales, horarios contiguos, suspensiones y edición de sí mismo',()=>{
  const entry=agendaOccurrences([slot],[],[],'2026-10-05','2026-10-05')[0];
  assert.equal(agendaConflicts(draft,null,[slot],[],[]).length,4);
  assert.equal(agendaConflicts({...draft,start_time:'09:00',end_time:'10:00'},null,[slot],[],[]).length,0);
  assert.equal(agendaConflicts(draft,entry,[slot],[],[]).length,0);
  assert.equal(agendaConflicts({...draft,recurrence:'once'},null,[slot],[{slot_id:'a',original_date:'2026-10-05',status:'cancelled'}],[]).length,0);
});
test('validaciones rechazan horario invertido, fecha final ausente y serie retroactiva',()=>{
  assert.match(validateAgendaDraft({...draft,end_time:'07:00'}),/posterior/);
  assert.match(validateAgendaDraft({...draft,end_date:''}),/fecha final/);
  const entry=agendaOccurrences([slot],[],[],'2026-10-12','2026-10-12')[0];
  assert.match(validateAgendaDraft({...draft,scope:'future'},entry),/seleccionada/);
});
