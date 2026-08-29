import fs from'node:fs';
import assert from'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8');
const teacher=read('teacher.html');
const boot=read('teacher-progressive-boot-v68.js');
const api=read('api/tedvio-ai.js');
const migration=read('supabase/migrations/20260828201138_v74_teacher_ai_context.sql');
const version=JSON.parse(read('version.json'));
const release=Number(String(version.version||'').split('.').at(-1)||0);

assert.ok(release>=741,'global release must preserve v74.1 or later');
assert.doesNotMatch(teacher,/teacher-ai-copilot-v74|teacher-insight-v742|api\/tedvio-ai/,'deep decision tools stay off first paint');
assert.match(api,/\/auth\/v1\/user/,'backend continues validating teacher sessions with Supabase Auth');
assert.match(api,/v2_teacher_ai_context/,'secure teacher-scoped context remains available');
assert.match(api,/sameOrigin\(request\)/,'decision endpoint stays same-origin');
assert.doesNotMatch(api,/service_role|SUPABASE_SECRET|sb_secret_/i,'backend contains no privileged Supabase key');
assert.doesNotMatch(api,/student_notes|\.note\b|observation/,'free-text teacher notes remain outside decision context');

if(release>=742){
  assert.equal(version.audit,'insight-zero-cost');
  assert.match(boot,/teacher-insight-v742\.js\?v=742/);
  assert.match(boot,/◎ TEDVIO Insight/);
  assert.doesNotMatch(boot,/\bai:\{styles:/,'generative AI loader is retired');
  for(const forbidden of[/ai-gateway/i,/api\.openai\.com/i,/OPENAI_API_KEY/,/AI_GATEWAY_API_KEY/,/VERCEL_OIDC_TOKEN/,/gpt-5/i,/json_schema/])assert.doesNotMatch(api,forbidden,'v74.2 must remain zero-cost');
  assert.match(api,/generative_ai:false/);
  assert.match(api,/inference_cost:0/);
  assert.match(api,/provider:'local-rules'/);
}else{
  assert.equal(version.audit,'ai-copilot-reliability');
}

assert.match(migration,/create or replace function public\.v2_teacher_ai_context/);
assert.match(migration,/auth\.uid\(\)/);
assert.doesNotMatch(migration,/security definer/i,'teacher context remains security invoker');
assert.match(migration,/revoke all on function public\.v2_teacher_ai_context\(uuid\) from public, anon/);
assert.match(migration,/grant execute on function public\.v2_teacher_ai_context\(uuid\) to authenticated/);
assert.doesNotMatch(migration,/\bdrop\b|\btruncate\b|\bdelete\b/i,'v74 context migration remains non-destructive');

console.log('TEDVIO v74 compatibility regression: OK');