import fs from'node:fs';
import assert from'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8');
const teacher=read('teacher.html');
const version=JSON.parse(read('version.json'));
const is763=version.revision==='76.3-no-flash-ui';
const router=read(is763?'teacher-router-v76-3.js':'teacher-router-v76-2.js');
const scripts=[...teacher.matchAll(/<script[^>]+src="([^"]+)"/g)].map(x=>x[1]);
const styles=[...teacher.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map(x=>x[1]);

assert.equal(version.version,'2026.08.28.76');
assert.ok(['76.2-quality-core','76.3-no-flash-ui'].includes(version.revision),'Quality Core may advance to the no-flash compatibility revision');
assert.equal(version.audit,'academic-periods');
assert.equal(scripts.length,9,'Quality Core keeps one lightweight persistent-router runtime');
assert.equal(styles.length,12,'Quality Core adds no external stylesheet');
assert.match(teacher,is763?/teacher-router-v76-3\.js\?v=763/:/teacher-router-v76-2\.js\?v=762/);
assert.match(teacher,is763?/id="tv763VisualStabilityStyle"/:/id="tv762RouterStyle"/);
assert.ok(teacher.indexOf('teacher-periods-v76.js?v=76')<teacher.indexOf(is763?'teacher-router-v76-3.js?v=763':'teacher-router-v76-2.js?v=762'),'persistent router layers after academic context');
assert.doesNotMatch(teacher,/tv761NavShield|tv761NavStability|snapshot\(\)/,'v76.1 visual snapshot is retired');
assert.doesNotMatch(teacher,/xlsx\.full|jspdf|jsQR/i,'router adds no heavy first-paint dependency');

assert.match(router,is763?/const VERSION='2026\.08\.28\.76\.3'/:/const VERSION='2026\.08\.28\.76\.2'/);
assert.match(router,/ROUTES=new Set\(\['dashboard','bank','quizzes','history'\]\)/);
assert.match(router,/function stageDashboard/);
assert.match(router,/DashboardStage/);
assert.match(router,/live\.replaceChildren\(\.\.\.children\)/,'dashboard is staged before one atomic main swap');
assert.match(router,/c\.state\.view='dashboard'/);
assert.match(router,/c\.state\.view='bank'/);
assert.match(router,/loader\.ensure\('bank'\)/,'Question Studio remains demand loaded');
assert.match(router,/bankDelegating/,'first lazy Bank route delegates through the installed Question Studio wrapper');
assert.match(router,/history\.pushState/);
assert.match(router,/history\.replaceState/);
assert.match(router,/addEventListener\('popstate'/);
assert.match(router,/history\.scrollRestoration='manual'/);
assert.match(router,/R\.scroll\.set/);
assert.match(router,/aria-current/);
assert.match(router,/route===\(core\(\)\?\.state\?\.view\|\|R\.current\)&&ready\(route\)/,'same-route top-nav work is suppressed');
assert.match(router,/tedvio:route-ready/);
assert.match(router,/aria-live/);
assert.doesNotMatch(router,/new MutationObserver/,'router adds no permanent DOM observer');
assert.doesNotMatch(router,/setInterval\(/,'router adds no polling interval');
assert.doesNotMatch(router,/location\.(?:reload|replace)/,'router never reloads the document');
assert.doesNotMatch(router,/cloneNode|tv761NavShield/,'persistent router no longer masks destructive navigation with snapshots');
assert.doesNotMatch(router,/createClient\(|\.from\(|\.rpc\(/,'router performs no backend work of its own');
assert.doesNotMatch(router,/service_role|SUPABASE_SECRET|sb_secret_|OPENAI_API_KEY|AI_GATEWAY_API_KEY/i,'router exposes no privileged or inference key material');
if(is763){assert.match(router,/installGroupStability/);assert.match(router,/PerformanceObserver/);assert.doesNotMatch(teacher,/tv762RouteBar/,'v76.3 removes the animated route bar');}

console.log(`TEDVIO ${is763?'v76.3 No-Flash UI':'v76.2 Quality Core'} regression: OK`);
