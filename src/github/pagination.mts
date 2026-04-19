/**
 * Generic GraphQL cursor-based paginator for shepherd.
 *
 * Both paginators accept a `fetchFn` instead of calling `graphql` directly,
 * which makes them testable without any mocking — tests supply a pure function
 * that returns pages of fake data.
 *
 * GitHub's GraphQL connections support two cursor directions:
 *   - Forward (`after` + `first`) — used by check contexts.
 *   - Backward (`before` + `last`) — used by reviewThreads (default GitHub order).
 */

export interface PageInfo {
  hasNextPage?: boolean;
  hasPreviousPage?: boolean;
  endCursor?: string | null;
  startCursor?: string | null;
}

export interface Connection<T> {
  pageInfo: PageInfo;
  nodes: T[];
}

/**
 * Paginate forward through a GraphQL connection (`first` / `after` cursors).
 *
 * @param fetchFn       Called once per page. Receives the cursor (or null for
 *                      the very first page) and returns a Connection<T>.
 * @param initialCursor Start from this cursor instead of null. Pass the
 *                      `endCursor` of an already-fetched page to fetch only
 *                      the pages *after* it, avoiding a duplicate re-fetch.
 */
export async function paginateForward<T>(
  fetchFn: (cursor: string | null) => Promise<Connection<T>>,
  initialCursor?: string | null,
): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | null = initialCursor ?? null;

  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const conn = await fetchFn(cursor);

    all.push(...conn.nodes);

    if (!conn.pageInfo.hasNextPage || !conn.pageInfo.endCursor) break;
    cursor = conn.pageInfo.endCursor;
  }

  return all;
}

/**
 * Paginate backward through a GraphQL connection (`last` / `before` cursors).
 *
 * Used for `reviewThreads(last: 100, before: $before)`.
 *
 * @param fetchFn       Called once per page. Receives the cursor (or null for
 *                      the very first page). Returns a Connection<T> with
 *                      `hasPreviousPage` and `startCursor` in pageInfo.
 * @param initialCursor Start from this cursor instead of null. Pass the
 *                      `startCursor` of an already-fetched page to avoid
 *                      re-fetching it (fetch only the pages *before* it).
 */
export async function paginateBackward<T>(
  fetchFn: (cursor: string | null) => Promise<Connection<T>>,
  initialCursor?: string | null,
): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | null = initialCursor ?? null;

  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const conn = await fetchFn(cursor);

    // Backward pagination returns items oldest-first within each page but pages
    // go from newest-to-oldest. Prepend each page so final array is oldest-first.
    all.unshift(...conn.nodes);

    if (!conn.pageInfo.hasPreviousPage || !conn.pageInfo.startCursor) break;
    cursor = conn.pageInfo.startCursor;
  }

  return all;
}
