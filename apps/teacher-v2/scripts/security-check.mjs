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
const authProvider = readApp('features/auth/AuthProvider.tsx');
const login = readApp('features/auth/LoginPage.tsx');
const callback = readApp('features/auth/AuthCallbackPage.tsx');
const gate = readApp('features/auth/LegalConsentGate.tsx');
const security = readApp('core/auth-security.ts');
const settings = readApp('core/settings.ts');
const vercel = JSON.parse(read('vercel.json'));
const packageJson = read('apps/teacher-v2/package.json');
const legalMigration = read('supabase/migrations/20260831170500_tedvio_v21_legal_rpc_privilege_hardening.sql');
const accessMigration = read('supabase/migrations/20260831162000_tedvio_v21_access_security.sql');
const disclosure = read('SECURITY.md');
const license = read('LICENSE');

const globalHeaders = vercel.headers?.find((entry) => entry.source === '/(.*)')?.headers || [];
const csp = globalHeaders.find((header) => header.key === 'Content-Security-Policy')?.value || '';
const reportOnly = globalHeaders.find((header) => header.key === 'Content-Security-Policy-Report-Only');
const routes = ['/teacher', '/teacher/', '/teacher-v2', '/teacher-v2/', '/teacher-v2/index.html', '/auth/confirm', '/auth/confirm/', '/auth/recovery', '/auth/recovery/'];
const headerFor = (source) => vercel.headers?.find((entry) => entry.source === source)?.headers || [];

must(security.includes('PASSWORD_MIN_LENGTH = 12'), 'política local exige al menos 12 caracteres');
must(security.includes('noIdentity') && security.includes('notCommon'), 'política evita identidad y contraseñas comunes');
must(authProvider.includes('resetPasswordForEmail') && authProvider.includes("type: 'signup'"), 'proveedor implementa recuperación y reenvío');
must(authProvider.includes('tedvio_legal_acceptances'), 'alta envía aceptaciones versionadas al servidor');
must(login.includes('PasswordChecklist') && login.includes('legalAcceptancePayload'), 'pantalla de alta muestra política y consentimiento');
must(login.includes('auth-honeypot') && login.includes('startAuthCooldown'), 'formularios públicos incorporan controles básicos contra abuso');
must(app.includes("physicalPath === '/auth/confirm'") && app.includes("physicalPath === '/auth/recovery'"), 'callbacks físicos no dependen del HashRouter');
must(callback.includes('updateRecoveredPassword') && callback.includes('Cerrar') === false, 'callback de recuperación actualiza la contraseña sin exponer credenciales');
must(gate.includes('acceptRequiredLegalDocuments') && gate.includes('He leído y acepto'), 'cuentas existentes deben aceptar documentos vigentes');
must(settings.includes('signOutOtherSessions') && settings.includes('changePassword'), 'Centro de cuenta conserva controles de sesión y contraseña');

must(csp.includes("default-src 'self'") && csp.includes("script-src 'self'") && csp.includes("frame-ancestors 'none'") && csp.includes("object-src 'none'"), 'CSP aplicada restringe scripts, frames y objetos');
must(!reportOnly, 'CSP ya no permanece únicamente en modo reporte');
must(globalHeaders.some((header) => header.key === 'Strict-Transport-Security'), 'HSTS está publicado');
must(globalHeaders.some((header) => header.key === 'X-Content-Type-Options' && header.value === 'nosniff'), 'MIME sniffing está bloqueado');
must(globalHeaders.some((header) => header.key === 'Permissions-Policy' && header.value.includes('camera=(self)')), 'permisos del navegador son mínimos y explícitos');
for (const route of routes) {
  const headers = headerFor(route);
  must(headers.some((header) => header.key === 'Cache-Control' && header.value.includes('no-store')), `${route} no conserva credenciales/callbacks en caché`);
  must(headers.some((header) => header.key === 'Content-Security-Policy'), `${route} recibe CSP canónica`);
}

must(/tedvio_required_legal_documents_v21\(\)[\s\S]*security invoker/i.test(legalMigration), 'lector legal público usa privilegios del llamador');
must(/revoke all on function public\.tedvio_accept_required_legal_v21\(text\)[\s\S]*from public, anon/i.test(legalMigration), 'aceptación legal pública no es ejecutable por anon');
must(/tedvio_private\.accept_required_legal_v21[\s\S]*security definer/i.test(legalMigration), 'escritura privilegiada vive en esquema privado');
must(accessMigration.includes('capture_signup_legal_consents_v21') && accessMigration.includes('LEGAL_ACCEPTANCE_REQUIRED'), 'alta valida todas las aceptaciones en el servidor');

must(packageJson.includes('"test:security"'), 'quality gate ejecuta la auditoría de seguridad');
must(disclosure.includes('divulgación') || disclosure.includes('vulnerabilidad'), 'repositorio documenta divulgación responsable');
must(license.includes('Propietario') || license.includes('PROPIETARIA') || license.includes('proprietary'), 'repositorio declara propiedad intelectual');
must(!/service_role|sb_secret_|SUPABASE_SERVICE_ROLE/i.test(`${authProvider}\n${login}\n${callback}\n${gate}\n${security}\n${settings}`), 'frontend no contiene credenciales privilegiadas');
must(!/OPENAI|AI_GATEWAY|gpt-/i.test(`${authProvider}\n${login}\n${callback}\n${gate}\n${security}`), 'acceso y cumplimiento no incorporan IA ni costo por tokens');

if (failures.length) {
  console.error(`\n${failures.length} regla(s) de seguridad fallaron.`);
  process.exit(1);
}

console.log('\nTEDVIO 2.1 access and security check passed.');
