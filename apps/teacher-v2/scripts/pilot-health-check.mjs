import fs from 'node:fs';
import path from 'node:path';

const appRoot = new URL('../', import.meta.url).pathname;
const root = path.resolve(appRoot, '../..');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20260901180000_pilot_health_lab.sql'), 'utf8');
const core = fs.readFileSync(path.join(appRoot, 'src/core/pilot-health.ts'), 'utf8');
const page = fs.readFileSync(path.join(appRoot, 'src/features/reliability/PilotHealthPage.tsx'), 'utf8');
const app = fs.readFileSync(path.join(appRoot, 'src/app/App.tsx'), 'utf8');
const student = fs.readFileSync(path.join(appRoot, 'live/student/app.jsx'), 'utf8');
const fatalMigration = fs.readFileSync(path.join(root, 'supabase/migrations/20260904140921_live_surface_fatal_telemetry.sql'), 'utf8');
const failures = [];
const must = (condition, message) => condition ? console.log('OK  ', message) : (failures.push(message), console.error('FAIL', message));

must(migration.includes('v2_session_health_events') && migration.includes('enable row level security'), 'telemetría tiene RLS');
must(migration.includes('v2_session_health_events_teacher_select') && migration.includes('teacher_id = (select auth.uid())'), 'el docente sólo consulta sus sesiones');
must(migration.includes('HEALTH_ACTOR_NOT_ALLOWED') && migration.includes('p_participant_id') && migration.includes('session_id = p_session_id'), 'telemetría anónima exige un participante válido de la sesión');
must(migration.includes("'surface'") && migration.includes("'question_id'") && !migration.includes("p_details ->> 'answer'"), 'el servidor limita la telemetría a metadatos seguros');
must(migration.includes('primary key (run_id, client_no)') && migration.includes('on conflict (run_id, client_no) do nothing'), 'el laboratorio bloquea duplicados en la base');
must(migration.includes('requested_clients between 1 and 100') && migration.includes('p_virtual_clients not between 1 and 100'), 'la carga está limitada a 100 clientes');
must(migration.includes('delete from public.v2_pilot_load_probes') && migration.includes('v2_pilot_load_runs'), 'los detalles temporales se eliminan y el resumen permanece');
must(migration.includes('revoke all on function public.v2_teacher_start_load_test') && migration.includes('to authenticated'), 'el laboratorio no es ejecutable por anónimos');
must(core.includes('Promise.all(Array.from({ length: virtualClients }') && core.includes('loadProbe(runId, clientNo, recovered)'), 'el navegador genera carga concurrente real');
must(core.includes('Promise.all([loadProbe') && page.includes('Duplicados intencionales'), 'la prueba provoca y comunica duplicados');
must(core.includes("table: 'v2_session_health_events'") && !page.includes('setInterval('), 'el panel se actualiza por Realtime sin polling permanente');
must(app.includes('classroom/:sessionId/health') && page.includes('Simular carga aislada'), 'la salud del piloto tiene ruta docente propia');
must(student.includes('v2_record_session_health') && student.includes('response_recovered') && student.includes('response_confirmed'), 'Student informa confirmación y recuperación');
must(!/p_details:[^\n]*(answer|matricula|name|prompt)/i.test(student), 'Student no envía contenido académico en telemetría');
must(fatalMigration.includes("'client_render_failed'") && fatalMigration.includes("'reference'") && fatalMigration.includes("'stage'"), 'telemetría fatal conserva referencia y etapa sin contenido académico');
must(fatalMigration.includes('HEALTH_ACTOR_NOT_ALLOWED') && fatalMigration.includes('session_id = p_session_id'), 'un reporte fatal anónimo exige participante válido');
must(!/p_details ->> '(answer|matricula|name|prompt)'/i.test(fatalMigration), 'la telemetría fatal no acepta identidad, pregunta ni respuesta');

const model = new Map();
for (let client = 1; client <= 100; client += 1) {
  model.set(client, (model.get(client) || 0) + 1);
  if (client % 10 === 0) model.set(client, (model.get(client) || 0) + 1);
}
must(model.size === 100 && [...model.values()].reduce((sum, attempts) => sum + attempts - 1, 0) === 10, 'el modelo de 100 clientes conserva 100 respuestas y bloquea 10 duplicados');

if (failures.length) {
  console.error(`\n${failures.length} regla(s) de Pilot Health fallaron.`);
  process.exit(1);
}
console.log('\nTEDVIO Pilot Health & Load Lab check passed.');
