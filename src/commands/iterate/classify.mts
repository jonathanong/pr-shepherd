import type {
  AgentThread,
  Review,
  ResolveCommand,
  AgentCheck,
  ReviewThread,
} from "../../types.mts";
import { buildPrShepherdCommand, type CliRunner } from "../../cli/runner.mts";

export function classifyReviewSummaries(
  summaries: { firstLook: Review[]; seen: Review[]; edited: Review[] },
  approvals: Review[],
  minimizeApprovals: boolean,
): {
  minimizeIds: string[];
  firstLookSummaries: Review[];
  editedSummaries: Review[];
  surfacedApprovals: Review[];
} {
  // First-look and seen summaries go into the minimize mutation; edited summaries do NOT —
  // they are already minimized server-side (body changed after minimize was applied).
  // First-look bodies are rendered so the agent sees them before the minimize happens.
  const minimizeIds = [...summaries.firstLook, ...summaries.seen].map((r) => r.id);
  if (minimizeApprovals) {
    for (const r of approvals) minimizeIds.push(r.id);
    return {
      minimizeIds,
      firstLookSummaries: summaries.firstLook,
      editedSummaries: summaries.edited,
      surfacedApprovals: [],
    };
  }
  return {
    minimizeIds,
    firstLookSummaries: summaries.firstLook,
    editedSummaries: summaries.edited,
    surfacedApprovals: approvals,
  };
}

export function buildResolveCommand(
  threads: AgentThread[],
  resolutionOnlyThreads: ReviewThread[],
  allCommentIds: string[],
  reviews: Review[],
  checks: AgentCheck[],
  prNumber: number,
  runner?: CliRunner,
): ResolveCommand {
  const argv = buildPrShepherdCommand(["resolve", String(prNumber)], { runner }).argv;

  const threadIds = [...threads.map((t) => t.id), ...resolutionOnlyThreads.map((t) => t.id)];
  if (threadIds.length > 0) {
    argv.push("--resolve-thread-ids", threadIds.join(","));
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
  const hasMutations = threadIds.length > 0 || allCommentIds.length > 0 || reviews.length > 0;

  return { argv, requiresHeadSha, requiresDismissMessage: hasDismiss, hasMutations };
}
