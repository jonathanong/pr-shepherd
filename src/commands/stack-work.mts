import type { PollSummaryItem } from "../types.mts";

/** How the stack selector routes the autonomous layers that still need work. */
export interface StackWork {
  /** Layers that need a one-PR Shepherd session, with or without a known command. */
  sessions: PollSummaryItem[];
  /** Clean drafts held by the disabled ready transition. No more work is scheduled for them. */
  held: PollSummaryItem[];
  /** Layers whose bounded probe could only report that they are still waiting. */
  idle: PollSummaryItem[];
}

export function isDraftReadinessVerification(item: PollSummaryItem): boolean {
  return item.reasons?.includes("draft-readiness-verification-required") === true;
}

/** A full one-PR check is the final task when the compact review sample was incomplete. */
export function onlyDraftReadinessVerification(
  sessions: PollSummaryItem[],
  idle: PollSummaryItem[],
): boolean {
  return sessions.length > 0 && idle.length === 0 && sessions.every(isDraftReadinessVerification);
}

/**
 * Split autonomous stack candidates by what the agent can do for each. A clean draft held by
 * disabled mark-ready is complete for this run. Other bounded waits stay idle.
 * A stale-ancestry child keeps its session, which returns the ancestry repair.
 */
export function splitStackWork(
  candidates: PollSummaryItem[],
  staleChildren: ReadonlySet<number>,
): StackWork {
  const work: StackWork = { sessions: [], held: [], idle: [] };
  for (const item of candidates) {
    if (item.reasons.includes("draft-auto-mark-ready-disabled") && !staleChildren.has(item.pr)) {
      work.held.push(item);
    } else if (!isProbed(item) || item.action !== "wait" || staleChildren.has(item.pr)) {
      work.sessions.push(item);
    } else {
      work.idle.push(item);
    }
  }
  return work;
}

function isProbed(item: PollSummaryItem): boolean {
  return item.pollProbe === true && item.pollCommand !== undefined;
}

/**
 * Work exists, but every routed layer belongs to another author: rerunning the stack selector
 * cannot change anything, so the caller reports the overview and stops instead.
 */
function onlyUnownedWork(layers: PollSummaryItem[]): boolean {
  return layers.length > 0 && layers.every((item) => !item.owned);
}

/**
 * The closing step after routed sessions: rerun the selector, or stop when nothing is owned.
 * Returns the plan action: a stop is a handoff, so no rerun, quota cadence, or wake-up follows it.
 */
export function appendStackRerunInstruction(
  instructions: string[],
  layers: PollSummaryItem[],
  rerun: string,
): "shepherd" | "escalate" {
  const stop = onlyUnownedWork(layers);
  instructions.push(
    `${instructions.length + 1}. ${stop ? "No owned layer needs a session. Report this overview and stop." : rerun}`,
  );
  return stop ? "escalate" : "shepherd";
}
