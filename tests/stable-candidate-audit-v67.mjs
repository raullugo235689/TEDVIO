import fs from'node:fs';
const source=fs.readFileSync('tests/stable-candidate-audit.mjs','utf8')
 .replace("tedvio-pilot-v60-20260825","tedvio-pilot-v67-20260826")
 .replace("String(version.version).endsWith('.60')","String(version.version).endsWith('.67')")
 .replace('Student Experience Pilot Ready version is v60','Security & Commercial Readiness Pilot Ready version is v67')
 .replace('TEDVIO v60 Student Experience Pro Pilot Ready static audit passed.','TEDVIO v67 compatibility static audit passed.');
const tmp='tests/.stable-candidate-audit-v67.generated.mjs';
fs.writeFileSync(tmp,source);
try{await import('./.stable-candidate-audit-v67.generated.mjs?'+Date.now())}finally{try{fs.unlinkSync(tmp)}catch{}}
