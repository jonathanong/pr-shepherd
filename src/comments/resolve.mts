/* eslint-disable max-lines */
import { graphqlWithRateLimit, type RepoInfo } from "../github/client.mts";
import type { ResolveOptions } from "../types.mts";
import {
  isRateLimitMessage,
  rateLimitFromError,
  rateLimitFromGraphQlResult,
  type ResolveRateLimitStop,
} from "./rate-limit.mts";
import { setPendingOps, type ResolveMutationOp } from "./pending-ops.mts";
import { waitForSha } from "./sha-poll.mts";

export interface ResolveResult {
  repliedThreads: string[];
  resolvedThreads: string[];
  minimizedComments: string[];
  dismissedReviews: string[];
  errors: string[];
  skippedDismissals?: string[];
  skippedHumanResolves?: string[];
  skippedHumanMinimizes?: string[];
  skippedHumanDismissals?: string[];
  skippedNonHumanReplies?: string[];
  rateLimit?: ResolveRateLimitStop;
  unrepliedThreads?: string[];
  unresolvedThreads?: string[];
  unminimizedComments?: string[];
  undismissedReviews?: string[];
}

const COMMENTED_DISMISS_ERROR_PATTERNS = [
  /can\s*not\s+dismiss[\s\S]*?commented pull request review/i,
];

interface GraphQlErrorLike {
  message: string;
  path?: unknown;
}

function dedupeIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function isCommentedDismissError(message: string): boolean {
  return COMMENTED_DISMISS_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

function dismissReviewNonDismissibleMessage(id: string): string {
  return `Not dismissed: ${id} is a COMMENTED review. Use --minimize-comment-ids instead; --dismiss-review-ids is only for CHANGES_REQUESTED reviews.`;
}

export async function applyResolveOptions(
  pr: number,
  repo: RepoInfo,
  opts: ResolveOptions,
): Promise<ResolveResult> {
  const resolveThreadIds = dedupeIds(opts.resolveThreadIds ?? []);
  const replyThreadIds = dedupeIds(opts.replyThreadIds ?? []);
  const minimizeCommentIds = opts.minimizeCommentIds ?? [];
  const dismissReviewIds = dedupeIds(opts.dismissReviewIds ?? []);
  const minimizeCommentIdSet = new Set(minimizeCommentIds);
  const filteredDismissReviewIds = dismissReviewIds.filter((id) => !minimizeCommentIdSet.has(id));
  const overlappingDismissIds = dismissReviewIds.filter((id) => minimizeCommentIdSet.has(id));

  const result: ResolveResult = {
    repliedThreads: [],
    resolvedThreads: [],
    minimizedComments: [],
    dismissedReviews: [],
    errors: [],
  };

  if (overlappingDismissIds.length > 0) {
    result.skippedDismissals = [];
    for (const id of overlappingDismissIds) {
      result.skippedDismissals.push(id);
    }
  }

  if ((filteredDismissReviewIds.length > 0 || replyThreadIds.length > 0) && !opts.dismissMessage) {
    throw new Error("--message is required when replying to threads or dismissing reviews");
  }

  if (opts.requireSha) {
    // Verify GitHub received the commit before resolving — prevents auto-merge
    // before reviewers see the fix.
    await waitForSha(pr, repo, opts.requireSha);
  }

  await bulkApply(
    replyThreadIds,
    resolveThreadIds,
    minimizeCommentIds,
    filteredDismissReviewIds,
    opts.dismissMessage ?? "",
    result,
  );

  return result;
}

export async function autoResolveOutdated(
  threadIds: string[],
): Promise<{ resolved: string[]; errors: string[] }> {
  const result: ResolveResult = {
    repliedThreads: [],
    resolvedThreads: [],
    minimizedComments: [],
    dismissedReviews: [],
    errors: [],
  };
  await bulkApply([], threadIds, [], [], "", result);
  return { resolved: result.resolvedThreads, errors: result.errors };
}

// Keep mutation batches small so rate-limit stops leave a precise pending list.
const BULK_CHUNK_SIZE = 10;

function buildBulkMutation(
  replyIds: string[],
  resolveIds: string[],
  minimizeIds: string[],
  dismissIds: string[],
  dismissMessage: string,
): string {
  const ops: string[] = [];

  for (let i = 0; i < replyIds.length; i++) {
    ops.push(
      `  p${i}: addPullRequestReviewThreadReply(input: { pullRequestReviewThreadId: ${JSON.stringify(replyIds[i])}, body: ${JSON.stringify(dismissMessage)} }) { comment { id } }`,
    );
  }

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
  replyIds: string[],
  resolveIds: string[],
  minimizeIds: string[],
  dismissIds: string[],
  dismissMessage: string,
  result: ResolveResult,
): Promise<void> {
  const allOps: ResolveMutationOp[] = [
    ...replyIds.map((id) => ({ kind: "p" as const, id })),
    ...resolveIds.map((id) => ({ kind: "r" as const, id })),
    ...minimizeIds.map((id) => ({ kind: "m" as const, id })),
    ...dismissIds.map((id) => ({ kind: "d" as const, id })),
  ];

  for (let i = 0; i < allOps.length; i += BULK_CHUNK_SIZE) {
    const chunk = allOps.slice(i, i + BULK_CHUNK_SIZE);
    // eslint-disable-next-line no-await-in-loop
    const stopped = await bulkApplyChunk(
      chunk.filter((o) => o.kind === "r").map((o) => o.id),
      chunk.filter((o) => o.kind === "p").map((o) => o.id),
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
  replyIds: string[],
  minimizeIds: string[],
  dismissIds: string[],
  dismissMessage: string,
  result: ResolveResult,
  hasPendingAfter: boolean,
): Promise<boolean> {
  const doc = buildBulkMutation(replyIds, resolveIds, minimizeIds, dismissIds, dismissMessage);

  let data: Record<string, unknown> = {};
  let graphQlErrors: GraphQlErrorLike[] = [];
  let rateLimitStop: ResolveRateLimitStop | undefined;
  let suppressCurrentChunkErrors = false;
  try {
    const resp = await graphqlWithRateLimit<Record<string, unknown>>(doc, {});
    data = resp.data;
    graphQlErrors = (resp.errors ?? []) as GraphQlErrorLike[];
    const graphQlErrorMessages = graphQlErrors.map((e) => e.message);
    suppressCurrentChunkErrors = graphQlErrorMessages.some(isRateLimitMessage);
    rateLimitStop = rateLimitFromGraphQlResult(graphQlErrorMessages, {
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
    for (const id of replyIds) result.errors.push(`${id}: ${msg}`);
    for (const id of resolveIds) result.errors.push(`${id}: ${msg}`);
    for (const id of minimizeIds) result.errors.push(`${id}: ${msg}`);
    for (const id of dismissIds) result.errors.push(`${id}: ${msg}`);
    return false;
  }

  for (let i = 0; i < replyIds.length; i++) {
    const id = replyIds[i];
    if (id === undefined) continue;
    const p = data[`p${i}`] as { comment?: { id?: string } } | null | undefined;
    if (p?.comment?.id) result.repliedThreads.push(id);
    else if (!suppressCurrentChunkErrors)
      result.errors.push(`${id}: reply returned null or comment not created`);
  }

  for (let i = 0; i < resolveIds.length; i++) {
    const r = data[`r${i}`] as { thread?: { isResolved?: boolean } } | null | undefined;
    if (r?.thread?.isResolved === true) result.resolvedThreads.push(resolveIds[i]!);
    else if (!suppressCurrentChunkErrors)
      result.errors.push(`${resolveIds[i]}: resolve returned null or thread not resolved`);
  }

  for (let i = 0; i < minimizeIds.length; i++) {
    const m = data[`m${i}`] as { minimizedComment?: { isMinimized?: boolean } } | null | undefined;
    if (m?.minimizedComment?.isMinimized === true) result.minimizedComments.push(minimizeIds[i]!);
    else if (!suppressCurrentChunkErrors)
      result.errors.push(`${minimizeIds[i]}: minimize returned null or comment not minimized`);
  }

  const singleDismiss = dismissIds.length === 1;
  const commentedDismissErrorIndexes = new Set<number>();
  let hasUnmappedCommentedDismissError = false;
  for (const error of graphQlErrors) {
    if (!isCommentedDismissError(error.message)) continue;
    const alias = dismissErrorAliasIndex(error);
    if (alias === undefined) {
      hasUnmappedCommentedDismissError = true;
      continue;
    }
    commentedDismissErrorIndexes.add(alias);
  }

  for (let i = 0; i < dismissIds.length; i++) {
    const d = data[`d${i}`] as { pullRequestReview?: { state?: string } } | null | undefined;
    if (d?.pullRequestReview != null) result.dismissedReviews.push(dismissIds[i]!);
    else if (!suppressCurrentChunkErrors)
      result.errors.push(
        commentedDismissErrorIndexes.has(i) || (singleDismiss && hasUnmappedCommentedDismissError)
          ? dismissReviewNonDismissibleMessage(dismissIds[i]!)
          : `${dismissIds[i]}: dismiss returned null`,
      );
  }

  if (rateLimitStop) {
    result.errors.push(`rate limit: ${rateLimitStop.message}`);
    result.rateLimit = rateLimitStop;
    return true;
  }

  return false;
}

function dismissErrorAliasIndex(error: GraphQlErrorLike): number | undefined {
  if (!Array.isArray(error.path)) return undefined;
  const alias = error.path.find((part) => typeof part === "string" && /^d\d+$/.test(part));
  if (typeof alias !== "string") return undefined;
  const parsed = Number.parseInt(alias.slice(1), 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}
