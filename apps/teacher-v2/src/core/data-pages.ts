/** Fetch bounded pages in stable order. Never return a silently truncated history. */
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 500,
  maxRows = 100_000,
): Promise<T[]> {
  if (!Number.isInteger(pageSize) || pageSize < 1 || !Number.isInteger(maxRows) || maxRows < 1) throw new Error('Los límites de paginación deben ser enteros positivos.');
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = data || [];
    if (rows.length + page.length > maxRows) throw new Error('El historial es muy extenso. Reduce el periodo de consulta.');
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

/** Collapse a burst to one in-flight refresh plus a final reconciliation.
 * Unlike repeated invalidateQueries, no event cancels a request already in flight.
 */
export function createRefreshQueue(refresh: () => Promise<unknown>, delay = 180) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let dirty = false;
  let disposed = false;
  async function flush() {
    timer = undefined;
    if (disposed || running || !dirty) return;
    running = true;
    dirty = false;
    try { await refresh(); } catch { /* the query owns its error state */ }
    finally {
      running = false;
      if (dirty && !disposed) timer = setTimeout(() => void flush(), delay);
    }
  }
  return {
    request() {
      if (disposed) return;
      dirty = true;
      if (!running && !timer) timer = setTimeout(() => void flush(), delay);
    },
    dispose() { disposed = true; dirty = false; clearTimeout(timer); },
  };
}

/** Compatibility result for existing data loaders; backend pages are bounded.
 * A fresh query is created for each page because PostgREST builders are mutable.
 */
export async function pagedResult<T>(factory: () => {
  range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
}): Promise<{ data: T[]; error: null }> {
  return { data: await fetchAllPages((from, to) => factory().range(from, to)), error: null };
}
export async function batchedPagedResult<T>(ids: string[], factory: (batch: string[]) => {
  range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
}): Promise<{ data: T[]; error: null }> {
  const unique = [...new Set(ids)];
  const data: T[] = [];
  for (let i = 0; i < unique.length; i += 100) {
    const batch = unique.slice(i, i + 100);
    const part = await fetchAllPages((from, to) => factory(batch).range(from, to));
    if (data.length + part.length > 100_000) throw new Error('El historial es muy extenso. Reduce el periodo de consulta.');
    data.push(...part);
  }
  return { data, error: null };
}
