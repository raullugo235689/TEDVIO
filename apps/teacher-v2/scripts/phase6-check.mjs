import fs from 'node:fs';
import path from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const src = path.join(root, 'src');
const repositoryRoot = path.resolve(root, '../..');
const app = fs.readFileSync(path.join(src, 'app/App.tsx'), 'utf8');
const appShell = fs.readFileSync(path.join(src, 'app/AppShell.tsx'), 'utf8');
const boundary = fs.readFileSync(path.join(src, 'app/AppErrorBoundary.tsx'), 'utf8');
const auth = fs.readFileSync(path.join(src, 'features/auth/AuthProvider.tsx'), 'utf8');
const login = fs.readFileSync(path.join(src, 'features/auth/LoginPage.tsx'), 'utf8');
const main = fs.readFileSync(path.join(src, 'main.tsx'), 'utf8');
const swRegister = fs.readFileSync(path.join(src, 'core/service-worker.ts'), 'utf8');
const sourceIndex = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(src, 'styles/phase-six.css'), 'utf8');
const vercel = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'vercel.json'), 'utf8'));
const legacy = fs.readFileSync(path.join(repositoryRoot, 'teacher.html'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'manifest.webmanifest'), 'utf8'));
const serviceWorker = fs.readFileSync(path.join(repositoryRoot, 'sw.js'), 'utf8');
const version = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'version.json'), 'utf8'));
const workflow = fs.readFileSync(path.join(repositoryRoot, '.github/workflows/phase6-production-cutover.yml'), 'utf8');
const browserSpec = fs.readFileSync(path.join(repositoryRoot, 'tests/browser/phase6-cutover.spec.mjs'), 'utf8');
const failures = [];

function must(condition, message) {
  if (condition) console.log('OK  ', message);
  else { failures.push(message); console.error('FAIL', message); }
}

const teacherRewrite = vercel.rewrites?.find((row) => row.source === '/teacher');
const legacyRewrite = vercel.rewrites?.find((row) => row.source === '/teacher-legacy');
const headerFor = (source) => vercel.headers?.find((row) => row.source === source);

must(teacherRewrite?.destination === '/teacher-v2/index.html', '/teacher apunta al frontend unificado');
must(legacyRewrite?.destination === '/teacher.html', '/teacher-legacy conserva el rollback');
must(headerFor('/teacher')?.headers?.some((h) => h.key === 'Cache-Control' && h.value.includes('no-store')), 'shell canónico no se almacena en caché');
must(headerFor('/teacher-v2/index.html')?.headers?.some((h) => h.value.includes('no-store')), 'índice compilado no se sirve obsoleto');
must(headerFor('/teacher-v2/assets/(.*)')?.headers?.some((h) => h.value.includes('immutable')), 'assets hashados utilizan caché inmutable');

must(legacy.includes('teacher-core-v68-6.js') && legacy.includes('teacher-router-v76-2.js'), 'la versión anterior permanece disponible como rollback');
must(!sourceIndex.includes('teacher-core-v68-6.js') && !sourceIndex.includes('teacher-router-v76-2.js'), 'el frontend principal no carga capas heredadas');
must(sourceIndex.includes('rel="manifest"') && sourceIndex.includes('rel="canonical" href="/teacher"'), 'shell nuevo declara PWA y ruta canónica');
must(manifest.id === '/teacher' && manifest.start_url === '/teacher', 'PWA inicia en la ruta canónica');
must(auth.includes('emailRedirectTo: `${window.location.origin}/teacher`'), 'confirmación de correo vuelve a /teacher');
must(login.includes('href="/teacher"') && login.includes('href="/teacher-legacy"'), 'acceso utiliza ruta canónica y rollback explícito');
must(!login.includes('Vista de reconstrucción') && !appShell.includes('RECONSTRUCCIÓN SEGURA'), 'la interfaz ya no se presenta como reconstrucción');
must(appShell.includes('PRODUCCIÓN UNIFICADA') && appShell.includes('Frontend principal'), 'el shell identifica el corte de producción');

must(main.includes('<AppErrorBoundary>') && boundary.includes('Abrir versión anterior'), 'un error de interfaz ofrece recuperación y rollback');
must(swRegister.includes("register('/sw.js'") && main.includes('registerTedvioServiceWorker()'), 'TEDVIO registra el service worker desde el frontend nuevo');
must(serviceWorker.includes("CACHE='tedvio-2-production-20260831'") && serviceWorker.includes("TEACHER_SHELL='/teacher'"), 'service worker invalida cachés antiguas y conoce el shell canónico');
must(serviceWorker.includes("url.pathname==='/teacher-v2/'") && serviceWorker.includes("cache.put(TEACHER_SHELL"), 'PWA conserva alias y fallback de navegación');
must(css.includes('.fatal-screen') && css.includes('@media(max-width:640px)'), 'recuperación visual funciona en escritorio y móvil');

must(!app.includes('MigrationPage'), 'el router no contiene pantallas de migración');
must(!/OPENAI|AI_GATEWAY|gpt-/i.test(`${main}\n${boundary}\n${swRegister}\n${login}\n${appShell}`), 'Fase 6 no introduce IA generativa ni costo por tokens');
must(version.version === '2026.08.28.76' && version.product_version === '2.0.0' && version.revision === 'phase6-production-cutover' && version.canonical_path === '/teacher', 'version.json conserva el build académico y registra el producto 2.0');
must(workflow.includes('phase6-cutover.spec.mjs') && workflow.includes('playwright install --with-deps chromium webkit'), 'CI prueba el corte en Chromium y WebKit');
must(browserSpec.includes("page.goto('/teacher'") && browserSpec.includes("page.goto('/teacher-legacy'"), 'navegador valida ruta principal y rollback');

if (failures.length) {
  console.error(`\n${failures.length} regla(s) de Fase 6 fallaron.`);
  process.exit(1);
}
console.log('\nTEDVIO 2.0 Phase 6 production cutover check passed.');
