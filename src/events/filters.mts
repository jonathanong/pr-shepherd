import type { EventFilter, WatchTarget } from "./types.mts";

const MAX_FILTERS = 50;
const MAX_FILTER_BYTES = 4096;

/**
 * A superset hint for the relay: events for these PR numbers, head SHAs, or branches (head and
 * base). Local matching stays authoritative; older relays ignore the parameter.
 */
export function filtersFor(targets: readonly WatchTarget[]): EventFilter[] {
  const unique = (values: Array<string | undefined>): string[] => [
    ...new Set(values.filter((value): value is string => Boolean(value))),
  ];
  const sha = unique(targets.map((target) => target.headSha));
  const ref = unique(targets.flatMap((target) => [target.headRef, target.baseRef]));
  return [
    { pr: targets.map((target) => target.pr) },
    ...(sha.length > 0 ? [{ sha }] : []),
    ...(ref.length > 0 ? [{ ref }] : []),
  ];
}

/** The `filters` query value, or undefined when over the relay's limits (match locally). */
export function filtersParam(filters: readonly EventFilter[]): string | undefined {
  if (filters.length === 0 || filters.length > MAX_FILTERS) return undefined;
  const json = JSON.stringify(filters);
  return json.length > MAX_FILTER_BYTES ? undefined : json;
}
