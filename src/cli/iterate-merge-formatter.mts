import type { IterateDeferredWork, IterateResult, IterateResultMerge } from "../types.mts";
import { joinSections } from "../util/markdown.mts";
import { buildSimpleIterateInstructions, numberInstructions } from "./iterate-instructions.mts";

/** One inline rollup line of the non-CI work held back while the PR sits in the merge queue. */
export function formatDeferredWorkLine(dw: IterateDeferredWork): string {
  const parts: string[] = [];
  if (dw.threads > 0) parts.push(`${dw.threads} thread${dw.threads === 1 ? "" : "s"}`);
  if (dw.comments > 0) parts.push(`${dw.comments} comment${dw.comments === 1 ? "" : "s"}`);
  if (dw.changesRequestedReviews > 0) {
    parts.push(
      `${dw.changesRequestedReviews} changes-requested review${dw.changesRequestedReviews === 1 ? "" : "s"}`,
    );
  }
  if (dw.reviewSummaries > 0) {
    parts.push(`${dw.reviewSummaries} review summar${dw.reviewSummaries === 1 ? "y" : "ies"}`);
  }
  return `**deferred (in merge queue)** ${parts.join(", ")}`;
}

/**
 * True when `mergeQueue` adds nothing to the `Merge queue:` requirement line: it carries only
 * `enabled`/`inQueue`, the queue is required (so enabled), and membership matches. Text and JSON
 * both omit it then.
 */
export function isRedundantMergeQueue(result: IterateResult): boolean {
  const queue = result.mergeQueue;
  const req = result.mergeRequirements?.mergeQueue;
  if (!queue || !req) return false;
  return (
    Object.keys(queue).every((k) => k === "enabled" || k === "inQueue") &&
    queue.enabled &&
    req.required &&
    req.enabled === true &&
    req.inQueue === queue.inQueue
  );
}

export function appendMergeQueueHeader(lines: string[], result: IterateResult): void {
  const queue = result.mergeQueue;
  if (!queue || isRedundantMergeQueue(result)) return;
  const parts = [`enabled \`${queue.enabled}\``, `inQueue \`${queue.inQueue}\``];
  if (queue.entry) {
    parts.push(`state \`${queue.entry.state}\``, `position \`${queue.entry.position}\``);
    if (queue.entry.estimatedTimeToMerge !== null) {
      parts.push(`estimatedTimeToMerge \`${queue.entry.estimatedTimeToMerge}\``);
    }
    if (queue.entry.enqueuedAtUnix !== undefined) {
      parts.push(`enqueuedAtUnix \`${queue.entry.enqueuedAtUnix}\``);
    }
    if (queue.entry.enqueuer) parts.push(`enqueuer \`@${queue.entry.enqueuer}\``);
    if (queue.entry.headCommitOid) parts.push(`headCommit \`${queue.entry.headCommitOid}\``);
  }
  if (queue.checkCommitOid) parts.push(`checkCommit \`${queue.checkCommitOid}\``);
  if (queue.checksIncomplete) parts.push("checks incomplete (first 100 shown)");
  if (queue.headUpdatedAfterRemoval) parts.push("head updated after removal");
  if (queue.removalsOnHead) parts.push(`removals on this head \`${queue.removalsOnHead}\``);
  if (queue.removalAcknowledged) parts.push("removal acknowledged");
  lines.push(`**merge queue** ${parts.join(" · ")}`);
  if (queue.autoMergeRequest) {
    const autoMergeParts = [`method \`${queue.autoMergeRequest.mergeMethod}\``];
    if (queue.autoMergeRequest.enabledAtUnix !== undefined)
      autoMergeParts.push(`enabledAtUnix \`${queue.autoMergeRequest.enabledAtUnix}\``);
    if (queue.autoMergeRequest.enabledBy)
      autoMergeParts.push(`by \`@${queue.autoMergeRequest.enabledBy}\``);
    lines.push(`**auto-merge** ${autoMergeParts.join(" · ")}`);
  }
  if (queue.latestRemoval) {
    const removal = queue.latestRemoval;
    lines.push(
      `**queue removal** reason \`${removal.reason ?? "not provided"}\` · createdAtUnix \`${removal.createdAtUnix}\`${removal.actor ? ` · actor \`@${removal.actor}\`` : ""}${removal.beforeCommitOid ? ` · commit \`${removal.beforeCommitOid}\`` : ""}${removal.beforeCommitParentOids ? ` · parents \`${removal.beforeCommitParentOids.join(",")}\`` : ""}`,
    );
  }
}

export function formatMergeAction(header: string, result: IterateResultMerge): string {
  return joinSections([
    header,
    `## Instructions\n\n${numberInstructions(buildSimpleIterateInstructions(result))}`,
  ]);
}
