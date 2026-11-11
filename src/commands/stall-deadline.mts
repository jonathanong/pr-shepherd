import { loadConfig } from "../config/load.mts";
import { readStallState } from "../state/iterate-stall.mts";
import type { IterateResult, PollSummaryResult } from "../types.mts";
import { readStackStallDeadline } from "./stack-stall.mts";

export function earliestDeadline(...deadlines: (number | undefined)[]): number | undefined {
  const known = deadlines.filter((d): d is number => d !== undefined);
  return known.length > 0 ? Math.min(...known) : undefined;
}

/**
 * The `deadlineAt` (epoch ms) for an aggregate tick's event wait: a stack stall timer or a
 * ready-delay countdown. No event announces either, so the wait must not outlast them.
 */
export async function aggregateDeadline(
  result: PollSummaryResult,
  stallTimeoutSeconds: number | undefined,
): Promise<WaitDeadline | undefined> {
  const stall = await readStackStallDeadline(
    result,
    stallTimeoutSeconds ?? loadConfig().iterate["stall-timeout-minutes"] * 60,
  );
  const ready = result.prs
    .filter((item) => (item.remainingSeconds ?? 0) > 0)
    .map((item): Candidate => [Date.now() / 1000 + item.remainingSeconds!, "ready-delay"]);
  return firstDeadline([stall, "stall-timeout"], ...ready);
}

/** The `deadlineAt` for a single-PR wait: the stall timeout or the CI-start timeout. */
export async function onePrDeadline(
  result: IterateResult,
  opts: { stallTimeoutSeconds?: number },
  sink: { ciStartDeadlineSeconds?: number },
): Promise<WaitDeadline | undefined> {
  return firstDeadline(
    [await readStallDeadline(result, opts.stallTimeoutSeconds), "stall-timeout"],
    [result.action === "wait" ? sink.ciStartDeadlineSeconds : undefined, "CI-start"],
  );
}

/** A capped event wait's deadline (epoch ms) and the timer it belongs to, for the wake log. */
export interface WaitDeadline {
  deadlineAt: number;
  deadlineReason: string;
}

type Candidate = [seconds: number | undefined, reason: string];

function firstDeadline(...candidates: Candidate[]): WaitDeadline | undefined {
  let first: WaitDeadline | undefined;
  for (const [seconds, reason] of candidates) {
    if (seconds !== undefined && (first === undefined || seconds * 1000 < first.deadlineAt)) {
      first = { deadlineAt: seconds * 1000, deadlineReason: reason };
    }
  }
  return first;
}

/** When an unchanged state would trip the stall timeout, or undefined when no timer is running. */
export async function readStallDeadline(
  result: IterateResult,
  stallTimeoutSeconds: number | undefined,
): Promise<number | undefined> {
  if (result.action !== "wait") return undefined;
  const timeout = stallTimeoutSeconds ?? loadConfig().iterate["stall-timeout-minutes"] * 60;
  const [owner, repo] = result.repo.split("/");
  if (timeout <= 0 || !owner || !repo) return undefined;
  const read = await readStallState({ owner, repo, pr: result.pr });
  return read.ok && read.state ? read.state.firstSeenAt + timeout : undefined;
}
