import { getRepoInfo, getCurrentPrNumber } from "../github/client.mts";
import { applyResolveOptions } from "../comments/resolve.mts";
import { fetchReplyThreadTranscripts } from "../github/reply-thread-transcripts.mts";
import { markReplySeen } from "../state/seen-comments.mts";
import { threadTranscriptBodies } from "../threads/transcript.mts";
import { addPrShepherdMarker } from "../comments/marker.mts";
import { EXIT, ShepherdError } from "../exit-codes.mts";
import type { ResolveOptions } from "../types.mts";
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
  let transcriptById: Map<string, string> | undefined;
  if (opts.replyThreadIds?.length) {
    try {
      transcriptById = await fetchReplyThreadTranscripts(prNumber, repo, opts.replyThreadIds);
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
  if (opts.dismissMessage && transcriptById) {
    const markedMessage = addPrShepherdMarker(opts.dismissMessage);
    await Promise.all(
      result.repliedThreads.map((id) => {
        const previousBody = transcriptById.get(id);
        if (previousBody === undefined) return Promise.resolve();
        return markReplySeen(
          { owner: repo.owner, repo: repo.name, pr: prNumber },
          id,
          previousBody,
          threadTranscriptBodies([previousBody, markedMessage]),
          markedMessage,
        );
      }),
    );
  }
  return result;
}
