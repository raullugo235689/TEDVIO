import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function filesIn(relative,workspace=root) {
 const full=path.join(workspace,relative);
 if(!fs.existsSync(full)) return [];
 if(fs.statSync(full).isFile()) return [relative];
 return fs.readdirSync(full).sort().filter(name=>!['node_modules','.git','.vite','test-results','playwright-report'].includes(name))
  .flatMap(name=>filesIn(`${relative}/${name}`,workspace));
}
export function sourceFiles(workspace=root) {
 const directories=['apps/teacher-v2/src','apps/teacher-v2/live','apps/teacher-v2/public','apps/teacher-v2/scripts','supabase/migrations','supabase/tests','.github/scripts','.github/workflows','assets'];
 const singles=['apps/teacher-v2/index.html','apps/teacher-v2/package.json','apps/teacher-v2/package-lock.json','apps/teacher-v2/vite.config.ts','apps/teacher-v2/vite.live.config.ts','apps/teacher-v2/tsconfig.json','supabase/config.toml','sw.js','config.js','manifest.webmanifest','vercel.json'];
 // Legacy shells and shared public runtime files remain part of the release.
 // Generated manifests/attestations and temporary runner package files are not inputs.
 const shared=fs.readdirSync(workspace).filter(file=>/\.(?:html|js|css|webmanifest)$/.test(file)&&fs.statSync(path.join(workspace,file)).isFile());
 return [...new Set([...directories.flatMap(dir=>filesIn(dir,workspace)),...singles,...shared,...filesIn('tests/browser',workspace).filter(file=>file.endsWith('.mjs'))])].sort();
}
/** JSON configuration is interpreted by value, not indentation or key order.
 * Vercel can serialize vercel.json again before the build command runs.
 * Preserve every key/value and array order; all other inputs remain byte-exact.
 */
export function canonicalJson(value) {
 if(Array.isArray(value)) return value.map(canonicalJson);
 if(value !== null && typeof value === 'object') {
  return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonicalJson(value[key])]));
 }
 return value;
}
function sourceBytes(file,workspace) {
 const bytes=fs.readFileSync(path.join(workspace,file));
 return file === 'vercel.json' ? JSON.stringify(canonicalJson(JSON.parse(bytes.toString('utf8')))) : bytes;
}
export function sourceDigest(workspace=root) {
 return digest(sourceFiles(workspace).map(file=>`${file}\0${digest(sourceBytes(file,workspace))}`).join('\n'));
}
function outputManifest() {
 return Object.fromEntries(['teacher-v2','student-v2','projection-v2'].flatMap(dir=>filesIn(dir)).sort().map(file=>[file,digest(fs.readFileSync(path.join(root,file)))]));
}
function json(file){return JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));}
function write(file,data){fs.writeFileSync(path.join(root,file),JSON.stringify(data,null,2)+'\n');}
function verifyOutputs() {
 const manifest=json('deployment-manifest.json'), release=json('release.json');
 if(release.build_id!==manifest.source_hash||release.version!==json('apps/teacher-v2/package.json').version) throw new Error('El identificador de versión no corresponde al paquete.');
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
   workflow_run:process.env.GITHUB_RUN_ID||'local-review',source_commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()});
 } else if(command==='verify') {
  const manifest=verifyOutputs(), attestation=json('release-attestation.json');
  if(attestation.source_hash!==manifest.source_hash||attestation.outputs_hash!==digest(JSON.stringify(manifest.files))) throw new Error('Esta versión no tiene una validación correspondiente.');
  for(const required of ['typecheck','domain-tests','database-atomicity-and-isolation','desktop-chromium','iphone-webkit']) if(!attestation.checks.includes(required)) throw new Error(`Falta la comprobación ${required}.`);
  console.log(`Verified release ${manifest.source_hash.slice(0,12)} · run ${attestation.workflow_run}`);
 } else throw new Error('Usa manifest, attest o verify.');
}
