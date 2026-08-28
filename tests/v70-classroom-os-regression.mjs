import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('teacher.html','utf8');
const js=fs.readFileSync('teacher-command-center-v70.js','utf8');
const css=fs.readFileSync('teacher-command-center-v70.css','utf8');
const version=JSON.parse(fs.readFileSync('version.json','utf8'));

assert.match(html,/teacher-command-center-v70\.css\?v=70/,'teacher.html must load v70 CSS');
assert.match(html,/teacher-command-center-v70\.js\?v=70/,'teacher.html must load v70 JS');
assert.ok(html.indexOf('teacher-theme-v68-7.js')<html.indexOf('teacher-command-center-v70.js'),'v70 must layer after theme integration');

assert.equal(version.version,'2026.08.28.70');
assert.equal(version.audit,'teacher-command-center-classroom-os');

assert.match(js,/__TEDVIO_TEACHER686__/,'v70 must reuse Teacher Core state');
assert.doesNotMatch(js,/rpc\(['"]v2_teacher_today_dashboard/,'v70 must not duplicate the dashboard RPC');
assert.match(js,/SIGUIENTE ACCIÓN RECOMENDADA/);
assert.match(js,/SIN LISTA HOY/);
assert.match(js,/LISTA HOY/);
assert.match(js,/ASISTENCIA ABIERTA/);
assert.match(js,/ASISTENCIA PAUSADA/);
assert.match(js,/Modo Clase/);
assert.match(js,/PARTICIPACIÓN ALEATORIA/);
assert.match(js,/CRONÓMETRO DE CLASE/);
assert.match(js,/tv70OpenClass/);
assert.match(js,/tv70StartLive/);
assert.match(js,/v2_group_students/,'random student must load roster only on demand');

assert.match(css,/\.tv70-command/);
assert.match(css,/\.tv70-class-overlay/);
assert.match(css,/data-tedvio-theme="dark"/);
assert.match(css,/@media\(max-width:600px\)/);
assert.match(css,/prefers-reduced-motion/);

console.log('TEDVIO v70 regression: OK');
