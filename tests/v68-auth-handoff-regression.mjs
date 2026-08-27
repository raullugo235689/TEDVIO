import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const teacher=read('teacher.html'),beta=read('beta.html'),shim=read('auth-handoff-v68-3.js'),vercel=read('vercel.json');
let failed=0;const must=(ok,msg)=>{if(ok)console.log('OK  ',msg);else{console.error('FAIL',msg);failed++}};
for(const [name,html] of [['teacher',teacher],['beta',beta]]){
  must(html.includes('auth-handoff-v68-3.js?v=683'),`${name} shell loads auth handoff v68.3`);
  must(html.indexOf('auth-handoff-v68-3.js?v=683')<html.indexOf('beta-auth-fix.js?v=56'),`${name} auth handoff loads before signup/auth fix`);
  must(html.indexOf('auth-handoff-v68-3.js?v=683')<html.indexOf('beta.js?v=56'),`${name} auth handoff loads before legacy beta auth listener`);
}
must(shim.includes("Object.getPrototypeOf(probe.auth)"),'auth handoff patches the shared GoTrue auth prototype');
must(shim.includes("proto.onAuthStateChange=function(callback)"),'auth handoff wraps onAuthStateChange registrations');
must(shim.includes("setTimeout(()=>")&&shim.includes("return undefined"),'auth callbacks are released synchronously and deferred to a later task');
must(shim.includes('__TEDVIO_AUTH_HANDOFF_683__'),'auth prototype patch is idempotent');
must(shim.includes("button.textContent='Entrando…'")&&shim.includes("aria-busy"),'login gives immediate visible feedback');
must(shim.includes("event.key!=='Enter'")&&shim.includes("#authLogin')?.click()"),'password Enter key triggers login');
must(vercel.includes('/auth-handoff-v68-3.js')&&vercel.includes('no-store, no-cache, must-revalidate'),'auth handoff asset is explicitly no-store');
must(!/service_role|SUPABASE_SECRET|sb_secret_|access_token|refresh_token/i.test(shim),'auth handoff contains no privileged credentials or session tokens');
if(failed){console.error(`\n${failed} auth handoff regression check(s) failed.`);process.exit(1)}
console.log('\nTEDVIO v68.3 Auth Handoff regression audit passed.');
