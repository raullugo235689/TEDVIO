import fs from 'node:fs';
import path from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const sourceRoot = path.join(root, 'src');
const failures = [];

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const files = walk(sourceRoot).filter((file) => /\.(?:ts|tsx|css)$/.test(file));
const source = files.map((file) => ({ file, text: fs.readFileSync(file, 'utf8') }));
const joined = source.map((entry) => entry.text).join('\n');

function must(condition, message) {
  if (condition) console.log('OK  ', message);
  else {
    failures.push(message);
    console.error('FAIL', message);
  }
}

for (const [pattern, label] of [
  [/\.innerHTML\b/, 'innerHTML'],
  [/\.insertAdjacentHTML\b/, 'insertAdjacentHTML'],
  [/\.replaceChildren\b/, 'replaceChildren'],
  [/new\s+MutationObserver\b/, 'MutationObserver'],
  [/dangerouslySetInnerHTML\b/, 'dangerouslySetInnerHTML'],
]) {
  must(!pattern.test(joined), `frontend unificado no utiliza ${label}`);
}

must(!/<[^>]+\sonclick=/.test(joined), 'no existen handlers onclick incrustados en HTML');
must(!/window\.beta|__TEDVIO_TEACHER686__|teacher-command-center-v\d/i.test(joined), 'el nuevo frontend no depende del runtime global heredado');
must(!/OPENAI|AI_GATEWAY|gpt-/i.test(joined), 'la reconstrucción no introduce IA generativa ni costos de inferencia');
must((joined.match(/createClient\(/g) || []).length === 1, 'existe exactamente un cliente Supabase');
must(fs.readFileSync(path.join(sourceRoot, 'app/AppShell.tsx'), 'utf8').includes('<Outlet />'), 'AppShell es persistente y contiene un único Outlet');
must(fs.readFileSync(path.join(sourceRoot, 'main.tsx'), 'utf8').includes('<HashRouter>'), 'React Router controla toda la navegación');
must(fs.readFileSync(path.join(sourceRoot, 'core/api.ts'), 'utf8').includes("rpc('v2_teacher_today_dashboard')"), 'Inicio reutiliza el RPC académico existente');
must(!files.some((file) => /(?:^|[-_.])v\d+(?:[-_.]|$)/i.test(path.basename(file))), 'los archivos activos no llevan números históricos de versión');
must(!joined.includes('setInterval('), 'no se introduce polling permanente');
must(!joined.includes('service_role') && !joined.includes('SUPABASE_SECRET'), 'no se expone material privilegiado');

if (failures.length) {
  console.error(`\n${failures.length} regla(s) de arquitectura fallaron.`);
  process.exit(1);
}

console.log(`\nTEDVIO 2.0 architecture check passed (${files.length} source files).`);
