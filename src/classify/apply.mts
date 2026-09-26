import type { BatchPrData, ReviewThread, PrComment, Review } from "../types.mts";
import type { ClassifyItem, ClassifyAction } from "./types.mts";
import type { LoadedRule } from "./loader.mts";
import { collectAction, type CollectedAction } from "./rule-action.mts";

export interface ClassifyIndex {
  suppressedIds: Set<string>;
  autoResolveIds: Set<string>;
  ruleReasons: Map<string, string[]>;
}

export interface BatchPartition {
  suppressedCommentIds: Set<string>;
  suppressedThreadIds: Set<string>;
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

function threadToItem(t: ReviewThread): ClassifyItem {
  return {
    kind: "review-thread",
    id: t.id,
    author: t.author,
    authorType: t.authorType,
    ...(t.authorAssociation !== undefined && { authorAssociation: t.authorAssociation }),
    body: t.body,
    url: t.url,
    path: t.path,
  };
}

function commentToItem(c: PrComment): ClassifyItem {
  return {
    kind: "pr-comment",
    id: c.id,
    author: c.author,
    authorType: c.authorType,
    ...(c.authorAssociation !== undefined && { authorAssociation: c.authorAssociation }),
    body: c.body,
    url: c.url,
  };
}

function reviewSummaryToItem(r: Review): ClassifyItem {
  return {
    kind: "review-summary",
    id: r.id,
    author: r.author,
    authorType: r.authorType,
    ...(r.authorAssociation !== undefined && { authorAssociation: r.authorAssociation }),
    body: r.body,
    ...(r.url ? { url: r.url } : {}),
  };
}

function changesRequestedToItem(r: Review): ClassifyItem {
  return {
    kind: "changes-requested",
    id: r.id,
    author: r.author,
    authorType: r.authorType,
    ...(r.authorAssociation !== undefined && { authorAssociation: r.authorAssociation }),
    body: r.body,
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
  return { suppressedIds: new Set(), autoResolveIds: new Set(), ruleReasons: new Map() };
}

export function buildClassifyIndex(rules: LoadedRule[], batch: BatchPrData): ClassifyIndex {
  if (rules.length === 0) return emptyIndex();
  const suppressedIds = new Set<string>();
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
  return { suppressedIds, autoResolveIds, ruleReasons };
}

export function partitionBatch(index: ClassifyIndex, batch: BatchPrData): BatchPartition {
  const { suppressedIds, autoResolveIds } = index;
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
    suppressedReviewSummaryIds,
    suppressedChangesRequestedIds,
    ruleAutoResolveCommentIds,
    ruleAutoResolveThreadIds,
    ruleAutoResolveReviewSummaryIds,
    ruleReasons: index.ruleReasons,
  };
}
