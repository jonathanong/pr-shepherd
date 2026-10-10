/* eslint-disable max-lines */
import { graphqlWithRateLimit, type RepoInfo } from "../github/client.mts";
import type { ResolveOptions } from "../types.mts";
import { addPrShepherdMarker } from "./marker.mts";
import { findExistingReplies } from "./existing-reply-scan.mts";
import {
  isRateLimitMessage,
  rateLimitFromError,
  rateLimitFromGraphQlResult,
  type ResolveRateLimitStop,
} from "./rate-limit.mts";
import { setPendingOps, type ResolveMutationOp } from "./pending-ops.mts";
import { waitForSha } from "./sha-poll.mts";
import { githubOperation, getGithubTransport } from "../github/transport.mts";
import { resolveGraphqlThreadId } from "../github/rest-identities.mts";
import { applyRestReviewChunk, isAmbiguousMutationError } from "./rest-review-mutations.mts";
import {
  assertReplyOutcomeKnown,
  rememberUncertainReplies,
  trackAdoptedReplyThreads,
} from "./uncertain-replies.mts";
import { isRestSessionRefusal } from "../github/rest-session-refusal.mts";
import { EXIT, ShepherdError } from "../exit-codes.mts";
import { readReplyRecoveryEvidence, type ReplyEvidence } from "../github/reply-recovery-read.mts";
import {
  GitHubRequestError,
  isRetryableGraphQlInternal,
  type GitHubGraphQlError,
} from "../github/errors.mts";

export interface ResolveResult {
  repliedThreads: string[];
  resolvedThreads: string[];
  minimizedComments: string[];
  dismissedReviews: string[];
  errors: string[];
  /** @deprecated Direct apply forwards every supplied dismissal ID to GitHub. */
  skippedDismissals?: string[];
  /** @deprecated Direct apply no longer applies author policy. */
  skippedHumanResolves?: string[];
  /** @deprecated Direct apply no longer applies author policy. */
  skippedHumanMinimizes?: string[];
  /** @deprecated Direct apply no longer applies author policy. */
  skippedHumanDismissals?: string[];
  /** @deprecated Direct apply forwards every supplied reply ID to GitHub. */
  skippedNonHumanReplies?: string[];
  /** @deprecated Direct apply requests now rely on GitHub's mutation response. */
  skippedUnauthorizedReplies?: string[];
  /** @deprecated Direct apply requests now rely on GitHub's mutation response. */
  skippedUnauthorizedResolves?: string[];
  /** @deprecated Direct apply requests now rely on GitHub's mutation response. */
  skippedUnauthorizedMinimizes?: string[];
  /** @deprecated Direct apply requests now rely on GitHub's mutation response. */
  skippedUnauthorizedDismissals?: string[];
  rateLimit?: ResolveRateLimitStop;
  sessionRefusal?: string;
  instructions?: string[];
  unrepliedThreads?: string[];
  unresolvedThreads?: string[];
  unminimizedComments?: string[];
  undismissedReviews?: string[];
}

const COMMENTED_DISMISS_ERROR_PATTERNS = [
  /can\s*not\s+dismiss[\s\S]*?commented pull request review/i,
];

type GraphQlErrorLike = GitHubGraphQlError;

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

function mutationErrorMessage(errors: GraphQlErrorLike[], alias: string): string | undefined {
  const messages = errors
    .filter((error) => Array.isArray(error.path) && error.path.includes(alias))
    .map((error) => error.message);
  return messages.length > 0 ? messages.join("; ") : undefined;
}

function uncertainReplyIds(
  ids: string[],
  confirmed: string[],
  errors: GraphQlErrorLike[],
): string[] {
  return ids.filter((id, index) => {
    if (confirmed.includes(id)) return false;
    const applicable = errors.filter(
      (error) =>
        error.path === undefined || (Array.isArray(error.path) && error.path[0] === `p${index}`),
    );
    return applicable.length === 0 || isRetryableGraphQlInternal(applicable);
  });
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

  const result: ResolveResult = {
    repliedThreads: [],
    resolvedThreads: [],
    minimizedComments: [],
    dismissedReviews: [],
    errors: [],
  };

  if ((dismissReviewIds.length > 0 || replyThreadIds.length > 0) && !opts.dismissMessage) {
    throw new Error("--message is required when replying to threads or dismissing reviews");
  }

  if (opts.requireSha) {
    // Verify GitHub received the commit before resolving — prevents auto-merge
    // before reviewers see the fix.
    await waitForSha(pr, repo, opts.requireSha);
  }

  const known = await assertReplyOutcomeKnown(
    { repo, pr },
    replyThreadIds,
    opts.dismissMessage ?? "",
  );
  const adopted = [
    ...known,
    ...(opts.adoptExistingReplies
      ? await findExistingReplies(
          { repo, pr },
          replyThreadIds.filter((id) => !known.includes(id)),
          opts.dismissMessage ?? "",
        )
      : []),
  ];
  result.repliedThreads.push(...adopted);
  trackAdoptedReplyThreads(result, adopted);

  await bulkApply(
    replyThreadIds.filter((id) => !adopted.includes(id)),
    resolveThreadIds,
    minimizeCommentIds,
    dismissReviewIds,
    opts.dismissMessage ?? "",
    result,
    { repo, pr },
  );

  if (result.sessionRefusal)
    result.instructions = [
      "Restore GitHub access for this session using the proxy instructions above.",
      "Retry only the pending IDs listed above.",
    ];

  return result;
}

