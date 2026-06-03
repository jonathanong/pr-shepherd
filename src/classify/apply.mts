import type { BatchPrData, ReviewThread, PrComment, Review } from "../types.mts";
import type { ClassifyItem, ClassifyAction } from "./types.mts";
import type { LoadedRule } from "./loader.mts";

export interface ClassifyIndex {
  suppressedIds: Set<string>;
  autoResolveIds: Set<string>;
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
}

function applyRules(rules: LoadedRule[], item: ClassifyItem): ClassifyAction {
  let autoResolve = false;
  let suppress = false;
  for (const { rule, name } of rules) {
    let action: ClassifyAction | null | undefined;
    try {
      action = rule(item);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(
        `pr-shepherd: classification rule ${name}: threw during evaluation: ${msg} — skipped\n`,
      );
      continue;
    }
    if (!action) continue;
    if (action.autoResolve) autoResolve = true;
    if (action.suppress) suppress = true;
  }
  return { autoResolve, suppress };
}

function threadToItem(t: ReviewThread): ClassifyItem {
  return {
    kind: "review-thread",
    id: t.id,
    author: t.author,
    authorType: t.authorType,
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
    body: r.body,
  };
}

function changesRequestedToItem(r: Review): ClassifyItem {
  return {
    kind: "changes-requested",
    id: r.id,
    author: r.author,
    authorType: r.authorType,
    body: r.body,
  };
}

export function buildClassifyIndex(rules: LoadedRule[], batch: BatchPrData): ClassifyIndex {
  if (rules.length === 0) return { suppressedIds: new Set(), autoResolveIds: new Set() };
  const suppressedIds = new Set<string>();
  const autoResolveIds = new Set<string>();
  for (const t of batch.reviewThreads) {
    const { suppress, autoResolve } = applyRules(rules, threadToItem(t));
    if (suppress) suppressedIds.add(t.id);
    if (autoResolve) autoResolveIds.add(t.id);
  }
  for (const c of batch.comments) {
    const { suppress, autoResolve } = applyRules(rules, commentToItem(c));
    if (suppress) suppressedIds.add(c.id);
    if (autoResolve) autoResolveIds.add(c.id);
  }
  for (const r of batch.reviewSummaries) {
    const { suppress, autoResolve } = applyRules(rules, reviewSummaryToItem(r));
    if (suppress) suppressedIds.add(r.id);
    if (autoResolve) autoResolveIds.add(r.id);
  }
  for (const r of batch.changesRequestedReviews) {
    const { suppress } = applyRules(rules, changesRequestedToItem(r));
    if (suppress) suppressedIds.add(r.id);
    // autoResolve for changes-requested requires a dismiss message; not supported here
  }
  return { suppressedIds, autoResolveIds };
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
    .filter((c) => suppressedIds.has(c.id) && autoResolveIds.has(c.id))
    .map((c) => c.id);
  const ruleAutoResolveThreadIds = batch.reviewThreads
    .filter((t) => suppressedIds.has(t.id) && autoResolveIds.has(t.id))
    .map((t) => t.id);
  const ruleAutoResolveReviewSummaryIds = batch.reviewSummaries
    .filter((r) => suppressedIds.has(r.id) && autoResolveIds.has(r.id))
    .map((r) => r.id);
  return {
    suppressedCommentIds,
    suppressedThreadIds,
    suppressedReviewSummaryIds,
    suppressedChangesRequestedIds,
    ruleAutoResolveCommentIds,
    ruleAutoResolveThreadIds,
    ruleAutoResolveReviewSummaryIds,
  };
}
