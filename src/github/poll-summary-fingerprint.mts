import { createHash } from "node:crypto";
import type { RawSummaryPr } from "./poll-summary-raw.mts";

/**
 * Bind receipts to the review and head-commit CI evidence shared by one-PR
 * completion and stack reconciliation. Queue entry, queue checks, and GitHub's
 * computed merge state are checked separately: including them here would
 * invalidate a READY receipt merely because a ready PR entered the queue.
 */
export function fingerprintRawSummaryPr(raw: RawSummaryPr): string | null {
  if (!raw.updatedAt || !raw.headRefOid || !raw.baseRefOid) return null;
  const evidence = {
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
    comments: hideBodies(raw.comments),
    reviews: hideBodies(raw.reviews),
    reviewThreads: {
      ...raw.reviewThreads,
      nodes: raw.reviewThreads.nodes.map((thread) => ({
        ...thread,
        rootComments: thread.rootComments && hideBodies(thread.rootComments),
        comments: hideBodies(thread.comments),
      })),
    },
    commits: {
      ...raw.commits,
      nodes: raw.commits.nodes.map((node) => ({
        ...node,
        commit: { ...node.commit, committedDate: undefined },
      })),
    },
  };
  return createHash("sha256").update(JSON.stringify(evidence)).digest("hex");
}

/** Hidden bodies are not readiness evidence: bots keep editing hidden notices after a PR settles. */
function hideBodies<C extends { nodes: Array<{ isMinimized: boolean; body: string }> }>(
  connection: C,
) {
  return {
    ...connection,
    nodes: connection.nodes.map((node) => (node.isMinimized ? { ...node, body: undefined } : node)),
  };
}
