/**
 * Derives a shepherd `MergeStatusResult` from raw PR data.
 *
 * `pr.state` is passed through unchanged; `iterate` handles the cancel action
 * for non-OPEN (merged/closed) PRs — this function does not branch on it.
 *
 * Interpretation order for `status` — first match wins:
 *   1. mergeable == CONFLICTING       → CONFLICTS (hard conflict even for drafts)
 *   2. copilotReviewInProgress        → BLOCKED
 *   3. mergeStateStatus DIRTY         → CONFLICTS (GitHub merge conflicts, even for drafts)
 *   4. isDraft                        → DRAFT
 *   5. mergeStateStatus BEHIND        → BEHIND
 *   6. mergeStateStatus BLOCKED / HAS_HOOKS → BLOCKED
 *   7. mergeStateStatus UNSTABLE      → UNSTABLE
 *   8. mergeStateStatus UNKNOWN       → UNKNOWN
 *   9. mergeStateStatus CLEAN         → CLEAN
 */

import type { BatchPrData, MergeStatusResult } from "../types.mts";
import { loadConfig } from "../config/load.mts";

export function deriveMergeStatus(pr: BatchPrData): MergeStatusResult {
  const copilotReviewInProgress = detectCopilotReview(pr);

  let status: MergeStatusResult["status"];

  if (pr.mergeable === "CONFLICTING") {
    status = "CONFLICTS";
  } else if (copilotReviewInProgress) {
    status = "BLOCKED";
  } else if (pr.mergeStateStatus === "DIRTY") {
    // DIRTY means GitHub detected merge conflicts — surface as CONFLICTS even for drafts.
    status = "CONFLICTS";
  } else if (pr.isDraft || pr.mergeStateStatus === "DRAFT") {
    status = "DRAFT";
  } else if (pr.mergeStateStatus === "BEHIND") {
    status = "BEHIND";
  } else if (pr.mergeStateStatus === "BLOCKED" || pr.mergeStateStatus === "HAS_HOOKS") {
    status = "BLOCKED";
  } else if (pr.mergeStateStatus === "UNSTABLE") {
    status = "UNSTABLE";
  } else if (pr.mergeStateStatus === "UNKNOWN") {
    status = "UNKNOWN";
  } else {
    status = "CLEAN";
  }

  return {
    status,
    state: pr.state,
    isDraft: pr.isDraft,
    mergeable: pr.mergeable,
    reviewDecision: pr.reviewDecision,
    copilotReviewInProgress,
    mergeStateStatus: pr.mergeStateStatus,
  };
}

// ---------------------------------------------------------------------------
// Copilot review detection
// ---------------------------------------------------------------------------

function detectCopilotReview(pr: BatchPrData): boolean {
  // A blocking bot review is "in progress" when:
  //   1. Any reviewRequest has a login starting with one of the configured prefixes, OR
  //   2. Any latestReview has such a login AND state == "PENDING"
  const prefixes = loadConfig().mergeStatus.blockingReviewerLogins.map((l) => l.toLowerCase());
  const isBlocking = (login: string) => prefixes.some((p) => login.toLowerCase().startsWith(p));

  const requested = pr.reviewRequests.some((r) => isBlocking(r.login));
  const pendingReview = pr.latestReviews.some((r) => isBlocking(r.login) && r.state === "PENDING");

  return requested || pendingReview;
}