/** @deprecated Compatibility alias; use `autoResolveThreads`. */
export async function autoResolveOutdated(
  threadIds: string[],
): Promise<{ resolved: string[]; errors: string[] }> {
  return autoResolveThreads(threadIds);
}

export async function autoResolveThreads(
  threadIds: string[],
): Promise<{ resolved: string[]; errors: string[] }> {
  if (threadIds.length === 0) return { resolved: [], errors: [] };
  const result: ResolveResult = {
    repliedThreads: [],
    resolvedThreads: [],
    minimizedComments: [],
    dismissedReviews: [],
    errors: [],
  };
  await bulkApply([], threadIds, [], [], "", result);
  if (result.sessionRefusal) throw new ShepherdError(result.sessionRefusal, EXIT.NOPERM);
  return { resolved: result.resolvedThreads, errors: result.errors };
}

export async function autoMinimizeComments(
  minimizeIds: string[],
): Promise<{ minimized: string[]; errors: string[] }> {
  if (minimizeIds.length === 0) return { minimized: [], errors: [] };
  const result: ResolveResult = {
    repliedThreads: [],
    resolvedThreads: [],
    minimizedComments: [],
    dismissedReviews: [],
    errors: [],
  };
  await bulkApply([], [], minimizeIds, [], "", result);
  if (result.sessionRefusal) throw new ShepherdError(result.sessionRefusal, EXIT.NOPERM);
  return { minimized: result.minimizedComments, errors: result.errors };
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
  const replyBody = addPrShepherdMarker(dismissMessage);

  for (let i = 0; i < replyIds.length; i++) {
    ops.push(
      `  p${i}: addPullRequestReviewThreadReply(input: { pullRequestReviewThreadId: ${JSON.stringify(replyIds[i])}, body: ${JSON.stringify(replyBody)} }) { comment { id } }`,
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
  context?: { repo: RepoInfo; pr: number },
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
      context,
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
  context?: { repo: RepoInfo; pr: number },
): Promise<boolean> {
  let data: Record<string, unknown> = {};
  let graphQlErrors: GraphQlErrorLike[] = [];
  let rateLimitStop: ResolveRateLimitStop | undefined;
  let suppressCurrentChunkErrors = false;
  let restStopped = false;
  let graphqlMutationAttempted = false;
  let replyEvidence = new Map<string, ReplyEvidence>();
  if (context && replyIds.length && getGithubTransport() === "graphql") {
    try {
      replyEvidence = await readReplyRecoveryEvidence(context.repo, context.pr, replyIds);
    } catch {
      /* Preserve explicit mutation eligibility when recovery evidence is unavailable. */
    }
  }
  try {
    const resp = await githubOperation(
      "BulkApply",
      async () => {
        const [graphqlReplies, graphqlResolves] = await Promise.all([
          Promise.all(replyIds.map(resolveGraphqlThreadId)),
          Promise.all(resolveIds.map(resolveGraphqlThreadId)),
        ]);
        graphqlMutationAttempted = true;
        return graphqlWithRateLimit<Record<string, unknown>>(
          buildBulkMutation(
            graphqlReplies,
            graphqlResolves,
            minimizeIds,
            dismissIds,
            dismissMessage,
          ),
          {},
          { allowPartialData: true },
        );
      },
      () =>
        applyRestReviewChunk({
          ...context,
          replyIds,
          resolveIds,
          minimizeIds,
          dismissIds,
          message: dismissMessage,
        }),
      { mutation: true },
    );
    if ("restStopped" in resp) restStopped = resp.restStopped === true;
    if ("sessionRefusal" in resp && typeof resp.sessionRefusal === "string")
      result.sessionRefusal = resp.sessionRefusal;
    data = resp.data;
    graphQlErrors = (resp.errors ?? []) as GraphQlErrorLike[];
    const graphQlErrorMessages = graphQlErrors.map((e) => e.message);
    suppressCurrentChunkErrors = restStopped || graphQlErrorMessages.some(isRateLimitMessage);
    rateLimitStop = rateLimitFromGraphQlResult(graphQlErrorMessages, {
      rateLimit: resp.rateLimit,
      retryAfterSeconds: "retryAfterSeconds" in resp ? resp.retryAfterSeconds : undefined,
      stopOnZeroRemaining: hasPendingAfter,
    });
  } catch (err) {
    if (isRestSessionRefusal(err)) throw err;
    const uncertainIds =
      err instanceof GitHubRequestError && err.status === 200
        ? uncertainReplyIds(replyIds, [], err.graphqlErrors ?? [])
        : replyIds;
    const ambiguous =
      isAmbiguousMutationError(err) ||
      (graphqlMutationAttempted &&
        err instanceof GitHubRequestError &&
        (isRetryableGraphQlInternal(err.graphqlErrors) ||
          (err.status === 200 && (!err.graphqlErrors?.length || uncertainIds.length > 0))));
    if (context && graphqlMutationAttempted && ambiguous)
      await rememberUncertainReplies(context, uncertainIds, dismissMessage, replyEvidence);
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
    return ambiguous;
  }

  for (let i = 0; i < replyIds.length; i++) {
    const id = replyIds[i];
    if (id === undefined) continue;
    const p = data[`p${i}`] as { comment?: { id?: string } } | null | undefined;
    if (p?.comment?.id) result.repliedThreads.push(id);
    else if (!suppressCurrentChunkErrors || mutationErrorMessage(graphQlErrors, `p${i}`))
      result.errors.push(
        `${id}: ${mutationErrorMessage(graphQlErrors, `p${i}`) ?? "reply returned null or comment not created"}`,
      );
  }

  for (let i = 0; i < resolveIds.length; i++) {
    const r = data[`r${i}`] as { thread?: { isResolved?: boolean } } | null | undefined;
    if (r?.thread?.isResolved === true) result.resolvedThreads.push(resolveIds[i]!);
    else if (!suppressCurrentChunkErrors || mutationErrorMessage(graphQlErrors, `r${i}`))
      result.errors.push(
        `${resolveIds[i]}: ${mutationErrorMessage(graphQlErrors, `r${i}`) ?? "resolve returned null or thread not resolved"}`,
      );
  }

  for (let i = 0; i < minimizeIds.length; i++) {
    const m = data[`m${i}`] as { minimizedComment?: { isMinimized?: boolean } } | null | undefined;
    if (m?.minimizedComment?.isMinimized === true) result.minimizedComments.push(minimizeIds[i]!);
    else if (!suppressCurrentChunkErrors || mutationErrorMessage(graphQlErrors, `m${i}`))
      result.errors.push(
        `${minimizeIds[i]}: ${mutationErrorMessage(graphQlErrors, `m${i}`) ?? "minimize returned null or comment not minimized"}`,
      );
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
    else if (!suppressCurrentChunkErrors || mutationErrorMessage(graphQlErrors, `d${i}`))
      result.errors.push(
        commentedDismissErrorIndexes.has(i) || (singleDismiss && hasUnmappedCommentedDismissError)
          ? dismissReviewNonDismissibleMessage(dismissIds[i]!)
          : `${dismissIds[i]}: ${mutationErrorMessage(graphQlErrors, `d${i}`) ?? "dismiss returned null"}`,
      );
  }

  const internalFailure = graphqlMutationAttempted && isRetryableGraphQlInternal(graphQlErrors);
  const uncertainIds = graphqlMutationAttempted
    ? uncertainReplyIds(replyIds, result.repliedThreads, graphQlErrors)
    : [];
  if (context && uncertainIds.length) {
    await rememberUncertainReplies(context, uncertainIds, dismissMessage, replyEvidence);
  }

  if (rateLimitStop) {
    result.errors.push(`rate limit: ${rateLimitStop.message}`);
    result.rateLimit = rateLimitStop;
    return true;
  }

  if (result.sessionRefusal) return true;

  return restStopped || internalFailure || uncertainIds.length > 0;
}

function dismissErrorAliasIndex(error: GraphQlErrorLike): number | undefined {
  if (!Array.isArray(error.path)) return undefined;
  const alias = error.path.find((part) => typeof part === "string" && /^d\d+$/.test(part));
  if (typeof alias !== "string") return undefined;
  const parsed = Number.parseInt(alias.slice(1), 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}
