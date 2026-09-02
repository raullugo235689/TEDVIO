import fs from 'node:fs';
import path from 'node:path';

const appRoot = new URL('../', import.meta.url).pathname;
const repositoryRoot = path.resolve(appRoot, '../..');
const migration = [
  '20260902161321_response_receipts_v1.sql',
  '20260902161412_response_receipts_public_rpc_v1.sql',
].map((name) => fs.readFileSync(
  path.join(repositoryRoot, 'supabase/migrations', name),
  'utf8',
)).join('\n');
const student = fs.readFileSync(path.join(appRoot, 'live/student/app.jsx'), 'utf8');
const preflight = fs.readFileSync(path.join(appRoot, 'src/core/session-preflight.ts'), 'utf8');
const failures = [];

const must = (condition, message) => {
  if (condition) console.log('OK  ', message);
  else {
    failures.push(message);
    console.error('FAIL', message);
  }
};

must(migration.includes('add column if not exists request_id uuid'), 'cada respuesta admite una clave idempotente');
must(migration.includes('v2_responses_participant_request_uidx') && migration.includes('where request_id is not null'), 'la base impide repetir una clave por participante');
must(migration.includes('v2_response_receipts_v1') && migration.includes('primary key (participant_id, request_id)'), 'los intentos conservados se vinculan a un recibo privado');
must(migration.includes("outcome in ('recorded', 'already_recorded')"), 'los alias distinguen una respuesta creada de la primera ya existente');
must(migration.includes('pg_advisory_xact_lock') && migration.includes('tedvio-response|'), 'reintentos simultáneos convergen antes de consumir el límite');
must(migration.includes('for share') && migration.includes('for update'), 'sesión, pregunta y participante se bloquean antes de calificar');
must(migration.includes("s.status is distinct from 'live'") && migration.includes('s.current_question_id is distinct from q.id'), 'el motor revalida la frontera académica activa');
must(migration.includes('clock_timestamp()') && migration.includes('request_id, submitted_at') && migration.includes('p_request_id, v_now'), 'la espera de bloqueos no amplía el tiempo de respuesta');
must(migration.includes("q.question_type = 'multiple_select'") && migration.includes('jsonb_agg(item.value order by item.value::text)'), 'selección múltiple se califica sin depender del orden de toque');
must(migration.includes('select null::boolean, null::integer, null::integer, null::text'), 'la compatibilidad heredada no filtra calificación en vivo');
must(migration.includes('public.v2_submit_response_v2') && migration.includes("'receipt_version', 1"), 'la RPC nueva devuelve recibos versionados');
must(migration.includes('IDEMPOTENCY_KEY_REUSED') && migration.includes("errcode = '22023'"), 'reutilizar una clave con otro contenido falla de forma explícita');
must(migration.includes('revoke all on table tedvio_private.v2_response_receipts_v1'), 'los alias con respuestas no son consultables por clientes');

must(student.includes('getOrCreateOutboxEntry') && student.includes('readOutboxUnsafe'), 'Student crea o recupera el pendiente bajo una sola exclusión');
must(student.includes('DELETED_MARKER') && student.includes('transaction.abort()'), 'las limpiezas no resucitan identidad después de un timeout');
must(student.includes('pendingQuestionIds.has(current.id)'), 'una respuesta pendiente bloquea un segundo envío visual');
must(student.includes('data.request_id !== pending.requestId') && student.includes('data.question_id !== pending.questionId'), 'Student valida que el recibo pertenezca al intento exacto');
must(student.includes('onSubmit([...selected].sort())'), 'Student normaliza selección múltiple antes de enviarla');
must(preflight.includes('receipt?.receipt_version !== 1') && preflight.includes('receipt.request_id !== responseRequestId'), 'la microclase exige el recibo exacto de punta a punta');

if (failures.length) {
  console.error(`\n${failures.length} regla(s) de recibos fallaron.`);
  process.exit(1);
}

console.log('\nTEDVIO Response Receipts 1.x check passed.');
