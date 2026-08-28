import fs from'node:fs';
import assert from'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8');
const html=read('teacher.html');
const loader=read('teacher-progressive-boot-v68.js');
const homeJs=read('teacher-command-center-v70.js');
const homeCss=read('teacher-command-center-v70.css');
const groupJs=read('teacher-group-workflow-v72.js');
const groupCss=read('teacher-group-workflow-v72.css');
const version=JSON.parse(read('version.json'));
const marker='TEDVIO v72 · Academic Workflow Home';
const home72=homeJs.slice(homeJs.indexOf(marker));
const homeCss72=homeCss.slice(homeCss.indexOf(marker));

assert.equal(version.version,'2026.08.28.72');
assert.equal(version.audit,'teacher-academic-workflow');

assert.match(html,/teacher-command-center-v70\.css\?v=72/);
assert.match(html,/teacher-command-center-v70\.js\?v=72/);
assert.doesNotMatch(html,/teacher-group-workflow-v72|Academic Workflow Home/,'v72 must add no first-paint asset');
assert.match(homeJs,/tv72EnhanceDashboard\(\);\s*\n}/,'v72 home must run after the v70 dashboard render');
assert.match(home72,/Tu ruta académica de hoy/);
assert.match(home72,/PREPARAR/);
assert.match(home72,/DAR CLASE/);
assert.match(home72,/CERRAR CICLO/);
assert.match(home72,/CONTINUAR DONDE LO DEJASTE/);
assert.match(home72,/PENDIENTES DE HOY/);
assert.match(home72,/__TEDVIO_ACADEMIC_HOME72__/);
assert.doesNotMatch(home72,/createClient\(|\.from\(|\.rpc\(|setInterval\(|new MutationObserver/,'v72 home must reuse v70 state without backend or polling work');

assert.match(loader,/teacher-group-workflow-v72\.css\?v=72/);
assert.match(loader,/teacher-group-workflow-v72\.js\?v=72/);
assert.ok(loader.indexOf('teacher-group-intelligence-v71.css')<loader.indexOf('teacher-group-workflow-v72.css'));
assert.ok(loader.indexOf('teacher-group-intelligence-v71.js')<loader.indexOf('teacher-group-workflow-v72.js'));

assert.match(groupJs,/__TEDVIO_TEACHER686__/);
assert.doesNotMatch(groupJs,/createClient\(/);
assert.match(groupJs,/eq\('teacher_id',teacher\)\.eq\('group_id',groupId\)/);
assert.match(groupJs,/STATE\.groups/);
assert.match(groupJs,/requestIdleCallback/);
assert.match(groupJs,/TEDVIO · PROGRESO ACADÉMICO/);
assert.match(groupJs,/Ponderación con evidencia/);
assert.match(groupJs,/CURSO EVALUADO SEGÚN PONDERACIÓN/);
assert.match(groupJs,/REVISIÓN DE CIERRE/);
assert.match(groupJs,/SI SE CERRARA HOY/);
assert.match(groupJs,/Exportar acta detallada/);
assert.match(groupJs,/ACTIVIDADES PENDIENTES DE CAPTURA/);
assert.match(groupJs,/EVIDENCIAS PENDIENTES/);
assert.match(groupJs,/SIMULADOR ACADÉMICO/);
assert.match(groupJs,/Promedio proyectado/);
assert.match(groupJs,/no guarda cambios/);
assert.match(groupJs,/__TEDVIO_GROUP_WORKFLOW72__/);
assert.doesNotMatch(groupJs,/setInterval\(|new MutationObserver/);
assert.doesNotMatch(groupJs,/service_role|SUPABASE_SECRET|sb_secret_|access_token|refresh_token/i);
assert.doesNotMatch(groupJs,/create table|alter table|drop table|security definer/i);

assert.match(homeCss72,/var\(--tv687-surface/);
assert.match(homeCss72,/data-tedvio-theme="dark"/);
assert.match(homeCss72,/@media\(max-width:520px\)/);
assert.match(homeCss72,/prefers-reduced-motion/);
assert.match(groupCss,/var\(--tv687-surface/);
assert.match(groupCss,/data-tedvio-theme="dark"/);
assert.match(groupCss,/@media\(max-width:620px\)/);
assert.match(groupCss,/prefers-reduced-motion/);
assert.match(groupCss,/\.tv72-close-now/);

console.log('TEDVIO v72 Academic Workflow regression: OK');
