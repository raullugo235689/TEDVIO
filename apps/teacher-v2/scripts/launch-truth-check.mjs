import fs from 'node:fs';
import path from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const src = path.join(root, 'src');
const failures = [];

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function must(condition, message) {
  if (condition) console.log('OK  ', message);
  else {
    failures.push(message);
    console.error('FAIL', message);
  }
}

const files = walk(src).filter((file) => /\.(?:ts|tsx)$/.test(file));
const joined = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
const dashboard = fs.readFileSync(path.join(src, 'features/dashboard/DashboardPage.tsx'), 'utf8');
const shell = fs.readFileSync(path.join(src, 'app/AppShell.tsx'), 'utf8');
const login = fs.readFileSync(path.join(src, 'features/auth/LoginPage.tsx'), 'utf8');
const shared = fs.readFileSync(path.join(src, 'shared/components.tsx'), 'utf8');

for (const [pattern, label] of [
  [/RECONSTRUCCI[ÓO]N CONTROLADA/i, 'reconstrucción controlada'],
  [/MIGRACI[ÓO]N CONTROLADA/i, 'migración controlada'],
  [/contin[uú]an en migraci[óo]n/i, 'módulos pendientes de migración'],
  [/Fase\s+\d+\s+activa/i, 'fase interna activa'],
  [/se migrar[áa](?:n)?\b/i, 'promesa de migración futura'],
]) {
  must(!pattern.test(joined), `producción no muestra lenguaje interno: ${label}`);
}

must(!fs.existsSync(path.join(src, 'features/migration')), 'no existe una feature activa de migración');
must(!dashboard.includes('LegacyBridge'), 'Inicio no depende del puente heredado');
must(!shell.includes('PRODUCCIÓN UNIFICADA') && !shell.includes('Frontend principal'), 'el shell no expone etiquetas técnicas de despliegue');
must(shell.includes('ESPACIO DOCENTE') && shell.includes('Espacio docente protegido'), 'el shell utiliza lenguaje útil para el docente');
must(login.includes('Todo tu trabajo docente, en un solo lugar.'), 'el acceso comunica la propuesta de valor');
must(login.includes('Acceso de recuperación') && login.includes('href="/teacher-legacy"'), 'el rollback permanece como recuperación explícita');
must(shared.includes("window.location.assign('/teacher-legacy')"), 'el puente heredado nunca se redirige a sí mismo');

if (failures.length) {
  console.error(`\n${failures.length} regla(s) de verdad del producto fallaron.`);
  process.exit(1);
}

console.log('\nTEDVIO launch truth check passed.');