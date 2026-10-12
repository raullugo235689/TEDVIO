// Read-only isolated preview probe. Always fails so it cannot publish a site.
// Exit 81: bytes identical; 82: JSON identical but reformatted;
// 83: semantic difference; 84: config absent/invalid.
import fs from 'node:fs';
const expected='{"framework":null,"installCommand":"","buildCommand":"node release-diagnostics/probe.mjs","outputDirectory":".","git":{"deploymentEnabled":{"*":false}}}\n';
function canonical(value){
 if(Array.isArray(value)) return value.map(canonical);
 if(value && typeof value==='object') return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
 return value;
}
try {
 const actual=fs.readFileSync('vercel.json','utf8');
 if(actual===expected) process.exit(81);
 if(JSON.stringify(canonical(JSON.parse(actual)))===JSON.stringify(canonical(JSON.parse(expected)))) process.exit(82);
 console.error('Semantic configuration mismatch');
 process.exit(83);
} catch { process.exit(84); }
