import type { BatchPartition } from "../classify/apply.mts";
import type { PrActivitySummary } from "../types.mts";

/**
 * Drop rule-suppressed items from the activity digest, matching what `check` hides from the
 * agent. IDs whose automatic minimize/resolve was denied stay visible: `check` surfaces those
 * once so the caller can act. `reviewRoundCount` is raw review history and stays unchanged.
 */
export function filterSuppressedActivity(
  activity: PrActivitySummary | undefined,
  partition: BatchPartition,
  denied: Iterable<string>,
): PrActivitySummary | undefined {
  if (!activity) return activity;
  const deniedIds = new Set(denied);
  const hidden = (id: string, suppressed: ReadonlySet<string>): boolean =>
    suppressed.has(id) && !deniedIds.has(id);
  const reviewItemsSinceLatestCommit = activity.reviewItemsSinceLatestCommit.filter((item) => {
    switch (item.kind) {
      case "pr-comment":
        return !hidden(item.id, partition.suppressedCommentIds);
      case "review-thread-comment":
        return !item.threadId || !hidden(item.threadId, partition.suppressedThreadIds);
      case "review-summary":
        return !hidden(item.id, partition.suppressedReviewSummaryIds);
      case "changes-requested-review":
        return !partition.suppressedChangesRequestedIds.has(item.id);
      default:
        return true;
    }
  });
  return { ...activity, reviewItemsSinceLatestCommit };
}
