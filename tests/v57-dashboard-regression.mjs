import fs from 'node:fs';

const smart=fs.readFileSync('beta-pilot-ready-v57.js','utf8');
let failed=0;
const must=(ok,msg)=>{if(ok)console.log('OK  ',msg);else{console.error('FAIL',msg);failed++}};

must(smart.includes('choice=smartChoice(all)'),'smart action evaluates all groups');
must(smart.includes('visible=all.slice(0,8)'),'dashboard keeps empty groups in the visible group set');
must(!smart.includes('visible=all.filter(g=>hasStudents(g)||g.today_attendance_status)'),'empty groups are not filtered out of the dashboard');
must(smart.includes('hasOperationalNeed=all.some'),'ready-state decision evaluates all groups');
must(smart.includes("kind:'setup'"),'empty-only dashboards expose a setup next action');
must(smart.includes("choice.kind==='setup'")&&smart.includes("tvPilotAddStudents('${g.id}')"),'setup next action sends the teacher to add students');

if(failed){console.error(`\n${failed} v57 dashboard regression check(s) failed.`);process.exit(1)}
console.log('\nTEDVIO v57 empty-group and smart-priority regression audit passed.');
