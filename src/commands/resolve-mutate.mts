import { getRepoInfo, getCurrentPrNumber } from "../github/client.mts";
import { applyResolveOptions } from "../comments/resolve.mts";
import { fetchPrBatch } from "../github/batch.mts";
import { loadConfig } from "../config/load.mts";
import {
  isConfiguredBotAuthor,
  isHumanAuthor,
  normalizeBotUsernames,
} from "../comments/authors.mts";
import { markReplySeen } from "../state/seen-comments.mts";
import { threadTranscriptBody } from "../threads/transcript.mts";
import type { ResolveOptions } from "../types.mts";
import type { ResolveCommandOptions } from "./resolve.mts";

export async function runResolveMutate(
  opts: ResolveCommandOptions & ResolveOptions,
): Promise<import("../comments/resolve.mts").ResolveResult> {
  const repo = await getRepoInfo();
  const prNumber = opts.prNumber ?? (await getCurrentPrNumber());
  if (prNumber === null) {
    throw new Error("No open PR found for current branch. Pass a PR number explicitly.");
  }
  const { data } = await fetchPrBatch(prNumber, repo, { paginateApprovedReviews: true });
  const config = loadConfig();
  const botUsernames = normalizeBotUsernames(config.botUsernames);
  const threadById = new Map(data.reviewThreads.map((t) => [t.id, t]));
  const humanThreadIds = new Set(
    data.reviewThreads
      .filter((t) => isHumanAuthor(t) && !isConfiguredBotAuthor(t, botUsernames))
      .map((t) => t.id),
  );
  const humanCommentIds = new Set(
    data.comments
      .filter((c) => isHumanAuthor(c) && !isConfiguredBotAuthor(c, botUsernames))
      .map((c) => c.id),
  );
  const humanReviewIds = new Set(
    [...data.reviewSummaries, ...data.approvedReviews, ...data.changesRequestedReviews]
      .filter((r) => isHumanAuthor(r) && !isConfiguredBotAuthor(r, botUsernames))
      .map((r) => r.id),
  );
  const resolveThreadIds = (opts.resolveThreadIds ?? []).filter((id) => !humanThreadIds.has(id));
  const skippedHumanResolves = (opts.resolveThreadIds ?? []).filter((id) => humanThreadIds.has(id));
  const replyThreadIds = opts.replyThreadIds?.filter((id) => humanThreadIds.has(id));
  const skippedNonHumanReplies = (opts.replyThreadIds ?? []).filter(
    (id) => !humanThreadIds.has(id),
  );
  const minimizeCommentIds = (opts.minimizeCommentIds ?? []).filter(
    (id) => !humanCommentIds.has(id) && !humanReviewIds.has(id),
  );
  const skippedHumanMinimizes = (opts.minimizeCommentIds ?? []).filter(
    (id) => humanCommentIds.has(id) || humanReviewIds.has(id),
  );
  const dismissReviewIds = (opts.dismissReviewIds ?? []).filter((id) => !humanReviewIds.has(id));
  const skippedHumanDismissals = (opts.dismissReviewIds ?? []).filter((id) =>
    humanReviewIds.has(id),
  );

  const result = await applyResolveOptions(prNumber, repo, {
    resolveThreadIds,
    replyThreadIds,
    minimizeCommentIds,
    dismissReviewIds,
    dismissMessage: opts.dismissMessage,
    requireSha: opts.requireSha,
  });
  if (skippedHumanResolves.length > 0) result.skippedHumanResolves = skippedHumanResolves;
  if (skippedHumanMinimizes.length > 0) result.skippedHumanMinimizes = skippedHumanMinimizes;
  if (skippedHumanDismissals.length > 0) result.skippedHumanDismissals = skippedHumanDismissals;
  if (skippedNonHumanReplies.length > 0) result.skippedNonHumanReplies = skippedNonHumanReplies;
  if (opts.dismissMessage) {
    await Promise.all(
      result.repliedThreads.map((id) => {
        const thread = threadById.get(id);
        if (!thread) return Promise.resolve();
        const previousBody = threadTranscriptBody(thread);
        return markReplySeen(
          { owner: repo.owner, repo: repo.name, pr: prNumber },
          id,
          previousBody,
          threadTranscriptBody(thread, [opts.dismissMessage!]),
          opts.dismissMessage!,
        );
      }),
    );
  }
  return result;
}
