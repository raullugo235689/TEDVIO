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
const navigation = fs.readFileSync(path.join(sourceRoot, 'app/navigation.tsx'), 'utf8');
const main = fs.readFileSync(path.join(sourceRoot, 'main.tsx'), 'utf8');
const groupsApi = fs.readFileSync(path.join(sourceRoot, 'core/groups.ts'), 'utf8');
const attendanceApi = fs.readFileSync(path.join(sourceRoot, 'core/attendance.ts'), 'utf8');
const bankApi = fs.readFileSync(path.join(sourceRoot, 'core/bank.ts'), 'utf8');
const classroomApi = fs.readFileSync(path.join(sourceRoot, 'core/classroom.ts'), 'utf8');
const examsApi = fs.readFileSync(path.join(sourceRoot, 'core/exams.ts'), 'utf8');
const groupsPage = fs.readFileSync(path.join(sourceRoot, 'features/groups/GroupsPage.tsx'), 'utf8');
const groupDetail = fs.readFileSync(path.join(sourceRoot, 'features/groups/GroupDetailPage.tsx'), 'utf8');
const attendancePage = fs.readFileSync(path.join(sourceRoot, 'features/attendance/AttendancePage.tsx'), 'utf8');
const bankPage = fs.readFileSync(path.join(sourceRoot, 'features/bank/BankPage.tsx'), 'utf8');
const classroomPage = fs.readFileSync(path.join(sourceRoot, 'features/classroom/ClassroomPage.tsx'), 'utf8');
const examsPage = fs.readFileSync(path.join(sourceRoot, 'features/exams/ExamsPage.tsx'), 'utf8');

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
must(main.includes('<HashRouter>'), 'React Router controla toda la navegación');
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

must(app.includes('path="classroom"') && app.includes('path="classroom/:sessionId"') && app.includes('<ClassroomPage />'), 'Modo Clase tiene rutas React propias');
must(app.includes('path="bank"') && app.includes('<BankPage />'), 'Banco de Reactivos tiene una ruta React propia');
must(!app.includes('module="classroom"') && !app.includes('module="bank"'), 'Modo Clase y Banco fueron retirados de los placeholders heredados');
must(navigation.includes("label: 'Modo Clase'") && navigation.includes("label: 'Banco'") && (navigation.match(/migrated: true/g) || []).length >= 6, 'la navegación marca Fase 3 como migrada');
must(main.includes("import './styles/phase-three.css'"), 'los estilos de Fase 3 se cargan desde un módulo único');

must(bankPage.includes('saveBankQuestion') && bankPage.includes('duplicateBankQuestion') && bankPage.includes('launchClassroomSession') && bankPage.includes('appendBankQuestionsToSession'), 'Question Studio cubre autoría, reutilización y lanzamiento');
must(classroomPage.includes('subscribeClassroom') && classroomPage.includes('launchClassroomQuestion') && classroomPage.includes('revealClassroomQuestion') && classroomPage.includes('closeClassroomSession'), 'Modo Clase cubre tiempo real, preguntas y cierre');
must(classroomPage.includes('saveClassroomStudentNote') && classroomPage.includes('sessionStorage'), 'Modo Clase distingue notas persistentes y contadores locales');

for (const table of ['v2_question_bank', 'v2_sessions', 'v2_questions']) {
  must(bankApi.includes(`from('${table}')`), `capa del banco utiliza ${table}`);
}
for (const table of ['v2_sessions', 'v2_questions', 'v2_participants', 'v2_responses', 'v2_group_students', 'v2_student_notes']) {
  must(classroomApi.includes(`from('${table}')`), `capa de Modo Clase utiliza ${table}`);
}
must(bankApi.includes("rpc('v2_teacher_question_bank_metrics')"), 'Banco reutiliza métricas académicas existentes');
must(bankApi.includes("rpc('tedvio_launch_first_session_v68'"), 'Banco lanza sesiones mediante el RPC protegido existente');
must(bankApi.includes("onConflict: 'group_id,student_id'") === false, 'Banco no mezcla notas de estudiantes');
must(classroomApi.includes("onConflict: 'group_id,student_id'"), 'Notas docentes respetan la clave única del expediente');
must((bankApi.match(/\.eq\('teacher_id', user\.id\)/g) || []).length >= 5, 'operaciones del banco restringen datos al docente autenticado');
must((classroomApi.match(/\.eq\('teacher_id', user\.id\)/g) || []).length >= 5 && classroomApi.includes("supabase.rpc('v2_teacher_classroom_command'"), 'operaciones de Modo Clase restringen datos al docente autenticado');
must(!bankApi.includes('.delete(') && !classroomApi.includes('.delete('), 'Fase 3 archiva preguntas y conserva sesiones en lugar de eliminarlas');
must(classroomApi.includes(".channel(channelName)") && classroomApi.includes("table: 'v2_responses'"), 'Modo Clase usa Supabase Realtime sin polling permanente');
must(classroomApi.includes('/student-v2/?code=') && classroomApi.includes('/projection-v2/?code='), 'Modo Clase abre directamente Student 2.x y Projection 2.x');

must(app.includes('path="exams"') && app.includes('path="exams/new"') && app.includes('path="exams/:examId"') && app.includes('<ExamsPage />'), 'Evaluaciones tiene listado, editor y detalle en rutas React propias');
must(!app.includes('module="exams"'), 'Evaluaciones fue retirada de los placeholders heredados');
must(navigation.includes("label: 'Evaluaciones'") && (navigation.match(/migrated: true/g) || []).length >= 7, 'la navegación marca Fase 4A como migrada');
must(main.includes("import './styles/phase-four.css'"), 'los estilos de Fase 4A se cargan desde un módulo único');
must(examsPage.includes('saveExamDraft') && examsPage.includes('setExamStatus') && examsPage.includes('duplicateExam') && examsPage.includes('analyzeExam'), 'Evaluaciones cubre composición, estados, duplicación y lectura académica');
must(examsPage.includes('buildExamBlueprint') && examsPage.includes('Question Studio'), 'Evaluaciones reutiliza el Banco en lugar de crear otro editor de reactivos');
for (const table of ['v2_paper_exams', 'v2_paper_exam_questions', 'v2_paper_exam_results', 'v2_question_bank', 'v2_academic_periods', 'v2_groups', 'v2_group_students']) {
  must(examsApi.includes(`from('${table}')`), `capa de Evaluaciones utiliza ${table}`);
}
must(examsApi.includes("rpc('v2_save_paper_exam_v2'"), 'Evaluaciones guarda la composición mediante un RPC atómico');
must(examsApi.includes("rpc('v2_set_paper_exam_status'"), 'Evaluaciones utiliza transiciones de estado protegidas');
must(examsApi.includes("rpc('v2_duplicate_paper_exam'"), 'Evaluaciones duplica sin copiar resultados');
must((examsApi.match(/\.eq\('teacher_id', user\.id\)/g) || []).length >= 10, 'lecturas de Evaluaciones se restringen al docente autenticado');
must(!examsApi.includes('.delete(') && !examsPage.includes('.delete('), 'Fase 4A archiva evaluaciones y conserva evidencia histórica');
must(examsApi.includes("'multiple_choice', 'true_false'") && examsApi.includes('compatibleExamQuestion'), 'la composición objetiva solo acepta reactivos con clave OMR inequívoca');

if (failures.length) {
  console.error(`\n${failures.length} regla(s) de arquitectura fallaron.`);
  process.exit(1);
}

console.log(`\nTEDVIO 2.0 architecture check passed (${files.length} source files).`);
