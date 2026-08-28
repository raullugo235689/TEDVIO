import fs from'node:fs';
import assert from'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8');
const teacher=read('teacher.html');
const boot=read('teacher-progressive-boot-v68.js');
const client=read('teacher-ai-copilot-v74.js');
const css=read('teacher-ai-copilot-v74.css');
const api=read('api/tedvio-ai.js');
const migration=read('supabase/migrations/20260828201138_v74_teacher_ai_context.sql');
const version=JSON.parse(read('version.json'));

assert.equal(version.version,'2026.08.28.74');
assert.equal(version.audit,'ai-copilot');

assert.doesNotMatch(teacher,/teacher-ai-copilot-v74|api\/tedvio-ai/,'v74 must add nothing to teacher first paint');
assert.match(boot,/ai:\{styles:\['\.\/teacher-ai-copilot-v74\.css\?v=74'\],scripts:\[\['\.\/teacher-ai-copilot-v74\.js\?v=74','module'\]\]\}/);
assert.match(boot,/tvLazyAi/);
assert.match(boot,/✦ TEDVIO AI/);
assert.match(boot,/shim\('tv74OpenAI','ai'\)/);

assert.match(client,/__TEDVIO_TEACHER686__/);
assert.doesNotMatch(client,/createClient\(/,'AI UI reuses Teacher Core auth/client');
assert.match(client,/fetch\('\/api\/tedvio-ai'/);
assert.match(client,/db\.auth\.getSession\(\)/);
assert.match(client,/authorization:`Bearer \$\{session\.access_token\}`/);
assert.match(client,/TEDVIO AI apoya decisiones docentes/);
assert.match(client,/data-tv74-save/,'generated questions require an explicit save action');
assert.match(client,/from\('v2_question_bank'\)\.insert/,'teacher can explicitly save reviewed AI drafts to Question Studio');
assert.match(client,/correct_answer:q\.options\[q\.correct_index\]/,'AI draft stores the actual correct option text expected by Question Studio');
assert.match(client,/create_reinforcement/);
assert.doesNotMatch(client,/setInterval\(|new MutationObserver/,'AI UI adds no polling or DOM observer');
assert.doesNotMatch(client,/service_role|SUPABASE_SECRET|sb_secret_/i,'AI UI exposes no privileged secret');

assert.match(api,/\/auth\/v1\/user/,'backend validates the teacher session with Supabase Auth');
assert.match(api,/v2_teacher_ai_context/,'backend uses the compact teacher-scoped RPC');
assert.match(api,/VERCEL_OIDC_TOKEN/,'backend supports Vercel AI Gateway OIDC');
assert.match(api,/AI_GATEWAY_API_KEY/);
assert.match(api,/OPENAI_API_KEY/,'server-only OpenAI key is an optional fallback');
assert.match(api,/https:\/\/ai-gateway\.vercel\.sh\/v1\/responses/);
assert.match(api,/https:\/\/api\.openai\.com\/v1\/responses/);
assert.match(api,/openai\/gpt-5\.6-luna/);
assert.match(api,/openai\/gpt-5\.6-terra/);
assert.match(api,/type:'json_schema'/,'model response is schema constrained');
assert.match(api,/store:false/);
assert.match(api,/sameOrigin\(request\)/,'AI POST is restricted to same-origin browser use');
assert.match(api,/MAX_REQUESTS=15/,'AI endpoint includes best-effort per-user abuse control');
assert.match(api,/compactPriority/);
assert.doesNotMatch(api,/service_role|SUPABASE_SECRET|sb_secret_/i,'backend contains no privileged Supabase key');
assert.doesNotMatch(api,/student_id|enrollment/,'model context never requests internal student IDs or enrollment numbers');
assert.doesNotMatch(api,/student_notes|\.note\b|observation/,'model context excludes teacher notes and free-text observations');
assert.match(api,/DATOS NO CONFIABLES/,'model instructions treat database text as untrusted data');
assert.match(api,/No infieras ni diagnostiques salud/,'model is instructed against sensitive-trait inference');
assert.match(api,/decisiones punitivas automáticas/,'model is not used for automated punitive academic decisions');
assert.match(api,/allowed=new Set\(\['open_group','open_grades','open_omr','take_attendance','create_reinforcement','none'\]\)/,'client-visible actions are allowlisted');

assert.match(migration,/create or replace function public\.v2_teacher_ai_context/);
assert.match(migration,/auth\.uid\(\)/);
assert.doesNotMatch(migration,/security definer/i,'AI context remains security invoker');
assert.match(migration,/revoke all on function public\.v2_teacher_ai_context\(uuid\) from public, anon/);
assert.match(migration,/grant execute on function public\.v2_teacher_ai_context\(uuid\) to authenticated/);
assert.doesNotMatch(migration,/\bdrop\b|\btruncate\b|\bdelete\b/i,'v74 AI migration is non-destructive');

assert.match(css,/data-tedvio-theme="dark"/);
assert.match(css,/@media\(max-width:720px\)/);
assert.match(css,/prefers-reduced-motion/);
assert.match(css,/var\(--tv687-surface/);

console.log('TEDVIO v74 AI Copilot regression: OK');
