import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type PropsWithChildren,
} from 'react';
import { useAuth } from '../auth/AuthProvider';
import {
  flushReliabilityQueue,
  getReliabilitySnapshot,
  installGlobalReliability,
  submitSupportReport,
  type ReliabilitySnapshot,
  type SupportCategory,
  type SupportSubmission,
} from '../../core/reliability';
import { Icon } from '../../shared/icons';

interface ReliabilityContextValue extends ReliabilitySnapshot {
  syncing: boolean;
  openSupport(prefill?: string): void;
  flush(): Promise<void>;
  submit(input: { category: SupportCategory; message: string; includeDiagnostics: boolean }): Promise<SupportSubmission>;
}

interface DialogState {
  open: boolean;
  prefill: string;
}

const ReliabilityContext = createContext<ReliabilityContextValue | null>(null);

function categoryLabel(category: SupportCategory): string {
  if (category === 'bug') return 'Algo no funciona';
  if (category === 'question') return 'Tengo una pregunta';
  if (category === 'feature') return 'Sugerir una mejora';
  if (category === 'billing') return 'Cuenta o plan';
  return 'Otro';
}

function SupportDialog({
  state,
  snapshot,
  onClose,
  onSubmit,
}: {
  state: DialogState;
  snapshot: ReliabilitySnapshot;
  onClose(): void;
  onSubmit(input: { category: SupportCategory; message: string; includeDiagnostics: boolean }): Promise<SupportSubmission>;
}) {
  const [category, setCategory] = useState<SupportCategory>('bug');
  const [message, setMessage] = useState('');
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);
  const [busy, setBusy] = useState(false);
  const [submission, setSubmission] = useState<SupportSubmission | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!state.open) return;
    setMessage(state.prefill);
    setSubmission(null);
    setError('');
  }, [state.open, state.prefill]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      setSubmission(await onSubmit({ category, message, includeDiagnostics }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo guardar el reporte.');
    } finally {
      setBusy(false);
    }
  }

  if (!state.open) return null;

  return (
    <div className="support-dialog-backdrop" role="presentation" onClick={onClose}>
      <section
        className="support-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="support-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span className="eyebrow">SOPORTE TEDVIO</span>
            <h2 id="support-dialog-title">{submission ? 'Reporte registrado' : 'Reportar un problema'}</h2>
            <p>
              {submission
                ? 'Conserva la referencia para dar seguimiento.'
                : 'Describe lo que estabas intentando hacer y qué ocurrió.'}
            </p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Cerrar">×</button>
        </header>

        {submission ? (
          <div className="support-success">
            <div className="support-success-icon"><Icon name={submission.queued ? 'clock' : 'check'} /></div>
            <span>{submission.queued ? 'PENDIENTE DE ENVÍO' : 'ENVIADO'}</span>
            <strong>{submission.reference}</strong>
            <p>
              {submission.queued
                ? 'TEDVIO lo guardó en este dispositivo y lo enviará al recuperar la conexión.'
                : 'El reporte ya está disponible para revisión técnica.'}
            </p>
            <div className="support-dialog-actions">
              <button
                className="button secondary"
                type="button"
                onClick={() => void navigator.clipboard?.writeText(submission.reference)}
              >
                Copiar referencia
              </button>
              <button className="button primary" type="button" onClick={onClose}>Cerrar</button>
            </div>
          </div>
        ) : (
          <form className="support-form" onSubmit={submit}>
            <label>
              Categoría
              <select value={category} onChange={(event) => setCategory(event.target.value as SupportCategory)}>
                {(['bug', 'question', 'feature', 'billing', 'other'] as SupportCategory[]).map((value) => (
                  <option key={value} value={value}>{categoryLabel(value)}</option>
                ))}
              </select>
            </label>

            <label>
              ¿Qué ocurrió?
              <textarea
                rows={6}
                minLength={5}
                maxLength={4000}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Ejemplo: estaba guardando la asistencia del grupo y apareció un mensaje de error."
                required
                autoFocus
              />
              <small>{message.length.toLocaleString('es-MX')} / 4000</small>
            </label>

            <label className="support-consent">
              <input
                type="checkbox"
                checked={includeDiagnostics}
                onChange={(event) => setIncludeDiagnostics(event.target.checked)}
              />
              <span>
                <b>Adjuntar diagnóstico técnico</b>
                <small>Ruta, versión, navegador y estado de conexión. No incluye calificaciones, respuestas ni nombres de alumnos.</small>
              </span>
            </label>

            <div className="support-diagnostic-preview">
              <span><i className={snapshot.online ? 'online' : 'offline'} />{snapshot.online ? 'En línea' : 'Sin conexión'}</span>
              <span>{snapshot.pendingCount ? `${snapshot.pendingCount} envío(s) pendiente(s)` : 'Sin envíos pendientes'}</span>
            </div>

            {error ? <div className="form-message error" role="alert">{error}</div> : null}

            <div className="support-dialog-actions">
              <button className="button secondary" type="button" onClick={onClose}>Cancelar</button>
              <button className="button primary" type="submit" disabled={busy || message.trim().length < 5}>
                {busy ? 'Guardando…' : snapshot.online ? 'Enviar reporte' : 'Guardar para enviar'}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

export function ReliabilityProvider({ children }: PropsWithChildren) {
  const auth = useAuth();
  const [snapshot, setSnapshot] = useState<ReliabilitySnapshot>(() => getReliabilitySnapshot());
  const [syncing, setSyncing] = useState(false);
  const [dialog, setDialog] = useState<DialogState>({ open: false, prefill: '' });

  const updateSnapshot = useCallback(() => {
    setSnapshot(getReliabilitySnapshot());
  }, []);

  const flush = useCallback(async () => {
    if (!auth.user || !navigator.onLine) {
      updateSnapshot();
      return;
    }
    setSyncing(true);
    try {
      setSnapshot(await flushReliabilityQueue());
    } finally {
      setSyncing(false);
    }
  }, [auth.user, updateSnapshot]);

  useEffect(() => {
    installGlobalReliability();
    const update = () => updateSnapshot();
    const openSupport = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      setDialog({ open: true, prefill: detail?.message || '' });
    };
    window.addEventListener('tedvio:reliability-state', update);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    window.addEventListener('tedvio:open-support', openSupport);
    updateSnapshot();
    return () => {
      window.removeEventListener('tedvio:reliability-state', update);
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      window.removeEventListener('tedvio:open-support', openSupport);
    };
  }, [updateSnapshot]);

  useEffect(() => {
    if (auth.status === 'authenticated' && navigator.onLine) void flush();
  }, [auth.status, auth.user?.id, flush]);

  const openSupport = useCallback((prefill = '') => {
    setDialog({ open: true, prefill });
  }, []);

  const submit = useCallback(async (input: { category: SupportCategory; message: string; includeDiagnostics: boolean }) => {
    if (!auth.user) throw new Error('Tu sesión expiró. Vuelve a ingresar antes de enviar el reporte.');
    const result = await submitSupportReport({
      userId: auth.user.id,
      category: input.category,
      message: input.message,
      includeDiagnostics: input.includeDiagnostics,
      source: 'teacher-support-dialog',
    });
    updateSnapshot();
    return result;
  }, [auth.user, updateSnapshot]);

  const value = useMemo<ReliabilityContextValue>(() => ({
    ...snapshot,
    syncing,
    openSupport,
    flush,
    submit,
  }), [snapshot, syncing, openSupport, flush, submit]);

  return (
    <ReliabilityContext.Provider value={value}>
      {children}
      <SupportDialog
        state={dialog}
        snapshot={snapshot}
        onClose={() => setDialog({ open: false, prefill: '' })}
        onSubmit={submit}
      />
    </ReliabilityContext.Provider>
  );
}

export function useReliability(): ReliabilityContextValue {
  const context = useContext(ReliabilityContext);
  if (!context) throw new Error('useReliability debe utilizarse dentro de ReliabilityProvider.');
  return context;
}
