import fs from 'node:fs';
import path from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const repositoryRoot = path.resolve(root, '../..');
const entry = fs.readFileSync(path.join(repositoryRoot, 'student-v2/index.html'), 'utf8');
const boot = fs.readFileSync(path.join(repositoryRoot, 'student-v2/boot.js'), 'utf8');
const redirect = fs.readFileSync(path.join(repositoryRoot, 'student-v2/legacy-redirect.js'), 'utf8');
const legacy = fs.readFileSync(path.join(repositoryRoot, 'beta.html'), 'utf8');
const failures = [];

function must(condition, message) {
  if (condition) console.log('OK  ', message);
  else { failures.push(message); console.error('FAIL', message); }
}

must(entry.includes('data-tedvio-surface="student-v2"'), 'Student 2.x declara una superficie propia');
must(entry.includes('../student-v60.js?v=60'), 'Student 2.x reutiliza el motor de sesión estable');
must(entry.includes('./student-v2.css?v=210'), 'Student 2.x carga su capa visual dedicada');
must(boot.includes("#join?code="), 'el acceso directo convierte el código en el flujo de unión existente');
must(redirect.includes('/student-v2/'), 'el puente heredado apunta a Student 2.x');
must(legacy.includes('student-v2/legacy-redirect.js?v=210'), 'beta.html entrega las nuevas uniones a Student 2.x');

if (failures.length) {
  console.error(`\n${failures.length} regla(s) de Student 2.x fallaron.`);
  process.exit(1);
}
console.log('\nTEDVIO Student 2.x entry check passed.');
