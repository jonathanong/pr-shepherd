import type { BatchPrData, ReviewThread } from "../types.mts";
import type { ClassifyItem, ClassifyAction } from "./types.mts";
import type { LoadedRule } from "./loader.mts";
import { collectAction, type CollectedAction } from "./rule-action.mts";
import {
  changesRequestedToItem,
  commentToItem,
  reviewSummaryToItem,
  threadReplyToItem,
  threadToItem,
} from "./items.mts";

export interface ClassifyIndex {
  suppressedIds: Set<string>;
  suppressedThreadReplyIds: Set<string>;
  autoResolveIds: Set<string>;
  ruleReasons: Map<string, string[]>;
}

export interface BatchPartition {
  suppressedCommentIds: Set<string>;
  suppressedThreadIds: Set<string>;
  suppressedThreadReplyIds: Set<string>;
  suppressedReviewSummaryIds: Set<string>;
  suppressedChangesRequestedIds: Set<string>;
  ruleAutoResolveCommentIds: string[];
  ruleAutoResolveThreadIds: string[];
  /** COMMENTED review summary IDs — minimized without surfacing to the agent. */
  ruleAutoResolveReviewSummaryIds: string[];
  ruleReasons: Map<string, string[]>;
}

export function applyRules(rules: LoadedRule[], item: ClassifyItem): ClassifyAction {
  const applied = collectAction(rules, item);
  return {
    autoResolve: applied.autoResolve,
    suppress: applied.suppress,
    ...(applied.reasons.length > 0 && { reason: applied.reasons.join("; ") }),
  };
}

function addToIndex(
  id: string,
  applied: CollectedAction,
  suppressedIds: Set<string>,
  autoResolveIds: Set<string>,
  ruleReasons: Map<string, string[]>,
): void {
  if (applied.suppress) suppressedIds.add(id);
  if (applied.autoResolve) autoResolveIds.add(id);
  if (applied.reasons.length > 0) ruleReasons.set(id, applied.reasons);
}

function emptyIndex(): ClassifyIndex {
  return {
    suppressedIds: new Set(),
    suppressedThreadReplyIds: new Set(),
    autoResolveIds: new Set(),
    ruleReasons: new Map(),
  };
}

export function buildClassifyIndex(rules: LoadedRule[], batch: BatchPrData): ClassifyIndex {
  if (rules.length === 0) return emptyIndex();
  const suppressedIds = new Set<string>();
  const suppressedThreadReplyIds = new Set<string>();
  const autoResolveIds = new Set<string>();
  const ruleReasons = new Map<string, string[]>();
  for (const t of batch.reviewThreads) {
    addToIndex(
      t.id,
      collectAction(rules, threadToItem(t)),
      suppressedIds,
      autoResolveIds,
      ruleReasons,
    );
    // Replies (after the root comment) can be suppressed individually; autoResolve is not supported.
    for (const reply of (t.comments ?? []).slice(1)) {
      const applied = collectAction(rules, threadReplyToItem(t, reply));
      if (applied.suppress) suppressedThreadReplyIds.add(reply.id);
      if (applied.reasons.length > 0) ruleReasons.set(reply.id, applied.reasons);
    }
  }
  for (const c of batch.comments) {
    addToIndex(
      c.id,
      collectAction(rules, commentToItem(c)),
      suppressedIds,
      autoResolveIds,
      ruleReasons,
    );
  }
  for (const r of batch.reviewSummaries)
    addToIndex(
      r.id,
      collectAction(rules, reviewSummaryToItem(r)),
      suppressedIds,
      autoResolveIds,
      ruleReasons,
    );
  // autoResolve for changes-requested requires a dismiss message; not supported
  for (const r of batch.changesRequestedReviews) {
    const applied = collectAction(rules, changesRequestedToItem(r));
    if (applied.suppress) suppressedIds.add(r.id);
    if (applied.reasons.length > 0) ruleReasons.set(r.id, applied.reasons);
  }
  return { suppressedIds, suppressedThreadReplyIds, autoResolveIds, ruleReasons };
}

export function partitionBatch(index: ClassifyIndex, batch: BatchPrData): BatchPartition {
  const { suppressedIds, suppressedThreadReplyIds, autoResolveIds } = index;
  const suppressedCommentIds = new Set(
    batch.comments.filter((c) => suppressedIds.has(c.id)).map((c) => c.id),
  );
  const suppressedThreadIds = new Set(
    batch.reviewThreads.filter((t) => suppressedIds.has(t.id)).map((t) => t.id),
  );
  const suppressedReviewSummaryIds = new Set(
    batch.reviewSummaries.filter((r) => suppressedIds.has(r.id)).map((r) => r.id),
  );
  const suppressedChangesRequestedIds = new Set(
    batch.changesRequestedReviews.filter((r) => suppressedIds.has(r.id)).map((r) => r.id),
  );
  const ruleAutoResolveCommentIds = batch.comments
    .filter((c) => !c.isMinimized && autoResolveIds.has(c.id))
    .map((c) => c.id);
  const ruleAutoResolveThreadIds = batch.reviewThreads
    .filter((t) => !t.isResolved && !t.isOutdated && autoResolveIds.has(t.id))
    .map((t) => t.id);
  const ruleAutoResolveReviewSummaryIds = batch.reviewSummaries
    .filter((r) => autoResolveIds.has(r.id))
    .map((r) => r.id);
  return {
    suppressedCommentIds,
    suppressedThreadIds,
    suppressedThreadReplyIds: new Set(suppressedThreadReplyIds),
    suppressedReviewSummaryIds,
    suppressedChangesRequestedIds,
    ruleAutoResolveCommentIds,
    ruleAutoResolveThreadIds,
    ruleAutoResolveReviewSummaryIds,
    ruleReasons: index.ruleReasons,
  };
}

/**
 * Return threads with rule-suppressed reply comments removed, leaving each thread's root comment
 * intact. Threads without matching replies are returned as-is.
 */
export function stripSuppressedThreadReplies(
  threads: ReviewThread[],
  suppressedReplyIds: ReadonlySet<string>,
): ReviewThread[] {
  if (suppressedReplyIds.size === 0) return threads;
  return threads.map((thread) => {
    const comments = thread.comments;
    if (!comments || comments.length <= 1) return thread;
    const filtered = [
      comments[0]!,
      ...comments.slice(1).filter((reply) => !suppressedReplyIds.has(reply.id)),
    ];
    return filtered.length === comments.length ? thread : { ...thread, comments: filtered };
  });
}
