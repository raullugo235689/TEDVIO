import { Component, type ErrorInfo, type ReactNode } from 'react';
import { recordClientEvent } from '../core/reliability';

interface Props {
  children: ReactNode;
  resetKey: string;
}

interface State {
  error: Error | null;
  reference: string | null;
}

export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null, reference: null };

  static getDerivedStateFromError(error: Error): State {
    return { error, reference: null };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const reference = recordClientEvent({
      eventType: 'route_render_error',
      error,
      context: {
        reset_key: this.props.resetKey,
        component_stack: info.componentStack,
      },
    });
    this.setState({ reference });
  }

  componentDidUpdate(previous: Props) {
    if (previous.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null, reference: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    const reference = this.state.reference || 'Generando referencia…';
    const reportMessage = `Referencia ${reference}. La herramienta ${this.props.resetKey} no pudo abrirse.`;

    return (
      <section className="route-error-panel" role="alert">
        <div className="route-error-icon">!</div>
        <span className="eyebrow">RECUPERACIÓN DE HERRAMIENTA</span>
        <h2>Esta sección no pudo completarse.</h2>
        <p>
          El resto de TEDVIO continúa disponible. Reintenta la herramienta o envía el diagnóstico al soporte.
        </p>
        <strong>{reference}</strong>
        <div className="route-error-actions">
          <button
            className="button primary"
            type="button"
            onClick={() => this.setState({ error: null, reference: null })}
          >
            Reintentar
          </button>
          <button
            className="button secondary"
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('tedvio:open-support', { detail: { message: reportMessage } }))}
          >
            Reportar problema
          </button>
          <a className="button ghost" href="/teacher">Volver al inicio</a>
        </div>
      </section>
    );
  }
}
