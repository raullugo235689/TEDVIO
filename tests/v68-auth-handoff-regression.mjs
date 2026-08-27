import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const teacher=read('teacher.html'),beta=read('beta.html'),teacherCore=read('teacher-core-v68-6.js'),shim=read('auth-handoff-v68-3.js'),vercel=read('vercel.json');
let failed=0;const must=(ok,msg)=>{if(ok)console.log('OK  ',msg);else{console.error('FAIL',msg);failed++}};
must(!teacher.includes('auth-handoff-v68-3.js')&&!teacher.includes('beta-auth-fix.js')&&!teacher.includes('beta.js?v=56'),'split teacher removes legacy auth-handoff stack entirely');
must(teacher.includes('teacher-core-v68-6.js?v=686'),'teacher auth is owned by dedicated v68.6 core');
must(teacherCore.includes("db.auth.signInWithPassword({email,password})")&&teacherCore.includes("btn.textContent='Entrando…'"),'Teacher Core performs direct login with immediate feedback');
must(teacherCore.includes("db.auth.signUp")&&teacherCore.includes("emailRedirectTo:`${location.origin}/teacher`"),'Teacher Core owns signup/redirect');
must(teacherCore.includes("#authPass")&&teacherCore.includes("if(e.key==='Enter')"),'password Enter triggers split-core login');
must(teacherCore.includes("db.auth.onAuthStateChange")&&teacherCore.includes('setTimeout(()=>{if(S.user)'),'auth state handoff remains non-blocking in Teacher Core');
must(beta.includes('auth-handoff-v68-3.js?v=683')&&beta.indexOf('auth-handoff-v68-3.js?v=683')<beta.indexOf('beta.js?v=56'),'beta rollback route keeps v68.3 deadlock protection before beta.js');
must(shim.includes("Object.getPrototypeOf(probe.auth)")&&shim.includes("proto.onAuthStateChange=function(callback)")&&shim.includes('return undefined'),'rollback auth-handoff still defers callbacks');
must(shim.includes('__TEDVIO_AUTH_HANDOFF_683__'),'rollback handoff remains idempotent');
must(vercel.includes('/auth-handoff-v68-3.js')&&vercel.includes('/teacher-core-v68-6.js'),'both rollback and split auth assets are no-store');
must(!/service_role|SUPABASE_SECRET|sb_secret_|access_token|refresh_token/i.test(shim+teacherCore),'auth code contains no privileged credentials/session tokens');
if(failed){console.error(`\n${failed} auth regression check(s) failed.`);process.exit(1)}
console.log('\nTEDVIO auth handoff contract passes under v68.6 Teacher Core Split.');