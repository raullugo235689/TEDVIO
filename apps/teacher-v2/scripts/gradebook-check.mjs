import fs from 'node:fs';
import path from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const src = path.join(root, 'src');
const app = fs.readFileSync(path.join(src, 'app/App.tsx'), 'utf8');
const navigation = fs.readFileSync(path.join(src, 'app/navigation.tsx'), 'utf8');
const main = fs.readFileSync(path.join(src, 'main.tsx'), 'utf8');
const api = fs.readFileSync(path.join(src, 'core/gradebook.ts'), 'utf8');
const page = fs.readFileSync(path.join(src, 'features/gradebook/GradebookPage.tsx'), 'utf8');
const css = fs.readFileSync(path.join(src, 'styles/phase-four-gradebook.css'), 'utf8');
const failures = [];

function must(condition, message) {
  if (condition) console.log('OK  ', message);
  else { failures.push(message); console.error('FAIL', message); }
}

must(app.includes('path="gradebook"') && app.includes('path="gradebook/:groupId"') && app.includes('<GradebookPage />'), 'Libro tiene listado y grupo en rutas React propias');
must(!app.includes('module="gradebook"'), 'Libro fue retirado del placeholder heredado');
must(navigation.includes("to: '/gradebook'") && navigation.includes("label: 'Calificaciones'") && navigation.includes('migrated: true'), 'navegación marca Calificaciones como migrado');
must(main.includes("import './styles/phase-four-gradebook.css'"), 'Libro carga un módulo visual dedicado');

for (const table of ['v2_grade_categories','v2_grade_items','v2_grade_scores','v2_gradebook_revisions','v2_paper_exams','v2_paper_exam_results','v2_attendance_sessions','v2_attendance_records','v2_sessions','v2_participants']) {
  must(api.includes(`from('${table}')`), `capa del Libro utiliza ${table}`);
}
for (const rpc of ['v2_gradebook_ensure_defaults','v2_gradebook_save_categories','v2_gradebook_save_item','v2_gradebook_save_scores','v2_gradebook_link_omr','v2_teacher_academic_period_summary']) {
  must(api.includes(`rpc('${rpc}'`), `Libro utiliza ${rpc}`);
}

must((api.match(/\.eq\('teacher_id', user\.id\)/g) || []).length >= 12, 'lecturas se restringen al docente autenticado');
must(!api.includes('.delete(') && !page.includes('.delete('), 'Etapa 4C no elimina categorías, evidencias ni calificaciones');
must(api.includes("result.review_status === 'confirmed'") && api.includes('!result.archived_at'), 'OMR solo aporta resultados confirmados y activos');
must(api.includes("['present', 'late', 'justified']") && api.includes('attendanceRate / 10'), 'Asistencia conserva la regla académica del periodo');
must(api.includes('weighted / evidenceWeight'), 'promedio se normaliza con las categorías que ya tienen evidencia');
must(api.includes('snapshotGrade') && page.includes('snapshot oficial'), 'periodos cerrados muestran el resultado oficial del cierre');
must(page.includes('Guardar ponderaciones') && page.includes('CAPTURA MASIVA') && page.includes('Publicar en Libro'), 'interfaz cubre ponderaciones, captura y sincronización OMR');
must(page.includes('Bitácora') && page.includes('<History'), 'Libro expone la trazabilidad de cambios');
must(page.includes('Exportar CSV') && api.includes('exportGradebookCsv'), 'exportación CSV se genera bajo demanda');
must(page.includes('PONDERACIONES') && page.includes('MATRIZ DE EVIDENCIAS') && page.includes('RESUMEN POR ALUMNO'), 'Libro explica fuente, evidencia y resultado');
must(css.includes('.gradebook-table') && css.includes('.gradebook-score-list') && css.includes('@media(max-width:640px)'), 'Libro tiene tabla, captura y adaptación móvil');
must(!/OPENAI|AI_GATEWAY|gpt-/i.test(`${api}\n${page}`), 'Libro no introduce IA generativa ni costo por tokens');

if (failures.length) {
  console.error(`\n${failures.length} regla(s) del Libro fallaron.`);
  process.exit(1);
}
console.log('\nTEDVIO 2.0 gradebook architecture check passed.');
