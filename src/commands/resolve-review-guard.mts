import {
  checkThreadsStillUnresolved,
  findUnresolvedThreadsByReviewId,
  isReviewNodeId,
} from "../github/review-unresolved-threads.mts";
import { loadSeenMap, markReviewUnresolvedThreads } from "../state/seen-comments.mts";

export const BLOCKED_REVIEW_INSTRUCTION =
  "Resolve every unresolved inline thread belonging to the blocked review(s) first, then run a separate `apply review` command to dismiss/hide the review.";

export function collectReviewIdsToGuard(
  dismissReviewIds?: readonly string[],
  minimizeCommentIds?: readonly string[],
): string[] {
  return [
    ...new Set([...(dismissReviewIds ?? []), ...(minimizeCommentIds ?? []).filter(isReviewNodeId)]),
  ];
}

export function formatBlockedReviewErrors(
  blockedByReview: ReadonlyMap<string, string[]>,
): string[] {
  return [...blockedByReview.entries()].map(([reviewId, threadIds]) => {
    const noun = threadIds.length === 1 ? "thread remains" : "threads remain";
    return `Refused to dismiss/hide review ${reviewId}: ${threadIds.length} unresolved inline ${noun} (${threadIds.join(", ")}). Resolve all inline threads first, then dismiss/hide the review in a separate command.`;
  });
}

/**
 * Determine which target review IDs still have unresolved inline threads.
 *
 * Uses local seen-marker tracking (`unresolvedInlineThreadIds`) so reviews whose
 * inline threads were already resolved require zero GitHub calls. GitHub is only
 * queried when local state still lists unresolved thread IDs (targeted `nodes(ids:)`
 * lookup to detect out-of-band resolution) or when no local record exists yet.
 */
export async function resolveBlockedReviews(
  stateKey: { owner: string; repo: string; pr: number },
  prNumber: number,
  repo: { owner: string; name: string },
  reviewIds: readonly string[],
): Promise<Map<string, string[]>> {
  const seen = await loadSeenMap(stateKey);
  const blocked = new Map<string, string[]>();
  const cachedWithUnresolved = new Map<string, string[]>();
  const coldReviewIds: string[] = [];

  for (const reviewId of reviewIds) {
    const raw = seen.get(reviewId)?.unresolvedInlineThreadIds;
    if (!Array.isArray(raw)) {
      coldReviewIds.push(reviewId);
      continue;
    }
    const pending = raw.filter((id): id is string => typeof id === "string");
    if (pending.length > 0) cachedWithUnresolved.set(reviewId, pending);
    // Empty cached array means all inline threads were already resolved — zero GitHub calls.
  }

  if (cachedWithUnresolved.size > 0) {
    const allPending = [...new Set([...cachedWithUnresolved.values()].flat())];
    const stillUnresolved = await checkThreadsStillUnresolved(prNumber, repo, allPending);
    const updates: Promise<void>[] = [];
    for (const [reviewId, pending] of cachedWithUnresolved) {
      const remaining = pending.filter((id) => stillUnresolved.has(id));
      if (remaining.length > 0) blocked.set(reviewId, remaining);
      if (remaining.length !== pending.length) {
        updates.push(markReviewUnresolvedThreads(stateKey, reviewId, remaining));
      }
    }
    await Promise.allSettled(updates);
  }

  if (coldReviewIds.length > 0) {
    const coldBlocked = await findUnresolvedThreadsByReviewId(prNumber, repo, coldReviewIds);
    await Promise.allSettled(
      coldReviewIds.map((reviewId) =>
        markReviewUnresolvedThreads(stateKey, reviewId, coldBlocked.get(reviewId) ?? []),
      ),
    );
    for (const [reviewId, threadIds] of coldBlocked) {
      blocked.set(reviewId, threadIds);
    }
  }

  return blocked;
}
