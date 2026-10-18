/**
 * Per-tick output budget for review items (see `iterate.reviewOutputMaxChars`).
 *
 * Fetching is complete; only the rendered volume is capped. When the bodies of every surfaced
 * review item fit the budget, nothing changes. Otherwise items are taken in a fixed priority
 * order — group by group, oldest first within a group — until the next item would exceed the
 * budget (at least one item is always shown). Every other budgeted item is held: the caller
 * omits it from the report, from generated mutation IDs, and from seen-marker writes, so a
 * later tick shows it.
 */

/** One review item's identity, age, and rendered-body cost in characters. */
export interface BudgetItem {
  id: string;
  createdAtUnix?: number;
  cost: number;
}

/** Raw rollup emitted only when items were held: `shown` of `total` review items this tick. */
export interface ReviewItemRollup {
  shown: number;
  total: number;
}

export interface ReviewOutputSelection {
  /** False only for a budgeted item held back this tick. Unbudgeted IDs are always kept. */
  keep: (id: string) => boolean;
  rollup?: ReviewItemRollup;
}

const KEEP_ALL: ReviewOutputSelection = { keep: () => true };

function oldestFirst(items: BudgetItem[]): BudgetItem[] {
  // Unknown ages sort last; Array.prototype.sort is stable, so fetch order breaks ties.
  const age = (item: BudgetItem) => item.createdAtUnix ?? Number.MAX_SAFE_INTEGER;
  return [...items].sort((a, b) => age(a) - age(b));
}

/**
 * Select which review items to show. `groups` is in priority order; an ID that appears in more
 * than one group (e.g. a thread that is both resolution-only and first-look) is counted and
 * charged once, in its first group. `maxChars <= 0` disables the cap.
 */
export function selectReviewOutput(
  groups: ReadonlyArray<ReadonlyArray<BudgetItem>>,
  maxChars: number,
): ReviewOutputSelection {
  if (maxChars <= 0) return KEEP_ALL;
  const seen = new Set<string>();
  const ordered: BudgetItem[] = [];
  for (const group of groups) {
    const unique = group.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
    ordered.push(...oldestFirst(unique));
  }
  const totalCost = ordered.reduce((sum, item) => sum + item.cost, 0);
  if (totalCost <= maxChars) return KEEP_ALL;
  const shown = new Set<string>();
  let used = 0;
  for (const item of ordered) {
    if (shown.size > 0 && used + item.cost > maxChars) break;
    shown.add(item.id);
    used += item.cost;
  }
  const held = new Set(ordered.filter((item) => !shown.has(item.id)).map((item) => item.id));
  return {
    keep: (id) => !held.has(id),
    rollup: { shown: shown.size, total: ordered.length },
  };
}
