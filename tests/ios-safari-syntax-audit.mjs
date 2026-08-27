import fs from 'node:fs';

const html=fs.readFileSync('teacher.html','utf8');
const scripts=[...html.matchAll(/<script[^>]+src="\.\/(.+?\.js)(?:\?[^" ]*)?"[^>]*>/g)].map(m=>m[1]);
let failed=0;
const fail=(file,msg,snippet='')=>{failed++;console.error(`FAIL ${file}: ${msg}${snippet?`\n  ${snippet}`:''}`)};
const ok=(file,msg)=>console.log(`OK   ${file}: ${msg}`);

for(const file of [...new Set(scripts)]){
  if(!fs.existsSync(file))continue;
  const src=fs.readFileSync(file,'utf8');
  const lines=src.split(/\r?\n/);
  let bad=false;

  // Optional chaining may be read/called, but it can never be an assignment target.
  // The negative lookahead avoids treating === / == comparisons as assignments.
  const lhsOptional=/\?\.[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\[[^\]\n]+\])*\s*(?:=(?!=)|\+=(?!=)|-=(?!=)|\*=(?!=)|\/=(?!=)|%=(?!=)|\*\*=(?!=)|&&=(?!=)|\|\|=(?!=)|\?\?=(?!=)|\+\+|--)/g;
  lines.forEach((line,i)=>{
    const m=line.match(lhsOptional);
    if(m){bad=true;fail(file,`optional chaining used as assignment target at line ${i+1}`,m[0])}
    const repeated=(line.match(/const\s*\{\s*error\s*\}\s*=/g)||[]).length;
    if(repeated>1){bad=true;fail(file,`same lexical binding {error} declared ${repeated} times on line ${i+1}`,line.slice(0,240))}
  });

  if(!bad)ok(file,'Safari-sensitive assignment syntax clean');
}

if(failed){console.error(`\n${failed} iOS/Safari compatibility issue(s) found.`);process.exit(1)}
console.log('\nTEDVIO iOS/Safari syntax audit passed.');