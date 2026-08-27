import fs from 'node:fs';

const html=fs.readFileSync('teacher.html','utf8');
const direct=[...html.matchAll(/<script[^>]+src="\.\/(.+?\.js)(?:\?[^" ]*)?"[^>]*>/g)].map(m=>m[1]);
let deferred=[];
for(const manifest of ['teacher-progressive-boot-v68.js','teacher-core-v68-6.js']){
  if(!fs.existsSync(manifest))continue;
  const src=fs.readFileSync(manifest,'utf8');
  deferred.push(...[...src.matchAll(/["'`]\.\/(.+?\.js)(?:\?[^"'`]*)?["'`]/g)].map(m=>m[1]));
}
for(const required of ['teacher-core-v68-6.js','teacher-session-core-v68-6.js'])if(fs.existsSync(required))deferred.push(required);
const scripts=[...new Set([...direct,...deferred])];
let failed=0;
const fail=(file,msg,snippet='')=>{failed++;console.error(`FAIL ${file}: ${msg}${snippet?`\n  ${snippet}`:''}`)};
const ok=(file,msg)=>console.log(`OK   ${file}: ${msg}`);
for(const file of scripts){
  if(!fs.existsSync(file))continue;
  const src=fs.readFileSync(file,'utf8'),lines=src.split(/\r?\n/);let bad=false;
  const lhsOptional=/\?\.[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\[[^\]\n]+\])*\s*(?:=(?!=)|\+=(?!=)|-=(?!=)|\*=(?!=)|\/=(?!=)|%=(?!=)|\*\*=(?!=)|&&=(?!=)|\|\|=(?!=)|\?\?=(?!=)|\+\+|--)/g;
  lines.forEach((line,i)=>{const m=line.match(lhsOptional);if(m){bad=true;fail(file,`optional chaining used as assignment target at line ${i+1}`,m[0])}const repeated=(line.match(/const\s*\{\s*error\s*\}\s*=/g)||[]).length;if(repeated>1){bad=true;fail(file,`same lexical binding {error} declared ${repeated} times on line ${i+1}`,line.slice(0,240))}});
  if(!bad)ok(file,'Safari-sensitive assignment syntax clean');
}
if(failed){console.error(`\n${failed} iOS/Safari compatibility issue(s) found.`);process.exit(1)}
console.log(`\nTEDVIO iOS/Safari syntax audit passed (${scripts.length} split/deferred teacher scripts).`);