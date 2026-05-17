import type {
  AgentThread,
  Review,
  ResolveCommand,
  AgentCheck,
  ReviewThread,
} from "../../types.mts";
import { buildPrShepherdCommand } from "../../cli/runner.mts";
import { shouldMinimizeAuthor } from "../../comments/minimize-policy.mts";
import type { MinimizeCommentsPolicy } from "../../config/load.mts";

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

export function classifyReviewSummaries(
  summaries: { firstLook: Review[]; seen: Review[]; edited: Review[] },
  approvals: Review[],
  minimizeApprovals: boolean,
  minimizeComments: MinimizeCommentsPolicy | undefined = "all",
): {
  minimizeIds: string[];
  firstLookSummaries: Review[];
  editedSummaries: Review[];
  surfacedApprovals: Review[];
} {
  // First-look and seen summaries go into the minimize mutation; edited summaries do NOT —
  // they are already minimized server-side (body changed after minimize was applied).
  // First-look bodies are rendered so the agent sees them before the minimize happens.
  const minimizeIds = [...summaries.firstLook, ...summaries.seen]
    .filter((r) => shouldMinimizeAuthor(r.authorType, minimizeComments))
    .map((r) => r.id);
  if (minimizeApprovals) {
    for (const r of approvals) {
      if (shouldMinimizeAuthor(r.authorType, minimizeComments)) minimizeIds.push(r.id);
    }
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
): ResolveCommand {
  const argv = buildPrShepherdCommand(["resolve", String(prNumber)]).argv;

  const resolveThreadIds = dedupeIds(threads.map((t) => t.id));
  const threadIds = dedupeIds([...resolveThreadIds, ...resolutionOnlyThreads.map((t) => t.id)]);
  if (threadIds.length > 0) {
    argv.push("--resolve-thread-ids", threadIds.join(","));
  }
  if (allCommentIds.length > 0) {
    argv.push("--minimize-comment-ids", allCommentIds.join(","));
  }
  const commentIdSet = new Set(allCommentIds);
  const filteredReviewIds: string[] = [];
  const droppedDismissReviewIds: string[] = [];
  for (const review of reviews) {
    if (commentIdSet.has(review.id)) droppedDismissReviewIds.push(review.id);
    else filteredReviewIds.push(review.id);
  }
  const hasDismiss = filteredReviewIds.length > 0;
  if (hasDismiss) {
    argv.push("--dismiss-review-ids", filteredReviewIds.join(","));
    argv.push("--message", "$DISMISS_MESSAGE");
  }

  // hasMutations = we appended at least one of --resolve-thread-ids,
  // --minimize-comment-ids, or --dismiss-review-ids. Returned explicitly
  // (rather than derived from argv.length) so callers don't couple to the
  // base-argv shape.
  const hasMutations =
    threadIds.length > 0 || allCommentIds.length > 0 || filteredReviewIds.length > 0;
  // `requiresHeadSha` is only added when this resolve command includes a
  // mutation that can race with a moving HEAD: resolving actionable threads,
  // dismissing CHANGES_REQUESTED reviews, or addressing failing checks.
  const hasCodeMutations =
    hasMutations && (threads.length > 0 || checks.length > 0 || filteredReviewIds.length > 0);
  const requiresHeadSha = hasCodeMutations;
  return {
    argv,
    requiresHeadSha,
    requiresDismissMessage: hasDismiss,
    ...(droppedDismissReviewIds.length > 0 ? { droppedDismissReviewIds } : undefined),
    hasMutations,
  };
}
