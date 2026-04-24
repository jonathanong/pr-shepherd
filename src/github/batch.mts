import { graphql, graphqlWithRateLimit, type RateLimitInfo, type RepoInfo } from "./client.mts";
import { paginateForward, paginateBackward } from "./pagination.mts";
import { BATCH_PR_QUERY } from "./queries.mts";
import { parseRawPr } from "./batch-parsers.mts";
import type {
  RawBatchResponse,
  RawThread,
  RawComment,
  RawReview,
  RawReviewSummary,
  RawContextNode,
} from "./batch-raw-types.mts";
import type { BatchPrData } from "../types.mts";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface BatchResult {
  data: BatchPrData;
  rateLimit?: RateLimitInfo;
}

export interface FetchPrBatchOptions {
  /**
   * When false (default), the first-page approvedReviews are returned but
   * backward pagination is skipped. Iterate's approvals-minimize flow sets this
   * to true only when the user opts in, so long-lived PRs with > 50 approvals
   * don't pay extra GraphQL round-trips per monitor tick for data no consumer
   * currently uses. The first page is free — already inside the one batch
   * request — so there's no need to conditionally omit the field itself.
   */
  paginateApprovedReviews?: boolean;
}

/**
 * Fetch all PR data needed for a `shepherd check` in one (or a few, if paginating) GraphQL requests.
 */
