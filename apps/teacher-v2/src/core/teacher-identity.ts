import type { User } from '@supabase/supabase-js';

export function teacherIdentityKey(userId?: string) {
  return ['teacher-identity', userId] as const;
}

function nameText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

export function teacherDisplayName(user: Pick<User, 'email' | 'user_metadata'> | null, displayName?: unknown, accountName?: unknown, fallback = 'Docente'): string {
  const savedName = nameText(displayName);
  const metadataName = nameText(user?.user_metadata?.display_name) || nameText(user?.user_metadata?.full_name);
  const legacyName = nameText(accountName);
  // Older accounts populated full_name with the email alias at signup.
  const emailAlias = user?.email?.split('@')[0]?.toLocaleLowerCase();
  const namedAccount = legacyName.toLocaleLowerCase() !== emailAlias && !legacyName.includes('@') ? legacyName : '';
  return savedName || metadataName || namedAccount || fallback;
}

export function teacherInitials(displayName: string): string {
  const name = displayName.replace(/^(?:(?:dra?|mtro|mtra|lic|ing|prof|profa)\.?\s+)+/i, '');
  const words = name.match(/[\p{L}\p{N}]+/gu) || [];
  return words.slice(0, 2).map((word) => word[0]).join('').toLocaleUpperCase('es-MX') || 'D';
}
