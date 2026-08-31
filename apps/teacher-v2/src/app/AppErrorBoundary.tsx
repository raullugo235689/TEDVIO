import { Component, type ErrorInfo, type ReactNode } from 'react';
import { recordClientEvent } from '../core/reliability';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  reference: string | null;
}

const DIAGNOSTIC_KEY = 'tedvio.reliability.last_fatal_error';

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null, reference: null };

  static getDerivedStateFromError(error: Error): State {
    return { error, reference: null };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('TEDVIO application boundary', error, info);
    const reference = recordClientEvent({
      eventType: 'application_boundary_error',
      error,
      context: { component_stack: info.componentStack },
    });
    this.setState({ reference });

    try {
      localStorage.setItem(
        DIAGNOSTIC_KEY,
        JSON.stringify({
          reference,
          at: new Date().toISOString(),
          path: `${window.location.pathname}${window.location.hash}`,
          message: String(error.message || 'Error de aplicación').slice(0, 500),
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
            Tus datos no se eliminaron. El incidente quedó registrado o se enviará al recuperar la conexión.
          </p>
          <strong className="fatal-reference">{this.state.reference || 'Generando referencia…'}</strong>
          <div className="fatal-actions">
            <button type="button" className="button primary" onClick={() => window.location.reload()}>
              Recargar TEDVIO
            </button>
            <a className="button secondary" href="/teacher-legacy">
              Abrir respaldo temporal
            </a>
          </div>
          <small>Comparte la referencia con soporte si el problema vuelve a aparecer.</small>
        </section>
      </main>
    );
  }
}
