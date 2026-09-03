import { supabase } from './supabase';

export const PASSWORD_MIN_LENGTH = 12;

export type AuthOperation =
  | 'signin'
  | 'signup'
  | 'recover'
  | 'resend'
  | 'update-password'
  | 'callback';

export type AuthCooldownAction = 'recover' | 'resend';

export interface PasswordPolicyResult {
  minLength: boolean;
  lowercase: boolean;
  uppercase: boolean;
  number: boolean;
  symbol: boolean;
  noWhitespace: boolean;
  noIdentity: boolean;
  notCommon: boolean;
  valid: boolean;
}

export interface RequiredLegalDocument {
  document_key: string;
  version: string;
  title: string;
  summary: string;
  text: string;
  effective_at: string | null;
  required: boolean;
}

export interface LegalAcceptanceInput {
  document_key: string;
  document_version: string;
  accepted: true;
}

const COMMON_PASSWORDS = new Set([
  '123456789012',
  '1234567890',
  'qwertyuiop12',
  'password1234',
  'contraseña123',
  'administrador',
  'admin123456',
  'tedvio123456',
  'universidad1',
]);

const COMMON_FRAGMENTS = [
  'password',
  'contraseña',
  'qwerty',
  'asdfgh',
  '123456',
  'abcdef',
  'admin',
  'tedvio',
];

const COOLDOWN_PREFIX = 'tedvio.auth.cooldown.v21';

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function errorCode(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  const value = error as { code?: unknown; status?: unknown; name?: unknown };
  return String(value.code || value.status || value.name || '').toLowerCase();
}

function errorText(error: unknown): string {
  if (!error || typeof error !== 'object') return String(error || '').toLowerCase();
  const value = error as { message?: unknown; error_description?: unknown };
  return String(value.message || value.error_description || '').toLowerCase();
}

