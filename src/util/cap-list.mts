/** Lean list cap shared by Markdown lines, lean JSON, and wait logs. */
const LEAN_LIST_CAP = 5;

/** First `LEAN_LIST_CAP` items plus the count of items left out. */
export function capList<T>(items: readonly T[]): { shown: T[]; hidden: number } {
  return {
    shown: items.slice(0, LEAN_LIST_CAP),
    hidden: Math.max(0, items.length - LEAN_LIST_CAP),
  };
}

/** `", +N more"` suffix for a capped inline list; empty when nothing was left out. */
export function moreSuffix(hidden: number): string {
  return hidden > 0 ? `, +${hidden} more` : "";
}
