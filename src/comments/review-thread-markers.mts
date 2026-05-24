import { markReviewInlineThreads } from "../state/seen-comments.mts";
import type { ReviewThread } from "../types.mts";

interface StateKey {
  owner: string;
  repo: string;
  pr: number;
}

function groupInlineThreadIdsByReview(threads: readonly ReviewThread[]): Map<string, string[]> {
  const byReview = new Map<string, Set<string>>();
  for (const thread of threads) {
    if (thread.reviewId === undefined) continue;
    const ids = byReview.get(thread.reviewId) ?? new Set<string>();
    ids.add(thread.id);
    byReview.set(thread.reviewId, ids);
  }
  return new Map(
    [...byReview.entries()].map(([reviewId, ids]) => [
      reviewId,
      [...ids].sort((a, b) => a.localeCompare(b)),
    ]),
  );
}

export async function markReviewInlineThreadMarkers(
  key: StateKey,
  threads: readonly ReviewThread[],
): Promise<void> {
  await Promise.allSettled(
    [...groupInlineThreadIdsByReview(threads)].map(([reviewId, inlineThreadIds]) =>
      markReviewInlineThreads(key, reviewId, inlineThreadIds),
    ),
  );
}
