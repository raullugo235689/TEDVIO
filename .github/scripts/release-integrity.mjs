import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function filesIn(relative) {
 const full=path.join(root,relative);
 if(!fs.existsSync(full)) return [];
 if(fs.statSync(full).isFile()) return [relative];
 return fs.readdirSync(full).sort().filter(name=>!['node_modules','.git','.vite','test-results','playwright-report'].includes(name))
  .flatMap(name=>filesIn(`${relative}/${name}`));
}
export function sourceDigest() {
 const directories=['apps/teacher-v2/src','apps/teacher-v2/scripts','supabase/migrations','.github/scripts','.github/workflows','assets'];
 const singles=['apps/teacher-v2/package.json','apps/teacher-v2/package-lock.json','apps/teacher-v2/vite.config.ts','apps/teacher-v2/vite.live.config.ts','apps/teacher-v2/tsconfig.json','sw.js','config.js','manifest.webmanifest','vercel.json'];
 const files=[...directories.flatMap(filesIn),...singles,...filesIn('tests/browser').filter(file=>file.endsWith('.mjs'))].sort();
 return digest(files.map(file=>`${file}\0${digest(fs.readFileSync(path.join(root,file)))}`).join('\n'));
}
function outputManifest() {
 return Object.fromEntries(['teacher-v2','student-v2','projection-v2'].flatMap(filesIn).sort().map(file=>[file,digest(fs.readFileSync(path.join(root,file)))]));
}
function json(file){return JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));}
function write(file,data){fs.writeFileSync(path.join(root,file),JSON.stringify(data,null,2)+'\n');}
function verifyOutputs() {
 const manifest=json('deployment-manifest.json');
 if(manifest.source_hash!==sourceDigest()) throw new Error('El código cambió después de construir la versión.');
 if(JSON.stringify(manifest.files)!==JSON.stringify(outputManifest())) throw new Error('El paquete no coincide con los archivos construidos.');
 return manifest;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const command=process.argv[2];
 if(command==='manifest') {
  const source_hash=sourceDigest();
  write('release.json',{version:json('apps/teacher-v2/package.json').version,build_id:source_hash});
  write('deployment-manifest.json',{source_hash,files:outputManifest()});
 } else if(command==='attest') {
  if(process.env.AUDIT_TESTS_VERIFIED!=='1') throw new Error('La atestación requiere los trabajos de pruebas aprobados.');
  const manifest=verifyOutputs();
  write('release-attestation.json',{source_hash:manifest.source_hash,outputs_hash:digest(JSON.stringify(manifest.files)),
   checks:['typecheck','domain-tests','database-atomicity-and-isolation','desktop-chromium','iphone-webkit'],
   workflow_run:process.env.GITHUB_RUN_ID||'local-review',source_commit:process.env.GITHUB_SHA||'local-review'});
 } else if(command==='verify') {
  const manifest=verifyOutputs(), attestation=json('release-attestation.json');
  if(attestation.source_hash!==manifest.source_hash||attestation.outputs_hash!==digest(JSON.stringify(manifest.files))) throw new Error('Esta versión no tiene una validación correspondiente.');
  for(const required of ['typecheck','domain-tests','database-atomicity-and-isolation','desktop-chromium','iphone-webkit']) if(!attestation.checks.includes(required)) throw new Error(`Falta la comprobación ${required}.`);
  console.log(`Verified release ${manifest.source_hash.slice(0,12)} · run ${attestation.workflow_run}`);
 } else throw new Error('Usa manifest, attest o verify.');
}
