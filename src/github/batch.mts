import { recordThreadIdentity } from "./rest-identities.mts";
import { githubOperation, runWithGithubTransport } from "./transport.mts";
import { fetchRestPrBatch } from "./rest-batch-read.mts";
import type { RateLimitInfo, RepoInfo } from "./client.mts";
import { hydrateThreadCommentPages } from "./thread-comments.mts";
import { makeAuthHeaders } from "./http-auth.mts";
import { readBatchFirstPage, usesViewerSplit } from "./batch-first-page.mts";
import { applyBatchViewer } from "./batch-viewer.mts";
import { prepareBatchReceiptEvidence } from "./batch-receipt-evidence.mts";
import { parseRawPr } from "./batch-parsers.mts";
import {
  parseCheckSuitesComplete,
  parseHeadCheckSuitesEmpty,
  workflowSuites,
  parseSuiteStartupFailures,
} from "./batch-parse-suites.mts";
import type { WorkflowSuiteSnapshot } from "../checks/unreported-required.mts";
import { mergeStartupFailureChecks } from "../checks/startup-failures.mts";
import { paginateBatchConnections } from "./batch-page.mts";
import { requireRawPr } from "./batch-response.mts";
import { hydrateMergeQueueChecks } from "./merge-queue-checks.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";
import type { BatchPrData } from "../types.mts";
import { fingerprintFromRaw, type PrFingerprint } from "./fingerprint.mts";
import { stackEvidenceFromRaw, type BatchStackEvidence } from "./batch-stack-evidence.mts";
import { takeStackHandoff } from "./stack-handoff.mts";

export interface BatchResult {
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
  /** Native-stack topology and trunk rules from the same first page, if complete. */
  stackEvidence?: BatchStackEvidence;
}

/** A fingerprint hit, plus the live base tip and stack evidence from the same first page. */
type ReusedBatch<T> = { reused: T; baseTipOid?: string; stackEvidence?: BatchStackEvidence };

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
  terminalShortCircuit?: boolean; // REST: a merged PR stops at its first pull read
}

/**
 * Fetch all PR data needed for a `shepherd check` in one (or a few, if paginating) GraphQL requests.
 */
async function fetchGraphqlPrBatch<T>(
  pr: number,
  repo: RepoInfo,
  opts: FetchPrBatchOptions = {},
  reuse?: (fingerprint: PrFingerprint) => Promise<T | null>,
): Promise<BatchResult | ReusedBatch<T>> {
  const handoff = await takeStackHandoff(repo, pr); // a routed stack layer's first read
  // The READY receipt sibling and a stack handoff carry viewer fields in the same document, and
  // a READY candidate needs them anyway, so those reads stay combined on the user's token.
  const split = !handoff && (await usesViewerSplit(repo, opts));
  const result = handoff ? { data: handoff } : await readBatchFirstPage(pr, repo, opts, split);
  const raw = requireRawPr(result.data, pr, repo);
  // A split read carries no viewer field, so its fingerprint holds the user token's identity in
  // place of the viewer login: another token never matches a stored one.
  const fingerprint = fingerprintFromRaw(
    raw,
    result.data.repository?.viewerPermission ?? null,
    result.data.viewer?.login ?? (split ? `token:${(await makeAuthHeaders()).fingerprint}` : null),
  );
  // Decide reuse from the first page alone, before any supplement is paid for.
  const reused = reuse && (await reuse(fingerprint));
  const baseTipOid = raw.baseRef?.target?.oid;
  // A split read has no viewer fields yet, so a reused tick carries only the trunk rules.
  let stackEvidence = stackEvidenceFromRaw(raw, result.data, split);
  if (reused)
    return { reused, ...(baseTipOid && { baseTipOid }), ...(stackEvidence && { stackEvidence }) };
  const queueRateLimit = await hydrateMergeQueueChecks(raw, repo, result.rateLimit);
  const paged = await paginateBatchConnections(
    pr,
    repo,
    raw,
    { ...opts, viewerFree: split },
    queueRateLimit,
  );
  const threadPages = await hydrateThreadCommentPages(paged.threads, paged.rateLimit, split);
  const viewer =
    split &&
    (await applyBatchViewer(repo, raw, {
      threads: threadPages.threads,
      comments: paged.comments,
      reviews: [...paged.reviewSummaries, ...paged.approvedReviews],
    }));
  // The topology's viewer login and administer bit come from this snapshot's viewer read.
  if (viewer) {
    stackEvidence = stackEvidenceFromRaw(raw, { viewer, repository: viewer.repository });
  }
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
    viewer ? { ...result.data.repository!, ...viewer.repository } : result.data.repository!,
  );
  const viewerLogin = viewer ? viewer.login : result.data.viewer?.login;
  if (viewerLogin) data.viewerLogin = viewerLogin;
  data.checks = mergeStartupFailureChecks(data.checks, parseSuiteStartupFailures(raw));
  return {
    data,
    fingerprint,
    // A split read's other samples are the app's buckets; only the viewer read is the user's.
    rateLimit: viewer
      ? viewer.rateLimit
      : (threadPages.rateLimit ?? paged.rateLimit ?? result.rateLimit),
    ...(parseCheckSuitesComplete(raw) && { checkSuitesComplete: true }),
    ...(parseHeadCheckSuitesEmpty(raw) && { headCheckSuitesEmpty: true as const }),
    ...workflowSuites(raw),
    ...(receiptSummary && { receiptSummary }),
    ...(stackEvidence && { stackEvidence }),
  };
}

/**
 * With `reuse`, the GraphQL first page's fingerprint is offered to it before any supplement
 * runs; a non-null answer is returned as `{ reused }` instead of a snapshot. REST snapshots never
 * call `reuse`: they have their own conditional-read reuse.
 */
export function fetchPrBatch<T>(
  pr: number,
  repo: RepoInfo,
  opts: FetchPrBatchOptions,
  reuse: (fingerprint: PrFingerprint) => Promise<T | null>,
): Promise<BatchResult | ReusedBatch<T>>;
// Last, so `Parameters<typeof fetchPrBatch>` keeps describing the ordinary snapshot read.
export function fetchPrBatch(
  pr: number,
  repo: RepoInfo,
  opts?: FetchPrBatchOptions,
): Promise<BatchResult>;
export function fetchPrBatch<T>(
  pr: number,
  repo: RepoInfo,
  opts: FetchPrBatchOptions = {},
  reuse?: (fingerprint: PrFingerprint) => Promise<T | null>,
): Promise<BatchResult | ReusedBatch<T>> {
  return githubOperation(
    "BatchPr",
    () => runWithGithubTransport("graphql", () => fetchGraphqlPrBatch(pr, repo, opts, reuse)),
    () => fetchRestPrBatch(pr, repo, opts),
  );
}
