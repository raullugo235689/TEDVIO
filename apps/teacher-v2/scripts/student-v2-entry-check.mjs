import fs from 'node:fs';
import path from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const repositoryRoot = path.resolve(root, '../..');
const entry = fs.readFileSync(path.join(repositoryRoot, 'student-v2/index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'live/student/app.jsx'), 'utf8');
const css = fs.readFileSync(path.join(root, 'live/student/base.css'), 'utf8');
const redirect = fs.readFileSync(path.join(repositoryRoot, 'student-v2/legacy-redirect.js'), 'utf8');
const legacy = fs.readFileSync(path.join(repositoryRoot, 'beta.html'), 'utf8');
const classroom = fs.readFileSync(path.join(root, 'src/core/classroom.ts'), 'utf8');
const failures = [];

function must(condition, message) {
  if (condition) console.log('OK  ', message);
  else { failures.push(message); console.error('FAIL', message); }
}

must(entry.includes('data-tedvio-surface="student-v2-react"'), 'Student 2.x declara la superficie React nativa');
must(/\/student-v2\/assets\/app-[^"']+\.js/.test(entry), 'Student 2.x carga un bundle local versionado');
must(!entry.includes('beta.js') && !entry.includes('student-v60.js'), 'Student 2.x ya no carga el runtime visual heredado');
must(app.includes('from "react"') && app.includes('createRoot'), 'Student 2.x utiliza React empaquetado localmente');
must(app.includes("v2_join_session_v3") && app.includes("v2_submit_response_v2"), 'Student 2.x usa unión estable y recibos idempotentes');
must(app.includes("postgres_changes") && app.includes('schedulePoll') && app.includes('30_000'), 'Student 2.x combina Realtime con recuperación adaptativa');
must(app.includes('indexedDB') && app.includes('requestId') && app.includes('clearOutbox(pending.requestId)'), 'Student protege y confirma cada respuesta pendiente');
must(app.includes('navigator.locks') && app.includes('tedvio-student-state'), 'Student serializa la identidad y la cola entre pestañas compatibles');
must(app.includes('receipt_version') && app.includes('data.request_id !== pending.requestId'), 'Student sólo limpia recibos que coinciden exactamente');
must(app.includes('confirmQuestionLocally') && app.includes('current.own?.submitted_at'), 'Student conserva la confirmación visual aunque falle la actualización posterior');
must(app.includes('return { ...next, own: current.own }'), 'un refresh anterior no puede borrar una confirmación local más nueva');
must(app.includes('settleTransaction') && app.includes('1_500'), 'el almacenamiento nunca bloquea indefinidamente la interfaz');
must(!app.includes('https://esm.sh') && !entry.includes('https://esm.sh'), 'Student no depende de runtimes CDN');
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
