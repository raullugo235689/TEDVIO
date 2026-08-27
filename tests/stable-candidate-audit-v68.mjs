import fs from'node:fs';
const source=fs.readFileSync('tests/stable-candidate-audit.mjs','utf8')
 .replace("const teacher=read('teacher.html');","const teacher=read('teacher.html')+(fs.existsSync('teacher-progressive-boot-v68.js')?read('teacher-progressive-boot-v68.js'):'');")
 .replace("must(teacher.includes('student-v60.js?v=60')&&teacher.includes('student-v60.css?v=60'),'teacher shell includes v60 student fallback layer');","must(teacher.includes('teacher-progressive-boot-v68.js?v=684')?(!read('teacher.html').includes('student-v60.js?v=60')&&beta.includes('student-v60.js?v=60')):(teacher.includes('student-v60.js?v=60')&&teacher.includes('student-v60.css?v=60')),'teacher keeps student capability on beta while progressive /teacher omits student-only runtime');")
 .replace("must(html.includes('beta-student-live-v1.js'),'legacy student reveal layer remains available for rollback');","must(html===teacher&&teacher.includes('teacher-progressive-boot-v68.js?v=684')?beta.includes('beta-student-live-v1.js'):html.includes('beta-student-live-v1.js'),'legacy student reveal remains available on student-capable beta while progressive /teacher stays lean');")
 .replace("tedvio-pilot-v60-20260825","tedvio-pilot-v68-20260826")
 .replace("String(version.version).endsWith('.60')","String(version.version).endsWith('.68')")
 .replace('Student Experience Pilot Ready version is v60','Onboarding & Product Activation Pilot Ready version is v68')
 .replace('TEDVIO v60 Student Experience Pro Pilot Ready static audit passed.','TEDVIO v68 compatibility static audit passed.');
const tmp='tests/.stable-candidate-audit-v68.generated.mjs';
fs.writeFileSync(tmp,source);
try{await import('./.stable-candidate-audit-v68.generated.mjs?'+Date.now())}finally{try{fs.unlinkSync(tmp)}catch{}}