export async function fetchPrBatch(
  pr: number,
  repo: RepoInfo,
  opts: FetchPrBatchOptions = {},
): Promise<BatchResult> {
  // First page: no cursor variables.
  const result = await graphqlWithRateLimit<RawBatchResponse>(BATCH_PR_QUERY, {
    owner: repo.owner,
    repo: repo.name,
    pr,
  });

  const raw = result.data.repository.pullRequest;
  if (!raw) {
    throw new Error(`PR #${pr} not found`);
  }

  // Paginate reviewThreads backward if the first page is incomplete.
  let rawThreadPages = raw.reviewThreads.nodes;
  if (raw.reviewThreads.pageInfo.hasPreviousPage && raw.reviewThreads.pageInfo.startCursor) {
    // Pass startCursor so paginateBackward fetches pages *before* the already-
    // fetched first page instead of re-fetching it from the start.
    const extra = await paginateBackward<RawThread>(async (cursor) => {
      const res = await graphql<RawBatchResponse>(BATCH_PR_QUERY, {
        owner: repo.owner,
        repo: repo.name,
        pr,
        ...(cursor ? { threadsCursor: cursor } : {}),
      });
      const pr2 = res.data.repository.pullRequest;
      if (!pr2) throw new Error(`PR #${pr} not found`);
      return pr2.reviewThreads;
    }, raw.reviewThreads.pageInfo.startCursor);
    // extra contains pages before the first page.
    rawThreadPages = [...extra, ...rawThreadPages];
  }

  // Paginate comments backward if the first page is incomplete.
  let rawCommentNodes = raw.comments.nodes;
  if (raw.comments.pageInfo.hasPreviousPage && raw.comments.pageInfo.startCursor) {
    const extra = await paginateBackward<RawComment>(async (cursor) => {
      const res = await graphql<RawBatchResponse>(BATCH_PR_QUERY, {
        owner: repo.owner,
        repo: repo.name,
        pr,
        ...(cursor ? { commentsCursor: cursor } : {}),
      });
      const pr2 = res.data.repository.pullRequest;
      if (!pr2) throw new Error(`PR #${pr} not found`);
      return pr2.comments;
    }, raw.comments.pageInfo.startCursor);
    rawCommentNodes = [...extra, ...rawCommentNodes];
  }

  // Paginate CHANGES_REQUESTED reviews backward if the first page is incomplete.
  let rawReviewNodes = raw.changesRequestedReviews.nodes;
  if (
    raw.changesRequestedReviews.pageInfo.hasPreviousPage &&
    raw.changesRequestedReviews.pageInfo.startCursor
  ) {
    const extra = await paginateBackward<RawReview>(async (cursor) => {
      const res = await graphql<RawBatchResponse>(BATCH_PR_QUERY, {
        owner: repo.owner,
        repo: repo.name,
        pr,
        ...(cursor ? { changesRequestedCursor: cursor } : {}),
      });
      const pr2 = res.data.repository.pullRequest;
      if (!pr2) throw new Error(`PR #${pr} not found`);
      return pr2.changesRequestedReviews;
    }, raw.changesRequestedReviews.pageInfo.startCursor);
    rawReviewNodes = [...extra, ...rawReviewNodes];
  }

  // Paginate COMMENTED review summaries backward if the first page is incomplete.
  let rawReviewSummaryNodes = raw.reviewSummaries.nodes;
  if (raw.reviewSummaries.pageInfo.hasPreviousPage && raw.reviewSummaries.pageInfo.startCursor) {
    const extra = await paginateBackward<RawReviewSummary>(async (cursor) => {
      const res = await graphql<RawBatchResponse>(BATCH_PR_QUERY, {
        owner: repo.owner,
        repo: repo.name,
        pr,
        ...(cursor ? { reviewSummariesCursor: cursor } : {}),
      });
      const pr2 = res.data.repository.pullRequest;
      if (!pr2) throw new Error(`PR #${pr} not found`);
      return pr2.reviewSummaries;
    }, raw.reviewSummaries.pageInfo.startCursor);
    rawReviewSummaryNodes = [...extra, ...rawReviewSummaryNodes];
  }

  // Paginate APPROVED reviews backward if the first page is incomplete — gated behind
  // `paginateApprovedReviews` because approvals minimization is opt-in. See FetchPrBatchOptions.
  let rawApprovedReviewNodes = raw.approvedReviews.nodes;
  if (
    opts.paginateApprovedReviews &&
    raw.approvedReviews.pageInfo.hasPreviousPage &&
    raw.approvedReviews.pageInfo.startCursor
  ) {
    const extra = await paginateBackward<RawReviewSummary>(async (cursor) => {
      const res = await graphql<RawBatchResponse>(BATCH_PR_QUERY, {
        owner: repo.owner,
        repo: repo.name,
        pr,
        ...(cursor ? { approvedReviewsCursor: cursor } : {}),
      });
      const pr2 = res.data.repository.pullRequest;
      if (!pr2) throw new Error(`PR #${pr} not found`);
      return pr2.approvedReviews;
    }, raw.approvedReviews.pageInfo.startCursor);
    rawApprovedReviewNodes = [...extra, ...rawApprovedReviewNodes];
  }

  // Paginate check contexts forward if the first page is incomplete.
  let rawCheckNodes = raw.commits.nodes[0]?.commit.statusCheckRollup?.contexts.nodes ?? [];
  const checksPageInfo = raw.commits.nodes[0]?.commit.statusCheckRollup?.contexts.pageInfo;
  const firstOid = raw.commits.nodes[0]?.commit.oid;
  if (checksPageInfo?.hasNextPage && checksPageInfo.endCursor) {
    // Pass endCursor so paginateForward fetches pages *after* the already-
    // fetched first page instead of re-fetching it from the start.
    let pageCount = 0;
    const extra = await paginateForward<RawContextNode>(async (cursor) => {
      const res = await graphql<RawBatchResponse>(BATCH_PR_QUERY, {
        owner: repo.owner,
        repo: repo.name,
        pr,
        ...(cursor ? { checksCursor: cursor } : {}),
      });
      const pr2 = res.data.repository.pullRequest;
      if (!pr2?.commits.nodes[0]?.commit.statusCheckRollup) {
        throw new Error(
          `Check-context pagination interrupted: statusCheckRollup disappeared on page ${pageCount + 1} (possible force-push race). Retry after the push stabilizes.`
        );
      }
      const currentOid = pr2.commits.nodes[0]?.commit.oid;
      if (firstOid !== undefined && currentOid !== undefined && currentOid !== firstOid) {
        throw new Error(
          `Check-context pagination interrupted: head commit changed from ${firstOid} to ${currentOid} between pages (force-push race). Retry.`
        );
      }
      pageCount++;
      const ctxs = pr2.commits.nodes[0]?.commit.statusCheckRollup?.contexts;
      return ctxs ?? { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] };
    }, checksPageInfo.endCursor);
    rawCheckNodes = [...rawCheckNodes, ...extra];
  }

  const data = parseRawPr(
    raw,
    rawThreadPages,
    rawCommentNodes,
    rawReviewNodes,
    rawReviewSummaryNodes,
    rawApprovedReviewNodes,
    rawCheckNodes,
  );
  return { data, rateLimit: result.rateLimit };
}
