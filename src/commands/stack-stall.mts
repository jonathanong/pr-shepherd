import {
  clearStackStallState,
  readStackStallState,
  writeStackStallState,
} from "../state/stack-stall.mts";
import type { PollSummaryItem, PollSummaryResult } from "../types.mts";
import { formatDurationApprox } from "./iterate/escalate.mts";
import { summaryStatusSignature } from "./poll-summary-signature.mts";
import { describeIdleLayers } from "./stack-drain.mts";

/**
 * A `--stack` plan that can only wait never reruns its layers' one-PR sessions, so their own
 * stall guards cannot fire. Escalate `stall-timeout` once that idle plan's fingerprint stays
 * unchanged for `stallTimeoutSeconds`; any other plan, or `0`, clears the timer. When the enabled
 * timer cannot be read or written, escalate `stall-state-unavailable` instead of restarting it.
 */
export async function applyStackStallGuard(
  planned: { result: PollSummaryResult; idle?: PollSummaryItem[] },
  repo: { owner: string; name: string },
  stallTimeoutSeconds: number,
): Promise<PollSummaryResult> {
  const { result, idle } = planned;
  if (result.selection.kind !== "stack") return result;
  const key = { owner: repo.owner, repo: repo.name, stack: result.selection.stackNumber };
  if (!idle || stallTimeoutSeconds <= 0) {
    await clearStackStallState(key);
    return result;
  }

  const fingerprint = stackStallFingerprint(result);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const read = await readStackStallState(key);
  if (!read.ok) return stackStateUnavailable(result, read.reason);
  const stored = read.state;
  if (!stored || stored.fingerprint !== fingerprint || stored.firstSeenAt > nowSeconds) {
    const wrote = await writeStackStallState(key, { fingerprint, firstSeenAt: nowSeconds });
    if (!wrote.ok) return stackStateUnavailable(result, wrote.reason);
    return result;
  }
  const ageSeconds = nowSeconds - stored.firstSeenAt;
  if (ageSeconds < stallTimeoutSeconds) return result;
  return {
    ...result,
    reason: "actionable",
    nextAction: "escalate",
    stackMergeable: false,
    instructions: [
      `1. \`stall-timeout\`: the stack has not changed for ${formatDurationApprox(ageSeconds)} while no one-PR session could advance it: ${describeIdleLayers(idle)}. Stop and ask a human to unblock the waiting layers.`,
    ],
  };
}

/**
 * Unix seconds when an unchanged idle stack plan trips `stall-timeout`, or undefined when no
 * stack timer is running. Event mode schedules its next tick no later than this.
 */
export async function readStackStallDeadline(
  result: PollSummaryResult,
  stallTimeoutSeconds: number,
): Promise<number | undefined> {
  const [owner, repo] = result.repo.split("/");
  if (result.selection.kind !== "stack" || stallTimeoutSeconds <= 0 || !owner || !repo)
    return undefined;
  const read = await readStackStallState({ owner, repo, stack: result.selection.stackNumber });
  return read.ok && read.state ? read.state.firstSeenAt + stallTimeoutSeconds : undefined;
}

function stackStateUnavailable(result: PollSummaryResult, reason: string): PollSummaryResult {
  return {
    ...result,
    reason: "actionable",
    nextAction: "escalate",
    stackMergeable: false,
    instructions: [
      `1. \`stall-state-unavailable\`: the stack stall timer could not be saved (${reason}). Stop and ask a human to fix the state directory before resuming.`,
    ],
  };
}

/** The status signature plus the per-layer evidence it omits, so a push resets the timer. */
function stackStallFingerprint(result: PollSummaryResult): string {
  return JSON.stringify({
    status: summaryStatusSignature(result),
    layers: result.prs.map((item) => ({
      pr: item.pr,
      headRefOid: item.headRefOid,
      isDraft: item.isDraft,
      readyReceipt: item.readyReceipt,
      reasons: item.reasons,
    })),
  });
}
