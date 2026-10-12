import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {execFileSync,spawnSync} from 'node:child_process';
import {sourceFiles,sourceDigest} from '../../../.github/scripts/release-integrity.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'tedvio-release-proof-'));
const run=(command,env={})=>spawnSync(process.execPath,[path.join(temporary,'.github/scripts/release-integrity.mjs'),command],{cwd:temporary,env:{...process.env,...env},encoding:'utf8'});
before(()=>{
 for(const file of sourceFiles()){const to=path.join(temporary,file);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(path.join(root,file),to);}
 for(const surface of ['teacher-v2','student-v2','projection-v2']){fs.mkdirSync(path.join(temporary,surface),{recursive:true});fs.writeFileSync(path.join(temporary,surface,'index.html'),'<p>Synthetic integrity test only</p>');}
 execFileSync('git',['init','-q'],{cwd:temporary});
 execFileSync('git',['-c','user.name=Isolated Test','-c','user.email=test@example.test','commit','--allow-empty','-qm','Synthetic integrity fixture'],{cwd:temporary});
});
after(()=>fs.rmSync(temporary,{recursive:true,force:true}));
test('release digest covers teacher HTML, both live applications and shared public code',()=>{
 const original=sourceDigest(temporary);
 for(const file of ['apps/teacher-v2/index.html','apps/teacher-v2/live/student/app.jsx','apps/teacher-v2/live/projection/app.jsx','sw.js','teacher.html']){
  const target=path.join(temporary,file),bytes=fs.readFileSync(target);
  try{fs.appendFileSync(target,'\n/* synthetic change */\n');assert.notEqual(sourceDigest(temporary),original,file);}finally{fs.writeFileSync(target,bytes);}
 }
 assert.equal(sourceDigest(temporary),original);
 assert.equal(sourceFiles().some(file=>file.includes('/node_modules/')),false);
});
test('attestation is refused without the verified-check signal',()=>{
 assert.equal(run('manifest').status,0);
 assert.notEqual(run('attest',{AUDIT_TESTS_VERIFIED:'0'}).status,0);
});
test('an isolated matching artifact verifies and compiled tampering is rejected',()=>{
 assert.equal(run('manifest').status,0);
 const attest=run('attest',{AUDIT_TESTS_VERIFIED:'1',GITHUB_RUN_ID:'synthetic-integrity-test'});assert.equal(attest.status,0,attest.stderr);
 assert.equal(run('verify').status,0);
 const target=path.join(temporary,'student-v2/index.html'),bytes=fs.readFileSync(target);
 try{fs.appendFileSync(target,'changed');assert.notEqual(run('verify').status,0);}finally{fs.writeFileSync(target,bytes);}
 assert.equal(run('verify').status,0);
});
test('a misleading release identifier is rejected without touching real artifacts',()=>{
 const target=path.join(temporary,'release.json'),bytes=fs.readFileSync(target),value=JSON.parse(bytes);
 try{fs.writeFileSync(target,JSON.stringify({...value,build_id:'not-the-verified-build'}));assert.notEqual(run('verify').status,0);}finally{fs.writeFileSync(target,bytes);}
 assert.equal(run('verify').status,0);
});
