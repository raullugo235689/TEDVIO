import fs from'node:fs';
import assert from'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8');
const teacher=read('teacher.html');
const boot=read('teacher-progressive-boot-v68.js');
const client=read('teacher-insight-v742.js');
const css=read('teacher-insight-v742.css');
const legacyApi=read('api/tedvio-ai.js');
const version=JSON.parse(read('version.json'));

assert.equal(version.version,'2026.08.28.742');
assert.equal(version.audit,'insight-zero-cost');

assert.doesNotMatch(teacher,/teacher-insight-v742|teacher-ai-copilot-v74/,'Insight remains off teacher first paint');
assert.match(boot,/insight:\{styles:\['\.\/teacher-insight-v742\.css\?v=742'\],scripts:\[\['\.\/teacher-insight-v742\.js\?v=742','module'\]\]\}/);
assert.doesNotMatch(boot,/\bai:\{styles:/,'generative AI registry is retired');
assert.match(boot,/◎ TEDVIO Insight/);
assert.match(boot,/shim\('tv742OpenInsight','insight'\)/);
assert.match(boot,/shim\('tv74OpenAI','insight'\)/,'legacy cached callers are redirected to local Insight');

assert.match(client,/TEDVIO INSIGHT/);
assert.match(client,/Sin IA generativa/);
assert.match(client,/Costo de inferencia: \$0/);
assert.match(client,/Reglas académicas · sin IA generativa/);
assert.match(client,/Suficiencia de evidencia/);
assert.match(client,/Usa mis reactivos, no genera nuevos/);
assert.match(client,/bank_items/);
assert.match(client,/open_bank/);
assert.match(client,/fetch\('\/api\/tedvio-ai'/,'legacy route stays compatible but is local-only');
assert.doesNotMatch(client,/v2_question_bank'\)\.insert|Guardar en Banco|reactivos generados/i,'Insight never invents or auto-saves questions');
assert.doesNotMatch(client,/setInterval\(|new MutationObserver/,'Insight UI adds no polling or observer');
assert.doesNotMatch(client,/service_role|SUPABASE_SECRET|sb_secret_/i,'Insight UI has no privileged secret');

for(const forbidden of[/ai-gateway/i,/api\.openai\.com/i,/OPENAI_API_KEY/,/AI_GATEWAY_API_KEY/,/VERCEL_OIDC_TOKEN/,/gpt-5/i,/callResponses/,/json_schema/,/TEDVIO_AI_ALLOW_DIRECT_OPENAI/]){
  assert.doesNotMatch(legacyApi,forbidden,`zero-cost endpoint must not contain ${forbidden}`);
}
assert.match(legacyApi,/provider:'local-rules'/);
assert.match(legacyApi,/generative_ai:false/);
assert.match(legacyApi,/inference_cost:0/);
assert.match(legacyApi,/v2_teacher_ai_context/,'existing secure teacher-scoped context is reused');
assert.match(legacyApi,/function coverageFor/);
assert.match(legacyApi,/No evaluable/);
assert.match(legacyApi,/Todavía no conviene interpretar “0 alumnos en riesgo”/);
assert.match(legacyApi,/function explicitStudentNames/,'student names require an explicit individual request');
assert.match(legacyApi,/v2_question_bank/,'reinforcement is selected from the teacher bank');
assert.match(legacyApi,/archived=eq\.false/);
assert.match(legacyApi,/topic=eq\./);
assert.doesNotMatch(legacyApi,/service_role|SUPABASE_SECRET|sb_secret_/i,'backend has no privileged Supabase key');

assert.match(css,/font:500 16px\/1\.4/,'mobile text input avoids iOS auto zoom');
assert.match(css,/@media\(max-width:720px\)/);
assert.match(css,/data-tedvio-theme="dark"/);
assert.match(css,/prefers-reduced-motion/);

console.log('TEDVIO v74.2 Insight zero-cost regression: OK');