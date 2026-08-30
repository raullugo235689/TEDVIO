import fs from 'node:fs';
import path from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const src = path.join(root, 'src');
const app = fs.readFileSync(path.join(src, 'app/App.tsx'), 'utf8');
const navigation = fs.readFileSync(path.join(src, 'app/navigation.tsx'), 'utf8');
const main = fs.readFileSync(path.join(src, 'main.tsx'), 'utf8');
const api = fs.readFileSync(path.join(src, 'core/student360.ts'), 'utf8');
const page = fs.readFileSync(path.join(src, 'features/students/Student360Page.tsx'), 'utf8');
const css = fs.readFileSync(path.join(src, 'styles/student360.css'), 'utf8');
const failures = [];

function must(condition, message) {
  if (condition) console.log('OK  ', message);
  else { failures.push(message); console.error('FAIL', message); }
}

must(app.includes('path="students"') && app.includes('path="students/:groupId/:studentId"') && app.includes('<Student360Page />'), 'Alumno 360° tiene directorio y expediente en rutas React propias');
must(navigation.includes("to: '/students'") && navigation.includes("label: 'Alumno 360°'") && navigation.includes('migrated: true'), 'la navegación marca Alumno 360° como migrado');
must(main.includes("import './styles/student360.css'"), 'Alumno 360° carga un módulo visual dedicado');

must(api.includes('fetchGradebookDetail') && api.includes('calculateGradebook') && api.includes('recommendedPeriodId'), 'Alumno 360° reutiliza la única fuente de cálculo del Libro');
for (const table of ['v2_group_students','v2_student_notes','v2_student_note_revisions','v2_assignments','v2_assignment_attempts','v2_gradebook_revisions','v2_paper_exam_result_revisions']) {
  must(api.includes(`from('${table}')`), `la capa Alumno 360° utiliza ${table}`);
}
must(api.includes("rpc('v2_save_student_note_v2'"), 'observaciones se guardan mediante RPC protegido');
must((api.match(/\.eq\('teacher_id', user\.id\)/g) || []).length >= 8, 'lecturas se restringen al docente autenticado');
must(!api.includes('.delete(') && !page.includes('.delete('), 'Etapa 4D no elimina observaciones ni evidencia académica');
must(api.includes('snapshotGrade') === false && api.includes('officialGrade'), 'Alumno 360° consume el snapshot oficial ya resuelto por el Libro');
must(api.includes('result.review_status === \'confirmed\'') && api.includes('!result.archived_at'), 'OMR solo aporta resultados confirmados y activos');

must(page.includes('Trayectoria') && page.includes('Evidencias') && page.includes('Seguimiento e historial'), 'el expediente separa trayectoria, evidencias y seguimiento');
must(page.includes('Guardar observación') && page.includes('Motivo del cambio'), 'la observación exige trazabilidad al actualizarse');
must(page.includes('Exportar CSV') && api.includes('exportStudent360Csv'), 'el expediente puede exportarse bajo demanda');
must(page.includes('Reglas transparentes') && page.includes('Sin IA'), 'la interfaz explica que las alertas son deterministas');
must(css.includes('.student360-chart') && css.includes('.student360-history-grid') && css.includes('@media(max-width: 700px)'), 'Alumno 360° incluye trayectoria, historial y adaptación móvil');

must(!/OPENAI|AI_GATEWAY|gpt-/i.test(`${api}\n${page}`), 'Alumno 360° no introduce IA generativa ni costo por tokens');
must(!/MutationObserver|innerHTML|dangerouslySetInnerHTML|setInterval\(/.test(`${api}\n${page}`), 'Alumno 360° no reintroduce capas, polling ni mutaciones globales');

if (failures.length) {
  console.error(`\n${failures.length} regla(s) de Alumno 360° fallaron.`);
  process.exit(1);
}
console.log('\nTEDVIO 2.0 Student 360 architecture check passed.');
