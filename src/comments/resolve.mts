/**
 * Batched mutations for resolving threads, minimizing comments, and dismissing reviews.
 *
 * All operations are sent in a single aliased mutation document (`BulkApply`), eliminating
 * one round-trip per id. Partial failures (one alias returns null) are tracked per-id
 * without aborting the rest.
 *
 * Push-before-resolve safety:
 *   When `requireSha` is set, shepherd verifies that GitHub has received that
 *   commit before issuing any resolve/dismiss mutations. It polls up to 20 seconds.
 *   If the push hasn't landed, shepherd throws rather than resolving prematurely
 *   (which could allow auto-merge before reviewers see the fix).
 */

import { graphql, getPrHeadSha, type RepoInfo } from "../github/client.mts";
import type { ResolveOptions } from "../types.mts";
import { loadConfig } from "../config/load.mts";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ResolveResult {
  resolvedThreads: string[];
  minimizedComments: string[];
  dismissedReviews: string[];
  errors: string[];
}

/**
 * Execute all requested resolve/minimize/dismiss mutations in a single GraphQL call.
 *
 * @throws Error if `requireSha` is set and GitHub hasn't received that commit
 *              within the polling window.
 */
export async function applyResolveOptions(
  pr: number,
  repo: RepoInfo,
  opts: ResolveOptions,
): Promise<ResolveResult> {
  if ((opts.dismissReviewIds?.length ?? 0) > 0 && !opts.dismissMessage) {
    throw new Error("--message is required when dismissing reviews");
  }

  if (opts.requireSha) {
    await waitForSha(pr, repo, opts.requireSha);
  }

  const result: ResolveResult = {
    resolvedThreads: [],
    minimizedComments: [],
    dismissedReviews: [],
    errors: [],
  };

  await bulkApply(
    opts.resolveThreadIds ?? [],
    opts.minimizeCommentIds ?? [],
    opts.dismissReviewIds ?? [],
    opts.dismissMessage ?? "",
    result,
  );

  return result;
}

/**
 * Auto-resolve a batch of outdated threads via a single aliased mutation.
 */
export async function autoResolveOutdated(
  threadIds: string[],
): Promise<{ resolved: string[]; errors: string[] }> {
  const result: ResolveResult = {
    resolvedThreads: [],
    minimizedComments: [],
    dismissedReviews: [],
    errors: [],
  };
  await bulkApply(threadIds, [], [], "", result);
  return { resolved: result.resolvedThreads, errors: result.errors };
}

// ---------------------------------------------------------------------------
// Bulk mutation
// ---------------------------------------------------------------------------

function buildBulkMutation(
  resolveIds: string[],
  minimizeIds: string[],
  dismissIds: string[],
  dismissMessage: string,
): string {
  const ops: string[] = [];

  for (let i = 0; i < resolveIds.length; i++) {
    ops.push(
      `  r${i}: resolveReviewThread(input: { threadId: ${JSON.stringify(resolveIds[i])} }) { thread { isResolved } }`,
    );
  }

  for (let i = 0; i < minimizeIds.length; i++) {
    ops.push(
      `  m${i}: minimizeComment(input: { subjectId: ${JSON.stringify(minimizeIds[i])}, classifier: RESOLVED }) { minimizedComment { isMinimized } }`,
    );
  }

  for (let i = 0; i < dismissIds.length; i++) {
    ops.push(
      `  d${i}: dismissPullRequestReview(input: { pullRequestReviewId: ${JSON.stringify(dismissIds[i])}, message: ${JSON.stringify(dismissMessage)} }) { pullRequestReview { state } }`,
    );
  }

  return `mutation BulkApply {\n${ops.join("\n")}\n}`;
}

async function bulkApply(
  resolveIds: string[],
  minimizeIds: string[],
  dismissIds: string[],
  dismissMessage: string,
  result: ResolveResult,
): Promise<void> {
  if (resolveIds.length === 0 && minimizeIds.length === 0 && dismissIds.length === 0) return;

  const doc = buildBulkMutation(resolveIds, minimizeIds, dismissIds, dismissMessage);

  let data: Record<string, unknown>;
  try {
    const resp = await graphql<Record<string, unknown>>(doc, {});
    data = resp.data;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    for (const id of resolveIds) result.errors.push(`${id}: ${msg}`);
    for (const id of minimizeIds) result.errors.push(`${id}: ${msg}`);
    for (const id of dismissIds) result.errors.push(`${id}: ${msg}`);
    return;
  }

  for (let i = 0; i < resolveIds.length; i++) {
    const r = data[`r${i}`] as { thread?: { isResolved?: boolean } } | null | undefined;
    if (r?.thread?.isResolved === true) result.resolvedThreads.push(resolveIds[i]!);
    else result.errors.push(`${resolveIds[i]}: resolve returned null or thread not resolved`);
  }

  for (let i = 0; i < minimizeIds.length; i++) {
    const m = data[`m${i}`] as { minimizedComment?: { isMinimized?: boolean } } | null | undefined;
    if (m?.minimizedComment?.isMinimized === true) result.minimizedComments.push(minimizeIds[i]!);
    else result.errors.push(`${minimizeIds[i]}: minimize returned null or comment not minimized`);
  }

  for (let i = 0; i < dismissIds.length; i++) {
    const d = data[`d${i}`] as { pullRequestReview?: { state?: string } } | null | undefined;
    if (d?.pullRequestReview != null) result.dismissedReviews.push(dismissIds[i]!);
    else result.errors.push(`${dismissIds[i]}: dismiss returned null`);
  }
}

// ---------------------------------------------------------------------------
// SHA polling
// ---------------------------------------------------------------------------

async function waitForSha(pr: number, repo: RepoInfo, expectedSha: string): Promise<void> {
  const { intervalMs: SHA_POLL_INTERVAL_MS, maxAttempts: SHA_POLL_MAX_ATTEMPTS } =
    loadConfig().resolve.shaPoll;
  for (let attempt = 0; attempt < SHA_POLL_MAX_ATTEMPTS; attempt++) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const currentSha = await getPrHeadSha(pr, repo.owner, repo.name);
      if (currentSha === expectedSha) return;
    } catch (err) {
      if (attempt === SHA_POLL_MAX_ATTEMPTS - 1) throw err;
    }

    if (attempt < SHA_POLL_MAX_ATTEMPTS - 1) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(SHA_POLL_INTERVAL_MS);
    }
  }

  throw new Error(
    `Timeout: GitHub PR #${pr} head SHA has not updated to ${expectedSha} after ${
      ((SHA_POLL_MAX_ATTEMPTS - 1) * SHA_POLL_INTERVAL_MS) / 1000
    }s. Push may still be in transit — retry shortly.`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
