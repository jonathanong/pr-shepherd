import type { NextCheck, NextCheckReason } from "../types/next-check.mts";

/** A queued PR is rechecked about every five minutes, matching the poll cadence for queue waits. */
export const MERGE_QUEUE_RECHECK_SECONDS = 300;
/** Backstop for a missed GitHub event; events normally wake the session long before this. */
export const SAFETY_NET_SECONDS = 3000;

export interface NextCheckCandidate {
  reason: NextCheckReason;
  seconds: number;
}

/** The earliest candidate as a `NextCheck`, with `at` rounded up to a whole minute. */
export function earliestNextCheck(
  candidates: NextCheckCandidate[],
  nowMs: number = Date.now(),
): NextCheck | undefined {
  const first = [...candidates].sort((a, b) => a.seconds - b.seconds)[0];
  if (!first) return undefined;
  const atMs = Math.ceil((nowMs + Math.max(0, first.seconds) * 1000) / 60_000) * 60_000;
  return {
    at: new Date(atMs).toISOString().replace(/\.\d{3}Z$/, "Z"),
    inSeconds: Math.max(0, Math.round((atMs - nowMs) / 1000)),
    reason: first.reason,
  };
}

interface NextCheckFacts {
  /** The action Shepherd returned for this tick. */
  action: "wait" | "ready" | "mark_ready" | "fix_code" | "merge" | "cancel" | "escalate";
  /** Ready-delay seconds left; only meaningful for `ready`. */
  remainingSeconds?: number;
  queued?: boolean;
  /** A `merge` tick whose printed command is a REST merge request, which can stay `pending`. */
  restMerge?: boolean;
  /** A native-stack draft hold: repeating this one-PR session cannot advance it. */
  stackDraftHold?: boolean;
  /** Unix seconds when an unchanged state would trip the stall timeout. */
  stallDeadlineSeconds?: number;
}

/**
 * Deadlines for one PR, or none when the caller must not wait for one. `mark_ready` has none:
 * its tick saw a draft, so only an immediate rerun can start the ready-delay timer. A REST
 * merge can return `pending`, so it keeps a wake-up to resume the recorded request.
 */
export function nextCheckCandidates(facts: NextCheckFacts, nowMs: number): NextCheckCandidate[] {
  if (facts.action === "merge" && facts.restMerge) {
    return [{ reason: "merge-pending", seconds: MERGE_QUEUE_RECHECK_SECONDS }];
  }
  const terminal = ["cancel", "escalate", "merge", "mark_ready"].includes(facts.action);
  if (terminal || facts.stackDraftHold) return [];
  const candidates: NextCheckCandidate[] = [];
  if (facts.action === "ready" && (facts.remainingSeconds ?? 0) > 0) {
    candidates.push({ reason: "ready-delay", seconds: facts.remainingSeconds! });
  } else if (facts.queued && facts.action === "wait") {
    candidates.push({ reason: "merge-queue", seconds: MERGE_QUEUE_RECHECK_SECONDS });
  } else {
    candidates.push({ reason: "safety-net", seconds: SAFETY_NET_SECONDS });
  }
  if (facts.stallDeadlineSeconds !== undefined) {
    candidates.push({
      reason: "stall-timeout",
      seconds: facts.stallDeadlineSeconds - nowMs / 1000,
    });
  }
  return candidates;
}
