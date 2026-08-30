import fs from 'node:fs';
import path from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const src = path.join(root, 'src');
const app = fs.readFileSync(path.join(src, 'app/App.tsx'), 'utf8');
const navigation = fs.readFileSync(path.join(src, 'app/navigation.tsx'), 'utf8');
const shell = fs.readFileSync(path.join(src, 'app/AppShell.tsx'), 'utf8');
const main = fs.readFileSync(path.join(src, 'main.tsx'), 'utf8');
const api = fs.readFileSync(path.join(src, 'core/omr.ts'), 'utf8');
const engine = fs.readFileSync(path.join(src, 'core/omr-engine.ts'), 'utf8');
const page = fs.readFileSync(path.join(src, 'features/omr/OmrPage.tsx'), 'utf8');
const scanner = fs.readFileSync(path.join(src, 'features/omr/OmrScanner.tsx'), 'utf8');
const sheets = fs.readFileSync(path.join(src, 'features/omr/OmrSheetsPage.tsx'), 'utf8');
const css = fs.readFileSync(path.join(src, 'styles/phase-four-omr.css'), 'utf8');
const failures = [];

function must(condition, message) {
  if (condition) console.log('OK  ', message);
  else {
    failures.push(message);
    console.error('FAIL', message);
  }
}

must(app.includes('path="omr"') && app.includes('path="omr/:examId"') && app.includes('path="omr/:examId/sheets"'), 'OMR tiene listado, evaluación y hojas en rutas React propias');
must(app.includes('<OmrPage />') && app.includes('<OmrSheetsPage />'), 'OMR utiliza componentes nativos del frontend unificado');
must(navigation.includes("to: '/omr'") && navigation.includes("label: 'OMR'") && navigation.includes("migrated: true"), 'la navegación marca OMR como migrado');
must(shell.includes('const moreItems = navigation.filter'), 'el menú móvil no depende de índices frágiles al incorporar OMR');
must(main.includes("import './styles/phase-four-omr.css'"), 'OMR carga un único módulo visual dedicado');

for (const table of ['v2_paper_exams', 'v2_paper_exam_results', 'v2_groups', 'v2_group_students']) {
  must(api.includes(`from('${table}')`), `la capa OMR utiliza ${table}`);
}
must(api.includes("rpc('v2_save_omr_result'"), 'los resultados se califican y guardan mediante RPC atómico');
must(api.includes("rpc('v2_set_omr_result_archived'"), 'los resultados se archivan sin eliminación física');
must((api.match(/\.eq\('teacher_id', user\.id\)/g) || []).length >= 8, 'las lecturas OMR se restringen al docente autenticado');
must(!api.includes('.delete(') && !page.includes('.delete(') && !scanner.includes('.delete('), 'Etapa 4B no elimina resultados ni evaluaciones');

must(engine.includes('analyzeOmrFile') && engine.includes('findCorner') && engine.includes('mapPoint'), 'el motor local detecta marcas, perspectiva y burbujas');
must(engine.includes("'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft'"), 'el lector exige las cuatro marcas de alineación');
must(engine.includes('crypto.subtle.digest') && scanner.includes('fingerprintFile'), 'la captura genera una huella local sin subir la fotografía');
must(engine.includes('jsqr@1.4.0') && engine.includes('qrcodejs/1.0.0'), 'QR se carga solo al utilizar lectura o impresión');
must(scanner.includes('capture="environment"') && scanner.includes('accept="image/*"'), 'el escáner abre la cámara trasera y también admite archivo');
must(scanner.includes('unresolvedWarnings') && scanner.includes('Guardar pendiente') && scanner.includes('Confirmar y calificar'), 'las marcas dudosas requieren revisión antes de confirmar');
must(scanner.includes('La fotografía se analiza en este dispositivo') && page.includes('La fotografía no se sube a Supabase'), 'la interfaz explica el tratamiento local de la imagen');

must(sheets.includes('omr-fid top-left') && sheets.includes('omr-fid top-right') && sheets.includes('omr-fid bottom-right') && sheets.includes('omr-fid bottom-left'), 'las hojas imprimen cuatro marcas negras');
must(sheets.includes('buildOmrPayload') && sheets.includes('data-omr-qr'), 'cada hoja personalizada contiene identidad y versión en QR');
must(css.includes('@page { size: A4; margin: 0; }') && css.includes('.omr-sheet-page'), 'las hojas mantienen formato A4 reproducible');
must(!/OPENAI|AI_GATEWAY|gpt-/i.test(`${api}\n${engine}\n${page}\n${scanner}\n${sheets}`), 'OMR no introduce IA generativa ni costo por tokens');

if (failures.length) {
  console.error(`\n${failures.length} regla(s) OMR fallaron.`);
  process.exit(1);
}

console.log('\nTEDVIO 2.0 OMR architecture check passed.');
