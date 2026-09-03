import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import {
  authErrorMessage,
  fetchRequiredLegalDocuments,
  isValidEmail,
  legalAcceptancePayload,
  legalVersionKey,
  passwordPolicy,
  remainingAuthCooldown,
  startAuthCooldown,
  type AuthCooldownAction,
  type RequiredLegalDocument,
} from '../../core/auth-security';
import { LoadingScreen } from '../../shared/components';
import { Icon } from '../../shared/icons';
import { LegalDocumentModal } from './LegalDocumentModal';
import { PasswordChecklist } from './PasswordChecklist';
import { useAuth } from './AuthProvider';

type AccessMode = 'signin' | 'signup' | 'recover' | 'resend';

function modeTitle(mode: AccessMode): string {
  if (mode === 'signup') return 'Crear cuenta';
  if (mode === 'recover') return 'Recuperar contraseña';
  if (mode === 'resend') return 'Reenviar confirmación';
  return 'Bienvenido de nuevo';
}

function modeDetail(mode: AccessMode): string {
  if (mode === 'signup') return 'Crea tu espacio docente y revisa las condiciones vigentes.';
  if (mode === 'recover') return 'Te enviaremos un enlace de un solo uso para crear una nueva contraseña.';
  if (mode === 'resend') return 'Solicita otro enlace para confirmar tu correo.';
  return 'Ingresa con tus credenciales de TEDVIO.';
}

