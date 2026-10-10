import { recordThreadIdentity } from "./rest-identities.mts";
import { githubOperation, runWithGithubTransport } from "./transport.mts";
import { fetchRestPrBatch } from "./rest-batch-read.mts";
import { graphqlWithRateLimit, type RateLimitInfo, type RepoInfo } from "./client.mts";
import { hydrateThreadCommentPages } from "./thread-comments.mts";
import { BATCH_PR_QUERY, BATCH_PR_RECEIPT_QUERY } from "./queries.mts";
import { prepareBatchReceiptEvidence } from "./batch-receipt-evidence.mts";
import {
  GitHubRequestError,
  isRetryableGraphQlResourceLimit,
  type GitHubGraphQlError,
} from "./errors.mts";
import { rateLimitKind } from "./rate-limit-kind.mts";
import { parseRawPr } from "./batch-parsers.mts";
import {
  parseCheckSuitesComplete,
  parseHeadCheckSuitesEmpty,
  parseHeadWorkflowSuites,
  parseSuiteStartupFailures,
} from "./batch-parse-suites.mts";
import type { WorkflowSuiteSnapshot } from "../checks/unreported-required.mts";
import { mergeStartupFailureChecks } from "../checks/startup-failures.mts";
import { paginateBatchConnections } from "./batch-page.mts";
import { requireRawPr } from "./batch-response.mts";
import { hydrateMergeQueueChecks } from "./merge-queue-checks.mts";
import type { RawBatchResponse } from "./batch-raw-types.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";
import type { BatchPrData } from "../types.mts";
import { fingerprintFromRaw, type PrFingerprint } from "./fingerprint.mts";

interface BatchResult {
  data: BatchPrData;
  fingerprint?: PrFingerprint;
  rateLimit?: RateLimitInfo;
  /** True when GraphQL returned a complete CheckSuite page; skip REST startup-failure fetch. */
  checkSuitesComplete?: boolean;
  /** True when that complete page listed no check suites on the head commit. */
  headCheckSuitesEmpty?: true;
  /** Actions workflow suites on the head, excluding apps that have no workflow run. */
  headWorkflowSuites?: WorkflowSuiteSnapshot[];
  /** Internal READY-receipt evidence from the same request, if complete. */
  receiptSummary?: RawSummaryPr;
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
  includeReceiptSummary?: boolean;
}

function onlyReceiptSummaryErrors(errors?: GitHubGraphQlError[]): boolean {
  return (
    !!errors?.length &&
    errors.every(
      (error) =>
        Array.isArray(error.path) &&
        error.path[0] === "repository" &&
        error.path[1] === "receiptSummary",
    )
  );
}

/**
 * Fetch all PR data needed for a `shepherd check` in one (or a few, if paginating) GraphQL requests.
 */
async function fetchGraphqlPrBatch(
  pr: number,
  repo: RepoInfo,
  opts: FetchPrBatchOptions = {},
): Promise<BatchResult> {
  const variables = {
    owner: repo.owner,
    repo: repo.name,
    pr,
  };
  let result: Awaited<ReturnType<typeof graphqlWithRateLimit<RawBatchResponse>>>;
  try {
    result = await graphqlWithRateLimit<RawBatchResponse>(
      opts.includeReceiptSummary ? BATCH_PR_RECEIPT_QUERY : BATCH_PR_QUERY,
      variables,
    );
  } catch (error) {
    if (
      !opts.includeReceiptSummary ||
      !(error instanceof GitHubRequestError) ||
      rateLimitKind(error) !== null ||
      !(
        isRetryableGraphQlResourceLimit(error.graphqlErrors) ||
        (error.status === 200 && onlyReceiptSummaryErrors(error.graphqlErrors))
      )
    )
      throw error;
    // Receipt evidence is optional; a resource-limited combined query or an
    // error confined to its sibling must not prevent the ordinary snapshot.
    result = await graphqlWithRateLimit<RawBatchResponse>(BATCH_PR_QUERY, variables);
  }

  const raw = requireRawPr(result.data, pr, repo);
  const queueRateLimit = await hydrateMergeQueueChecks(raw, repo, result.rateLimit);
  const paged = await paginateBatchConnections(pr, repo, raw, opts, queueRateLimit);
  const threadPages = await hydrateThreadCommentPages(paged.threads, paged.rateLimit);
  let receiptSummary: RawSummaryPr | null = null;
  if (opts.includeReceiptSummary) {
    try {
      receiptSummary = await prepareBatchReceiptEvidence(
        result.data.repository?.receiptSummary,
        raw,
        paged.checks,
        repo,
      );
    } catch {
      // Malformed supplemental evidence must not discard a complete BatchPr.
    }
  }

  for (const thread of threadPages.threads) {
    const root = thread.comments.nodes[0];
    const numericId = root?.url?.match(/discussion_r([0-9]+)/)?.[1];
    if (numericId) await recordThreadIdentity(repo, pr, thread.id, numericId);
  }
  const data = parseRawPr(
    raw,
    threadPages.threads,
    paged.comments,
    paged.changesRequested,
    paged.reviewSummaries,
    paged.approvedReviews,
    paged.checks,
    result.data.repository!,
  );
  const viewerLogin = result.data.viewer?.login;
  if (viewerLogin) data.viewerLogin = viewerLogin;
  data.checks = mergeStartupFailureChecks(data.checks, parseSuiteStartupFailures(raw));
  return {
    data,
    fingerprint: fingerprintFromRaw(
      raw,
      result.data.repository?.viewerPermission ?? null,
      result.data.viewer?.login ?? null,
    ),
    rateLimit: threadPages.rateLimit ?? paged.rateLimit ?? result.rateLimit,
    ...(parseCheckSuitesComplete(raw) && { checkSuitesComplete: true }),
    ...(parseHeadCheckSuitesEmpty(raw) && { headCheckSuitesEmpty: true as const }),
    ...workflowSuites(raw),
    ...(receiptSummary && { receiptSummary }),
  };
}

function workflowSuites(raw: Parameters<typeof parseHeadWorkflowSuites>[0]): {
  headWorkflowSuites?: WorkflowSuiteSnapshot[];
} {
  const suites = parseHeadWorkflowSuites(raw);
  return suites.length > 0 ? { headWorkflowSuites: suites } : {};
}

export function fetchPrBatch(
  pr: number,
  repo: RepoInfo,
  opts: FetchPrBatchOptions = {},
): Promise<BatchResult> {
  return githubOperation(
    "BatchPr",
    () => runWithGithubTransport("graphql", () => fetchGraphqlPrBatch(pr, repo, opts)),
    () => fetchRestPrBatch(pr, repo, opts),
  );
}
