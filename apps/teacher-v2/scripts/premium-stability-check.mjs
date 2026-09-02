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

must(studentHtml.includes('boot-progress') && projectionHtml.includes('p2-boot'), 'Student y Projection muestran arranque progresivo');
must(studentCss.includes('prefers-reduced-motion') && projectionCss.includes('prefers-reduced-motion'), 'el pulido visual respeta movimiento reducido');
must(projectionCss.includes('brightness(0) invert(1)'), 'el logotipo de Projection conserva contraste sobre fondo oscuro');
must(serviceWorker.includes('student-v2|projection-v2'), 'el service worker conserva caché de artefactos en vivo');

if (failures.length) {
  console.error(`\n${failures.length} regla(s) de Premium Stability fallaron.`);
  process.exit(1);
}

console.log('\nTEDVIO Premium Stability 2.3 check passed.');
