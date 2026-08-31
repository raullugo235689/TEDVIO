import fs from 'node:fs';
import path from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const src = path.join(root, 'src');
const read = (file) => fs.readFileSync(path.join(src, file), 'utf8');
const failures = [];

const main = read('main.tsx');
const app = read('app/App.tsx');
const shell = read('app/AppShell.tsx');
const boundary = read('app/AppErrorBoundary.tsx');
const routeBoundary = read('app/RouteErrorBoundary.tsx');
const reliability = read('core/reliability.ts');
const provider = read('features/reliability/ReliabilityProvider.tsx');
const support = read('features/reliability/SupportPage.tsx');
const css = read('styles/reliability.css');

function must(condition, message) {
  if (condition) console.log('OK  ', message);
  else { failures.push(message); console.error('FAIL', message); }
}

must(main.includes('QueryCache') && main.includes('MutationCache') && main.includes('recordQueryFailure'), 'consultas y mutaciones fallidas generan telemetría técnica');
must(main.includes('<ReliabilityProvider>') && main.includes("import './styles/reliability.css'"), 'ReliabilityProvider y sus estilos se instalan una sola vez');
must(app.includes('path="support"') && app.includes('<SupportPage />'), 'Soporte tiene una ruta React propia');
must(!app.trimStart().startsWith('<Suspense') && app.includes('function tool('), 'la carga diferida no desmonta el AppShell');
must(shell.includes('<RouteErrorBoundary') && shell.includes('reliability-pill') && shell.includes('Reportar un problema'), 'el shell conserva navegación, estado y recuperación por herramienta');
must(boundary.includes('recordClientEvent') && boundary.includes('fatal-reference'), 'el error global genera una referencia visible');
must(routeBoundary.includes('route_render_error') && routeBoundary.includes('tedvio:open-support'), 'los errores de ruta pueden reintentarse y reportarse');
must(reliability.includes("from('tedvio_client_events')") && reliability.includes("from('tedvio_support_reports')"), 'Reliability Core utiliza las tablas propias de Supabase');
must(reliability.includes('MAX_QUEUE_ITEMS') && reliability.includes('flushReliabilityQueue') && reliability.includes("window.addEventListener('online'"), 'los reportes se conservan y sincronizan al recuperar conexión');
must(reliability.includes('BLOCKED_CONTEXT_KEY') && reliability.includes('sanitizeContext') && reliability.includes('[redactado]'), 'el diagnóstico elimina campos académicos sensibles');
must(reliability.includes('diagnostics_included') && reliability.includes('includeDiagnostics'), 'el usuario controla si adjunta diagnóstico técnico');
must(provider.includes('SupportDialog') && provider.includes('useReliability') && provider.includes('PENDIENTE DE ENVÍO'), 'el producto muestra confirmación y estado del reporte');
must(support.includes('MIS REPORTES') && support.includes('Sin respuestas, notas ni calificaciones'), 'el centro de soporte explica seguimiento y privacidad');
must(css.includes('.support-dialog-backdrop') && css.includes('.route-error-panel') && css.includes('@media (max-width: 640px)'), 'Reliability Core tiene diseño adaptable a iPhone');
must(!/OPENAI|AI_GATEWAY|gpt-/i.test(`${main}\n${reliability}\n${provider}\n${support}`), 'Reliability Core no introduce IA generativa ni costo por tokens');
must(!reliability.includes('setInterval(') && !provider.includes('setInterval('), 'Reliability Core no utiliza polling permanente');

if (failures.length) {
  console.error(`\n${failures.length} regla(s) de Reliability Core fallaron.`);
  process.exit(1);
}

console.log('\nTEDVIO 2.1 Reliability Core check passed.');
