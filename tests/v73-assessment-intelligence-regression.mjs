import fs from'node:fs';
import assert from'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8');
const teacher=read('teacher.html');
const loader=read('teacher-progressive-boot-v68.js');
const js=read('assessment-intelligence-v73.js');
const css=read('assessment-intelligence-v73.css');
const migration=read('supabase/migrations/20260828193000_v73_assessment_intelligence_metadata.sql');
const version=JSON.parse(read('version.json'));

assert.equal(version.version,'2026.08.28.73');
assert.equal(version.audit,'assessment-intelligence');

assert.doesNotMatch(teacher,/assessment-intelligence-v73/,'v73 must remain out of first paint');
assert.match(loader,/assessment-intelligence-v73\.css\?v=73/);
assert.match(loader,/assessment-intelligence-v73\.js\?v=73/);
assert.ok(loader.indexOf('beta-paper-exams-v2.js?v=56')<loader.indexOf('assessment-intelligence-v73.js?v=73'),'v73 must load after the OMR UI');
assert.match(loader,/omr:\{styles:/,'v73 remains demand-loaded with OMR');

assert.match(js,/__TEDVIO_TEACHER686__/);
assert.doesNotMatch(js,/createClient\(/,'v73 reuses the authenticated Teacher Core client');
assert.match(js,/question_metadata/);
assert.match(js,/eq\('id',examId\)\.eq\('teacher_id',teacher\)/);
assert.match(js,/eq\('exam_id',examId\)\.eq\('teacher_id',teacher\)/);
assert.match(js,/function pearson/);
assert.match(js,/function reliability/);
assert.match(js,/Discriminación negativa/);
assert.match(js,/Varios distractores poco funcionales/);
assert.match(js,/COMPARACIÓN ENTRE VERSIONES/);
assert.match(js,/MAPA DE CONTENIDOS/);
assert.match(js,/Plan de reforzamiento/);
assert.match(js,/Muestra insuficiente/);
assert.match(js,/matrix\.length>=8/,'discrimination requires a minimum sample');
assert.match(js,/x\.n>=5/,'version item comparison requires a minimum per-version sample');
assert.match(js,/no altera la calificación ya registrada/);
assert.doesNotMatch(js,/from\('v2_paper_exam_results'\)\.update|from\('v2_paper_exam_results'\)\.upsert/,'v73 diagnosis must never rewrite student scores');
assert.doesNotMatch(js,/service_role|SUPABASE_SECRET|sb_secret_|access_token|refresh_token/i);
assert.doesNotMatch(js,/setInterval\(|new MutationObserver/,'v73 adds no polling or DOM observer');

assert.match(css,/data-tedvio-theme="dark"/);
assert.match(css,/@media\(max-width:620px\)/);
assert.match(css,/prefers-reduced-motion/);
assert.match(css,/var\(--tv687-surface/);

assert.match(migration,/add column if not exists question_metadata jsonb not null default '\{\}'::jsonb/);
assert.match(migration,/jsonb_typeof\(question_metadata\) = 'object'/);
assert.doesNotMatch(migration,/\bdrop\b|\btruncate\b|\bdelete\b/i,'v73 migration is additive only');

console.log('TEDVIO v73 Assessment Intelligence regression: OK');
