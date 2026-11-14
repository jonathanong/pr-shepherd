export { findHumanHandoffs, appendHumanHandoffInstructions } from "./stack-handoffs.mts";
import type { PollSummaryItem, StackNextAction } from "../types.mts";
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
      `1. No one-PR session can advance the stack yet: ${describeIdleLayers(idle)}. Recheck at the configured polling cadence.`,
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
    ? " That session fixes failing queue CI, or escalates when the removal has no concrete fix."
    : "";
  return `${removal} Run \`${item.pollCommand}\`.${queueNote}`;
}
export function describeIdleLayers(idle: PollSummaryItem[]): string {
  return idle.map((item) => `PR #${item.pr} (${item.reasons.join(", ")})`).join("; ");
}

export function appendAutonomousInstructions(
  instructions: string[],
  candidates: PollSummaryItem[],
): void {
  if (candidates.length === 0) return;
  instructions.push(
    `${instructions.length + 1}. Start or delegate concurrent one-PR sessions only for \`owned\` rows. Leave other layers untouched.`,
  );
  for (const item of candidates) {
    instructions.push(`${instructions.length + 1}.${sessionInstruction(item)}`);
  }
}
