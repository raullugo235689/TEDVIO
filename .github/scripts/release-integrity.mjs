// Diagnostic branch only. Always fails; cannot publish the application.
// 81=byte-identical configuration; 82=format/key-order only; 83=semantic change.
import fs from 'node:fs';
function canonical(value){return Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;}
try{
 const expected=fs.readFileSync('release-diagnostics/baseline-vercel.json','utf8');
 const actual=fs.readFileSync('vercel.json','utf8');
 if(actual===expected) process.exit(81);
 if(JSON.stringify(canonical(JSON.parse(actual)))===JSON.stringify(canonical(JSON.parse(expected)))) process.exit(82);
 process.exit(83);
}catch{process.exit(84);}
