import { graphqlWithRateLimit, type RateLimitInfo, type RepoInfo } from "./client.mts";
import { GitHubRequestError } from "./errors.mts";
import { BATCH_PR_PAGE_QUERY } from "./queries.mts";
import { requireContextNodes } from "./batch-response.mts";
import {
  applyIncludedPage,
  backwardCursor,
  forwardCursor,
  type PageAccumulator,
  type PageCursors,
  type RawPageResponse,
} from "./batch-page-helpers.mts";
import type { RawPr } from "./batch-raw-types.mts";

export interface PaginatedBatchNodes extends PageAccumulator {
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
  const dest: PageAccumulator = {
    threads: [...raw.reviewThreads.nodes],
    comments: [...raw.comments.nodes],
    changesRequested: [...raw.changesRequestedReviews.nodes],
    reviewSummaries: [...raw.reviewSummaries.nodes],
    approvedReviews: [...raw.approvedReviews.nodes],
    checks: [
      ...requireContextNodes(raw.commits.nodes[0]?.commit.statusCheckRollup?.contexts.nodes ?? []),
    ],
  };
  const firstOid = raw.commits.nodes[0]?.commit.oid;
  let cursors: PageCursors = {
    threads: backwardCursor(raw.reviewThreads),
    comments: backwardCursor(raw.comments),
    changesRequested: backwardCursor(raw.changesRequestedReviews),
    reviewSummaries: backwardCursor(raw.reviewSummaries),
    approvedReviews:
      opts.paginateApprovedReviews === true ? backwardCursor(raw.approvedReviews) : undefined,
    checks: forwardCursor(raw.commits.nodes[0]?.commit.statusCheckRollup?.contexts),
  };
  let rateLimit = initialRateLimit;
  let pageCount = 0;

  while (Object.values(cursors).some((cursor) => cursor !== undefined)) {
    if (rateLimit?.remaining === 0) {
      throw new GitHubRequestError(
        "GitHub GraphQL rate limit remaining is 0; pagination incomplete",
        { status: 403, rateLimit },
      );
    }

    const res = await graphqlWithRateLimit<RawPageResponse>(BATCH_PR_PAGE_QUERY, {
      owner: repo.owner,
      repo: repo.name,
      pr,
      includeThreads: cursors.threads !== undefined,
      threadsCursor: cursors.threads ?? null,
      includeComments: cursors.comments !== undefined,
      commentsCursor: cursors.comments ?? null,
      includeChangesRequested: cursors.changesRequested !== undefined,
      changesRequestedCursor: cursors.changesRequested ?? null,
      includeReviewSummaries: cursors.reviewSummaries !== undefined,
      reviewSummariesCursor: cursors.reviewSummaries ?? null,
      includeApprovedReviews: cursors.approvedReviews !== undefined,
      approvedReviewsCursor: cursors.approvedReviews ?? null,
      includeChecks: cursors.checks !== undefined,
      checksCursor: cursors.checks ?? null,
    });
    rateLimit = res.rateLimit ?? rateLimit;

    const pr2 = res.data.repository.pullRequest;
    if (!pr2) throw new Error(`PR #${pr} not found`);
    const applied = applyIncludedPage(dest, pr2, cursors, firstOid, pageCount, pr);
    cursors = applied.cursors;
    pageCount = applied.pageCount;
  }

  return { ...dest, rateLimit };
}
