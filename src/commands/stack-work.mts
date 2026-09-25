import type { PollSummaryItem } from "../types.mts";

type ProbedLayer = PollSummaryItem & { pollCommand: string; pollProbe: true };

/**
 * The one-PR hold reason for a `READY` draft that only the disabled setting keeps in draft. The
 * probe re-reads the draft, so this phrase, not a bare `[WAIT]`, proves it is still clean.
 */
export const AUTO_MARK_READY_DISABLED_HOLD = "automatic mark-ready is disabled for this session";

/** How the stack selector routes the autonomous layers that still need work. */
export interface StackWork {
  /** Layers that need a one-PR Shepherd session, with or without a known command. */
  sessions: PollSummaryItem[];
  /** Clean, unblocked drafts that the agent marks ready because the poll loop will not. */
  markReady: ProbedLayer[];
  /** Layers whose bounded probe could only report that they are still waiting. */
  idle: ProbedLayer[];
}

/**
 * Split autonomous stack candidates by what the agent can do for each. A bounded probe cannot
 * mark a draft ready, so rerunning it for a waiting layer cannot change the stack. A probed wait
 * kept in draft only by the disabled mark-ready setting is the agent's ready-for-review step.
 * A stale-ancestry child keeps its session, which returns the ancestry repair.
 */
export function splitStackWork(
  candidates: PollSummaryItem[],
  staleChildren: ReadonlySet<number>,
): StackWork {
  const work: StackWork = { sessions: [], markReady: [], idle: [] };
  for (const item of candidates) {
    if (!isProbed(item) || item.action !== "wait" || staleChildren.has(item.pr)) {
      work.sessions.push(item);
    } else if (item.reasons.includes("draft-auto-mark-ready-disabled")) {
      work.markReady.push(item);
    } else {
      work.idle.push(item);
    }
  }
  return work;
}

/**
 * The poll loop leaves a disabled draft's ready transition to the agent. The bounded probe runs
 * first because only the one-PR session reads the full review context.
 */
export function appendMarkReadyInstructions(instructions: string[], layers: ProbedLayer[]): void {
  for (const item of layers) {
    instructions.push(
      `${instructions.length + 1}. Automatic mark-ready is disabled, so marking PR #${item.pr} ready for review is your step. Run \`${item.pollCommand}\` first. If it returns \`[WAIT]\` saying PR #${item.pr} stays in draft because ${AUTO_MARK_READY_DISABLED_HOLD}, run \`gh pr ready ${item.pr} -R ${item.repo}\`; otherwise complete its instructions and leave PR #${item.pr} in draft this round.`,
    );
  }
}

function isProbed(item: PollSummaryItem): item is ProbedLayer {
  return item.pollProbe === true && item.pollCommand !== undefined;
}
