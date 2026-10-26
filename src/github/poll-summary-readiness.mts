import type { PollSummaryChecks, PollSummaryReview } from "../types.mts";
import { summarizePollSummaryChecks } from "./poll-summary-checks.mts";
import { parseBranchRules } from "./batch-parsers-rules.mts";
import { rulesComplete } from "./fingerprint-fields.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";
import { hasNoRelevantChecks } from "./poll-summary-unreported.mts";
import { isKnownMergeStateStatus, transportReadinessGaps } from "./transport-evidence.mts";

/**
 * Fresh compact evidence required before a READY receipt can be used.
 * `allowBlocked` asks whether GitHub's BLOCKED state is the only gap, so a
 * caller can tell a blocker it cannot clear from missing or stale evidence.
 */
export function isCurrentSummaryReady(
  raw: RawSummaryPr,
  checks: PollSummaryChecks,
  review: PollSummaryReview,
  options: { allowQueuedProgress?: boolean; allowBlocked?: boolean } = {},
): boolean {
  const blockedStates = options.allowBlocked
    ? ["DIRTY", "BEHIND", "UNKNOWN", "HAS_HOOKS"]
    : ["DIRTY", "BEHIND", "UNKNOWN", "BLOCKED", "HAS_HOOKS"];
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
    isKnownMergeStateStatus(raw.mergeStateStatus) &&
    transportReadinessGaps(raw, raw.mergeStateStatus).length === 0 &&
    checks.incomplete !== true &&
    sourceChecks.incomplete !== true &&
    (review.incomplete !== true ||
      raw.mergeStateStatus === "CLEAN" ||
      (rulesComplete(raw.baseRef) && !requiresConversationResolution)) &&
    raw.state === "OPEN" &&
    !raw.isDraft &&
    raw.mergeable !== "CONFLICTING" &&
    raw.mergeStateStatus !== "DIRTY" &&
    (queued || raw.mergeable === "MERGEABLE") &&
    (queued || !blockedStates.includes(raw.mergeStateStatus)) &&
    (checks.failing ?? 0) === 0 &&
    (checks.annotated ?? 0) === 0 &&
    (sourceChecks.failing ?? 0) === 0 &&
    (sourceChecks.inProgress ?? 0) === 0 &&
    (checks.unreportedRequired?.length ?? 0) === 0 &&
    !(checks.actionsWorkflowInProgress === true && hasNoRelevantChecks(checks)) &&
    (review.actionable ?? 0) === 0
  );
}
