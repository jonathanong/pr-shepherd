import { graphqlWithRateLimit, type RateLimitInfo, type RepoInfo } from "./client.mts";
import { hydrateThreadCommentPages } from "./thread-comments.mts";
import { BATCH_PR_QUERY } from "./queries.mts";
import { parseRawPr } from "./batch-parsers.mts";
import { parseCheckSuitesComplete, parseSuiteStartupFailures } from "./batch-parse-suites.mts";
import { mergeStartupFailureChecks } from "../checks/startup-failures.mts";
import { paginateBatchConnections } from "./batch-page.mts";
import { requireRawPr } from "./batch-response.mts";
import { hydrateMergeQueueChecks } from "./merge-queue-checks.mts";
import type { RawBatchResponse } from "./batch-raw-types.mts";
import type { BatchPrData } from "../types.mts";

interface BatchResult {
  data: BatchPrData;
  rateLimit?: RateLimitInfo;
  /** True when GraphQL returned a complete CheckSuite page; skip REST startup-failure fetch. */
  checkSuitesComplete?: boolean;
}

interface FetchPrBatchOptions {
  /**
   * When false (default), the first-page approvedReviews are returned but
   * backward pagination is skipped. Iterate's approvals-minimize flow sets this
   * to true only when the user opts in, so long-lived PRs with > 50 approvals
   * don't pay extra GraphQL round-trips per iterate call for data no consumer
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
  const result = await graphqlWithRateLimit<RawBatchResponse>(BATCH_PR_QUERY, {
    owner: repo.owner,
    repo: repo.name,
    pr,
  });

  const raw = requireRawPr(result.data, pr, repo);
  await hydrateMergeQueueChecks(raw, repo);
  const paged = await paginateBatchConnections(pr, repo, raw, opts, result.rateLimit);
  const rawThreadPages = await hydrateThreadCommentPages(paged.threads);

  const data = parseRawPr(
    raw,
    rawThreadPages,
    paged.comments,
    paged.changesRequested,
    paged.reviewSummaries,
    paged.approvedReviews,
    paged.checks,
    result.data.repository!,
  );
  data.checks = mergeStartupFailureChecks(data.checks, parseSuiteStartupFailures(raw));
  return {
    data,
    rateLimit: paged.rateLimit ?? result.rateLimit,
    ...(parseCheckSuitesComplete(raw) && { checkSuitesComplete: true }),
  };
}
