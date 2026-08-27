import fs from'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const teacher=read('teacher.html'),beta=read('beta.html'),deferred=fs.existsSync('teacher-progressive-boot-v68.js')?read('teacher-progressive-boot-v68.js'):'',teacherRuntime=teacher+deferred,a=read('academic-analytics-v61.js'),css=read('academic-analytics-v61.css'),vercel=read('vercel.json'),sw=read('sw.js'),version=JSON.parse(read('version.json')),legacy=read('beta-analytics-plus.js');
let failed=0;const must=(ok,msg)=>{if(ok)console.log('OK  ',msg);else{console.error('FAIL',msg);failed++}};
for(const [name,html,runtime] of[['teacher',teacher,teacherRuntime],['beta',beta,beta]]){
  must(runtime.includes('academic-analytics-v61.js?v=61')&&html.includes('academic-analytics-v61.css?v=61'),`${name} shell preserves Academic Analytics Pro`);
  must(!html.includes('beta-analytics-plus.js?v=56')&&!runtime.includes('beta-analytics-plus.js?v=56'),'legacy analytics-plus is rollback-only and not loaded');
  must(runtime.indexOf('beta-group-center-v2.js?v=56')<runtime.indexOf('academic-analytics-v61.js?v=61'),`${name} loads v61 after Group Center v2`);
}
must(legacy.includes('Evolución del grupo'),'legacy analytics runtime remains preserved for rollback');
must(a.includes("const VERSION='2026.08.25.61'"),'v61 runtime reports correct version');
for(const table of['v2_groups','v2_group_students','v2_attendance_sessions','v2_attendance_records','v2_paper_exams','v2_paper_exam_results','v2_grade_categories','v2_grade_items','v2_grade_scores','v2_sessions','v2_participants','v2_questions','v2_responses'])must(a.includes(`from('${table}')`),`v61 reads ${table}`);
must(a.includes(".eq('teacher_id',uid)")&&a.includes(".eq('group_id',id)"),'teacher-owned base data remains owner/group scoped');
must(!/from\('[^']+'\)\.(?:insert|update|upsert|delete)\(/.test(a),'v61 analytics runtime performs no Supabase mutations');
must(a.includes('currentGrade')&&a.includes('catGrade')&&a.includes("cat.kind==='omr'")&&a.includes("cat.kind==='attendance'")&&a.includes("cat.kind==='live'"),'v61 integrates weighted grades, OMR, attendance and live participation');
must(a.includes('liveAccuracy')&&a.includes('engagement')&&a.includes('health=')&&a.includes("level='priority'")&&a.includes("level='watch'"),'v61 computes follow-up index and priority levels');
must(a.includes('Asistencia vs desempeño')&&a.includes('pearson')&&a.includes('no implica causalidad'),'v61 correlation is descriptive and explicitly non-causal');
must(a.includes('Discriminación')||a.includes('D ${x.D.toFixed(2)}'),'v61 exposes question discrimination diagnostics');
must(a.includes('Siguiente acción sugerida')&&a.includes('Revisar ${priority.length}')&&a.includes('Reforzar los reactivos más difíciles'),'v61 turns analytics into actionable teacher guidance');
must(a.includes('ga61Excel')&&a.includes('XLSX.writeFile')&&a.includes('ga61Pdf')&&a.includes('jsPDF')&&a.includes('autoTable'),'v61 exports Excel and PDF reports');
must(a.includes('ga61Student')&&a.includes('ga360Student'),'v61 links priority rows back to existing student profile');
must(a.includes('window.gaOpenGroup')&&a.includes('window.ga360Tab')&&a.includes('Analítica Pro'),'v61 hooks Group Center without replacing it');
must(css.includes('#ga61Root')&&css.includes('.ga61-kpis')&&css.includes('.ga61-next')&&css.includes('.ga61-table')&&css.includes('@media(max-width:620px)'),'v61 CSS covers analytics dashboard and responsive layout');
must(vercel.includes('/academic-analytics-v61.js')&&vercel.includes('/academic-analytics-v61.css'),'v61 assets use no-store headers');
must(/tedvio-pilot-v\d+-2026082\d/.test(sw),'service worker keeps a versioned Pilot cache namespace');
const globalVersion=Number(String(version.version||'').split('.').pop()||0);
must(version.channel==='pilot-ready'&&globalVersion>=61,'global Pilot Ready version remains v61 or newer');
if(failed){console.error(`\n${failed} v61 regression check(s) failed.`);process.exit(1)}console.log('\nTEDVIO v61 Academic Analytics Pro regression audit passed.');
