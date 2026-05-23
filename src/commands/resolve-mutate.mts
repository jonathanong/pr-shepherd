import { getRepoInfo, getCurrentPrNumber } from "../github/client.mts";
import { applyResolveOptions } from "../comments/resolve.mts";
import { fetchPrBatch } from "../github/batch.mts";
import { isHumanAuthor } from "../comments/authors.mts";
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
  const { data } = await fetchPrBatch(prNumber, repo);
  const humanThreadIds = new Set(data.reviewThreads.filter(isHumanAuthor).map((t) => t.id));
  const humanCommentIds = new Set(data.comments.filter(isHumanAuthor).map((c) => c.id));
  const humanReviewIds = new Set(
    [...data.reviewSummaries, ...data.approvedReviews, ...data.changesRequestedReviews]
      .filter(isHumanAuthor)
      .map((r) => r.id),
  );
  const resolveThreadIds = (opts.resolveThreadIds ?? []).filter((id) => !humanThreadIds.has(id));
  const skippedHumanResolves = (opts.resolveThreadIds ?? []).filter((id) => humanThreadIds.has(id));
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
    replyThreadIds: opts.replyThreadIds,
    minimizeCommentIds,
    dismissReviewIds,
    dismissMessage: opts.dismissMessage,
    requireSha: opts.requireSha,
  });
  if (skippedHumanResolves.length > 0) result.skippedHumanResolves = skippedHumanResolves;
  if (skippedHumanMinimizes.length > 0) result.skippedHumanMinimizes = skippedHumanMinimizes;
  if (skippedHumanDismissals.length > 0) result.skippedHumanDismissals = skippedHumanDismissals;
  return result;
}
