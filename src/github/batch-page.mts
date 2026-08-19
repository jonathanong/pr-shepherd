import { graphqlWithRateLimit, type RateLimitInfo, type RepoInfo } from "./client.mts";
import { GitHubRequestError } from "./errors.mts";
import { BATCH_PR_PAGE_QUERY } from "./queries.mts";
import { requireContextNodes } from "./batch-response.mts";
import {
  backwardCursor,
  forwardCursor,
  prependConnection,
  takeCheckPage,
  type RawPageResponse,
} from "./batch-page-helpers.mts";
import type {
  RawComment,
  RawContextNode,
  RawPr,
  RawReview,
  RawReviewSummary,
  RawThread,
} from "./batch-raw-types.mts";

export interface PaginatedBatchNodes {
  threads: RawThread[];
  comments: RawComment[];
  changesRequested: RawReview[];
  reviewSummaries: RawReviewSummary[];
  approvedReviews: RawReviewSummary[];
  checks: RawContextNode[];
  rateLimit?: RateLimitInfo;
}

export interface PaginateBatchOptions {
  paginateApprovedReviews?: boolean;
}

/**
 * Fetch remaining connection pages with a slim `@include` query. Independent
 * connections that still have cursors are combined into one request per round.
 */
export async function paginateBatchConnections(
  pr: number,
  repo: RepoInfo,
  raw: RawPr,
  opts: PaginateBatchOptions,
  initialRateLimit?: RateLimitInfo,
): Promise<PaginatedBatchNodes> {
  const threads = [...raw.reviewThreads.nodes];
  const comments = [...raw.comments.nodes];
  const changesRequested = [...raw.changesRequestedReviews.nodes];
  const reviewSummaries = [...raw.reviewSummaries.nodes];
  const approvedReviews = [...raw.approvedReviews.nodes];
  const checks = [
    ...requireContextNodes(raw.commits.nodes[0]?.commit.statusCheckRollup?.contexts.nodes ?? []),
  ];
  const firstOid = raw.commits.nodes[0]?.commit.oid;

  let threadsCursor = backwardCursor(raw.reviewThreads);
  let commentsCursor = backwardCursor(raw.comments);
  let changesRequestedCursor = backwardCursor(raw.changesRequestedReviews);
  let reviewSummariesCursor = backwardCursor(raw.reviewSummaries);
  let approvedReviewsCursor =
    opts.paginateApprovedReviews === true ? backwardCursor(raw.approvedReviews) : undefined;
  let checksCursor = forwardCursor(raw.commits.nodes[0]?.commit.statusCheckRollup?.contexts);
  let rateLimit = initialRateLimit;
  let pageCount = 0;

  while (
    threadsCursor !== undefined ||
    commentsCursor !== undefined ||
    changesRequestedCursor !== undefined ||
    reviewSummariesCursor !== undefined ||
    approvedReviewsCursor !== undefined ||
    checksCursor !== undefined
  ) {
    if (rateLimit?.remaining === 0) {
      throw new GitHubRequestError(
        "GitHub GraphQL rate limit remaining is 0; pagination incomplete",
        { status: 403, rateLimit },
      );
    }

    const includeThreads = threadsCursor !== undefined;
    const includeComments = commentsCursor !== undefined;
    const includeChangesRequested = changesRequestedCursor !== undefined;
    const includeReviewSummaries = reviewSummariesCursor !== undefined;
    const includeApprovedReviews = approvedReviewsCursor !== undefined;
    const includeChecks = checksCursor !== undefined;

    const res = await graphqlWithRateLimit<RawPageResponse>(BATCH_PR_PAGE_QUERY, {
      owner: repo.owner,
      repo: repo.name,
      pr,
      includeThreads,
      threadsCursor: threadsCursor ?? null,
      includeComments,
      commentsCursor: commentsCursor ?? null,
      includeChangesRequested,
      changesRequestedCursor: changesRequestedCursor ?? null,
      includeReviewSummaries,
      reviewSummariesCursor: reviewSummariesCursor ?? null,
      includeApprovedReviews,
      approvedReviewsCursor: approvedReviewsCursor ?? null,
      includeChecks,
      checksCursor: checksCursor ?? null,
    });
    rateLimit = res.rateLimit ?? rateLimit;

    const pr2 = res.data.repository.pullRequest;
    if (!pr2) throw new Error(`PR #${pr} not found`);

    if (includeThreads) {
      prependConnection(threads, pr2.reviewThreads, pr);
      threadsCursor = backwardCursor(pr2.reviewThreads);
    }
    if (includeComments) {
      prependConnection(comments, pr2.comments, pr);
      commentsCursor = backwardCursor(pr2.comments);
    }
    if (includeChangesRequested) {
      prependConnection(changesRequested, pr2.changesRequestedReviews, pr);
      changesRequestedCursor = backwardCursor(pr2.changesRequestedReviews);
    }
    if (includeReviewSummaries) {
      prependConnection(reviewSummaries, pr2.reviewSummaries, pr);
      reviewSummariesCursor = backwardCursor(pr2.reviewSummaries);
    }
    if (includeApprovedReviews) {
      prependConnection(approvedReviews, pr2.approvedReviews, pr);
      approvedReviewsCursor = backwardCursor(pr2.approvedReviews);
    }
    if (includeChecks) {
      pageCount++;
      const extra = takeCheckPage(pr2, firstOid, pageCount);
      checks.push(...extra.nodes);
      checksCursor = forwardCursor(extra);
    }
  }

  return {
    threads,
    comments,
    changesRequested,
    reviewSummaries,
    approvedReviews,
    checks,
    rateLimit,
  };
}
