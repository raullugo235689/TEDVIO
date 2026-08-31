import fs from 'node:fs';
import path from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const dashboard = fs.readFileSync(path.join(root, 'src/features/dashboard/DashboardPage.tsx'), 'utf8');
const classroom = fs.readFileSync(path.join(root, 'src/features/classroom/ClassroomPage.tsx'), 'utf8');
const failures = [];

function must(condition, message) {
  if (condition) console.log('OK  ', message);
  else { failures.push(message); console.error('FAIL', message); }
}

must(
  dashboard.includes('Iniciar clase') && dashboard.includes("'/classroom'"),
  'Inicio expone una acción primaria para entrar a Modo Clase',
);
must(
  dashboard.includes('/classroom?group=${encodeURIComponent(occurrence.slot.group_id)}'),
  'la agenda abre Modo Clase con el grupo actual o siguiente preseleccionado',
);
must(
  dashboard.includes('/classroom?group=${encodeURIComponent(group.id)}'),
  'cada tarjeta de grupo ofrece acceso directo a Modo Clase',
);
must(
  classroom.includes("searchParams.get('group')") && classroom.includes('setGroupId'),
  'Modo Clase conserva la preselección de grupo recibida desde Inicio',
);

if (failures.length) {
  console.error(`\n${failures.length} regla(s) de entrada a Modo Clase fallaron.`);
  process.exit(1);
}

console.log('\nTEDVIO teacher live-class entry check passed.');
