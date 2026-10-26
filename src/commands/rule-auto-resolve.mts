import type { BatchPartition } from "../classify/apply.mts";
import { autoMinimizeComments, autoResolveThreads } from "../comments/resolve.mts";
import type { AutoMinimizedItem, AutoResolvedThread, ReviewThread } from "../types.mts";
import { canGenerateGithubMutation } from "../github/mutation-policy.mts";
import {
  decorateAutoResolveError,
  minimizedItem,
  reasonsForError,
  resolvedThread,
  uniqueReasons,
} from "./rule-auto-resolve-format.mts";

export interface RuleAutoResolveApplied {
  threadIds: string[];
  commentIds: string[];
  reviewSummaryIds: string[];
  autoResolved: AutoResolvedThread[];
  autoMinimized: AutoMinimizedItem[];
  autoResolveErrors: string[];
  errorReasons: string[];
}

interface MinimizableItem {
  id: string;
  url?: string;
  viewerCanMinimize?: boolean;
}

/** The part of a PR read the mutations need. A full batch and a compact summary both satisfy it. */
export interface RuleAutoResolveBatch {
  comments: readonly MinimizableItem[];
  reviewSummaries: readonly MinimizableItem[];
  reviewThreads: readonly ReviewThread[];
}

const EMPTY: RuleAutoResolveApplied = {
  threadIds: [],
  commentIds: [],
  reviewSummaryIds: [],
  autoResolved: [],
  autoMinimized: [],
  autoResolveErrors: [],
  errorReasons: [],
};

function idsIn(ids: readonly string[], confirmed: ReadonlySet<string>): string[] {
  return ids.filter((id) => confirmed.has(id));
}

function decorateErrors(
  errors: readonly string[],
  ids: readonly string[],
  ruleReasons: BatchPartition["ruleReasons"],
): string[] {
  return errors.map((error) =>
    decorateAutoResolveError(error, reasonsForError(error, ids, ruleReasons)),
  );
}

export async function applySuppressedRuleAutoResolve(input: {
  enabled: boolean;
  partition: BatchPartition;
  batch: RuleAutoResolveBatch;
}): Promise<RuleAutoResolveApplied> {
  if (!input.enabled) {
    return {
      ...EMPTY,
      threadIds: input.partition.ruleAutoResolveThreadIds,
      commentIds: input.partition.ruleAutoResolveCommentIds,
      reviewSummaryIds: input.partition.ruleAutoResolveReviewSummaryIds,
    };
  }
  const canMinimize = (items: readonly MinimizableItem[], id: string): boolean =>
    canGenerateGithubMutation(items.find((item) => item.id === id)?.viewerCanMinimize, "minimize");
  const threadFor = (id: string) => input.batch.reviewThreads.find((thread) => thread.id === id);
  const commentIds = input.partition.ruleAutoResolveCommentIds.filter(
    (id) => input.partition.suppressedCommentIds.has(id) && canMinimize(input.batch.comments, id),
  );
  const reviewSummaryIds = input.partition.ruleAutoResolveReviewSummaryIds.filter(
    (id) =>
      input.partition.suppressedReviewSummaryIds.has(id) &&
      canMinimize(input.batch.reviewSummaries, id),
  );
  const threadIds = input.partition.ruleAutoResolveThreadIds.filter(
    (id) =>
      input.partition.suppressedThreadIds.has(id) &&
      threadFor(id)?.isResolved === false &&
      canGenerateGithubMutation(threadFor(id)?.viewerCanResolve, "resolve"),
  );
  const minimizeIds = [...commentIds, ...reviewSummaryIds];
  const [minimized, resolved] = await Promise.all([
    minimizeIds.length > 0
      ? autoMinimizeComments(minimizeIds)
      : Promise.resolve({ minimized: [], errors: [] }),
    threadIds.length > 0
      ? autoResolveThreads(threadIds)
      : Promise.resolve({ resolved: [], errors: [] }),
  ]);
  const minimizedSet = new Set(minimized.minimized);
  const resolvedSet = new Set(resolved.resolved);
  const resolvedIds = idsIn(threadIds, resolvedSet);
  const minimizedCommentIds = idsIn(commentIds, minimizedSet);
  const minimizedSummaryIds = idsIn(reviewSummaryIds, minimizedSet);
  const threadsById = new Map(input.batch.reviewThreads.map((thread) => [thread.id, thread]));
  const commentsById = new Map(input.batch.comments.map((comment) => [comment.id, comment]));
  const summariesById = new Map(input.batch.reviewSummaries.map((review) => [review.id, review]));
  const autoResolved = resolvedIds.flatMap((id) => {
    const thread = threadsById.get(id);
    return thread ? [resolvedThread(thread, input.partition.ruleReasons.get(id) ?? [])] : [];
  });
  const autoMinimized = [
    ...minimizedCommentIds.map((id) =>
      minimizedItem(
        "pr-comment",
        id,
        commentsById.get(id)?.url,
        input.partition.ruleReasons.get(id) ?? [],
      ),
    ),
    ...minimizedSummaryIds.map((id) =>
      minimizedItem(
        "review-summary",
        id,
        summariesById.get(id)?.url,
        input.partition.ruleReasons.get(id) ?? [],
      ),
    ),
  ];
  const autoResolveErrors = [
    ...decorateErrors(minimized.errors, minimizeIds, input.partition.ruleReasons),
    ...decorateErrors(resolved.errors, threadIds, input.partition.ruleReasons),
  ];
  const errorReasons = uniqueReasons([
    ...minimized.errors.flatMap((error) =>
      reasonsForError(error, minimizeIds, input.partition.ruleReasons),
    ),
    ...resolved.errors.flatMap((error) =>
      reasonsForError(error, threadIds, input.partition.ruleReasons),
    ),
  ]);
  return {
    threadIds: input.partition.ruleAutoResolveThreadIds.filter((id) => !resolvedSet.has(id)),
    commentIds: input.partition.ruleAutoResolveCommentIds.filter((id) => !minimizedSet.has(id)),
    reviewSummaryIds: input.partition.ruleAutoResolveReviewSummaryIds.filter(
      (id) => !minimizedSet.has(id),
    ),
    autoResolved,
    autoMinimized,
    autoResolveErrors,
    errorReasons,
  };
}
