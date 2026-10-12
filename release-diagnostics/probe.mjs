// Isolated diagnostic preview: deliberately never produces a deployable site.
// It restores the verified configuration only to compare identical inputs.
// Codes: 51=verified; 41=version; 42=source; 43=output; 44=attestation;
// 45=missing file; 46=other; 52=verifier missing; 60-67=mutated input class.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
fs.copyFileSync('release-diagnostics/baseline-vercel.json','vercel.json');
if(!fs.existsSync('.github/scripts/release-integrity.mjs')) process.exit(52);
try {
 execFileSync(process.execPath,['.github/scripts/release-integrity.mjs','verify'],{stdio:'pipe'});
 console.log('Diagnostic: identical verified candidate passes in the deployment environment.');
 process.exit(51);
} catch(error) {
 const text=String(error.stderr||error.message); console.error(text);
 try {
  const paths=execFileSync('git',['diff','--name-only','098b9d98b20802a481e1a57c337d2a67847e1a69','--'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
  console.log('Changed tracked paths:',JSON.stringify(paths));
  const groups=['.github/','apps/','supabase/','assets/','teacher-v2/','student-v2/','projection-v2/','vercel.json'];
  const index=groups.findIndex(prefix=>paths.some(p=>p.startsWith(prefix)));
  if(index>=0) process.exit(60+index);
 } catch {}
 if(text.includes('identificador de versión')) process.exit(41);
 if(text.includes('código cambió')) process.exit(42);
 if(text.includes('archivos construidos')) process.exit(43);
 if(text.includes('validación correspondiente')||text.includes('Falta la comprobación')) process.exit(44);
 if(text.includes('ENOENT')) process.exit(45);
 process.exit(46);
}
