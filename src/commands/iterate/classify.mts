import type { AgentThread, Review, ResolveCommand, AgentCheck } from "../../types.mts";

export function classifyReviewSummaries(
  summaries: { firstLook: Review[]; seen: Review[] },
  approvals: Review[],
  minimizeApprovals: boolean,
): { minimizeIds: string[]; firstLookSummaries: Review[]; surfacedApprovals: Review[] } {
  // Both first-look and seen summaries go into the minimize mutation; first-look bodies are
  // rendered in the output so the agent sees them before the minimize happens.
  const minimizeIds = [...summaries.firstLook, ...summaries.seen].map((r) => r.id);
  if (minimizeApprovals) {
    for (const r of approvals) minimizeIds.push(r.id);
    return { minimizeIds, firstLookSummaries: summaries.firstLook, surfacedApprovals: [] };
  }
  return { minimizeIds, firstLookSummaries: summaries.firstLook, surfacedApprovals: approvals };
}

export function buildResolveCommand(
  threads: AgentThread[],
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

  // A push is required when threads, CI failures, or changes-requested reviews are present — the
  // CLI knows those imply code edits. Comments are surfaced for the agent to evaluate; the CLI
  // cannot know whether a given comment will require a push, so comments are excluded here.
  const requiresHeadSha = threads.length > 0 || checks.length > 0 || reviews.length > 0;

  // hasMutations = we appended at least one of --resolve-thread-ids,
  // --minimize-comment-ids, or --dismiss-review-ids. Returned explicitly
  // (rather than derived from argv.length) so callers don't couple to the
  // base-argv shape.
  const hasMutations = threads.length > 0 || allCommentIds.length > 0 || reviews.length > 0;

  return { argv, requiresHeadSha, requiresDismissMessage: hasDismiss, hasMutations };
}
