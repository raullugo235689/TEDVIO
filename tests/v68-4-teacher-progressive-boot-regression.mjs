import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const teacher=read('teacher.html'),beta=read('beta.html'),boot=read('teacher-progressive-boot-v68.js');
let failed=0;const must=(ok,msg)=>{if(ok)console.log('OK  ',msg);else{console.error('FAIL',msg);failed++}};
const direct=[...teacher.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m=>m[1]);

must(direct.length<=9,`teacher first paint is lean (${direct.length} direct scripts)`);
must(teacher.includes('auth-handoff-v68-3.js?v=683')&&teacher.indexOf('auth-handoff-v68-3.js?v=683')<teacher.indexOf('beta.js?v=56'),'auth handoff remains before beta.js');
must(/teacher-progressive-boot-v68\.js\?v=68[45]/.test(teacher)&&teacher.indexOf('beta.js?v=56')<teacher.indexOf('teacher-progressive-boot-v68.js'),'teacher performance loader starts after canonical beta.js');
must(!teacher.includes('cdn.jsdelivr.net/npm/xlsx')&&!teacher.includes('jspdf')&&!teacher.includes('qrcode.min.js')&&!teacher.includes('jsQR.js'),'heavy third-party libraries are removed from login first paint');
must(boot.includes("root?.querySelector('.b-app')")&&boot.includes("location.hash.startsWith('#join')")&&boot.includes("location.hash.startsWith('#student')"),'performance loader waits for authenticated teacher shell only');
must(boot.includes('requestIdleCallback')&&boot.includes('yieldToInput'),'teacher boot yields instead of blocking input');
for(const name of ['beta-pilot-ready-v57.js?v=57','live-classroom-v58.js?v=58','entitlements-v63.js?v=63','question-studio-v65.js?v=65','assignments-v66.js?v=66','security-commercial-v67.js?v=67','onboarding-v68.js?v=68','academic-analytics-v61.js?v=61','admin-v62.js?v=62','beta-paper-exams-v2.js?v=56'])must(boot.includes(name),`performance manifest preserves ${name}`);
for(const studentOnly of ['beta-student-brand-v1.js','beta-student-live-v1.js','student-v60.js','student-security-v67.js'])must(!boot.includes(studentOnly)&&!teacher.includes(studentOnly),`teacher route does not load student-only runtime ${studentOnly}`);
must(beta.includes('student-v60.js?v=60')&&beta.includes('student-security-v67.js?v=67'),'student-capable beta route keeps Student Experience and security');
const oldStages=boot.includes("stage('shell'")&&boot.includes("stage('classroom'")&&boot.includes("stage('features'")&&boot.includes("stage('extended'");
const demandMode=boot.includes("mode:'demand'")&&boot.includes("dataset.tedvioPerformance='demand-driven'")&&boot.includes('async function ensure(name)');
must(oldStages||demandMode,'boot uses either audited progressive stages or newer demand-driven feature loading');
must(boot.includes("document.documentElement.dataset.tedvioBoot='ready'")&&boot.includes('tedvio:teacher-ready'),'loader exposes a deterministic ready state');

if(failed){console.error(`\n${failed} v68.4 performance boot regression check(s) failed.`);process.exit(1)}
console.log('\nTEDVIO v68.4+ Teacher Performance Boot regression audit passed.');