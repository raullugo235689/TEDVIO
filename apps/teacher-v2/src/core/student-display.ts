/** Monograma visual del alumno. No afecta matrícula, nombre ni su identidad en datos. */
export function studentInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'AL';
  return parts.slice(0, 2).map((part) => part.charAt(0).toLocaleUpperCase('es-MX')).join('');
}
