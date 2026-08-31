import type { ReactNode } from 'react';
import { Icon, type IconName } from './icons';

export function PageHeader({ eyebrow, title, detail, actions }: { eyebrow: string; title: string; detail?: string; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {detail ? <p>{detail}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

export function MetricCard({ label, value, detail, icon, tone = 'neutral' }: { label: string; value: string; detail: string; icon: IconName; tone?: string }) {
  return (
    <article className={`metric-card tone-${tone}`}>
      <div className="metric-icon"><Icon name={icon} /></div>
      <div><span>{label}</span><b>{value}</b><small>{detail}</small></div>
    </article>
  );
}

export function StatusPill({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) {
  return <span className={`status-pill tone-${tone}`}>{children}</span>;
}

export function SectionCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`section-card ${className}`.trim()}>{children}</section>;
}

export function EmptyState({ icon = 'layout', title, detail, action }: { icon?: IconName; title: string; detail: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><Icon name={icon} /></div>
      <h3>{title}</h3>
      <p>{detail}</p>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

export function LoadingScreen({ label = 'Preparando tu espacio docente…' }: { label?: string }) {
  return (
    <div className="loading-screen" role="status" aria-live="polite">
      <div className="loading-mark"><img src="/assets/tedvio_official_isotipo.svg" alt="" /></div>
      <div className="loading-lines"><i /><i /><i /></div>
      <b>{label}</b>
    </div>
  );
}

export function ErrorPanel({ title, detail, onRetry }: { title: string; detail: string; onRetry?: () => void }) {
  return (
    <div className="error-panel" role="alert">
      <Icon name="alert" />
      <div><h3>{title}</h3><p>{detail}</p></div>
      {onRetry ? <button className="button secondary" type="button" onClick={onRetry}>Reintentar</button> : null}
    </div>
  );
}

export function LegacyBridge({ groupId, label = 'Abrir acceso de recuperación', compact = false }: { groupId?: string; label?: string; compact?: boolean }) {
  function openLegacy() {
    if (groupId) sessionStorage.setItem('tedvio.currentGroupId', groupId);
    window.location.assign('/teacher-legacy');
  }

  return (
    <button className={`button ${compact ? 'ghost compact' : 'secondary'}`} type="button" onClick={openLegacy}>
      <Icon name="external" />
      {label}
    </button>
  );
}