export function isValidEmail(value: string): boolean {
  const email = normalizeEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

export function passwordPolicy(password: string, email = ''): PasswordPolicyResult {
  const lower = password.toLocaleLowerCase('es-MX');
  const emailLocal = normalizeEmail(email).split('@')[0]?.replace(/[^a-z0-9]/g, '') || '';
  const compact = lower.replace(/[^a-z0-9áéíóúüñ]/g, '');
  const noIdentity = emailLocal.length < 4 || !compact.includes(emailLocal);
  const notCommon = !COMMON_PASSWORDS.has(lower)
    && !COMMON_FRAGMENTS.some((fragment) => lower.includes(fragment));

  const result: PasswordPolicyResult = {
    minLength: password.length >= PASSWORD_MIN_LENGTH,
    lowercase: /[a-záéíóúüñ]/.test(password),
    uppercase: /[A-ZÁÉÍÓÚÜÑ]/.test(password),
    number: /\d/.test(password),
    symbol: /[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9\s]/.test(password),
    noWhitespace: !/\s/.test(password),
    noIdentity,
    notCommon,
    valid: false,
  };

  result.valid = result.minLength
    && result.lowercase
    && result.uppercase
    && result.number
    && result.symbol
    && result.noWhitespace
    && result.noIdentity
    && result.notCommon;

  return result;
}

export function assertStrongPassword(password: string, email = ''): void {
  if (!passwordPolicy(password, email).valid) {
    throw new Error(
      `Usa al menos ${PASSWORD_MIN_LENGTH} caracteres con mayúscula, minúscula, número y símbolo; evita espacios, datos personales y contraseñas comunes.`,
    );
  }
}

export function authErrorMessage(error: unknown, operation: AuthOperation): string {
  const code = errorCode(error);
  const text = errorText(error);
  const combined = `${code} ${text}`;

  if (/auth_offline/.test(combined)) {
    return 'No hay conexión a internet. TEDVIO conservará tus datos; vuelve a intentar cuando recuperes la señal.';
  }
  if (/auth_(signin|session|clear)_timeout|tedvioauthtimeout/.test(combined)) {
    return 'El servicio de acceso tardó más de lo esperado. Tu contraseña no fue expuesta; revisa la conexión y vuelve a intentar.';
  }
  if (/auth_session_missing/.test(combined)) {
    return 'La cuenta fue validada, pero el navegador no pudo guardar la sesión. Limpia la sesión de este dispositivo e intenta nuevamente.';
  }
  if (/rate|too many|over_request|email_rate/.test(combined)) {
    return 'Se alcanzó el límite temporal de seguridad. Espera al menos un minuto antes de intentarlo de nuevo.';
  }
  if (/email_not_confirmed|email not confirmed/.test(combined)) {
    return 'El correo todavía no está confirmado. Revisa tu bandeja o solicita un nuevo enlace de confirmación.';
  }
  if (/weak_password|password.*weak/.test(combined)) {
    return `La contraseña no cumple la política de seguridad de TEDVIO. Usa al menos ${PASSWORD_MIN_LENGTH} caracteres variados.`;
  }
  if (/same_password|same password/.test(combined)) {
    return 'La nueva contraseña debe ser diferente de la anterior.';
  }
  if (/legal_acceptance/.test(combined)) {
    return 'Debes revisar y aceptar los documentos legales vigentes para crear la cuenta.';
  }
  if (/invalid.*email|email.*invalid/.test(combined)) {
    return 'Escribe un correo válido.';
  }
  if (operation === 'signin') {
    return 'No fue posible iniciar sesión. Verifica tus credenciales o utiliza la recuperación de contraseña.';
  }
  if (operation === 'recover' || operation === 'resend') {
    return 'No fue posible enviar el correo en este momento. Espera un minuto y vuelve a intentarlo.';
  }
  if (operation === 'signup') {
    return 'No fue posible crear la cuenta. Revisa los datos, la contraseña y las aceptaciones requeridas.';
  }
  if (operation === 'update-password') {
    return 'No fue posible actualizar la contraseña. Solicita un nuevo enlace de recuperación si el actual expiró.';
  }
  return 'El enlace no pudo validarse o ya expiró. Solicita uno nuevo desde el acceso de TEDVIO.';
}

export function authRedirect(pathname: '/auth/confirm' | '/auth/recovery'): string {
  return `${window.location.origin}${pathname}`;
}

function textFromHtml(value: string): string {
  const prepared = String(value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|section|article)>/gi, '\n\n');
  if (typeof DOMParser === 'undefined') {
    return prepared.replace(/<[^>]*>/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  }
  const parsed = new DOMParser().parseFromString(prepared, 'text/html');
  return String(parsed.body.textContent || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function legalVersionKey(document: Pick<RequiredLegalDocument, 'document_key' | 'version'>): string {
  return `${document.document_key}@${document.version}`;
}

export function legalAcceptancePayload(documents: RequiredLegalDocument[]): LegalAcceptanceInput[] {
  return documents.map((document) => ({
    document_key: document.document_key,
    document_version: document.version,
    accepted: true,
  }));
}

export async function fetchRequiredLegalDocuments(): Promise<RequiredLegalDocument[]> {
  const { data, error } = await supabase.rpc('tedvio_required_legal_documents_v21');
  if (error) throw new Error('No se pudieron cargar los documentos legales vigentes.');
  const rows = Array.isArray(data) ? data : [];
  const documents = rows.map((row) => {
    const value = row as Record<string, unknown>;
    return {
      document_key: String(value.document_key || ''),
      version: String(value.version || ''),
      title: String(value.title || 'Documento legal'),
      summary: String(value.summary || ''),
      text: textFromHtml(String(value.content_html || '')),
      effective_at: value.effective_at ? String(value.effective_at) : null,
      required: Boolean(value.required),
    } satisfies RequiredLegalDocument;
  }).filter((document) => document.document_key && document.version && document.required);

  if (!documents.length) throw new Error('TEDVIO no encontró documentos legales publicados.');
  return documents;
}

export async function fetchAcceptedLegalVersions(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('tedvio_user_consents')
    .select('document_key,document_version')
    .eq('user_id', userId)
    .limit(200);
  if (error) throw new Error('No se pudo comprobar el estado de las aceptaciones.');
  return new Set((data || []).map((row) => `${row.document_key}@${row.document_version}`));
}

export async function acceptRequiredLegalDocuments(source = 'teacher_v2_gate'): Promise<number> {
  const { data, error } = await supabase.rpc('tedvio_accept_required_legal_v21', {
    p_source: source,
  });
  if (error) throw new Error('No se pudo registrar la aceptación. Vuelve a intentarlo.');
  return Number(data || 0);
}

export function remainingAuthCooldown(action: AuthCooldownAction): number {
  if (typeof window === 'undefined') return 0;
  try {
    const expiresAt = Number(window.localStorage.getItem(`${COOLDOWN_PREFIX}.${action}`) || 0);
    return Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
  } catch {
    return 0;
  }
}

export function startAuthCooldown(action: AuthCooldownAction, seconds = 60): number {
  const safeSeconds = Math.max(30, Math.min(300, Math.round(seconds)));
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(`${COOLDOWN_PREFIX}.${action}`, String(Date.now() + safeSeconds * 1000));
    } catch {
      // El límite del servidor sigue vigente aunque localStorage no esté disponible.
    }
  }
  return safeSeconds;
}
