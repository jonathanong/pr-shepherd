import { graphqlWithRateLimit, type RepoInfo } from "../github/client.mts";
import type { ResolveOptions } from "../types.mts";
import {
  rateLimitFromError,
  rateLimitFromGraphQlResult,
  type ResolveRateLimitStop,
} from "./rate-limit.mts";
import { setPendingOps, type ResolveMutationOp } from "./pending-ops.mts";
import { waitForSha } from "./sha-poll.mts";

export interface ResolveResult {
  resolvedThreads: string[];
  minimizedComments: string[];
  dismissedReviews: string[];
  errors: string[];
  rateLimit?: ResolveRateLimitStop;
  unresolvedThreads?: string[];
  unminimizedComments?: string[];
  undismissedReviews?: string[];
}

export async function applyResolveOptions(
  pr: number,
  repo: RepoInfo,
  opts: ResolveOptions,
): Promise<ResolveResult> {
  if ((opts.dismissReviewIds?.length ?? 0) > 0 && !opts.dismissMessage) {
    throw new Error("--message is required when dismissing reviews");
  }

  if (opts.requireSha) {
    // Verify GitHub received the commit before resolving — prevents auto-merge
    // before reviewers see the fix.
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

// Keep mutation batches small so rate-limit stops leave a precise pending list.
const BULK_CHUNK_SIZE = 10;

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
  const allOps: ResolveMutationOp[] = [
    ...resolveIds.map((id) => ({ kind: "r" as const, id })),
    ...minimizeIds.map((id) => ({ kind: "m" as const, id })),
    ...dismissIds.map((id) => ({ kind: "d" as const, id })),
  ];

  for (let i = 0; i < allOps.length; i += BULK_CHUNK_SIZE) {
    const chunk = allOps.slice(i, i + BULK_CHUNK_SIZE);
    // eslint-disable-next-line no-await-in-loop
    const stopped = await bulkApplyChunk(
      chunk.filter((o) => o.kind === "r").map((o) => o.id),
      chunk.filter((o) => o.kind === "m").map((o) => o.id),
      chunk.filter((o) => o.kind === "d").map((o) => o.id),
      dismissMessage,
      result,
      i + BULK_CHUNK_SIZE < allOps.length,
    );
    if (stopped) {
      setPendingOps(result, allOps.slice(i));
      return;
    }
  }
}

async function bulkApplyChunk(
  resolveIds: string[],
  minimizeIds: string[],
  dismissIds: string[],
  dismissMessage: string,
  result: ResolveResult,
  hasPendingAfter: boolean,
): Promise<boolean> {
  if (resolveIds.length === 0 && minimizeIds.length === 0 && dismissIds.length === 0) return false;

  const doc = buildBulkMutation(resolveIds, minimizeIds, dismissIds, dismissMessage);

  let data: Record<string, unknown>;
  let rateLimitStop: ResolveRateLimitStop | undefined;
  try {
    const resp = await graphqlWithRateLimit<Record<string, unknown>>(doc, {});
    data = resp.data;
    rateLimitStop = rateLimitFromGraphQlResult(resp.errors?.map((e) => e.message) ?? [], {
      rateLimit: resp.rateLimit,
      retryAfterSeconds: resp.retryAfterSeconds,
      stopOnZeroRemaining: hasPendingAfter,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stop = rateLimitFromError(err, msg);
    if (stop) {
      result.errors.push(`rate limit: ${stop.message}`);
      result.rateLimit = stop;
      return true;
    }
    for (const id of resolveIds) result.errors.push(`${id}: ${msg}`);
    for (const id of minimizeIds) result.errors.push(`${id}: ${msg}`);
    for (const id of dismissIds) result.errors.push(`${id}: ${msg}`);
    return false;
  }

  for (let i = 0; i < resolveIds.length; i++) {
    const r = data[`r${i}`] as { thread?: { isResolved?: boolean } } | null | undefined;
    if (r?.thread?.isResolved === true) result.resolvedThreads.push(resolveIds[i]!);
    else if (!rateLimitStop)
      result.errors.push(`${resolveIds[i]}: resolve returned null or thread not resolved`);
  }

  for (let i = 0; i < minimizeIds.length; i++) {
    const m = data[`m${i}`] as { minimizedComment?: { isMinimized?: boolean } } | null | undefined;
    if (m?.minimizedComment?.isMinimized === true) result.minimizedComments.push(minimizeIds[i]!);
    else if (!rateLimitStop)
      result.errors.push(`${minimizeIds[i]}: minimize returned null or comment not minimized`);
  }

  for (let i = 0; i < dismissIds.length; i++) {
    const d = data[`d${i}`] as { pullRequestReview?: { state?: string } } | null | undefined;
    if (d?.pullRequestReview != null) result.dismissedReviews.push(dismissIds[i]!);
    else if (!rateLimitStop) result.errors.push(`${dismissIds[i]}: dismiss returned null`);
  }

  if (rateLimitStop) {
    result.errors.push(`rate limit: ${rateLimitStop.message}`);
    result.rateLimit = rateLimitStop;
    return true;
  }

  return false;
}
