import type { ClassifiedCheck } from "../types/check-classification.mts";

/**
 * Required contexts that are not currently passing on the head, grouped by why.
 * A context with no run at all is not listed: `unreportedRequiredChecks` already carries it.
 */
export interface RequiredCheckState {
  failing: string[];
  /** Contexts with a superseded cancelled run: GitHub still counts it against the gate. */
  cancelled: string[];
  pending: string[];
}

/**
 * Evaluate each required context against the head's classified checks. GitHub evaluates
 * every run of a required context on the head commit, so a cancelled run still fails the
 * gate even when a newer run of the same workflow passed (duplicate runs from one push,
 * see github/gh-stack#466). Precedence: failing, then cancelled, then pending.
 */
export function evaluateRequiredChecks(
  contexts: readonly string[],
  checks: readonly ClassifiedCheck[],
): RequiredCheckState {
  const byName = new Map<string, ClassifiedCheck[]>();
  for (const check of checks) {
    const name = check.name.trim();
    if (!name) continue;
    byName.set(name, [...(byName.get(name) ?? []), check]);
  }
  const state: RequiredCheckState = { failing: [], cancelled: [], pending: [] };
  const seen = new Set<string>();
  for (const raw of contexts) {
    const context = raw.trim();
    if (!context || seen.has(context)) continue;
    seen.add(context);
    const runs = byName.get(context);
    if (!runs) continue;
    if (runs.some((run) => run.category === "failing")) state.failing.push(context);
    else if (runs.some((run) => run.category === "superseded")) state.cancelled.push(context);
    else if (runs.some((run) => run.category === "in_progress")) state.pending.push(context);
  }
  return state;
}
