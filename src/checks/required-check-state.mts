import type { ClassifiedCheck } from "../types/check-classification.mts";

/**
 * Required contexts that are not currently passing on the head, grouped by why.
 * A context with no run at all is not listed: `unreportedRequiredChecks` already carries it.
 */
export interface RequiredCheckState {
  failing: string[];
  pending: string[];
}

/**
 * Evaluate each required context against the head's classified checks. A newer run
 * supersedes an older cancelled one, so only live (non-superseded) runs decide.
 * A context whose every run is superseded is pending: its replacement has not reported.
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
  const state: RequiredCheckState = { failing: [], pending: [] };
  const seen = new Set<string>();
  for (const raw of contexts) {
    const context = raw.trim();
    if (!context || seen.has(context)) continue;
    seen.add(context);
    const runs = byName.get(context);
    if (!runs) continue;
    const live = runs.filter((run) => run.category !== "superseded");
    if (live.some((run) => run.category === "failing")) state.failing.push(context);
    else if (live.length === 0 || live.some((run) => run.category === "in_progress")) {
      state.pending.push(context);
    }
  }
  return state;
}
