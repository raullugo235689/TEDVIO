import fs from 'node:fs';
import path from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const repositoryRoot = path.resolve(root, '../..');
const app = fs.readFileSync(path.join(root, 'src/app/App.tsx'), 'utf8');
const navigation = fs.readFileSync(path.join(root, 'src/app/navigation.tsx'), 'utf8');
const main = fs.readFileSync(path.join(root, 'src/main.tsx'), 'utf8');
const api = fs.readFileSync(path.join(root, 'src/core/analytics.ts'), 'utf8');
const page = fs.readFileSync(path.join(root, 'src/features/analytics/AnalyticsPage.tsx'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/styles/analytics.css'), 'utf8');
const packageJson = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
const migration = [
  '20260901151500_tedvio_analytics_2x.sql',
  '20260901162500_tedvio_analytics_2x_integrity.sql',
].map((name) => fs.readFileSync(path.join(repositoryRoot, 'supabase/migrations', name), 'utf8')).join('\n');
const failures = [];

function must(condition, message) {
  if (condition) console.log('OK  ', message);
  else { failures.push(message); console.error('FAIL', message); }
}

must(app.includes('path="analytics"') && app.includes('path="analytics/:groupId"') && app.includes('<AnalyticsPage />'), 'Analytics 2.x tiene rutas React propias');
must(navigation.includes("to: '/analytics'") && navigation.includes("label: 'Analítica'"), 'Analítica está disponible en la navegación docente');
must(main.includes("import './styles/analytics.css'"), 'Analytics carga un único módulo visual');
must(api.includes("rpc('v2_teacher_classroom_analytics'") && api.includes('analyticsDataKey'), 'frontend consume el RPC agregado y filtra la caché');
for (const filter of ['groupId', 'periodId', 'from', 'to', 'timezone', 'accuracyThreshold', 'participationThreshold']) {
  must(api.includes(`filters.${filter}`), `la clave y consulta incluyen ${filter}`);
}
must(api.includes('downloadAnalyticsCsv') && api.includes('printAnalyticsReport'), 'Analítica exporta CSV e impresión PDF bajo demanda');
must(page.includes('<svg') && page.includes('role="img"') && !/recharts|chart\.js|d3/i.test(packageJson), 'gráficas nativas conservan accesibilidad sin dependencias nuevas');
must(page.includes('/classroom/${question.session_id}') && page.includes('/students/${student.group_id}/${student.student_id}'), 'Analítica enlaza sesión y Alumno 360°');
must(page.includes('DOMINIO POR TEMA') && page.includes('COBERTURA DE DATOS') && page.includes('SEGUIMIENTO EXPLICABLE'), 'interfaz explica temas, cobertura y alertas');
must(css.includes('@media(max-width:640px)') && css.includes('prefers-reduced-motion'), 'Analytics se adapta a iPhone y movimiento reducido');
must(migration.includes('function public.v2_teacher_classroom_analytics') && migration.includes('security invoker'), 'RPC conserva la identidad del docente');
must(migration.includes('auth.uid()') && migration.includes('g.teacher_id = me.uid') && migration.includes('s.teacher_id'), 'agregación se ancla al docente autenticado');
must(migration.includes('presented_questions') && migration.includes('q.launched_at is not null'), 'analítica excluye preguntas nunca presentadas');
must(migration.includes('response_rate') && migration.includes('roster_reach'), 'backend separa respuesta de conectados y alcance del padrón');
must(migration.includes('participant_identity') && migration.includes('deduplicated_responses') && migration.includes('response_rank = 1'), 'backend deduplica reingresos por identidad y reactivo');
must(migration.includes('sm.questions > 0') && migration.includes('st.created_at <= coalesce(sm.started_at, sm.created_at)'), 'alertas respetan evidencia y fecha de incorporación al padrón');
must(migration.includes('p_timezone') && migration.includes('at time zone tz.name'), 'cortes diarios respetan la zona horaria docente');
must(migration.includes("'topics'") && migration.includes("'coverage'"), 'RPC devuelve dominio por tema y cobertura');
must(migration.includes('revoke all') && migration.includes('from public, anon') && migration.includes('grant execute'), 'RPC no es ejecutable por anónimos');
must(!/OPENAI|AI_GATEWAY|gpt-/i.test(`${api}\n${page}\n${migration}`), 'Analytics no introduce IA generativa ni costos por tokens');
must(/^[\s\S]*\[=\+\\-@\]/.test(api) && !api.includes('<script>window.addEventListener'), 'exportaciones neutralizan fórmulas y respetan CSP');

if (failures.length) {
  console.error(`\n${failures.length} regla(s) de Analytics 2.x fallaron.`);
  process.exit(1);
}
console.log('\nTEDVIO Analytics 2.x check passed.');