export function LoginPage() {
  const auth = useAuth();
  const location = useLocation();
  const [mode, setMode] = useState<AccessMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [documents, setDocuments] = useState<RequiredLegalDocument[]>([]);
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const [openDocument, setOpenDocument] = useState<RequiredLegalDocument | null>(null);
  const [legalLoading, setLegalLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);

  const policy = useMemo(() => passwordPolicy(password, email), [email, password]);
  const allLegalAccepted = documents.length > 0
    && documents.every((document) => accepted[legalVersionKey(document)]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('reset') === '1') setNotice('Contraseña actualizada. Ingresa nuevamente con tu nueva contraseña.');
    if (params.get('confirmed') === '1') setNotice('Correo confirmado. Ya puedes ingresar a TEDVIO.');
  }, [location.search]);

  useEffect(() => {
    if (mode !== 'signup' || documents.length || legalLoading) return;
    let active = true;
    setLegalLoading(true);
    fetchRequiredLegalDocuments()
      .then((nextDocuments) => {
        if (!active) return;
        setDocuments(nextDocuments);
        setAccepted(Object.fromEntries(nextDocuments.map((document) => [legalVersionKey(document), false])));
      })
      .catch((caught) => {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : 'No se pudieron cargar los documentos legales.');
      })
      .finally(() => {
        if (active) setLegalLoading(false);
      });
    return () => { active = false; };
  }, [documents.length, legalLoading, mode]);

  useEffect(() => {
    if (mode !== 'recover' && mode !== 'resend') {
      setCooldown(0);
      return undefined;
    }
    const action = mode as AuthCooldownAction;
    let timer: number | undefined;
    let active = true;
    const update = () => {
      if (!active) return;
      const remaining = remainingAuthCooldown(action);
      setCooldown(remaining);
      if (remaining > 0) timer = window.setTimeout(update, 1000);
    };
    update();
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [mode]);

  useEffect(() => {
    const markOnline = () => setOnline(true);
    const markOffline = () => setOnline(false);
    window.addEventListener('online', markOnline);
    window.addEventListener('offline', markOffline);
    return () => {
      window.removeEventListener('online', markOnline);
      window.removeEventListener('offline', markOffline);
    };
  }, []);

  if (auth.status === 'loading') return <LoadingScreen label="Recuperando tu sesión…" />;
  if (auth.status === 'authenticated') return <Navigate to="/" replace />;

  function changeMode(nextMode: AccessMode) {
    setMode(nextMode);
    setPassword('');
    setError('');
    setNotice('');
    if (nextMode === 'recover' || nextMode === 'resend') {
      setCooldown(remainingAuthCooldown(nextMode));
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');

    if (honeypot) {
      setNotice('Si el correo puede recibir este mensaje, llegará en unos minutos.');
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!isValidEmail(normalizedEmail)) {
      setError('Escribe un correo válido.');
      return;
    }

    if ((mode === 'recover' || mode === 'resend') && cooldown > 0) {
      setError(`Espera ${cooldown} segundo${cooldown === 1 ? '' : 's'} antes de solicitar otro correo.`);
      return;
    }

    if (mode === 'signin' && !password) {
      setError('Escribe tu contraseña.');
      return;
    }

    if (mode === 'signup') {
      if (!policy.valid) {
        setError('La contraseña todavía no cumple todos los requisitos de seguridad.');
        return;
      }
      if (!allLegalAccepted) {
        setError('Abre y acepta cada documento vigente para crear la cuenta.');
        return;
      }
    }

    setBusy(true);
    try {
      if (mode === 'signin') {
        await auth.signIn(normalizedEmail, password);
      } else if (mode === 'signup') {
        const result = await auth.signUp(
          normalizedEmail,
          password,
          legalAcceptancePayload(documents),
        );
        if (result === 'confirmation-required') {
          setNotice('Cuenta creada. Revisa tu correo y confirma el acceso antes de ingresar.');
          setMode('signin');
          setPassword('');
        }
      } else if (mode === 'recover') {
        await auth.requestPasswordReset(normalizedEmail);
        const seconds = startAuthCooldown('recover', 60);
        setCooldown(seconds);
        setNotice('Si existe una cuenta asociada, recibirás un enlace de recuperación en unos minutos.');
      } else {
        await auth.resendConfirmation(normalizedEmail);
        const seconds = startAuthCooldown('resend', 60);
        setCooldown(seconds);
        setNotice('Si el correo requiere confirmación, recibirás un nuevo enlace en unos minutos.');
      }
    } catch (caught) {
      setError(authErrorMessage(caught, mode === 'recover' ? 'recover' : mode === 'resend' ? 'resend' : mode));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-story" aria-labelledby="login-title">
        <a className="login-brand" href="/teacher" aria-label="TEDVIO Inicio">
          <img src="/assets/tedvio_official_horizontal.svg" alt="TEDVIO" />
        </a>
        <div className="login-story-copy">
          <span className="eyebrow">PLATAFORMA PARA LA GESTIÓN DOCENTE</span>
          <h1 id="login-title">Todo tu trabajo docente, en un solo lugar.</h1>
          <p>
            Organiza grupos, asistencia, clases, evaluaciones, calificaciones y seguimiento académico con una experiencia clara y continua.
          </p>
          <div className="login-benefits">
            <article><Icon name="calendar" /><div><b>Organiza tu jornada</b><span>Agenda, grupos y asistencia siempre a la mano.</span></div></article>
            <article><Icon name="exam" /><div><b>Evalúa con claridad</b><span>Banco, evaluaciones, OMR y libro conectados.</span></div></article>
            <article><Icon name="shield" /><div><b>Da seguimiento</b><span>Periodos, reportes y Alumno 360° con trazabilidad.</span></div></article>
          </div>
        </div>
        <small>TEDVIO · Gestión docente y evaluación académica</small>
      </section>

      <section className="login-panel">
        <div className="login-card auth-access-card">
          <div className="login-mark"><img src="/assets/tedvio_official_isotipo.svg" alt="" /></div>
          <span className="eyebrow">ACCESO DOCENTE</span>
          <h2>{modeTitle(mode)}</h2>
          <p>{modeDetail(mode)}</p>

          {!online ? (
            <div className="auth-access-status offline" role="status">
              <Icon name="alert" />
              <div><b>Sin conexión</b><span>Recupera la señal para ingresar. No necesitas volver a escribir tus datos.</span></div>
            </div>
          ) : null}

          {auth.accessIssue ? (
            <div className="auth-access-status recoverable" role="alert">
              <Icon name="shield" />
              <div>
                <b>La sesión guardada necesita atención</b>
                <span>{auth.accessIssue.message}</span>
                <small>Referencia: {auth.accessIssue.code}</small>
              </div>
              <div className="auth-access-status-actions">
                <button type="button" onClick={() => void auth.retrySession()}>Reintentar</button>
                <button type="button" onClick={() => void auth.clearLocalSession()}>Limpiar sesión</button>
              </div>
            </div>
          ) : null}

          {(mode === 'signin' || mode === 'signup') ? (
            <div className="segmented" aria-label="Tipo de acceso">
              <button type="button" className={mode === 'signin' ? 'active' : ''} onClick={() => changeMode('signin')}>Ingresar</button>
              <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => changeMode('signup')}>Crear cuenta</button>
            </div>
          ) : null}

          <form onSubmit={submit}>
            <label className="auth-honeypot" aria-hidden="true">
              Sitio web
              <input tabIndex={-1} autoComplete="off" value={honeypot} onChange={(event) => setHoneypot(event.target.value)} />
            </label>
            <label>
              Correo
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                inputMode="email"
                placeholder="tu@correo.com"
                maxLength={254}
                required
              />
            </label>

            {(mode === 'signin' || mode === 'signup') ? (
              <label>
                Contraseña
                <span className="auth-password-field">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    onKeyUp={(event) => setCapsLock(event.getModifierState('CapsLock'))}
                    onKeyDown={(event) => setCapsLock(event.getModifierState('CapsLock'))}
                    autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                    placeholder={mode === 'signup' ? '12 caracteres o más' : 'Tu contraseña'}
                    minLength={mode === 'signup' ? 12 : 1}
                    maxLength={128}
                    required
                  />
                  <button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                    {showPassword ? 'Ocultar' : 'Mostrar'}
                  </button>
                </span>
                {capsLock ? <small className="auth-caps-warning">Bloq Mayús está activado.</small> : null}
              </label>
            ) : null}

            {mode === 'signup' ? <PasswordChecklist policy={policy} /> : null}

            {mode === 'signup' ? (
              legalLoading ? <div className="auth-inline-loading">Cargando documentos vigentes…</div> : (
                <div className="legal-consent-list">
                  <div className="legal-consent-heading"><b>Condiciones de uso</b><span>Debes revisar y aceptar cada versión para continuar.</span></div>
                  {documents.map((document) => {
                    const key = legalVersionKey(document);
                    return (
                      <article key={key}>
                        <label>
                          <input
                            type="checkbox"
                            checked={Boolean(accepted[key])}
                            onChange={(event) => setAccepted((current) => ({ ...current, [key]: event.target.checked }))}
                          />
                          <span>Acepto {document.title} · v{document.version}</span>
                        </label>
                        <button className="auth-text-button" type="button" onClick={() => setOpenDocument(document)}>Leer</button>
                      </article>
                    );
                  })}
                </div>
              )
            ) : null}

            {error ? <div className="form-message error" role="alert">{error}</div> : null}
            {notice ? <div className="form-message success" role="status">{notice}</div> : null}

            <button
              className="button primary wide"
              type="submit"
              disabled={!online || busy || legalLoading || ((mode === 'recover' || mode === 'resend') && cooldown > 0)}
            >
              {busy
                ? 'Procesando…'
                : mode === 'signin'
                  ? 'Entrar a TEDVIO'
                  : mode === 'signup'
                    ? 'Crear cuenta'
                    : mode === 'recover'
                      ? cooldown > 0 ? `Reintentar en ${cooldown}s` : 'Enviar enlace de recuperación'
                      : cooldown > 0 ? `Reintentar en ${cooldown}s` : 'Reenviar confirmación'}
            </button>
          </form>

          <div className="auth-help-actions">
            {mode === 'signin' ? (
              <>
                <button className="auth-text-button" type="button" onClick={() => changeMode('recover')}>Olvidé mi contraseña</button>
                <button className="auth-text-button" type="button" onClick={() => changeMode('resend')}>Reenviar confirmación</button>
              </>
            ) : null}
            {(mode === 'recover' || mode === 'resend') ? <button className="auth-text-button" type="button" onClick={() => changeMode('signin')}>Volver al acceso</button> : null}
          </div>

          <a className="legacy-link" href="/teacher-legacy">Acceso de recuperación</a>
        </div>
      </section>

      {openDocument ? <LegalDocumentModal document={openDocument} onClose={() => setOpenDocument(null)} /> : null}
    </main>
  );
}
