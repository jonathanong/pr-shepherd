import { graphqlWithRateLimit, type RateLimitInfo, type RepoInfo } from "./client.mts";
import { BATCH_PR_DATA_QUERY, BATCH_PR_QUERY, BATCH_PR_RECEIPT_QUERY } from "./queries.mts";
import { findGithubApp } from "./github-app-config.mts";
import {
  GitHubRequestError,
  isRetryableGraphQlResourceLimit,
  type GitHubGraphQlError,
} from "./errors.mts";
import { rateLimitKind } from "./rate-limit-kind.mts";
import type { RawBatchResponse } from "./batch-raw-types.mts";

interface FirstPageOptions {
  includeReceiptSummary?: boolean;
}

/**
 * Whether this tick reads `BatchPr` viewer-free and the viewer fields apart. A GitHub App
 * answers only viewer-free documents, so the split is worth its extra request only when one
 * covers the repository. Without an App the single combined query stays. The READY receipt
 * sibling stays combined too: a READY candidate needs the viewer fields in that tick anyway.
 */
export function usesViewerSplit(repo: RepoInfo, opts: FirstPageOptions): boolean {
  return !opts.includeReceiptSummary && findGithubApp(repo.owner, repo.name) !== undefined;
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

export async function readBatchFirstPage(
  pr: number,
  repo: RepoInfo,
  opts: FirstPageOptions,
  split: boolean,
): Promise<{ data: RawBatchResponse; rateLimit?: RateLimitInfo }> {
  const variables = { owner: repo.owner, repo: repo.name, pr };
  // The data read goes to the App; `applyBatchViewer` reads the viewer fields on the user's token.
  if (split) return graphqlWithRateLimit<RawBatchResponse>(BATCH_PR_DATA_QUERY, variables);
  try {
    return await graphqlWithRateLimit<RawBatchResponse>(
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
    return graphqlWithRateLimit<RawBatchResponse>(BATCH_PR_QUERY, variables);
  }
}
