import fs from'node:fs';
import assert from'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8');
const teacher=read('teacher.html');
const boot=read('teacher-progressive-boot-v68.js');
const command=read('teacher-command-center-v70.js');
const group=read('beta-group-center-v2.js');
const workflow=read('teacher-group-workflow-v72.js');
const assessment=read('assessment-intelligence-v73.js');

assert.match(teacher,/teacher-command-center-v70\.js/,'teacher route reaches the command center');
assert.match(command,/Modo Clase/,'teacher can enter Modo Clase');
for(const action of ["action==='attendance'","action==='live'","action==='grades'","action==='exam'"])assert.ok(command.includes(action),`Modo Clase preserves ${action}`);
assert.match(boot,/groups:\{styles:/,'Groups remains reachable through the lazy registry');
assert.match(boot,/omr:\{styles:/,'OMR remains reachable through the lazy registry');
assert.match(boot,/tvPilotOpenGroups/,'teacher can enter Groups from the command center');
assert.match(group,/ga360Student/,'Group Center preserves Student 360 entry');
assert.match(group,/ga360Tab/,'Group Center preserves tab navigation');
assert.match(workflow,/TEDVIO · FLUJO DE CALIFICACIÓN/,'smart grade workflow remains connected');
assert.match(workflow,/TEDVIO · EXPEDIENTE ACTIVO/,'student active record remains connected');
assert.match(assessment,/ASSESSMENT INTELLIGENCE/,'OMR reaches Assessment Intelligence');
assert.match(assessment,/Plan de reforzamiento/,'assessment reaches reinforcement planning');
assert.doesNotMatch(teacher,/teacher-group-workflow-v72|assessment-intelligence-v73/,'deep academic modules remain off first paint');

console.log('TEDVIO v73.1 teacher workflow smoke: OK');
