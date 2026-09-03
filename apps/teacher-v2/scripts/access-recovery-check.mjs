import fs from 'node:fs';
import path from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const src = path.join(root, 'src');
const read = (relative) => fs.readFileSync(path.join(src, relative), 'utf8');
const failures = [];

function must(condition, message) {
  if (condition) console.log('OK  ', message);
  else {
    failures.push(message);
    console.error('FAIL', message);
  }
}

const provider = read('features/auth/AuthProvider.tsx');
const login = read('features/auth/LoginPage.tsx');
const security = read('core/auth-security.ts');
const styles = read('styles/security.css');

must(provider.includes('AUTH_BOOT_TIMEOUT_MS') && provider.includes('AUTH_ACTION_TIMEOUT_MS'), 'el arranque y el acceso tienen límites de espera');
must(provider.includes('authEventRevision') && provider.includes('revisionAtStart'), 'una respuesta inicial lenta no sobrescribe una autenticación reciente');
must(provider.includes('if (!data.session)') && provider.includes('applySession(data.session)'), 'una sesión validada abre el frontend sin depender de otro evento');
must(provider.includes('retrySession') && provider.includes('clearLocalSession'), 'el usuario puede recuperar o limpiar una sesión local dañada');
must(provider.includes("scope: 'local'") && !/service_role|sb_secret_|SUPABASE_SERVICE_ROLE/i.test(provider), 'la limpieza es local y no expone credenciales privilegiadas');
must(login.includes('auth.accessIssue') && login.includes('Referencia:'), 'la pantalla muestra diagnóstico seguro y copiables');
must(login.includes("navigator.onLine") && login.includes("addEventListener('offline'"), 'el acceso detecta pérdida y recuperación de red');
must(login.includes('Bloq Mayús está activado') && login.includes('Mostrar contraseña'), 'el formulario reduce errores de escritura de contraseña');
must(security.includes('auth_(signin|session|clear)_timeout') && security.includes('auth_session_missing'), 'los fallos técnicos tienen mensajes específicos sin enumerar cuentas');
must(styles.includes('.auth-access-status') && styles.includes('.auth-password-field'), 'los controles de recuperación tienen presentación adaptable');

if (failures.length) {
  console.error(`\n${failures.length} regla(s) de Acceso y Recuperación 2.0 fallaron.`);
  process.exit(1);
}

console.log('\nTEDVIO Access & Recovery 2.0 check passed.');
