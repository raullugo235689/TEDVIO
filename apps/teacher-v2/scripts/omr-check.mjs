import fs from 'node:fs';
import path from 'node:path';

const appRoot = new URL('../', import.meta.url).pathname;
const repositoryRoot = path.resolve(appRoot, '../..');
const sourceRoot = path.join(appRoot, 'src');
const app = fs.readFileSync(path.join(sourceRoot, 'app/App.tsx'), 'utf8');
const navigation = fs.readFileSync(path.join(sourceRoot, 'app/navigation.tsx'), 'utf8');
const main = fs.readFileSync(path.join(sourceRoot, 'main.tsx'), 'utf8');
const omrApi = fs.readFileSync(path.join(sourceRoot, 'core/omr.ts'), 'utf8');
const engine = fs.readFileSync(path.join(sourceRoot, 'core/omr-engine.ts'), 'utf8');
const page = fs.readFileSync(path.join(sourceRoot, 'features/omr/OmrPage.tsx'), 'utf8');
const capture = fs.readFileSync(path.join(sourceRoot, 'features/omr/OmrCapturePanel.tsx'), 'utf8');
const printPage = fs.readFileSync(path.join(sourceRoot, 'features/omr/OmrPrintPage.tsx'), 'utf8');
const bridge = fs.readFileSync(path.join(sourceRoot, 'features/omr/ExamOmrBridge.tsx'), 'utf8');
const styles = fs.readFileSync(path.join(sourceRoot, 'styles/omr.css'), 'utf8');
const migration = fs.readFileSync(path.join(repositoryRoot, 'supabase/migrations/20260830021000_teacher_v2_phase4b_omr.sql'), 'utf8');
const failures = [];

function must(condition, message) {
  if (condition) console.log('OK  ', message);
  else { failures.push(message); console.error('FAIL', message); }
}

must(app.includes('path="omr"') && app.includes('path="omr/:examId"') && app.includes('path="/omr/:examId/print"'), 'OMR tiene listado, captura e impresión en rutas React');
must(app.includes('<OmrPage />') && app.includes('<OmrPrintPage />'), 'las rutas OMR usan componentes del frontend unificado');
must(app.includes('<ExamOmrBridge />') && bridge.includes('to={`/omr/${examId}`}'), 'Evaluaciones enlaza directamente con la captura OMR');
must(navigation.includes("label: 'Captura OMR'") && navigation.includes("migrated: true"), 'OMR aparece como módulo migrado');
must(main.includes("import './styles/omr.css'"), 'OMR carga una sola hoja de estilos propia');
must(page.includes('fetchExamWorkspace') && page.includes('fetchExamDetail'), 'OMR reutiliza el espacio académico de Evaluaciones');
must(capture.includes('analyzeOmrImage') && capture.includes('capture="environment"'), 'la captura usa cámara y análisis local');
must(capture.includes('qualitySummary?.ambiguous') && capture.includes('REVISAR Y CONFIRMAR'), 'la interfaz bloquea marcas ambiguas antes de confirmar');
must(capture.includes('confirmOmrResult') && capture.includes('servidor recalculará'), 'la interfaz muestra cálculo provisional y confirma mediante servidor');
must(printPage.includes('<OmrSheet') && printPage.includes('window.print()'), 'la impresión OMR se genera dentro de React');
must(engine.includes("document.createElement('canvas')") && engine.includes('[0, 90, 180, 270]'), 'el motor corrige orientación y perspectiva en el dispositivo');
must(engine.includes("status = 'ambiguous'") && engine.includes("OmrMarkStatus = 'blank'"), 'el motor distingue lectura clara, ambigua y en blanco');
must(!engine.includes('fetch(') && !engine.includes('supabase') && !capture.includes('storage.'), 'las fotografías no se envían ni se almacenan');
must(omrApi.includes("rpc('v2_confirm_paper_omr_result'"), 'los resultados se confirman mediante RPC atómico');
must(!omrApi.includes('.insert(') && !omrApi.includes('.update(') && !omrApi.includes('.delete('), 'el frontend OMR no escribe directamente ni elimina evidencia');
must(migration.includes('security invoker') && migration.includes('from anon') && migration.includes('to authenticated'), 'el RPC conserva identidad docente y bloquea anon');
must(migration.includes("exam_row.status <> 'ready'") && migration.includes('student_row') && migration.includes('answer_keys'), 'el servidor valida estado, padrón y clave');
must(migration.includes('revision_log') && migration.includes('previous_entry'), 'las correcciones conservan el resultado anterior');
must(!printPage.includes('document.write') && !printPage.includes('dangerouslySetInnerHTML'), 'impresión y revisión no inyectan HTML');
must(styles.includes('@media print') && styles.includes('@page'), 'las hojas están preparadas para impresión A4');
must(![omrApi, engine, page, capture, printPage].join('\n').match(/OPENAI|AI_GATEWAY|gpt-/i), 'OMR no introduce IA generativa ni costo por tokens');

if (failures.length) {
  console.error(`\n${failures.length} regla(s) OMR fallaron.`);
  process.exit(1);
}

console.log('\nTEDVIO 2.0 OMR check passed.');
