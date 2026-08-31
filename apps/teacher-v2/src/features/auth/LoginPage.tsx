import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { LoadingScreen } from '../../shared/components';
import { Icon } from '../../shared/icons';

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message || 'No se pudo completar la operación.');
  }
  return 'No se pudo completar la operación.';
}

export function LoginPage() {
  const auth = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  if (auth.status === 'loading') return <LoadingScreen label="Recuperando tu sesión…" />;
  if (auth.status === 'authenticated') return <Navigate to="/" replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!email.trim() || password.length < 6) {
      setError('Escribe un correo válido y una contraseña de al menos 6 caracteres.');
      return;
    }

    setBusy(true);
    try {
      if (mode === 'signin') {
        await auth.signIn(email.trim(), password);
      } else {
        const result = await auth.signUp(email.trim(), password);
        if (result === 'confirmation-required') {
          setNotice('Cuenta creada. Revisa tu correo para confirmar el acceso.');
        }
      }
    } catch (caught) {
      setError(errorMessage(caught));
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
        <div className="login-card">
          <div className="login-mark"><img src="/assets/tedvio_official_isotipo.svg" alt="" /></div>
          <span className="eyebrow">ACCESO DOCENTE</span>
          <h2>{mode === 'signin' ? 'Bienvenido de nuevo' : 'Crear cuenta'}</h2>
          <p>{mode === 'signin' ? 'Ingresa con tus credenciales de TEDVIO.' : 'Registra tu acceso para comenzar.'}</p>

          <div className="segmented" aria-label="Tipo de acceso">
            <button type="button" className={mode === 'signin' ? 'active' : ''} onClick={() => setMode('signin')}>Ingresar</button>
            <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>Crear cuenta</button>
          </div>

          <form onSubmit={submit}>
            <label>
              Correo
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                inputMode="email"
                placeholder="tu@correo.com"
                required
              />
            </label>
            <label>
              Contraseña
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                placeholder="Mínimo 6 caracteres"
                minLength={6}
                required
              />
            </label>
            {error ? <div className="form-message error" role="alert">{error}</div> : null}
            {notice ? <div className="form-message success" role="status">{notice}</div> : null}
            <button className="button primary wide" type="submit" disabled={busy}>
              {busy ? 'Procesando…' : mode === 'signin' ? 'Entrar a TEDVIO' : 'Crear cuenta'}
            </button>
          </form>

          <a className="legacy-link" href="/teacher-legacy">
            Acceso de recuperación
          </a>
        </div>
      </section>
    </main>
  );
}