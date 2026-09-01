import fs from 'node:fs';
import path from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const repositoryRoot = path.resolve(root, '../..');
const entry = fs.readFileSync(path.join(repositoryRoot, 'student-v2/index.html'), 'utf8');
const app = fs.readFileSync(path.join(repositoryRoot, 'student-v2/app.js'), 'utf8');
const css = fs.readFileSync(path.join(repositoryRoot, 'student-v2/student-v2.css'), 'utf8');
const redirect = fs.readFileSync(path.join(repositoryRoot, 'student-v2/legacy-redirect.js'), 'utf8');
const legacy = fs.readFileSync(path.join(repositoryRoot, 'beta.html'), 'utf8');
const classroom = fs.readFileSync(path.join(root, 'src/core/classroom.ts'), 'utf8');
const failures = [];

function must(condition, message) {
  if (condition) console.log('OK  ', message);
  else { failures.push(message); console.error('FAIL', message); }
}

must(entry.includes('data-tedvio-surface="student-v2-react"'), 'Student 2.x declara la superficie React nativa');
must(entry.includes('./app.js?v=220'), 'Student 2.x carga el cliente React dedicado');
must(!entry.includes('beta.js') && !entry.includes('student-v60.js'), 'Student 2.x ya no carga el runtime visual heredado');
must(app.includes("react@19.2.0") && app.includes('createRoot'), 'Student 2.x utiliza React 19');
must(app.includes("v2_join_session_v3") && app.includes("v2_submit_response"), 'Student 2.x usa las RPC estables de unión y respuesta');
must(app.includes("postgres_changes") && app.includes('setInterval(refresh, 4000)'), 'Student 2.x combina Realtime con recuperación por sondeo');
must(app.includes("v2_student_answer_feedback") && app.includes("v2_student_feedback"), 'Student 2.x conserva feedback y ranking académico');
must(css.includes('.question-card') && css.includes('.entry-card'), 'Student 2.x tiene sistema visual propio');
must(redirect.includes('/student-v2/'), 'el puente heredado apunta a Student 2.x');
must(legacy.includes('student-v2/legacy-redirect.js?v=210'), 'beta.html entrega las nuevas uniones a Student 2.x');
must(classroom.includes('/student-v2/'), 'los enlaces nuevos del docente apuntan a Student 2.x');

if (failures.length) {
  console.error(`\n${failures.length} regla(s) de Student 2.x fallaron.`);
  process.exit(1);
}
console.log('\nTEDVIO Student 2.x native React check passed.');
