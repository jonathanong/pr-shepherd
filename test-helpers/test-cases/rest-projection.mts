// @ts-nocheck
/**
 * REST projection for test-cases fixtures.
 *
 * Fixtures model GraphQL-complete data. The REST variant of each fixture keeps only the fields
 * the production REST reader (`src/github/rest-batch-snapshot.mts` and the readers it calls)
 * can produce, so a GraphQL-only field disappears under REST by default. The key allowlists
 * below are pinned against the real reader by `test-cases/rest-projection.test.mts`, which
 * runs `readRestSnapshot` with every field populated and asserts the key sets are equal.
 *
 * Modeled environment: a Claude Code cloud session (`CLAUDE_CODE_REMOTE=true`) with an explicit
 * `--transport rest` selection. The CCR proxy supplies complete thread status, so resolved and
 * outdated flags survive. Branch policy is readable and equals the fixture's GraphQL policy;
 * scenarios with unreadable policy or plain (non-CCR) REST belong in dedicated fixtures.
 */
import { REST_BATCH_UNAVAILABLE } from "../../src/github/rest-batch-unavailable.mts";
import { mergeStartupFailureChecks } from "../../src/checks/startup-failures.mts";
import { restThreadRoots } from "./rest-thread-roots.mts";

/** Top-level `BatchPrData` keys `readRestSnapshot` can emit. */
export const REST_BATCH_KEYS = new Set([
  "nodeId",
  "viewerLogin",
  "number",
  "state",
  "headRefName",
  "headRefOid",
  "baseRefName",
  "baseRefOid",
  "isDraft",
  "mergeable",
  "mergeStateStatus",
  "reviewDecision",
  "autoMergeRequest",
  "headRepoWithOwner",
  "reviewRequests",
  "latestReviews",
  "reviewThreads",
  "comments",
  "changesRequestedReviews",
  "reviewSummaries",
  "approvedReviews",
  "checks",
  "branchProtection",
  "branchRules",
  "allowedMergeMethods",
  "stack",
  "transport",
  "transportUnavailable",
]);

/** `ReviewThread` keys `readRestFeedback` can emit with complete CCR thread status. */
export const REST_THREAD_KEYS = new Set([
  "id",
  "isResolved",
  "isOutdated",
  "path",
  "line",
  "startLine",
  "reviewId",
  "author",
  "authorType",
  "viewerDidAuthor",
  "authorAssociation",
  "body",
  "url",
  "createdAtUnix",
  "comments",
]);

/** `ReviewThreadComment` keys `readRestFeedback` can emit. */
export const REST_THREAD_COMMENT_KEYS = new Set([
  "id",
  "reviewId",
  "author",
  "authorType",
  "viewerDidAuthor",
  "authorAssociation",
  "body",
  "url",
  "createdAtUnix",
]);

/** `PrComment` keys `readRestFeedback` can emit. */
export const REST_COMMENT_KEYS = new Set([
  "id",
  "author",
  "authorType",
  "authorAssociation",
  "body",
  "url",
  "createdAtUnix",
]);

/** `Review` keys `restReviewToReview` (plus stale marking) can emit. */
export const REST_REVIEW_KEYS = new Set([
  "id",
  "author",
  "authorType",
  "authorAssociation",
  "body",
  "url",
  "commitOid",
  "createdAtUnix",
  "staleReview",
]);

function pick(value: Record<string, unknown>, keys: Set<string>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => keys.has(key)));
}

function projectThread(thread, root: string) {
  const projected = pick(thread, REST_THREAD_KEYS);
  projected.id = `rest-thread-${root}`;
  // `readRestFeedback` always returns the full transcript, root comment first. Fixtures that
  // omit `comments` describe a single-comment thread, so the root comment is rebuilt from the
  // thread's own fields, with a review-comment node ID rather than the thread's handle.
  const comments = Array.isArray(thread.comments)
    ? thread.comments
    : [{ ...thread, id: `PRRC_${root}` }];
  projected.comments = comments.map((comment) => pick(comment, REST_THREAD_COMMENT_KEYS));
  return projected;
}

/** Project a GraphQL-shaped `BatchPrData` onto what the REST reader returns for the same PR. */
export function projectBatchToRest(
  batchData: Record<string, unknown>,
  opts: { startupFailureChecks?: unknown[]; carryOver?: string[] } = {},
): Record<string, unknown> {
  const projected = pick(batchData, REST_BATCH_KEYS);
  for (const key of opts.carryOver ?? []) {
    if (key in batchData) projected[key] = batchData[key];
  }
  projected.reviewDecision = null;
  const threads = batchData.reviewThreads ?? [];
  const roots = restThreadRoots(threads);
  projected.reviewThreads = threads.map((thread, index) => projectThread(thread, roots[index]));
  projected.comments = (batchData.comments ?? []).map((comment) =>
    pick(comment, REST_COMMENT_KEYS),
  );
  for (const key of ["changesRequestedReviews", "reviewSummaries", "approvedReviews"]) {
    projected[key] = (batchData[key] ?? []).map((review) => pick(review, REST_REVIEW_KEYS));
  }
  // REST reads check suites with the snapshot, so startup failures are part of the batch rather
  // than a separate supplemental fetch.
  projected.checks = mergeStartupFailureChecks(
    batchData.checks ?? [],
    opts.startupFailureChecks ?? [],
  );
  projected.transport = "rest";
  projected.transportUnavailable = [...REST_BATCH_UNAVAILABLE];
  return projected;
}

/** The `fetchPrBatch` wrapper fields `fetchRestPrBatch` returns around `data`. */
export function restBatchEnvelope(
  data: Record<string, unknown>,
  headWorkflowSuites: unknown[],
): Record<string, unknown> {
  const hasCheckRuns = (data.checks ?? []).some(
    (check) => check.source !== "status_context" && check.source !== "startup_failure",
  );
  return {
    data,
    headWorkflowSuites,
    checkSuitesComplete: true,
    ...(!hasCheckRuns && headWorkflowSuites.length === 0 && { headCheckSuitesEmpty: true }),
  };
}
