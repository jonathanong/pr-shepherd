import { getRepoInfo, getCurrentPrNumber } from "../github/client.mts";
import { applyResolveOptions } from "../comments/resolve.mts";
import { fetchPrBatch } from "../github/batch.mts";
import { loadConfig } from "../config/load.mts";
import {
  isConfiguredBotAuthor,
  isHumanAuthor,
  isViewerAuthoredHuman,
  normalizeBotUsernames,
} from "../comments/authors.mts";
import { markReplySeen } from "../state/seen-comments.mts";
import { threadTranscriptBody } from "../threads/transcript.mts";
import { addPrShepherdMarker, threadEndedByShepherd } from "../comments/marker.mts";
import { EXIT, ShepherdError } from "../exit-codes.mts";
import type { ResolveOptions } from "../types.mts";
import type { ResolveCommandOptions } from "./resolve.mts";

/** @deprecated Hidden implementation for `resolve`; use `apply review`. */
export async function runResolveMutate(
  opts: ResolveCommandOptions & ResolveOptions,
): Promise<import("../comments/resolve.mts").ResolveResult> {
  const repo = await getRepoInfo();
  const prNumber = opts.prNumber ?? (await getCurrentPrNumber());
  if (prNumber === null) {
    throw new ShepherdError(
      "No open PR found for current branch. Pass a PR number explicitly.",
      EXIT.UNAVAILABLE,
    );
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
  const replyAuthorizedIds = new Set(
    data.reviewThreads
      .filter((thread) => thread.viewerCanReply === true)
      .map((thread) => thread.id),
  );
  const resolveAuthorizedIds = new Set(
    data.reviewThreads
      .filter((thread) => thread.viewerCanResolve === true)
      .map((thread) => thread.id),
  );
  const minimizeAuthorizedIds = new Set([
    ...data.comments
      .filter((comment) => comment.viewerCanMinimize === true)
      .map((comment) => comment.id),
    ...data.reviewSummaries
      .filter((review) => review.viewerCanMinimize === true)
      .map((review) => review.id),
    ...data.approvedReviews
      .filter((review) => review.viewerCanMinimize === true)
      .map((review) => review.id),
  ]);
  const requestedReplyIds = new Set(
    (opts.replyThreadIds ?? []).filter((id) => replyAuthorizedIds.has(id)),
  );
  const allowedViewerHumanResolveIds = new Set(
    data.reviewThreads
      .filter(
        (thread) =>
          isViewerAuthoredHuman(thread, botUsernames) &&
          (requestedReplyIds.has(thread.id) || threadEndedByShepherd(thread)),
      )
      .map((thread) => thread.id),
  );
  const resolveThreadIds = (opts.resolveThreadIds ?? []).filter(
    (id) =>
      (!humanThreadIds.has(id) || allowedViewerHumanResolveIds.has(id)) &&
      resolveAuthorizedIds.has(id),
  );
  const skippedHumanResolves = (opts.resolveThreadIds ?? []).filter(
    (id) => humanThreadIds.has(id) && !allowedViewerHumanResolveIds.has(id),
  );
  const skippedUnauthorizedResolves = (opts.resolveThreadIds ?? []).filter(
    (id) =>
      (!humanThreadIds.has(id) || allowedViewerHumanResolveIds.has(id)) &&
      !resolveAuthorizedIds.has(id),
  );
  const replyThreadIds = opts.replyThreadIds?.filter(
    (id) => humanThreadIds.has(id) && replyAuthorizedIds.has(id),
  );
  const skippedNonHumanReplies = (opts.replyThreadIds ?? []).filter(
    (id) => !humanThreadIds.has(id),
  );
  const skippedUnauthorizedReplies = (opts.replyThreadIds ?? []).filter(
    (id) => humanThreadIds.has(id) && !replyAuthorizedIds.has(id),
  );
  const minimizeCommentIds = (opts.minimizeCommentIds ?? []).filter(
    (id) => !humanCommentIds.has(id) && !humanReviewIds.has(id) && minimizeAuthorizedIds.has(id),
  );
  const skippedHumanMinimizes = (opts.minimizeCommentIds ?? []).filter(
    (id) => humanCommentIds.has(id) || humanReviewIds.has(id),
  );
  const skippedUnauthorizedMinimizes = (opts.minimizeCommentIds ?? []).filter(
    (id) => !humanCommentIds.has(id) && !humanReviewIds.has(id) && !minimizeAuthorizedIds.has(id),
  );
  const dismissReviewIds = (opts.dismissReviewIds ?? []).filter(
    (id) =>
      !humanReviewIds.has(id) &&
      data.changesRequestedReviews.some((review) => review.id === id) &&
      data.viewerAuthorization?.viewerCanAdminister === true,
  );
  const skippedHumanDismissals = (opts.dismissReviewIds ?? []).filter((id) =>
    humanReviewIds.has(id),
  );
  const skippedUnauthorizedDismissals = (opts.dismissReviewIds ?? []).filter(
    (id) => !humanReviewIds.has(id) && !dismissReviewIds.includes(id),
  );
  const hasAuthorizedMutation =
    resolveThreadIds.length > 0 ||
    (replyThreadIds?.length ?? 0) > 0 ||
    minimizeCommentIds.length > 0 ||
    dismissReviewIds.length > 0;

  const result = await applyResolveOptions(prNumber, repo, {
    resolveThreadIds,
    replyThreadIds,
    minimizeCommentIds,
    dismissReviewIds,
    dismissMessage: opts.dismissMessage,
    requireSha: hasAuthorizedMutation ? opts.requireSha : undefined,
  });
  if (skippedHumanResolves.length > 0) result.skippedHumanResolves = skippedHumanResolves;
  if (skippedHumanMinimizes.length > 0) result.skippedHumanMinimizes = skippedHumanMinimizes;
  if (skippedHumanDismissals.length > 0) result.skippedHumanDismissals = skippedHumanDismissals;
  if (skippedNonHumanReplies.length > 0) result.skippedNonHumanReplies = skippedNonHumanReplies;
  if (skippedUnauthorizedReplies.length > 0)
    result.skippedUnauthorizedReplies = skippedUnauthorizedReplies;
  if (skippedUnauthorizedResolves.length > 0)
    result.skippedUnauthorizedResolves = skippedUnauthorizedResolves;
  if (skippedUnauthorizedMinimizes.length > 0)
    result.skippedUnauthorizedMinimizes = skippedUnauthorizedMinimizes;
  if (skippedUnauthorizedDismissals.length > 0)
    result.skippedUnauthorizedDismissals = skippedUnauthorizedDismissals;
  if (opts.dismissMessage) {
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
