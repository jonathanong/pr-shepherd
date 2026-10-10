import type { PollSummaryItem, PollSummaryResult } from "../types.mts";
import { stackPosition } from "./stack-drain.mts";
/** Layers only a human can resolve: a closed dependency, an unverified state, or an escalation. */
export interface HumanHandoffs {
  closedDependency?: PollSummaryItem;
  unverified?: PollSummaryItem;
  escalated: PollSummaryItem[];
}

export function findHumanHandoffs(result: PollSummaryResult): HumanHandoffs | undefined {
  const lastOpen = result.prs.filter((item) => item.state === "OPEN").at(-1);
  const closedDependency = result.prs.find(
    (item) => item.state === "CLOSED" && lastOpen && stackPosition(item) < stackPosition(lastOpen),
  );
  const unverified = result.prs.find((item) => item.state !== "OPEN" && item.state !== "MERGED");
  const escalated = result.prs.filter((item) => item.action === "escalate");
  return closedDependency || unverified || escalated.length > 0
    ? { closedDependency, unverified, escalated }
    : undefined;
}

/** Name every human handoff; `stop` when no autonomous work precedes it. */
export function appendHumanHandoffInstructions(
  instructions: string[],
  { closedDependency, unverified, escalated }: HumanHandoffs,
  stop: boolean,
): void {
  const ask = stop ? "Stop and ask" : "After autonomous shepherding, ask";
  if (closedDependency) {
    instructions.push(
      `${instructions.length + 1}. PR #${closedDependency.pr} was closed without merging below an open layer. ${ask} the stack owner whether to restore that dependency or rebuild the upper branches.`,
    );
  }
  if (unverified && unverified.pr !== closedDependency?.pr) {
    instructions.push(
      `${instructions.length + 1}. PR #${unverified.pr} has state \`${unverified.state}\` rather than open or merged. ${ask} the stack owner to reconcile this layer before declaring the stack complete.`,
    );
  }
  for (const item of escalated) {
    if (item.pr === closedDependency?.pr || item.pr === unverified?.pr) continue;
    instructions.push(
      `${instructions.length + 1}. PR #${item.pr} requires human action (${item.reasons.join(", ")}). ${stop ? "Stop for that decision." : "Keep shepherding other PRs before the handoff."}`,
    );
  }
}
