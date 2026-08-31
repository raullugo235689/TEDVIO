import { useEffect, useRef } from 'react';
import type { RequiredLegalDocument } from '../../core/auth-security';

function dateText(value: string | null): string {
  if (!value) return 'Vigencia no indicada';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Vigencia no indicada'
    : `Vigente desde ${date.toLocaleDateString('es-MX', { dateStyle: 'long' })}`;
}

export function LegalDocumentModal({
  document,
  onClose,
}: {
  document: RequiredLegalDocument;
  onClose: () => void;
}) {
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButton.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const paragraphs = document.text.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);

  return (
    <div className="auth-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="auth-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-document-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span className="eyebrow">DOCUMENTO VIGENTE · {document.version}</span>
            <h2 id="legal-document-title">{document.title}</h2>
            <p>{dateText(document.effective_at)}</p>
          </div>
          <button ref={closeButton} className="icon-button" type="button" onClick={onClose} aria-label="Cerrar documento">
            ×
          </button>
        </header>
        <div className="legal-document-scroll" tabIndex={0}>
          {paragraphs.length
            ? paragraphs.map((paragraph, index) => <p key={`${document.document_key}-${index}`}>{paragraph}</p>)
            : <p>El documento no tiene contenido visible.</p>}
        </div>
        <footer>
          <span>TEDVIO registra la versión exacta que aceptas.</span>
          <button className="button primary" type="button" onClick={onClose}>Terminar revisión</button>
        </footer>
      </section>
    </div>
  );
}
