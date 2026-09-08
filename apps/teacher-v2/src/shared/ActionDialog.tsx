import { useEffect, useId, useRef, type ReactNode } from 'react';

/** Native modal semantics keep keyboard focus inside and the page behind inert. */
export function ActionDialog({ title, detail, children, confirmLabel, onConfirm, onDismiss, busy = false, danger = false, error, eyebrow = 'TEDVIO · MODO CLASE' }: {
  title: string;
  detail: string;
  children?: ReactNode;
  confirmLabel?: string;
  onConfirm?: () => void;
  onDismiss: () => void;
  busy?: boolean;
  danger?: boolean;
  error?: string;
  eyebrow?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const dismiss = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    const node = dialog.current;
    const trigger = document.activeElement;
    node?.showModal();
    dismiss.current?.focus();
    return () => {
      node?.close();
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, []);

  return (
    <dialog ref={dialog} className="classroom-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-detail`} aria-busy={busy}
      onCancel={(event) => { event.preventDefault(); if (!busy) onDismiss(); }}>
      <header>
        <span className="eyebrow">{eyebrow}</span>
        <h2 id={`${id}-title`}>{title}</h2>
        <p id={`${id}-detail`}>{detail}</p>
      </header>
      {children}
      {error ? <p className="classroom-dialog-error" role="alert">{error}</p> : null}
      <footer>
        <button ref={dismiss} type="button" className="button secondary" disabled={busy} onClick={onDismiss}>{onConfirm ? 'Cancelar' : 'Listo'}</button>
        {onConfirm ? <button type="button" className={`button ${danger ? 'danger' : 'primary'}`} disabled={busy} onClick={onConfirm}>{busy ? 'Procesando…' : confirmLabel}</button> : null}
      </footer>
    </dialog>
  );
}
