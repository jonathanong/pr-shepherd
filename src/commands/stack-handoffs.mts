import type { PollSummaryItem, PollSummaryResult } from "../types.mts";
import { stackPosition } from "./stack-merge-scope.mts";
/** Layers only a human can resolve: a closed layer or an escalation. An unreadable state waits instead. */
export interface HumanHandoffs {
  closedDependency?: PollSummaryItem;
  closedLayer?: PollSummaryItem;
  escalated: PollSummaryItem[];
}

export function findHumanHandoffs(result: PollSummaryResult): HumanHandoffs | undefined {
  const lastOpen = result.prs.filter((item) => item.state === "OPEN").at(-1);
  const closedDependency = result.prs.find(
    (item) => item.state === "CLOSED" && lastOpen && stackPosition(item) < stackPosition(lastOpen),
  );
  const closedLayer = result.prs.find((item) => item.state === "CLOSED");
  const escalated = result.prs.filter((item) => item.action === "escalate");
  return closedDependency || closedLayer || escalated.length > 0
    ? { closedDependency, closedLayer, escalated }
    : undefined;
}

/** Name every human handoff; `stop` when no autonomous work precedes it. */
export function appendHumanHandoffInstructions(
  instructions: string[],
  { closedDependency, closedLayer, escalated }: HumanHandoffs,
  stop: boolean,
): void {
  const ask = stop ? "Stop and ask" : "After autonomous shepherding, ask";
  if (closedDependency) {
    instructions.push(
      `${instructions.length + 1}. PR #${closedDependency.pr} was closed without merging below an open layer. ${ask} the stack owner whether to restore that dependency or rebuild the upper branches.`,
    );
  }
  if (closedLayer && closedLayer.pr !== closedDependency?.pr) {
    instructions.push(
      `${instructions.length + 1}. PR #${closedLayer.pr} was closed without merging. ${ask} the stack owner to reconcile this layer before declaring the stack complete.`,
    );
  }
  for (const item of escalated) {
    if (item.pr === closedDependency?.pr || item.pr === closedLayer?.pr) continue;
    instructions.push(
      `${instructions.length + 1}. PR #${item.pr} requires human action (${item.reasons.join(", ")}). ${stop ? "Stop for that decision." : "Keep shepherding other PRs before the handoff."}`,
    );
  }
}
