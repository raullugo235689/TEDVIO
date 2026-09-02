import React, { Component } from "react";

const h = React.createElement;
const DIAGNOSTIC_KEY = "tedvio.live.last_fatal_error";

function diagnosticReference() {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `LIVE-${Date.now().toString(36).toUpperCase()}-${random}`;
}

export class LiveSurfaceErrorBoundary extends Component {
  state = { error: null, reference: "" };

  static getDerivedStateFromError(error) {
    return { error, reference: "" };
  }

  componentDidCatch(error, info) {
    const reference = diagnosticReference();
    this.setState({ reference });
    console.error("TEDVIO live surface boundary", error, info);
    try {
      localStorage.setItem(DIAGNOSTIC_KEY, JSON.stringify({
        reference,
        surface: this.props.surface,
        at: new Date().toISOString(),
        path: `${location.pathname}${location.search}${location.hash}`,
        message: String(error?.message || "Error de superficie en vivo").slice(0, 300),
      }));
    } catch {
      // La recuperación visual funciona aunque el almacenamiento esté bloqueado.
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return h(
      "main",
      { className: "live-fatal-shell", role: "alert" },
      h(
        "section",
        { className: "live-fatal-card" },
        h("img", { src: "/assets/tedvio_official_horizontal.svg", alt: "TEDVIO" }),
        h("span", { className: "live-fatal-kicker" }, "RECUPERACIÓN SEGURA"),
        h("h1", null, "La pantalla necesita volver a cargarse."),
        h("p", null, "La sesión y las respuestas guardadas no se eliminaron. TEDVIO conservará el estado disponible en este dispositivo."),
        h("strong", { className: "live-fatal-reference" }, this.state.reference || "Preparando diagnóstico…"),
        h(
          "div",
          { className: "live-fatal-actions" },
          h("button", { type: "button", onClick: () => location.reload() }, "Recargar TEDVIO"),
          h("a", { href: this.props.homeHref || "/" }, "Volver al acceso"),
        ),
        h("small", null, "Si vuelve a ocurrir, comparte la referencia con soporte."),
      ),
    );
  }
}
