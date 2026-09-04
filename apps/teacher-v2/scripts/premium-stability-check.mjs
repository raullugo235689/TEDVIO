import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(appRoot, '../..');
const failures = [];

const read = (relativePath) => fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');
const must = (condition, message) => {
  if (condition) console.log('OK  ', message);
  else {
    failures.push(message);
    console.error('FAIL', message);
  }
};

const app = read('apps/teacher-v2/src/app/App.tsx');
const shell = read('apps/teacher-v2/src/app/AppShell.tsx');
const loaders = read('apps/teacher-v2/src/app/route-loaders.ts');
const student = read('apps/teacher-v2/live/student/app.jsx');
const projection = read('apps/teacher-v2/live/projection/app.jsx');
const liveBoundary = read('apps/teacher-v2/live/shared/LiveSurfaceErrorBoundary.jsx');
const studentHtml = read('apps/teacher-v2/live/student/index.html');
const projectionHtml = read('apps/teacher-v2/live/projection/index.html');
const studentCss = read('apps/teacher-v2/live/student/premium.css');
const projectionCss = read('apps/teacher-v2/live/projection/premium.css');
const serviceWorker = read('sw.js');

must(app.includes("from './route-loaders'"), 'el router docente reutiliza cargadores precargables');
must(loaders.includes('prefetchTeacherRoute') && loaders.includes('warmedRoutes'), 'la precarga docente se deduplica');
must(shell.includes('onPointerEnter') && shell.includes('onFocus') && shell.includes('onTouchStart'), 'la navegación precarga por intención en mouse, teclado y tacto');

must(student.includes('import("@supabase/supabase-js")'), 'Student difiere Supabase hasta necesitar datos');
must(projection.includes('import("@supabase/supabase-js")'), 'Projection difiere Supabase hasta abrir una sesión');
must(projection.includes('import("qrcode")'), 'Projection difiere el generador QR hasta el lobby');
must(student.includes('LiveSurfaceErrorBoundary') && projection.includes('LiveSurfaceErrorBoundary'), 'las superficies en vivo tienen recuperación de render');
must(liveBoundary.includes('RECUPERACIÓN SEGURA') && liveBoundary.includes('tedvio.live.last_fatal_error'), 'la recuperación conserva una referencia diagnóstica local');
must(liveBoundary.includes('retryCount') && liveBoundary.includes('onFatal'), 'la superficie reintenta una vez e informa el fallo sin bloquear');
must(student.includes('client_render_failed') && student.includes('classifyRenderError'), 'Student registra fallos fatales con una categoría segura');
must(student.includes('.replace(/_/g, " ")') && !student.includes('question.question_type.replaceAll'), 'Student evita replaceAll en la transición a pregunta');
must(student.includes('normalizeQuestion') && student.includes('normalizeSession') && student.includes('normalizeStoredStudent'), 'Student normaliza datos remotos y estado local antes de renderizar');
must(student.includes('probeStudentReadiness') && student.includes('probeDurableStorage'), 'Student comprueba API, almacenamiento, navegador y Realtime');
must(student.includes('client_ready') && student.includes('client_degraded') && student.includes('client_update_required'), 'Student informa preparación sin contenido académico');
must(student.includes('manifest.json?ready=') && student.includes('applyStudentUpdate'), 'Student detecta y aplica una versión nueva antes de continuar');
must(studentCss.includes('readiness-strip') && studentCss.includes('Modo de respaldo') === false, 'Student presenta un semáforo adaptable sin duplicar contenido en CSS');

must(studentHtml.includes('boot-progress') && projectionHtml.includes('p2-boot'), 'Student y Projection muestran arranque progresivo');
must(studentCss.includes('prefers-reduced-motion') && projectionCss.includes('prefers-reduced-motion'), 'el pulido visual respeta movimiento reducido');
must(student.includes('student-stage') && studentCss.includes('student-scene-in'), 'Student anima cada cambio de escena sin depender del motor de datos');
must(projection.includes('p2-scene') && projectionCss.includes('projection-scene-in'), 'Projection diferencia lobby, pregunta y resultado con transiciones de escena');
must(studentCss.includes('transform, opacity') && projectionCss.includes('transform, opacity'), 'las escenas premium priorizan propiedades de animación fluidas');
must(projectionCss.includes('brightness(0) invert(1)'), 'el logotipo de Projection conserva contraste sobre fondo oscuro');
must(serviceWorker.includes('student-v2|projection-v2'), 'el service worker conserva caché de artefactos en vivo');

if (failures.length) {
  console.error(`\n${failures.length} regla(s) de Premium Stability fallaron.`);
  process.exit(1);
}

console.log('\nTEDVIO Premium Stability 2.3 check passed.');
