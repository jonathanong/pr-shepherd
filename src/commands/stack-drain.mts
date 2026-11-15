export { findHumanHandoffs, appendHumanHandoffInstructions } from "./stack-handoffs.mts";
import type { PollSummaryItem, PollSummaryResult, StackNextAction } from "../types.mts";
export { isStackLayerReady, stackPosition } from "./stack-merge-scope.mts";

export interface StackPlan {
  action: StackNextAction;
  stackMergeable: boolean;
  waiting?: boolean;
  /** Set only by {@link idleWaitPlan}: the layers whose one-PR probes could only report waiting. */
  idle?: PollSummaryItem[];
  instructions: string[];
}

/**
 * A merge-requested, fully ready stack whose bottom open layer still targets
 * the merged layer below it until GitHub retargets it onto the stack base.
 */
export function retargetWaitPlan(first: PollSummaryItem): StackPlan {
  return {
    action: "wait",
    stackMergeable: true,
    waiting: true,
    instructions: [
      `1. PR #${first.pr} still targets \`${first.baseRefName}\` rather than \`${first.stack?.baseRefName}\`; wait for GitHub to retarget it before merging. Recheck at the configured polling cadence.`,
    ],
  };
}

/** Every remaining layer only waits on CI or merge state. */
export function idleWaitPlan(idle: PollSummaryItem[]): StackPlan {
  return {
    action: "wait",
    stackMergeable: false,
    waiting: true,
    idle,
    instructions: [
      `1. No one-PR session can advance the stack yet: ${describeIdleLayers(idle)}. Recheck at the configured polling cadence; Shepherd escalates \`stall-timeout\` if the stack does not change.`,
    ],
  };
}

function sessionInstruction(item: PollSummaryItem): string {
  if (!item.owned) return ` PR #${item.pr} is not owned. Do not run a session for it.`;
  const removal = item.queueRemoval
    ? ` PR #${item.pr} was removed from the merge queue (\`${item.queueRemoval.reason ?? "unknown reason"}\`${item.queueRemoval.actor ? ` by @${item.queueRemoval.actor}` : ""}).`
    : "";
  if (!item.pollCommand) {
    return ` PR #${item.pr} needs a one-PR Shepherd session, but no command was available.`;
  }
  const queueNote = item.queueRemoval
    ? " That session fixes failing queue CI, or investigates a removal with no failed check once, then escalates if it is unchanged."
    : "";
  const receiptNote = item.reasons.includes("ready-receipt-required")
    ? " It looks ready, but only its own one-PR session records the READY receipt a stack merge needs."
    : "";
  return `${removal} Run \`${item.pollCommand}\`.${queueNote}${receiptNote}`;
}
export function describeIdleLayers(idle: PollSummaryItem[]): string {
  return idle.map((item) => `PR #${item.pr} (${item.reasons.join(", ")})`).join("; ");
}

/** True when the caller listed its own PRs, so rows carry `owned` and others are not theirs. */
export function hasListedOwnership(result: PollSummaryResult): boolean {
  return result.selection.kind === "stack" && result.selection.owned !== undefined;
}

export function appendAutonomousInstructions(
  instructions: string[],
  candidates: PollSummaryItem[],
  partial = false,
): void {
  if (candidates.length === 0) return;
  const separate = candidates.some((item) => item.reasons.includes("ready-receipt-required"))
    ? " Run each command as its own session: one multi-PR `pr-shepherd <PR> <PR>` poll records no READY receipts."
    : "";
  instructions.push(
    `${instructions.length + 1}. ${partial ? "Start one concurrent one-PR session per command below, only for `owned` rows; none for layers without one." : "Start one concurrent one-PR session per command below; none for layers without one."}${separate}`,
  );
  for (const item of candidates) {
    instructions.push(`${instructions.length + 1}.${sessionInstruction(item)}`);
  }
}
