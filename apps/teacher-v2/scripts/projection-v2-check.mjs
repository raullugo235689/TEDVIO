import fs from 'node:fs';
import path from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const repositoryRoot = path.resolve(root, '../..');
const entry = fs.readFileSync(path.join(repositoryRoot, 'projection-v2/index.html'), 'utf8');
const app = fs.readFileSync(path.join(repositoryRoot, 'projection-v2/projection-v2.js'), 'utf8');
const redirect = fs.readFileSync(path.join(repositoryRoot, 'projection-v2/legacy-redirect.js'), 'utf8');
const legacy = fs.readFileSync(path.join(repositoryRoot, 'proyectar.html'), 'utf8');
const failures = [];
const must=(condition,message)=>condition?console.log('OK  ',message):(failures.push(message),console.error('FAIL',message));

must(entry.includes('data-tedvio-surface="projection-v2"'),'Projection 2.x declara superficie propia');
must(app.includes('react-dom@19.2.0'),'Projection 2.x usa React 19');
must(app.includes("v2_public_session_meta")&&app.includes("v2_public_live_counts"),'Projection 2.x consume las RPC públicas de sesión');
must(app.includes("v2_public_ranking")&&app.includes("v2_public_question_results"),'Projection 2.x muestra ranking y resultados');
must(app.includes('/student-v2/?code='),'el QR de Projection 2.x abre Student 2.x');
must(app.includes("postgres_changes")&&/setInterval\(sync,\s*2500\)/.test(app),'Projection 2.x combina Realtime y polling de respaldo');
must(redirect.includes('/projection-v2/?code='),'el puente heredado apunta a Projection 2.x');
must(legacy.includes('projection-v2/legacy-redirect.js?v=220'),'proyectar.html entrega sesiones antiguas a Projection 2.x');

if(failures.length){console.error(`\n${failures.length} regla(s) de Projection 2.x fallaron.`);process.exit(1)}
console.log('\nTEDVIO Projection 2.x check passed.');
