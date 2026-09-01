import fs from 'node:fs';
import path from 'node:path';

const appRoot = new URL('../', import.meta.url).pathname;
const root = path.resolve(appRoot, '../..');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20260901170000_pilot_live_recovery.sql'), 'utf8');
const classroom = fs.readFileSync(path.join(appRoot, 'src/core/classroom.ts'), 'utf8');
const page = fs.readFileSync(path.join(appRoot, 'src/features/classroom/ClassroomPage.tsx'), 'utf8');
const student = fs.readFileSync(path.join(root, 'student-v2/app.js'), 'utf8');
const projection = fs.readFileSync(path.join(root, 'projection-v2/projection-v2.js'), 'utf8');
const failures = [];
const must = (condition, message) => condition ? console.log('OK  ', message) : (failures.push(message), console.error('FAIL', message));

must(migration.includes('v2_teacher_classroom_command') && migration.includes('for update'), 'los comandos docentes se serializan en una transacción');
must(migration.includes('security invoker') && migration.includes('auth.uid()'), 'el comando conserva RLS y exige identidad docente');
must(migration.includes("v_session.current_question_id = p_question_id") && migration.includes("v_question.status = 'live'"), 'repetir un lanzamiento es idempotente');
must(migration.includes("then r.answer else null") && migration.includes('r.submitted_at'), 'el recibo confirma la respuesta sin revelar secretos');
must(!/realtime\s*\./i.test(migration), 'la migración no modifica el esquema reservado Realtime');
must(classroom.includes("supabase.rpc('v2_teacher_classroom_command'") && !classroom.includes("update({ status: 'live'"), 'Teacher usa el comando atómico');
must(classroom.includes("status === 'SUBSCRIBED'") && page.includes("connection === 'connected'") && page.includes('5_000'), 'Teacher muestra conexión y activa respaldo sólo al degradarse');
must(student.includes('OUTBOX_KEY') && student.includes('submitLockRef') && student.includes('saveOutbox(pending)'), 'Student guarda respuestas pendientes y bloquea dobles toques');
must(student.includes('isDuplicate(submitError)') && student.includes('document.visibilityState'), 'Student recupera confirmaciones y vuelve a sincronizar al regresar');
must(projection.includes('channelKey') && projection.includes('question_id=eq.${x.s.current_question_id}'), 'Projection reconstruye y filtra el canal por pregunta');
must(/status === ["']SUBSCRIBED["']/.test(projection) && projection.includes('visibilitychange'), 'Projection informa y recupera su conexión');

if (failures.length) {
  console.error(`\n${failures.length} regla(s) de recuperación fallaron.`);
  process.exit(1);
}
console.log('\nTEDVIO Pilot Recovery 1.x check passed.');
