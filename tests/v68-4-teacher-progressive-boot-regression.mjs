import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const teacher=read('teacher.html'),beta=read('beta.html'),boot=read('teacher-progressive-boot-v68.js'),core=read('teacher-core-v68-6.js');
let failed=0;const must=(ok,msg)=>{if(ok)console.log('OK  ',msg);else{console.error('FAIL',msg);failed++}};
const direct=[...teacher.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m=>m[1]);

const allowedCore=['config.js','runtime-core-v64.js','teacher-core-v68-6.js','teacher-progressive-boot-v68.js','teacher-theme-v68-7.js','teacher-command-center-v70.js'];
const unexpectedDirect=direct.filter(src=>!allowedCore.some(name=>src.includes(name)));
must(direct.length===allowedCore.length&&allowedCore.every(name=>direct.some(src=>src.includes(name)))&&unexpectedDirect.length===0,`teacher first paint remains the audited split-core foundation plus the v70 command-center controller (${direct.length} direct scripts)`);
must(teacher.includes('teacher-core-v68-6.js?v=686')&&teacher.includes('teacher-progressive-boot-v68.js?v=686'),'teacher loads split core + demand loader');
must(!teacher.includes('beta.js?v=56')&&!teacher.includes('auth-handoff-v68-3.js')&&!teacher.includes('beta-auth-fix.js')&&!teacher.includes('beta-runtime-hooks.js'),'teacher no longer loads monolithic/legacy auth runtime stack');
must(!teacher.includes('cdn.jsdelivr.net/npm/xlsx')&&!teacher.includes('jspdf')&&!teacher.includes('qrcode.min.js')&&!teacher.includes('jsQR.js'),'heavy libraries stay off first paint');
must(boot.includes("mode:'teacher-core'")&&boot.includes("dataset.tedvioPerformance='teacher-core-split'")&&boot.includes('async function ensure(name)'),'v68.6 loader is pure on-demand split-core mode');
must(!boot.includes("await loadList([\n      ['./beta-brand-v2.js")&&!boot.includes("stage('shell'"),'loader no longer auto-loads decorator/stage bundles');
for(const name of ['live-classroom-v58.js?v=58','question-studio-v65.js?v=65','assignments-v66.js?v=66','security-commercial-v67.js?v=67','onboarding-v68.js?v=68','academic-analytics-v61.js?v=61','admin-v62.js?v=62','beta-paper-exams-v2.js?v=56'])must(boot.includes(name),`demand registry preserves ${name}`);
for(const studentOnly of ['beta-student-brand-v1.js','beta-student-live-v1.js','student-v60.js','student-security-v67.js'])must(!boot.includes(studentOnly)&&!teacher.includes(studentOnly),`teacher route excludes student-only runtime ${studentOnly}`);
must(beta.includes('student-v60.js?v=60')&&beta.includes('student-security-v67.js?v=67')&&beta.includes('beta.js?v=56'),'beta route remains full student/rollback shell');
must(core.includes("from('tedvio_user_profiles').select('status,plan,role')")&&core.includes("db.rpc('tedvio_current_entitlements')")&&core.includes("db.rpc('v2_teacher_today_dashboard')"),'split core initial workspace uses profile + entitlements + one aggregate dashboard RPC');
must(!core.includes("from('v2_question_bank')")&&!core.includes("from('v2_sessions')"),'split core does not preload bank or session history');
must(boot.includes("document.documentElement.dataset.tedvioBoot='ready'")&&boot.includes('tedvio:teacher-ready'),'loader exposes deterministic ready state');
if(failed){console.error(`\n${failed} v68.4+ compatibility check(s) failed.`);process.exit(1)}
console.log('\nTEDVIO v68.4+ compatibility passes with the v70 command-center layer.');
