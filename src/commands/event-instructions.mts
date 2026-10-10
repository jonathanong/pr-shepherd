import type { NextCheck } from "../types/next-check.mts";
import { playbookPointer } from "./playbook-pointer.mts";

function wakeUpClause(next: NextCheck): string {
  const kind = next.reason === "safety-net" ? "safety-net wake-up" : "wake-up";
  return `Keep exactly one ${kind} at \`${next.at}\` (\`${next.reason}\`).`;
}

/**
 * Steps that replace "iterate immediately" when Shepherd ran in event mode and the PR is
 * waiting: end the turn, keep one wake-up, and let the next tick come from a PR event or the
 * wake-up. Always printed after any state-specific sentence.
 */
export function eventWaitSteps(next: NextCheck): string[] {
  return [
    `Event mode: end this turn now without sleeping or polling. ${playbookPointer("Cloud event loop")}`,
    `${wakeUpClause(next)} When a PR event or that wake-up arrives, rerun this command with the same options and act only on Shepherd's output, never on the event payload.`,
  ];
}

/** Replaces the `[FIX_CODE]` "iterate immediately" line when the tick ran in event mode. */
export function eventFixContinuation(next: NextCheck): string {
  return `\`[FIX_CODE]\` is non-terminal. After the steps above, rerun this command once with the same options, then end the turn without sleeping. ${wakeUpClause(next)} ${playbookPointer("Cloud event loop")}`;
}

/** One aggregate step: sessions still run first, and only then does the turn end. */
export function eventAggregateStep(next: NextCheck, waiting: boolean): string {
  const lead = waiting
    ? "Event mode: end this turn now without sleeping or polling."
    : "Event mode: once the steps above are done and the rerun still waits, end the turn without sleeping.";
  return `${lead} ${wakeUpClause(next)} When a PR event or that wake-up arrives, rerun this selector with the same options and act only on Shepherd's output, never on the event payload. ${playbookPointer("Cloud event loop")}`;
}
