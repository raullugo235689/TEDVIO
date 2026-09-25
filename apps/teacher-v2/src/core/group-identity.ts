const accents = ['teal', 'blue', 'violet', 'amber', 'rose', 'indigo'] as const;

/** A group's identity is stable across screens, sessions and devices. */
export function groupAccent(groupId: string): typeof accents[number] {
  let hash = 0;
  for (const character of groupId) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0;
  return accents[hash % accents.length] ?? 'teal';
}
