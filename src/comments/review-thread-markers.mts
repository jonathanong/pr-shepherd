import { markReviewInlineThreads, markReviewUnresolvedThreads } from "../state/seen-comments.mts";
import type { ReviewThread } from "../types.mts";

interface StateKey {
  owner: string;
  repo: string;
  pr: number;
}

function groupInlineThreadsByReview(
  threads: readonly ReviewThread[],
): Map<string, { all: string[]; unresolved: string[] }> {
  const byReview = new Map<string, { all: Set<string>; unresolved: Set<string> }>();
  for (const thread of threads) {
    if (thread.reviewId === undefined) continue;
    const entry = byReview.get(thread.reviewId) ?? {
      all: new Set<string>(),
      unresolved: new Set<string>(),
    };
    entry.all.add(thread.id);
    if (thread.isResolved !== true) entry.unresolved.add(thread.id);
    byReview.set(thread.reviewId, entry);
  }
  return new Map(
    [...byReview.entries()].map(([reviewId, entry]) => [
      reviewId,
      {
        all: [...entry.all].sort((a, b) => a.localeCompare(b)),
        unresolved: [...entry.unresolved].sort((a, b) => a.localeCompare(b)),
      },
    ]),
  );
}

export async function markReviewInlineThreadMarkers(
  key: StateKey,
  threads: readonly ReviewThread[],
  reviewIds: readonly string[] = [],
): Promise<void> {
  const grouped = groupInlineThreadsByReview(threads);
  const writes: Promise<void>[] = [...grouped.entries()].map(([reviewId, entry]) =>
    markReviewInlineThreads(key, reviewId, entry.all, entry.unresolved),
  );
  for (const reviewId of new Set(reviewIds)) {
    if (!grouped.has(reviewId)) writes.push(markReviewUnresolvedThreads(key, reviewId, []));
  }
  await Promise.allSettled(writes);
}
