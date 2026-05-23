import type {
  AgentThread,
  Review,
  ResolveCommand,
  AgentCheck,
  ReviewThread,
} from "../../types.mts";
import { buildPrShepherdCommand } from "../../cli/runner.mts";
import { shouldMinimizeAuthor } from "../../comments/minimize-policy.mts";
import { isHumanAuthor } from "../../comments/authors.mts";
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
    .filter((r) => shouldMinimizeAuthor(r.authorType, minimizeComments, r.author))
    .map((r) => r.id);
  if (minimizeApprovals) {
    const surfacedApprovals: Review[] = [];
    for (const r of approvals) {
      if (shouldMinimizeAuthor(r.authorType, minimizeComments, r.author)) minimizeIds.push(r.id);
      else surfacedApprovals.push(r);
    }
    return {
      minimizeIds,
      firstLookSummaries: summaries.firstLook,
      editedSummaries: summaries.edited,
      surfacedApprovals,
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
  _reviews: Review[],
  checks: AgentCheck[],
  prNumber: number,
): ResolveCommand {
  const argv = buildPrShepherdCommand(["resolve", String(prNumber)]).argv;

  const allThreads = [...threads, ...resolutionOnlyThreads];
  const replyThreadIds = dedupeIds(allThreads.filter(isHumanAuthor).map((t) => t.id));
  const resolveThreadIds = dedupeIds(allThreads.filter((t) => !isHumanAuthor(t)).map((t) => t.id));
  if (replyThreadIds.length > 0) {
    argv.push("--reply-thread-ids", replyThreadIds.join(","));
    argv.push("--message", "$DISMISS_MESSAGE");
  }
  if (resolveThreadIds.length > 0) {
    argv.push("--resolve-thread-ids", resolveThreadIds.join(","));
  }
  if (allCommentIds.length > 0) {
    argv.push("--minimize-comment-ids", allCommentIds.join(","));
  }
  // hasMutations = we appended at least one reply, resolve, or minimize mutation. Returned explicitly
  // (rather than derived from argv.length) so callers don't couple to the
  // base-argv shape.
  const hasMutations =
    replyThreadIds.length > 0 || resolveThreadIds.length > 0 || allCommentIds.length > 0;
  // `requiresHeadSha` is only added when this resolve command includes a
  // mutation that can race with a moving HEAD: replying after actionable
  // thread fixes or addressing failing checks.
  const hasCodeMutations = hasMutations && (threads.length > 0 || checks.length > 0);
  const requiresHeadSha = hasCodeMutations;
  return {
    argv,
    requiresHeadSha,
    requiresDismissMessage: replyThreadIds.length > 0,
    ...(replyThreadIds.length > 0 ? { replyThreadIds } : undefined),
    ...(resolveThreadIds.length > 0 ? { resolveThreadIds } : undefined),
    hasMutations,
  };
}
