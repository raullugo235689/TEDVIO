import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

const DIAGNOSTIC_KEY = 'tedvio.phase6.last_error';

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('TEDVIO application boundary', error, info);
    try {
      localStorage.setItem(
        DIAGNOSTIC_KEY,
        JSON.stringify({
          at: new Date().toISOString(),
          path: `${window.location.pathname}${window.location.hash}`,
          message: String(error.message || 'Error de aplicación').slice(0, 500),
          componentStack: String(info.componentStack || '').slice(0, 2500),
        }),
      );
    } catch {
      // El diagnóstico local es opcional y nunca debe impedir la recuperación.
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="fatal-screen" role="alert">
        <section className="fatal-card">
          <img src="/assets/tedvio_official_horizontal.svg" alt="TEDVIO" />
          <span>RECUPERACIÓN SEGURA</span>
          <h1>TEDVIO no pudo completar esta pantalla.</h1>
          <p>
            Tus datos no se eliminaron. Recarga la aplicación para intentar nuevamente o utiliza temporalmente la versión anterior.
          </p>
          <div className="fatal-actions">
            <button type="button" className="button primary" onClick={() => window.location.reload()}>
              Recargar TEDVIO
            </button>
            <a className="button secondary" href="/teacher-legacy">
              Abrir versión anterior
            </a>
          </div>
          <small>El diagnóstico técnico se guardó únicamente en este dispositivo.</small>
        </section>
      </main>
    );
  }
}
