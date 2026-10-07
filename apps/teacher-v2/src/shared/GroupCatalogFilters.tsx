import { useLayoutEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { catalogOptions, catalogSubject, catalogUniversity, matchesGroup, orderGroups, type CatalogGroup } from '../core/group-catalog';
import { Icon } from './icons';

const emptyGroups: readonly CatalogGroup[] = [];

export function useGroupCatalog<T extends CatalogGroup>(source?: readonly T[] | null) {
  const [params, setParams] = useSearchParams();
  const latestParams = useRef(params);
  useLayoutEffect(() => { latestParams.current = params; }, [params]);
  const groups = source || emptyGroups as readonly T[];
  const ordered = useMemo(() => orderGroups(groups), [groups]);
  const universities = useMemo(() => catalogOptions(groups.map(catalogUniversity)), [groups]);
  const requestedUniversity = params.get('university') || '';
  const university = universities.includes(requestedUniversity) ? requestedUniversity : '';
  const subjects = useMemo(() => catalogOptions(groups.filter(group => !university || catalogUniversity(group) === university).map(catalogSubject)), [groups, university]);
  const requestedSubject = params.get('subject') || '';
  const subject = subjects.includes(requestedSubject) ? requestedSubject : '';
  const query = params.get('q') || '';
  const filtered = useMemo(() => ordered.filter(group => (!university || catalogUniversity(group) === university) && (!subject || catalogSubject(group) === subject) && matchesGroup(group, query)), [ordered, university, subject, query]);

  function change(key: 'q' | 'university' | 'subject', value: string) {
    // Router search-param callbacks do not queue like React state updates.
    // Preserve rapid edits before the navigation has committed its next render.
    const next = new URLSearchParams(latestParams.current);
    if (value) next.set(key, value); else next.delete(key);
    if (key === 'university') next.delete('subject');
    latestParams.current = next;
    setParams(next, { replace: true });
  }
  function clear() {
    const next = new URLSearchParams(latestParams.current);
    for (const key of ['q', 'university', 'subject']) next.delete(key);
    latestParams.current = next;
    setParams(next, { replace: true });
  }
  const linkParams = new URLSearchParams();
  if (university) linkParams.set('university', university);
  if (subject) linkParams.set('subject', subject);
  if (query) linkParams.set('q', query);

  return { filtered, universities, subjects, university, subject, query, change, clear, active: Boolean(university || subject || query), total: groups.length, allGroupsPath: `/groups${linkParams.size ? `?${linkParams}` : ''}` };
}

export function GroupCatalogFilters({ catalog }: { catalog: ReturnType<typeof useGroupCatalog> }) {
  return (
    <div className="group-catalog-filters">
      <label className="catalog-search">Buscar grupos<div><Icon name="search" /><input type="search" value={catalog.query} onChange={event => catalog.change('q', event.target.value)} placeholder="Grupo, materia o universidad" /></div></label>
      <label>Universidad<select aria-label="Universidad" value={catalog.university} onChange={event => catalog.change('university', event.target.value)}><option value="">Todas las universidades</option>{catalog.universities.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
      <label>Materia<select aria-label="Materia" value={catalog.subject} onChange={event => catalog.change('subject', event.target.value)}><option value="">Todas las materias</option>{catalog.subjects.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
      <div className="catalog-filter-summary"><span role="status">{catalog.filtered.length} de {catalog.total} grupos</span>{catalog.active ? <button type="button" className="button ghost compact" onClick={catalog.clear}>Limpiar filtros</button> : null}</div>
    </div>
  );
}
