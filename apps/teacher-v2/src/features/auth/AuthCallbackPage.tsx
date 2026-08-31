import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { authErrorMessage, passwordPolicy } from '../../core/auth-security';
import { LoadingScreen } from '../../shared/components';
import { useAuth } from './AuthProvider';
import { PasswordChecklist } from './PasswordChecklist';

export function AuthCallbackPage({ kind }: { kind: 'confirmation' | 'recovery' }) {
  const auth = useAuth();
  const [settled, setSettled] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const policy = useMemo(() => passwordPolicy(password, auth.user?.email || ''), [auth.user?.email, password]);

  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(true), 2500);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (kind !== 'confirmation' || auth.status !== 'authenticated') return undefined;
    const timer = window.setTimeout(() => {
      window.location.replace('/teacher#/?confirmed=1');
    }, 650);
    return () => window.clearTimeout(timer);
  }, [auth.status, kind]);

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!policy.valid) {
      setError('La contraseña todavía no cumple todos los requisitos de seguridad.');
      return;
    }
    if (password !== confirmation) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setBusy(true);
    try {
      await auth.updateRecoveredPassword(password);
      window.location.replace('/teacher#/login?reset=1');
    } catch (caught) {
      setError(authErrorMessage(caught, 'update-password'));
    } finally {
      setBusy(false);
    }
  }

  if (auth.status === 'loading' || (!settled && auth.status === 'anonymous')) {
    return <LoadingScreen label={kind === 'recovery' ? 'Validando enlace de recuperación…' : 'Confirmando tu correo…'} />;
  }

  if (kind === 'confirmation' && auth.status === 'authenticated') {
    return <LoadingScreen label="Correo confirmado. Abriendo TEDVIO…" />;
  }

  const recoveryReady = kind === 'recovery' && auth.status === 'authenticated' && auth.recoveryMode;

  return (
    <main className="auth-callback-page">
      <section className="auth-callback-card">
        <a className="login-brand" href="/teacher" aria-label="TEDVIO Inicio">
          <img src="/assets/tedvio_official_horizontal.svg" alt="TEDVIO" />
        </a>

        {recoveryReady ? (
          <>
            <span className="eyebrow">RECUPERACIÓN VALIDADA</span>
            <h1>Crea una nueva contraseña</h1>
            <p>El enlace es de un solo uso. Al guardar, TEDVIO cerrará las demás sesiones y te pedirá ingresar nuevamente.</p>
            <form onSubmit={updatePassword}>
              <label>
                Nueva contraseña
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  required
                />
              </label>
              <label>
                Confirmar contraseña
                <input
                  type="password"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  required
                />
              </label>
              <PasswordChecklist policy={policy} />
              {error ? <div className="form-message error" role="alert">{error}</div> : null}
              <button className="button primary wide" type="submit" disabled={busy}>
                {busy ? 'Actualizando…' : 'Guardar nueva contraseña'}
              </button>
            </form>
          </>
        ) : (
          <>
            <span className="eyebrow">ENLACE NO DISPONIBLE</span>
            <h1>{kind === 'recovery' ? 'La recuperación no pudo validarse' : 'La confirmación no pudo completarse'}</h1>
            <p>{authErrorMessage(null, 'callback')}</p>
            <a className="button primary wide auth-anchor-button" href="/teacher#/login">Volver al acceso</a>
          </>
        )}

        <small>No compartas enlaces de confirmación o recuperación. TEDVIO nunca solicitará tu contraseña por correo.</small>
      </section>
    </main>
  );
}
