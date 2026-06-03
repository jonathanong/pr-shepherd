import type {
  AgentThread,
  Review,
  ResolveCommand,
  AgentCheck,
  ReviewThread,
} from "../../types.mts";
import { buildPrShepherdCommand } from "../../cli/runner.mts";
import { shouldMinimizeAuthor } from "../../comments/minimize-policy.mts";
import {
  isConfiguredBotAuthor,
  isHumanAuthor,
  type NormalizedBotUsernames,
} from "../../comments/authors.mts";
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
  botUsernames: NormalizedBotUsernames = new Set(),
  unresolvedThreads: ReviewThread[] = [],
  ruleAutoResolveIds: string[] = [],
): {
  minimizeIds: string[];
  firstLookSummaries: Review[];
  editedSummaries: Review[];
  surfacedApprovals: Review[];
} {
  const blockedReviewIds = new Set(
    unresolvedThreads.flatMap((t) => (t.reviewId !== undefined ? [t.reviewId] : [])),
  );
  // First-look and seen summaries go into the minimize mutation; edited summaries do NOT —
  // they are already minimized server-side (body changed after minimize was applied).
  // First-look bodies are rendered so the agent sees them before the minimize happens.
  const minimizeIds = [...summaries.firstLook, ...summaries.seen]
    .filter((r) => shouldMinimizeAuthor(r.authorType, minimizeComments, r.author, botUsernames))
    .filter((r) => !blockedReviewIds.has(r.id))
    .map((r) => r.id);
  // Rule-matched summaries are already suppressed from agent output; bypass normal policy gates.
  for (const id of ruleAutoResolveIds) {
    if (!minimizeIds.includes(id)) minimizeIds.push(id);
  }
  if (minimizeApprovals) {
    const surfacedApprovals: Review[] = [];
    for (const r of approvals) {
      if (shouldMinimizeAuthor(r.authorType, minimizeComments, r.author, botUsernames))
        minimizeIds.push(r.id);
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
  botUsernames: NormalizedBotUsernames = new Set(),
  ruleAutoResolveThreadIds: string[] = [],
): { resolveCommand: ResolveCommand; resolveOnlyCommand?: ResolveCommand } {
  const allThreads = [...threads, ...resolutionOnlyThreads];
  const replyThreadIds = dedupeIds(
    allThreads
      .filter((t) => isHumanAuthor(t) && !isConfiguredBotAuthor(t, botUsernames))
      .map((t) => t.id),
  );
  // Rule-matched threads bypass the author check (human-author guard still applies in resolve-mutate).
  const resolveThreadIds = dedupeIds([
    ...allThreads.filter((t) => !isHumanAuthor(t) || isConfiguredBotAuthor(t, botUsernames)).map((t) => t.id),
    ...ruleAutoResolveThreadIds,
  ]);

  const hasReply = replyThreadIds.length > 0;
  const hasResolveOrMinimize = resolveThreadIds.length > 0 || allCommentIds.length > 0;

  if (hasReply && hasResolveOrMinimize) {
    // Split: reply command needs SHA; resolve/minimize command does not.
    const resolveArgv = buildPrShepherdCommand(["resolve", String(prNumber)]).argv;
    resolveArgv.push("--reply-thread-ids", replyThreadIds.join(","));
    resolveArgv.push("--message", "$DISMISS_MESSAGE");
    // `requiresHeadSha` is only true when actionable thread fixes or failing
    // checks are being addressed — mutations that can race with a moving HEAD.
    const requiresHeadSha = threads.length > 0 || checks.length > 0;
    const resolveCommand: ResolveCommand = {
      argv: resolveArgv,
      requiresHeadSha,
      requiresDismissMessage: true,
      replyThreadIds,
      hasMutations: true,
    };

    const resolveOnlyArgv = buildPrShepherdCommand(["resolve", String(prNumber)]).argv;
    if (resolveThreadIds.length > 0) {
      resolveOnlyArgv.push("--resolve-thread-ids", resolveThreadIds.join(","));
    }
    if (allCommentIds.length > 0) {
      resolveOnlyArgv.push("--minimize-comment-ids", allCommentIds.join(","));
    }
    const resolveOnlyCommand: ResolveCommand = {
      argv: resolveOnlyArgv,
      requiresHeadSha: false,
      requiresDismissMessage: false,
      ...(resolveThreadIds.length > 0 ? { resolveThreadIds } : undefined),
      hasMutations: true,
    };

    return { resolveCommand, resolveOnlyCommand };
  }

  // Single command: either reply-only or resolve/minimize-only (no split needed).
  const argv = buildPrShepherdCommand(["resolve", String(prNumber)]).argv;
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
  const hasMutations = hasReply || hasResolveOrMinimize;
  // SHA is only required when replying after actionable fixes or failing checks.
  // Resolve/minimize-only mutations never need SHA.
  const requiresHeadSha = hasReply && (threads.length > 0 || checks.length > 0);
  const resolveCommand: ResolveCommand = {
    argv,
    requiresHeadSha,
    requiresDismissMessage: replyThreadIds.length > 0,
    ...(replyThreadIds.length > 0 ? { replyThreadIds } : undefined),
    ...(resolveThreadIds.length > 0 ? { resolveThreadIds } : undefined),
    hasMutations,
  };

  return { resolveCommand };
}
