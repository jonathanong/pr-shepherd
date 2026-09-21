import type { PollSummaryChecks, PollSummaryReview } from "../types.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";

/** Fresh compact evidence required before a READY receipt can be used. */
export function isCurrentSummaryReady(
  raw: RawSummaryPr,
  checks: PollSummaryChecks,
  review: PollSummaryReview,
  options: { allowQueuedProgress?: boolean } = {},
): boolean {
  return (
    checks.incomplete !== true &&
    review.incomplete !== true &&
    raw.state === "OPEN" &&
    !raw.isDraft &&
    ((raw.isInMergeQueue && options.allowQueuedProgress) || raw.mergeable !== "CONFLICTING") &&
    ((raw.isInMergeQueue && options.allowQueuedProgress) ||
      !["DIRTY", "BEHIND", "UNKNOWN"].includes(raw.mergeStateStatus)) &&
    (checks.failing ?? 0) === 0 &&
    ((raw.isInMergeQueue && options.allowQueuedProgress) || (checks.inProgress ?? 0) === 0) &&
    (review.actionable ?? 0) === 0
  );
}
