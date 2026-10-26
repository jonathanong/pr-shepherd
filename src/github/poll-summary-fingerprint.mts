import { createHash } from "node:crypto";
import { withoutHandoffFields } from "./poll-summary-handoff-fields.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";

/**
 * Bind receipts to the review and head-commit CI evidence shared by one-PR
 * completion and stack reconciliation. Queue entry, queue checks, and GitHub's
 * computed merge state are checked separately: including them here would
 * invalidate a READY receipt merely because a ready PR entered the queue.
 *
 * Deliberately conservative: every comment, review and thread node and the ignored
 * checks are hashed without applying classification rules. A rule-suppressed bot
 * comment or an ignored-check change therefore invalidates a receipt, but a miss only
 * costs one more one-PR session (`no-ready-receipt`), whereas a hash that skipped
 * evidence could certify a state the one-PR check never examined. Do not narrow this
 * to post-rule state unless the one-PR check hashes the same projection.
 */
export function fingerprintRawSummaryPr(summary: RawSummaryPr): string | null {
  const raw = withoutHandoffFields(summary);
  if (!raw.updatedAt || !raw.headRefOid || !raw.baseRefOid) return null;
  const reviewTruncated =
    raw.comments.pageInfo.hasPreviousPage ||
    raw.reviews.pageInfo.hasPreviousPage ||
    raw.reviewThreads.pageInfo.hasPreviousPage ||
    raw.reviewThreads.nodes.some((thread) => thread.comments.pageInfo.hasPreviousPage);
  const evidence = {
    ...(raw.transport === "rest" && { transport: "rest" }),
    number: raw.number,
    state: raw.state,
    lifecycleEvents: raw.lifecycleEvents,
    isDraft: raw.isDraft,
    headRefOid: raw.headRefOid,
    baseRefOid: raw.baseRefOid,
    baseRefName: raw.baseRefName,
    reviewDecision: raw.reviewDecision,
    reviewRequests: raw.reviewRequests,
    latestReviews: raw.latestReviews,
    // Omitted bodies cannot participate in the hash. Bind truncated evidence
    // to the PR revision instead, so updates require a fresh full review poll.
    ...(reviewTruncated && { reviewUpdatedAt: raw.updatedAt }),
    // A PR comment edit is not readiness evidence; its ID still binds new comments.
    comments: {
      ...raw.comments,
      nodes: raw.comments.nodes.map(({ body: _body, ...node }) => node),
    },
    reviews: hideBodies(raw.reviews),
    reviewThreads: {
      ...raw.reviewThreads,
      nodes: raw.reviewThreads.nodes.map((thread) => ({
        ...thread,
        comments: hideBodies(thread.comments),
      })),
    },
    commits: {
      ...raw.commits,
      nodes: raw.commits.nodes.map((node) => ({
        ...node,
        commit: { ...node.commit, committedDate: undefined, checkSuites: undefined },
      })),
    },
  };
  return createHash("sha256").update(JSON.stringify(evidence)).digest("hex");
}

/** Hidden bodies are not readiness evidence: bots keep editing hidden notices after a PR settles. */
function hideBodies<C extends { nodes: Array<{ isMinimized?: boolean; body: string }> }>(
  connection: C,
) {
  return {
    ...connection,
    nodes: connection.nodes.map((node) => (node.isMinimized ? { ...node, body: undefined } : node)),
  };
}
