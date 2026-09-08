import { getRepoInfo, getCurrentPrNumber } from "../github/client.mts";
import { applyResolveOptions } from "../comments/resolve.mts";
import { fetchPrBatch } from "../github/batch.mts";
import { markReplySeen } from "../state/seen-comments.mts";
import { threadTranscriptBody } from "../threads/transcript.mts";
import { addPrShepherdMarker } from "../comments/marker.mts";
import { EXIT, ShepherdError } from "../exit-codes.mts";
import type { ResolveOptions, ReviewThread } from "../types.mts";
import type { ResolveCommandOptions } from "./resolve.mts";

/** @deprecated Hidden implementation for `resolve`; use `apply review`. */
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
  let threadById: Map<string, ReviewThread> | undefined;
  if (opts.replyThreadIds?.length) {
    try {
      threadById = new Map(
        (
          await fetchPrBatch(prNumber, repo, { paginateApprovedReviews: true })
        ).data.reviewThreads.map((thread) => [thread.id, thread]),
      );
    } catch {
      // Seen-marker bookkeeping is best-effort. A failed read must not block
      // the explicit mutation request; GitHub's mutation response is authoritative.
    }
  }

  // Iterate capability-checks and routes its generated commands. Direct apply
  // requests are user-directed: forward every supplied ID unchanged and let
  // GitHub report whether each requested mutation is permitted or applicable.
  const result = await applyResolveOptions(prNumber, repo, {
    resolveThreadIds: opts.resolveThreadIds,
    replyThreadIds: opts.replyThreadIds,
    minimizeCommentIds: opts.minimizeCommentIds,
    dismissReviewIds: opts.dismissReviewIds,
    dismissMessage: opts.dismissMessage,
    requireSha: opts.requireSha,
  });
  if (opts.dismissMessage && threadById) {
    const markedMessage = addPrShepherdMarker(opts.dismissMessage);
    await Promise.all(
      result.repliedThreads.map((id) => {
        const thread = threadById.get(id);
        if (!thread) return Promise.resolve();
        const previousBody = threadTranscriptBody(thread);
        return markReplySeen(
          { owner: repo.owner, repo: repo.name, pr: prNumber },
          id,
          previousBody,
          threadTranscriptBody(thread, [markedMessage]),
          markedMessage,
        );
      }),
    );
  }
  return result;
}
