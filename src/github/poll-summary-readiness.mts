import type { PollSummaryChecks, PollSummaryReview } from "../types.mts";
import { summarizePollSummaryChecks } from "./poll-summary-checks.mts";
import { parseBranchRules } from "./batch-parsers-rules.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";

/** Fresh compact evidence required before a READY receipt can be used. */
export function isCurrentSummaryReady(
  raw: RawSummaryPr,
  checks: PollSummaryChecks,
  review: PollSummaryReview,
  options: { allowQueuedProgress?: boolean } = {},
): boolean {
  const queued = options.allowQueuedProgress === true && raw.isInMergeQueue;
  // Merge-group checks may still be running after the PR earned its receipt;
  // source-commit checks must remain complete. A fresh pending source check is
  // not made ready merely by entering the queue.
  const sourceChecks = queued
    ? summarizePollSummaryChecks({ ...raw, mergeQueueEntry: null })
    : checks;
  // The full one-PR check already surfaces review feedback. Certification
  // need not reread historical conversations unless their resolution is a
  // merge requirement. GitHub's CLEAN state proves that requirement is
  // satisfied. BLOCKED is not conversation-specific, and queue progress
  // alone is not that proof.
  const requiresConversationResolution = parseBranchRules(
    raw.baseRef,
  ).requiresConversationResolution;
  return (
    checks.incomplete !== true &&
    sourceChecks.incomplete !== true &&
    (review.incomplete !== true ||
      !requiresConversationResolution ||
      raw.mergeStateStatus === "CLEAN") &&
    raw.state === "OPEN" &&
    !raw.isDraft &&
    raw.mergeable !== "CONFLICTING" &&
    raw.mergeStateStatus !== "DIRTY" &&
    (queued || raw.mergeable === "MERGEABLE") &&
    (queued ||
      !["DIRTY", "BEHIND", "UNKNOWN", "BLOCKED", "HAS_HOOKS"].includes(raw.mergeStateStatus)) &&
    (checks.failing ?? 0) === 0 &&
    (sourceChecks.failing ?? 0) === 0 &&
    (sourceChecks.inProgress ?? 0) === 0 &&
    (checks.unreportedRequired?.length ?? 0) === 0 &&
    (review.actionable ?? 0) === 0
  );
}
