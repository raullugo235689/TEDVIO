import fs from 'node:fs';
import path from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const src = path.join(root, 'src');
const repositoryRoot = path.resolve(root, '../..');
const read = (relative) => fs.readFileSync(path.join(repositoryRoot, relative), 'utf8');
const readApp = (relative) => fs.readFileSync(path.join(src, relative), 'utf8');
const failures = [];

function must(condition, message) {
  if (condition) console.log('OK  ', message);
  else {
    failures.push(message);
    console.error('FAIL', message);
  }
}

const app = readApp('app/App.tsx');
const main = readApp('main.tsx');
const login = readApp('features/auth/LoginPage.tsx');
const authProvider = readApp('features/auth/AuthProvider.tsx');
const authSecurity = readApp('core/auth-security.ts');
const onboardingCore = readApp('core/onboarding.ts');
const onboardingUi = readApp('features/onboarding/OnboardingExperience.tsx');
const navigation = readApp('app/navigation.tsx');
const onboardingCss = readApp('styles/onboarding.css');
const legalMigration = read('supabase/migrations/20260831170500_tedvio_v21_legal_rpc_privilege_hardening.sql');
const onboardingMigration = read('supabase/migrations/20260831173500_tedvio_v21_onboarding_demo_scope.sql');
const scope = read('PRODUCT-SCOPE-1.0.md');

must(app.includes('<OnboardingExperience>') && app.includes('<LegalConsentGate>'), 'onboarding se monta después del control legal y antes del AppShell');
must(main.includes("./styles/onboarding.css"), 'el frontend carga los estilos del onboarding');
must(onboardingCss.includes('@media(max-width:620px)') && onboardingCss.includes('prefers-reduced-motion'), 'onboarding contempla móvil y movimiento reducido');

must(login.includes("'recover'") && login.includes("'resend'"), 'acceso incluye recuperación y reenvío de confirmación');
must(login.includes('PasswordChecklist') && login.includes('passwordPolicy'), 'alta utiliza la política fuerte y su checklist');
must(login.includes('fetchRequiredLegalDocuments') && login.includes('legalAcceptancePayload'), 'alta exige documentos legales versionados');
must(login.includes('auth-honeypot') && login.includes('startAuthCooldown'), 'acceso incorpora honeypot y cooldown de correo');
must(authProvider.includes('resetPasswordForEmail') && authProvider.includes("type: 'signup'"), 'proveedor de sesión implementa recuperación y reenvío');
must(authSecurity.includes('PASSWORD_MIN_LENGTH = 12') && authSecurity.includes('noIdentity') && authSecurity.includes('notCommon'), 'política local exige 12 caracteres y evita identidad/secuencias comunes');

must(/tedvio_required_legal_documents_v21\(\)[\s\S]*security invoker/i.test(legalMigration), 'lector legal público es SECURITY INVOKER');
must(/tedvio_accept_required_legal_v21[\s\S]*security invoker/i.test(legalMigration), 'wrapper público de aceptación es SECURITY INVOKER');
must(/revoke all on function public\.tedvio_accept_required_legal_v21\(text\)[\s\S]*from public, anon/i.test(legalMigration), 'anon no puede aceptar documentos mediante el RPC público');
must(/tedvio_private\.accept_required_legal_v21[\s\S]*security definer/i.test(legalMigration), 'la escritura privilegiada permanece fuera del esquema API público');

for (const step of ['group', 'students', 'attendance', 'question', 'session']) {
  must(onboardingCore.includes(`id: '${step}'`), `onboarding incluye el paso ${step}`);
}
must(onboardingCore.includes("tedvio_onboarding_snapshot_v21") && onboardingCore.includes("tedvio_reset_demo_v21"), 'cliente usa snapshot y reinicio de demo v2.1');
must(onboardingUi.includes('Demo reiniciable') || onboardingUi.includes('DEMO REINICIABLE'), 'interfaz presenta una demostración reiniciable');
must(onboardingUi.includes("navigate(`/classroom/${demo.session_id}`)"), 'demo abre una sesión real dentro del frontend unificado');
must(onboardingMigration.includes('tedvio_onboarding_snapshot_v21') && onboardingMigration.includes('reset_demo_workspace_v21'), 'migración crea medición y reinicio de demo');
must(!/Tareas asincrónicas|Assignments/i.test(onboardingCore), 'servicio activo de onboarding no promete Tareas');
must(!/Tareas asincrónicas|Assignments/i.test(onboardingUi), 'interfaz activa de onboarding no promete Tareas');
must(!navigation.includes("to: '/assignments'") && !app.includes('AssignmentsPage'), 'router y navegación de lanzamiento excluyen Tareas');
must(scope.includes('Tareas/Assignments no forma parte de la promesa comercial inicial'), 'documento de alcance congela Tareas fuera de 1.0');

must(!/OPENAI|AI_GATEWAY|gpt-/i.test(`${login}\n${onboardingCore}\n${onboardingUi}`), 'P0 de lanzamiento no introduce IA ni costo por tokens');
must(!/service_role/i.test(`${login}\n${authProvider}\n${onboardingCore}\n${onboardingUi}`), 'frontend no contiene credenciales privilegiadas');

if (failures.length) {
  console.error(`\n${failures.length} regla(s) de preparación de lanzamiento fallaron.`);
  process.exit(1);
}

console.log('\nTEDVIO 2.1 P0 launch readiness check passed.');
