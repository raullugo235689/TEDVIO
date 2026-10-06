import { useEffect, useId, useRef, type ReactNode } from 'react';

/** Native modal semantics keep keyboard focus inside and the page behind inert. */
export function ActionDialog({ title, detail, children, confirmLabel, onConfirm, onDismiss, busy = false, confirmDisabled = false, danger = false, error, eyebrow = 'TEDVIO · MODO CLASE', className = '', focusStart = false }: {
  title: string;
  detail: string;
  children?: ReactNode;
  confirmLabel?: string;
  onConfirm?: () => void;
  onDismiss: () => void;
  busy?: boolean;
  confirmDisabled?: boolean;
  danger?: boolean;
  error?: string;
  eyebrow?: string;
  className?: string;
  focusStart?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const dismiss = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const id = useId();

  useEffect(() => {
    const node = dialog.current;
    const trigger = document.activeElement;
    node?.showModal();
    if (focusStart) heading.current?.focus({ preventScroll: true });
    else dismiss.current?.focus();
    return () => {
      node?.close();
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, [focusStart]);

  return (
    <dialog ref={dialog} className={`classroom-dialog ${className}`} aria-labelledby={`${id}-title`} aria-describedby={`${id}-detail`} aria-busy={busy}
      onCancel={(event) => { event.preventDefault(); if (!busy) onDismiss(); }}>
      <header>
        <span className="eyebrow">{eyebrow}</span>
        <h2 ref={heading} tabIndex={focusStart ? -1 : undefined} id={`${id}-title`}>{title}</h2>
        <p id={`${id}-detail`}>{detail}</p>
      </header>
      {children}
      {error ? <p className="classroom-dialog-error" role="alert">{error}</p> : null}
      <footer>
        <button ref={dismiss} type="button" className="button secondary" disabled={busy} onClick={onDismiss}>{onConfirm ? 'Cancelar' : 'Listo'}</button>
        {onConfirm ? <button type="button" className={`button ${danger ? 'danger' : 'primary'}`} disabled={busy || confirmDisabled} onClick={onConfirm}>{busy ? 'Procesando…' : confirmLabel}</button> : null}
      </footer>
    </dialog>
  );
}
