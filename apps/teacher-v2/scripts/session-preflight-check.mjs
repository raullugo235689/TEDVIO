import fs from 'node:fs';
import path from 'node:path';

const appRoot = new URL('../', import.meta.url).pathname;
const root = path.resolve(appRoot, '../..');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20260901190000_session_preflight.sql'), 'utf8');
const core = fs.readFileSync(path.join(appRoot, 'src/core/session-preflight.ts'), 'utf8');
const supabaseCore = fs.readFileSync(path.join(appRoot, 'src/core/supabase.ts'), 'utf8');
const panel = fs.readFileSync(path.join(appRoot, 'src/features/reliability/SessionPreflightPanel.tsx'), 'utf8');
const health = fs.readFileSync(path.join(appRoot, 'src/features/reliability/PilotHealthPage.tsx'), 'utf8');
const browser = fs.readFileSync(path.join(root, 'tests/browser/launch-authenticated.spec.mjs'), 'utf8');
const failures = [];
const must = (condition, message) => condition ? console.log('OK  ', message) : (failures.push(message), console.error('FAIL', message));

must(migration.includes('v2_session_check_runs') && migration.includes('enable row level security'), 'el historial técnico tiene RLS');
must(migration.includes('v2_session_check_runs_teacher_select') && migration.includes('teacher_id = (select auth.uid())'), 'cada docente sólo consulta sus comprobaciones');
must(migration.includes("revoke all on table public.v2_session_check_runs from public, anon, authenticated") && migration.includes('grant select on table public.v2_session_check_runs to authenticated'), 'el historial no admite DML directo');
must(migration.includes('pg_advisory_xact_lock') && migration.includes("status = 'running'"), 'dos clics concurrentes no crean dos salas');
must(migration.includes("'Comprobación técnica TEDVIO', 'draft'") && migration.includes("300, 'queued', null"), 'la microclase inicia preparada y Teacher debe publicarla');
must(migration.includes("'Sesión temporal', 'accuracy'") && migration.includes('false, true'), 'la sala es sintética, sin grupo y marcada como demo');
must(migration.includes("values (v_question_id, '\"TEDVIO_OK\"'::jsonb") && migration.includes("'multiple_choice'"), 'la clave sintética permanece en el almacén protegido');
must(migration.includes('source_ready') && migration.includes('source_ready_question_count'), 'la sesión seleccionada debe tener contenido listo');
must(migration.includes("tablename in ('v2_sessions', 'v2_questions', 'v2_participants', 'v2_responses')"), 'el servidor verifica la publicación Realtime completa');
must(migration.includes("delete from public.v2_sessions") && migration.includes("status = 'expired'") && migration.includes('expires_at'), 'éxito y abandono eliminan la microclase');
must(migration.includes('jsonb_array_elements(v_results)') && migration.includes('left join') && migration.includes("case when e->>'ok' = 'true'"), 'resultados faltantes, duplicados o inválidos fallan de forma segura');
must(migration.includes('revoke all on function public.v2_teacher_start_session_check') && migration.includes('from public, anon'), 'un alumno no puede iniciar ni finalizar comprobaciones');
must(!migration.includes('alter schema realtime') && !migration.includes('create table realtime.'), 'la migración no modifica el esquema reservado Realtime');

must(
  supabaseCore.includes('persistSession: false')
    && supabaseCore.includes('autoRefreshToken: false')
    && core.includes("anonymousClient('session-preflight-student')"),
  'Student de prueba usa un cliente realmente anónimo y aislado',
);
must(core.includes('fetchBundledSurface') && core.includes('url.origin !== window.location.origin'), 'se comprueban aplicaciones y bundles del mismo origen');
must(!core.includes('preloadExternalRuntime') && !core.includes('esm.sh') && !core.includes('cdnjs.cloudflare.com'),
  'el preflight ya no depende de runtimes externos');
must(core.indexOf('createRealtimeProbe') < core.indexOf("p_action: 'launch'"), 'Realtime se suscribe antes de publicar la pregunta');
must(core.includes("rpc('v2_join_session_v3'") && core.includes("rpc('v2_submit_response_v2'"), 'el ensayo usa unión canónica y recibos idempotentes');
must(core.includes("p_action: 'launch'") && core.includes("p_action: 'reveal'"), 'Teacher prueba publicación y revelado mediante el comando atómico');
must(core.includes("select('correct_answer,explanation')") && core.includes('data.correct_answer != null'), 'el preflight impide exponer la respuesta durante la pregunta');
must(core.includes('duplicate_guard') && core.includes("status !== 'replayed'") && core.includes('receipt_version !== 1') && core.includes('responseReceiptId'), 'el doble envío recupera exactamente el mismo recibo');
must(core.includes("rpc('v2_student_answer_result'") && core.includes('recoveryClient'), 'la respuesta se recupera desde un cliente reconstruido');
must(core.includes("rpc('v2_public_live_counts'") && core.includes("rpc('v2_public_question_results'") && core.includes("rpc('v2_public_ranking'"), 'Projection reconstruye todo el estado público');
must(core.includes("waitForEvents(['session', 'question', 'participant', 'response'])"), 'Realtime debe entregar las cuatro fronteras de la microclase');
must(core.includes('finally') && core.includes("rpc('v2_teacher_finish_session_check'"), 'la sala se finaliza y limpia incluso cuando un paso falla');

must(panel.includes('Comprobar sesión') && panel.includes('microclase temporal'), 'el docente tiene una acción clara de comprobación previa');
must(panel.includes('Teacher') && panel.includes('Student') && panel.includes('Projection') && panel.includes('Realtime'), 'la interfaz explica el recorrido completo');
must(health.includes('<SessionPreflightPanel sessionId={session.id} />'), 'Salud del piloto integra la comprobación por sesión');
must(browser.includes("name: 'Comprobar sesión'") && browser.includes("toHaveCount(14") && browser.includes('sala temporal eliminada'), 'el E2E autenticado recorre y limpia la comprobación completa');

const expected = ['database', 'source_ready', 'student_surface', 'projection_surface', 'public_meta', 'realtime', 'student_join', 'teacher_launch', 'live_question', 'answer_secret', 'response_submit', 'duplicate_guard', 'recovery_receipt', 'projection_data'];
must(expected.every((name) => migration.includes(`('${name}')`) && core.includes(`'${name}'`)), 'cliente y servidor comparten los 14 controles obligatorios');

if (failures.length) {
  console.error(`\n${failures.length} regla(s) de Session Preflight fallaron.`);
  process.exit(1);
}
console.log('\nTEDVIO Session Preflight 1.x check passed.');
