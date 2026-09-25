import type { PollSummaryItem, StackLayerBlockReason } from "../types.mts";

/**
 * Why a native stack layer is not ready to merge, or undefined when it is.
 * A draft is marked ready by its own session; this predicate does not gate that.
 */
export function stackLayerBlockReason(item: PollSummaryItem): StackLayerBlockReason | undefined {
  if (item.state !== "OPEN") return "closed";
  if (item.isDraft) return "draft";
  if (item.mergeable === "CONFLICTING" || item.mergeStateStatus === "DIRTY") return "conflicting";
  // A receipt only establishes readiness after a merge-queue removal once
  // the one-PR session has observed and acknowledged that exact removal.
  // The aggregate projection preserves an unacknowledged removal here, so
  // the layer is not ready to merge.
  if (item.queueRemoval) return "queue-removal";
  if ((item.checks?.failing ?? 0) > 0) return "failing-checks";
  if ((item.review?.actionable ?? 0) > 0) return "review-work";
  // Merge-group checks and the queue's own merge state supersede the source
  // PR's while it is queued.
  if (!item.isInMergeQueue) {
    if ((item.checks?.inProgress ?? 0) > 0) return "checks-in-progress";
    if (
      item.mergeable !== "MERGEABLE" ||
      ["BEHIND", "UNKNOWN", "BLOCKED", "HAS_HOOKS"].includes(item.mergeStateStatus)
    )
      return "merge-state";
  }
  // A layer that looks ready but has not completed its own one-PR receipt
  // is not ready to merge.
  return item.readyReceipt === true ? undefined : "no-ready-receipt";
}
