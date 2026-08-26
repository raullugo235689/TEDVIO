import fs from'node:fs';
const source=fs.readFileSync('tests/stable-candidate-audit.mjs','utf8')
 .replace("tedvio-pilot-v60-20260825","tedvio-pilot-v62-20260825")
 .replace("String(version.version).endsWith('.60')","String(version.version).endsWith('.62')")
 .replace('Student Experience Pilot Ready version is v60','Admin Institutional Control Pilot Ready version is v62')
 .replace('TEDVIO v60 Student Experience Pro Pilot Ready static audit passed.','TEDVIO v62 compatibility static audit passed.');
const tmp='tests/.stable-candidate-audit-v62.generated.mjs';
fs.writeFileSync(tmp,source);
try{await import('./.stable-candidate-audit-v62.generated.mjs?'+Date.now())}finally{try{fs.unlinkSync(tmp)}catch{}}
