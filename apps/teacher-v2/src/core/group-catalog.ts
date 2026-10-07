/** Shared, deterministic academic order for Inicio and the complete catalogue. */
export interface CatalogGroup {
  id: string;
  name?: string | null;
  group_name?: string | null;
  university_name?: string | null;
  university?: string | null;
  subject?: string | null;
  program_name?: string | null;
  program?: string | null;
  term?: string | null;
  school_cycle?: string | null;
}

const collator = new Intl.Collator('es-MX', { numeric: true, sensitivity: 'base' });
const clean = (value?: string | null) => (value || '').trim().replace(/\s+/gu, ' ');
export const catalogUniversity = (group: CatalogGroup) => clean(group.university_name) || clean(group.university) || 'Institución sin asignar';
export const catalogSubject = (group: CatalogGroup) => clean(group.subject) || 'Materia sin asignar';
const searchable = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es-MX');

function compareField(a: string, b: string): number {
  return a && b ? collator.compare(a, b) : a ? -1 : b ? 1 : 0;
}

export function orderGroups<T extends CatalogGroup>(groups: readonly T[]): T[] {
  return [...groups].sort((a, b) =>
    compareField(clean(a.university_name) || clean(a.university), clean(b.university_name) || clean(b.university))
    || compareField(clean(a.subject), clean(b.subject))
    || compareField(clean(a.group_name) || clean(a.name), clean(b.group_name) || clean(b.name))
    || compareField(clean(a.program_name) || clean(a.program), clean(b.program_name) || clean(b.program))
    || (clean(a.term || a.school_cycle) && clean(b.term || b.school_cycle)
      ? collator.compare(clean(b.term || b.school_cycle), clean(a.term || a.school_cycle))
      : compareField(clean(a.term || a.school_cycle), clean(b.term || b.school_cycle)))
    || a.id.localeCompare(b.id));
}

export function matchesGroup(group: CatalogGroup, query: string): boolean {
  const text = searchable([group.group_name, group.name, group.subject, catalogUniversity(group), group.program_name, group.program, group.term, group.school_cycle].filter(Boolean).join(' '));
  return searchable(query).trim().split(/\s+/u).every(word => text.includes(word));
}

export function catalogOptions(values: string[]): string[] {
  return [...new Set(values)].sort(collator.compare);
}

export function universitySections<T extends CatalogGroup>(groups: readonly T[]) {
  const sections = new Map<string, T[]>();
  for (const group of groups) {
    const name = catalogUniversity(group);
    const section = sections.get(name);
    if (section) section.push(group);
    else sections.set(name, [group]);
  }
  return [...sections].map(([name, items]) => ({ name, groups: items }));
}
