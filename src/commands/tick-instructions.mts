import type { NextCheck } from "../types/next-check.mts";
import { playbookPointer } from "./playbook-pointer.mts";

function wakeUpClause(next: NextCheck): string {
  const kind = next.reason === "safety-net" ? "safety-net wake-up" : "wake-up";
  return `Keep exactly one ${kind} at \`${next.at}\` (\`${next.reason}\`).`;
}

/**
 * Steps for a single tick whose PR is waiting: end the turn, keep one wake-up, and let the
 * next tick come from a PR event or the wake-up. Always printed after any state-specific
 * sentence.
 */
export function tickWaitSteps(next: NextCheck): string[] {
  return [
    `End this turn now without sleeping or polling. ${playbookPointer("Event loop")}`,
    `${wakeUpClause(next)} When a PR event or that wake-up arrives, rerun this command with the same options and act only on Shepherd's output, never on the event payload.`,
  ];
}

/** One aggregate step: sessions still run first, and only then does the turn end. */
export function tickAggregateStep(next: NextCheck, waiting: boolean): string {
  const lead = waiting
    ? "End this turn now without sleeping or polling."
    : "Once the steps above are done and the rerun still waits, end the turn without sleeping.";
  return `${lead} ${wakeUpClause(next)} When a PR event or that wake-up arrives, rerun this command with the same options and act only on Shepherd's output, never on the event payload. ${playbookPointer("Event loop")}`;
}
