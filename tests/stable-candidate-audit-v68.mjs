import fs from'node:fs';
const source=fs.readFileSync('tests/stable-candidate-audit.mjs','utf8')
 .replace("tedvio-pilot-v60-20260825","tedvio-pilot-v68-20260826")
 .replace("String(version.version).endsWith('.60')","String(version.version).endsWith('.68')")
 .replace('Student Experience Pilot Ready version is v60','Onboarding & Product Activation Pilot Ready version is v68')
 .replace('TEDVIO v60 Student Experience Pro Pilot Ready static audit passed.','TEDVIO v68 compatibility static audit passed.');
const tmp='tests/.stable-candidate-audit-v68.generated.mjs';
fs.writeFileSync(tmp,source);
try{await import('./.stable-candidate-audit-v68.generated.mjs?'+Date.now())}finally{try{fs.unlinkSync(tmp)}catch{}}
