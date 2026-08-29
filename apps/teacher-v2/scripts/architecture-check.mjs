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
const app = fs.readFileSync(path.join(sourceRoot, 'app/App.tsx'), 'utf8');
const shell = fs.readFileSync(path.join(sourceRoot, 'app/AppShell.tsx'), 'utf8');
const groupsApi = fs.readFileSync(path.join(sourceRoot, 'core/groups.ts'), 'utf8');
const attendanceApi = fs.readFileSync(path.join(sourceRoot, 'core/attendance.ts'), 'utf8');
const groupsPage = fs.readFileSync(path.join(sourceRoot, 'features/groups/GroupsPage.tsx'), 'utf8');
const groupDetail = fs.readFileSync(path.join(sourceRoot, 'features/groups/GroupDetailPage.tsx'), 'utf8');
const attendancePage = fs.readFileSync(path.join(sourceRoot, 'features/attendance/AttendancePage.tsx'), 'utf8');

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
must(shell.includes('<Outlet />'), 'AppShell es persistente y contiene un único Outlet');
must(fs.readFileSync(path.join(sourceRoot, 'main.tsx'), 'utf8').includes('<HashRouter>'), 'React Router controla toda la navegación');
must(fs.readFileSync(path.join(sourceRoot, 'core/api.ts'), 'utf8').includes("rpc('v2_teacher_today_dashboard')"), 'Inicio reutiliza el RPC académico existente');
must(!files.some((file) => /(?:^|[-_.])v\d+(?:[-_.]|$)/i.test(path.basename(file))), 'los archivos activos no llevan números históricos de versión');
must(!joined.includes('setInterval('), 'no se introduce polling permanente');
must(!joined.includes('service_role') && !joined.includes('SUPABASE_SECRET'), 'no se expone material privilegiado');

must(app.includes('path="groups/:groupId"') && app.includes('<GroupDetailPage />'), 'Centro de grupo tiene una ruta React propia');
must(app.includes('path="attendance"') && app.includes('path="attendance/:groupId"') && app.includes('<AttendancePage />'), 'Asistencia ya no utiliza la pantalla de migración');
must(!app.includes('module="attendance"'), 'Asistencia fue retirada de los placeholders heredados');
must(groupsPage.includes('saveGroup') && groupsPage.includes('createUniversity') && groupsPage.includes('createProgram'), 'Grupos administra estructura y escritura de forma tipada');
must(groupDetail.includes('saveStudent') && groupDetail.includes('importStudents') && groupDetail.includes('setStudentActive'), 'Centro de grupo administra el padrón sin eliminar historial');
must(attendancePage.includes('createAttendanceSession') && attendancePage.includes('saveAttendanceRecords') && attendancePage.includes('updateAttendanceState'), 'Asistencia cubre apertura, captura, pausa y cierre');

for (const table of ['v2_universities', 'v2_programs', 'v2_groups', 'v2_group_students']) {
  must(groupsApi.includes(`from('${table}')`), `capa de grupos utiliza ${table}`);
}
for (const table of ['v2_groups', 'v2_group_students', 'v2_attendance_sessions', 'v2_attendance_records']) {
  must(attendanceApi.includes(`from('${table}')`), `capa de asistencia utiliza ${table}`);
}
must((groupsApi.match(/\.eq\('teacher_id', user\.id\)/g) || []).length >= 6, 'operaciones de grupos restringen lecturas y cambios al docente autenticado');
must((attendanceApi.match(/\.eq\('teacher_id', user\.id\)/g) || []).length >= 6, 'operaciones de asistencia restringen lecturas y cambios al docente autenticado');
must(!groupsApi.includes('.delete(') && !attendanceApi.includes('.delete('), 'Fase 2 no elimina grupos, alumnos ni listas');
must(groupsApi.includes("onConflict: 'group_id,enrollment'") && attendanceApi.includes("onConflict: 'attendance_session_id,student_id'"), 'importación y asistencia respetan las claves únicas existentes');
must(attendanceApi.includes("'present' | 'late' | 'absent' | 'justified'") || fs.readFileSync(path.join(sourceRoot, 'core/types.ts'), 'utf8').includes("'present' | 'late' | 'absent' | 'justified'"), 'estados de asistencia coinciden con las restricciones de base de datos');

if (failures.length) {
  console.error(`\n${failures.length} regla(s) de arquitectura fallaron.`);
  process.exit(1);
}

console.log(`\nTEDVIO 2.0 architecture check passed (${files.length} source files).`);
