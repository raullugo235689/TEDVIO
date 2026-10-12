// Isolated preview diagnosis only. Always exits nonzero: never publishes an app.
// Restores the EXACT reviewed config bytes before testing that original package.
import fs from 'node:fs';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
fs.copyFileSync('release-original-config.snapshot','vercel.json');
if(!fs.existsSync('.github/scripts/release-integrity.mjs'))process.exit(30);
const {sourceFiles}=await import('./.github/scripts/release-integrity.mjs');
const expected={
'apps/teacher-v2/src/':'949c03b39da42b373030c844331b430545f5721e1f559a1fe2c24a422fddbc49',
'apps/teacher-v2/live/':'9f192c1eae29aa071c534e4aeb1c1fe33f621c850d34a4802ca4b1f1567ed6c1',
'apps/teacher-v2/public/':'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
'apps/teacher-v2/scripts/':'fadbb8221cd040724ed2d28d11762acc4c49bae13302cf6c990f71de69c43bae',
'supabase/migrations/':'b2d905c08e6f58bd0213f1f5a3e13167dbdcf273127bea4787582ce3e419bfd8',
'supabase/tests/':'ad75c1cd1cd7cde8f8ad5c414fb12506e507ba9ce05cb2281fa1e278ef45171e',
'.github/scripts/':'7324c4e80be2089fb220785033d58ea49d7c448954b60f8720f7e3147a8d75d8',
'.github/workflows/':'a05b1a99bb71b89f77ca182dfede40cb258bcec0c7baacc06cdf499b90f93f24',
'assets/':'241734e2856fdd6d6a34b2f97903f9e85fa9b317c537c8887ad28e83909128b6',
'tests/browser/':'403e4a2da55f839bbe63a33a6c0258e9dd7224fea32dc260584e6b7a7b9672fd',
'other':'c0994ef78fc888c8db112b895ca8135837a4b838d54a8ae1495cab58d28a0794'};
const all=sourceFiles(),prefixes=Object.keys(expected).filter(p=>p!=='other');let exit=40;
for(const[p,want]of Object.entries(expected)){
 const files=all.filter(f=>p==='other'?!prefixes.some(pre=>f.startsWith(pre)):f.startsWith(p));
 let got;try{got=hash(files.map(f=>`${f}\0${hash(fs.readFileSync(f))}`).join('\n'));}catch(e){console.error(e);process.exit(exit);}
 if(got!==want){console.error('SOURCE_GROUP_DIFFERENCE',p,files.length,got,want);process.exit(exit);}exit++;
}
const r=spawnSync('node',['.github/scripts/release-integrity.mjs','verify'],{encoding:'utf8'});console.log(r.stdout);console.error(r.stderr);
process.exit(r.status?(/El paquete/.test(r.stderr)?70:/validación/.test(r.stderr)?71:72):60);
