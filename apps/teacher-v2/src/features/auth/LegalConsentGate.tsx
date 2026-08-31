import { useCallback, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import {
  acceptRequiredLegalDocuments,
  fetchAcceptedLegalVersions,
  fetchRequiredLegalDocuments,
  legalVersionKey,
  type RequiredLegalDocument,
} from '../../core/auth-security';
import { ErrorPanel, LoadingScreen } from '../../shared/components';
import { Icon } from '../../shared/icons';
import { useAuth } from './AuthProvider';
import { LegalDocumentModal } from './LegalDocumentModal';

type GateStatus = 'loading' | 'ready' | 'error';

export function LegalConsentGate({ children }: PropsWithChildren) {
  const auth = useAuth();
  const [status, setStatus] = useState<GateStatus>('loading');
  const [documents, setDocuments] = useState<RequiredLegalDocument[]>([]);
  const [acceptedVersions, setAcceptedVersions] = useState<Set<string>>(new Set());
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [openDocument, setOpenDocument] = useState<RequiredLegalDocument | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!auth.user) return;
    setStatus('loading');
    setError('');
    try {
      const [nextDocuments, nextAccepted] = await Promise.all([
        fetchRequiredLegalDocuments(),
        fetchAcceptedLegalVersions(auth.user.id),
      ]);
      setDocuments(nextDocuments);
      setAcceptedVersions(nextAccepted);
      setChecked(Object.fromEntries(nextDocuments.map((document) => [legalVersionKey(document), false])));
      setStatus('ready');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo validar el estado legal de la cuenta.');
      setStatus('error');
    }
  }, [auth.user]);

  useEffect(() => {
    void load();
  }, [load]);

  const pending = useMemo(
    () => documents.filter((document) => !acceptedVersions.has(legalVersionKey(document))),
    [acceptedVersions, documents],
  );
  const allChecked = pending.length > 0 && pending.every((document) => checked[legalVersionKey(document)]);

  async function accept() {
    if (!allChecked) return;
    setAccepting(true);
    setError('');
    try {
      await acceptRequiredLegalDocuments('teacher_v2_mandatory_gate');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo registrar la aceptación.');
    } finally {
      setAccepting(false);
    }
  }

  if (status === 'loading') return <LoadingScreen label="Comprobando documentos y privacidad…" />;
  if (status === 'error') {
    return (
      <main className="legal-gate-page compact">
        <ErrorPanel title="No pude validar los documentos de tu cuenta" detail={error} onRetry={() => void load()} />
        <button className="button ghost" type="button" onClick={() => void auth.signOut()}>Cerrar sesión</button>
      </main>
    );
  }
  if (!pending.length) return children;

  return (
    <main className="legal-gate-page">
      <section className="legal-gate-card" aria-labelledby="legal-gate-title">
        <header>
          <div className="legal-gate-icon"><Icon name="shield" /></div>
          <div>
            <span className="eyebrow">CUENTA Y PRIVACIDAD</span>
            <h1 id="legal-gate-title">Revisa las condiciones vigentes</h1>
            <p>
              Antes de utilizar herramientas académicas, debes revisar y aceptar cada documento requerido.
              TEDVIO guardará la versión exacta y la fecha del servidor.
            </p>
          </div>
        </header>

        <div className="legal-gate-documents">
          {pending.map((document) => {
            const key = legalVersionKey(document);
            return (
              <article key={key}>
                <div>
                  <span className="eyebrow">VERSIÓN {document.version}</span>
                  <h2>{document.title}</h2>
                  <p>{document.summary || 'Documento requerido para el uso responsable de TEDVIO.'}</p>
                  <button className="auth-text-button" type="button" onClick={() => setOpenDocument(document)}>
                    Abrir documento completo
                  </button>
                </div>
                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(checked[key])}
                    onChange={(event) => setChecked((current) => ({ ...current, [key]: event.target.checked }))}
                  />
                  <span>He leído y acepto esta versión.</span>
                </label>
              </article>
            );
          })}
        </div>

        {error ? <div className="form-message error" role="alert">{error}</div> : null}

        <footer>
          <button className="button ghost" type="button" onClick={() => void auth.signOut()}>Cerrar sesión</button>
          <button className="button primary" type="button" disabled={!allChecked || accepting} onClick={() => void accept()}>
            {accepting ? 'Registrando…' : `Aceptar ${pending.length} documento(s) y continuar`}
          </button>
        </footer>
      </section>

      {openDocument ? <LegalDocumentModal document={openDocument} onClose={() => setOpenDocument(null)} /> : null}
    </main>
  );
}
