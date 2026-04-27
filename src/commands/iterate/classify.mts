import type { AgentThread, AgentComment, Review, ResolveCommand, AgentCheck } from "../../types.mts";

export function classifyReviewSummaries(
  summaries: Review[],
  approvals: Review[],
  minimizeApprovals: boolean,
): { minimizeIds: string[]; surfacedApprovals: Review[] } {
  const minimizeIds = summaries.map((r) => r.id);
  if (minimizeApprovals) {
    for (const r of approvals) minimizeIds.push(r.id);
    return { minimizeIds, surfacedApprovals: [] };
  }
  return { minimizeIds, surfacedApprovals: approvals };
}

export function buildResolveCommand(
  threads: AgentThread[],
  actionableComments: AgentComment[],
  allCommentIds: string[],
  reviews: Review[],
  checks: AgentCheck[],
  prNumber: number,
): ResolveCommand {
  const argv = ["npx", "pr-shepherd", "resolve", String(prNumber)];

  if (threads.length > 0) {
    argv.push("--resolve-thread-ids", threads.map((t) => t.id).join(","));
  }
  if (allCommentIds.length > 0) {
    argv.push("--minimize-comment-ids", allCommentIds.join(","));
  }
  const hasDismiss = reviews.length > 0;
  if (hasDismiss) {
    argv.push("--dismiss-review-ids", reviews.map((r) => r.id).join(","));
    argv.push("--message", "$DISMISS_MESSAGE");
  }

  // A push happens when there is code to change — threads, actionable comments, CI checks, or reviews.
  const requiresHeadSha =
    threads.length > 0 || actionableComments.length > 0 || checks.length > 0 || reviews.length > 0;

  // hasMutations = we appended at least one of --resolve-thread-ids,
  // --minimize-comment-ids, or --dismiss-review-ids. Returned explicitly
  // (rather than derived from argv.length) so callers don't couple to the
  // base-argv shape.
  const hasMutations = threads.length > 0 || allCommentIds.length > 0 || reviews.length > 0;

  return { argv, requiresHeadSha, requiresDismissMessage: hasDismiss, hasMutations };
}
