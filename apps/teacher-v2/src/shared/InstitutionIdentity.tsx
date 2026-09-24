import { useState } from 'react';

function initials(name: string): string {
  const trimmed = name.trim();
  if (/^[\p{L}]{2,4}$/u.test(trimmed) && trimmed === trimmed.toLocaleUpperCase('es-MX')) return trimmed;
  return trimmed.split(/\s+/u).filter((word) => !['de', 'del'].includes(word.toLocaleLowerCase('es-MX')))
    .map((word) => word[0]).join('').slice(0, 3).toLocaleUpperCase('es-MX') || '—';
}

export function InstitutionIdentity({ name, logoUrl, detail }: { name?: string | null; logoUrl?: string | null; detail?: string | null }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const label = name || 'Institución sin asignar';

  return (
    <div className="group-institution">
      <span className="group-institution-mark" aria-hidden="true">
        {logoUrl && logoUrl !== failedUrl
          ? <img src={logoUrl} alt="" loading="lazy" decoding="async" onError={() => setFailedUrl(logoUrl)} />
          : <span>{initials(name || '')}</span>}
      </span>
      <p>{label}{detail ? <> <span aria-hidden="true">·</span> {detail}</> : null}</p>
    </div>
  );
}
