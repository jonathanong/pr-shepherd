import { getRepoInfo, getCurrentPrNumber } from "../github/client.mts";
import { applyResolveOptions } from "../comments/resolve.mts";
import { fetchReplyThreadTranscripts } from "../github/reply-thread-transcripts.mts";
import {
  readApplyReviewPreflight,
  type ApplyReviewPreflight,
} from "../github/apply-review-preflight.mts";
import {
  BLOCKED_REVIEW_INSTRUCTION,
  collectReviewIdsToGuard,
  formatBlockedReviewErrors,
  resolveBlockedReviews,
} from "./resolve-review-guard.mts";
import { markReplySeen, pruneResolvedReviewThreads } from "../state/seen-comments.mts";
import { threadTranscriptBodies } from "../threads/transcript.mts";
import { addPrShepherdMarker } from "../comments/marker.mts";
import { adoptedReplyThreads } from "../comments/uncertain-replies.mts";
import { EXIT, ShepherdError } from "../exit-codes.mts";
import type { ResolveOptions } from "../types.mts";
import type { ResolveCommandOptions } from "./resolve.mts";

/** Implementation for `apply review`. */
export async function runResolveMutate(
  opts: ResolveCommandOptions & ResolveOptions,
): Promise<import("../comments/resolve.mts").ResolveResult> {
  const repo = opts.targetRepository ?? (await getRepoInfo());
  const prNumber = opts.prNumber ?? (await getCurrentPrNumber());
  if (prNumber === null) {
    throw new ShepherdError(
      "No open PR found for current branch. Pass a PR number explicitly.",
      EXIT.UNAVAILABLE,
    );
  }
  // Fetch only to retain the pre-reply transcript for successful-reply seen
  // markers. It never determines which user-supplied IDs are sent to GitHub.
  let transcriptById: Map<string, string> | undefined;
  let preflight: ApplyReviewPreflight | null = null;
  if (opts.replyThreadIds?.length) {
    try {
      preflight = await readApplyReviewPreflight(prNumber, repo, opts.replyThreadIds);
    } catch {
      // The standalone reads below and in applyResolveOptions cover everything it would have.
    }
    transcriptById = new Map(preflight?.transcripts);
    const missing = [...new Set(opts.replyThreadIds)].filter((id) => !transcriptById!.has(id));
    try {
      if (missing.length)
        for (const [id, body] of await fetchReplyThreadTranscripts(prNumber, repo, missing))
          transcriptById.set(id, body);
    } catch {
      // Seen-marker bookkeeping is best-effort. A failed read must not block
      // the explicit mutation request; GitHub's mutation response is authoritative.
    }
  }

  const stateKey = { owner: repo.owner, repo: repo.name, pr: prNumber };
  // Guard: never allow dismissing or hiding a review while any of its inline threads are
  // unresolved — even if those threads are also passed to `--resolve-thread-ids` in the same
  // command. Local markers track each review's unresolved threads across `check` and `apply`,
  // so already-resolved reviews need zero GraphQL calls; GitHub is only queried when local
  // state still has unresolved thread IDs (to check for external resolution) or has no record yet.
  const reviewIdsToCheck = collectReviewIdsToGuard(opts.dismissReviewIds, opts.minimizeCommentIds);
  const blockedByReview =
    reviewIdsToCheck.length > 0
      ? await resolveBlockedReviews(stateKey, prNumber, repo, reviewIdsToCheck)
      : new Map<string, string[]>();
  const blockedErrors = formatBlockedReviewErrors(blockedByReview);
  const allowedDismissReviewIds = opts.dismissReviewIds?.filter((id) => !blockedByReview.has(id));
  const allowedMinimizeCommentIds = opts.minimizeCommentIds?.filter(
    (id) => !blockedByReview.has(id),
  );
  const hasAllowedMutations =
    (opts.resolveThreadIds?.length ?? 0) > 0 ||
    (opts.replyThreadIds?.length ?? 0) > 0 ||
    (allowedMinimizeCommentIds?.length ?? 0) > 0 ||
    (allowedDismissReviewIds?.length ?? 0) > 0;
  if (!hasAllowedMutations && blockedErrors.length > 0) {
    return {
      repliedThreads: [],
      resolvedThreads: [],
      minimizedComments: [],
      dismissedReviews: [],
      errors: blockedErrors,
      instructions: [BLOCKED_REVIEW_INSTRUCTION],
    };
  }

  // Iterate capability-checks and routes its generated commands. Direct apply
  // requests are user-directed: forward every remaining supplied ID unchanged and let
  // GitHub report whether each requested mutation is permitted or applicable.
  // Only generated durable-state commands carry `--adopt-existing-replies`.
  const result = await applyResolveOptions(
    prNumber,
    repo,
    {
      resolveThreadIds: opts.resolveThreadIds,
      replyThreadIds: opts.replyThreadIds,
      minimizeCommentIds: allowedMinimizeCommentIds,
      dismissReviewIds: allowedDismissReviewIds,
      dismissMessage: opts.dismissMessage,
      requireSha: opts.requireSha,
      ...(opts.adoptExistingReplies && { adoptExistingReplies: true }),
    },
    ...(preflight ? [preflight] : []),
  );
  if (blockedErrors.length > 0) {
    result.errors.push(...blockedErrors);
    result.instructions = [...(result.instructions ?? []), BLOCKED_REVIEW_INSTRUCTION];
  }
  const adopted = new Set(adoptedReplyThreads(result));
  let adoptedTranscripts: Map<string, string> | undefined;
  if (adopted.size) {
    try {
      adoptedTranscripts = await fetchReplyThreadTranscripts(prNumber, repo, [...adopted]);
    } catch {
      /* Never synthesize a transcript for an already-delivered reply. */
    }
  }
  if (opts.dismissMessage && (transcriptById || adoptedTranscripts)) {
    const markedMessage = addPrShepherdMarker(opts.dismissMessage);
    await Promise.all(
      result.repliedThreads.map((id) => {
        const previousBody = transcriptById?.get(id);
        const currentBody = adopted.has(id) ? adoptedTranscripts?.get(id) : undefined;
        if (adopted.has(id) && currentBody === undefined) return Promise.resolve();
        if (previousBody === undefined) return Promise.resolve();
        return markReplySeen(
          { owner: repo.owner, repo: repo.name, pr: prNumber },
          id,
          previousBody,
          currentBody ?? threadTranscriptBodies([previousBody, markedMessage]),
          markedMessage,
        );
      }),
    );
  }
  if (result.resolvedThreads.length > 0) {
    await pruneResolvedReviewThreads(stateKey, result.resolvedThreads);
  }
  return result;
}
