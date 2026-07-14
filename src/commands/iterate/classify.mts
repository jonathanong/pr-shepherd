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
  selfMinimizeIds: string[];
  firstLookSummaries: Review[];
  editedSummaries: Review[];
  surfacedApprovals: Review[];
} {
  const blockedReviewIds = new Set(
    unresolvedThreads.flatMap((t) => (t.reviewId !== undefined ? [t.reviewId] : [])),
  );
  const eligible = (r: Review): boolean =>
    shouldMinimizeAuthor(r.authorType, minimizeComments, r.author, botUsernames) &&
    !blockedReviewIds.has(r.id);
  // First-look summaries still need one tick to surface their body to the agent,
  // so their minimize IDs ride in the agent-facing resolve command. Seen summaries
  // (already surfaced in a prior tick) have no new content to show — the CLI
  // self-minimizes them in-process (selfMinimizeIds) instead of routing a
  // cosmetic-only mutation through fix_code (issue #313). Edited summaries are
  // excluded entirely: they are already minimized server-side (body changed after
  // minimize was applied).
  const minimizeIds = summaries.firstLook.filter(eligible).map((r) => r.id);
  const selfMinimizeIds = summaries.seen.filter(eligible).map((r) => r.id);
  // Rule-matched summaries are already suppressed from agent output; bypass normal
  // policy gates. Keep the two sets disjoint.
  for (const id of ruleAutoResolveIds) {
    if (!minimizeIds.includes(id) && !selfMinimizeIds.includes(id)) minimizeIds.push(id);
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
      selfMinimizeIds,
      firstLookSummaries: summaries.firstLook,
      editedSummaries: summaries.edited,
      surfacedApprovals,
    };
  }
  return {
    minimizeIds,
    selfMinimizeIds,
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
    ...allThreads
      .filter((t) => !isHumanAuthor(t) || isConfiguredBotAuthor(t, botUsernames))
      .map((t) => t.id),
    ...ruleAutoResolveThreadIds,
  ]);
  // Bot/non-human CHANGES_REQUESTED reviews are auto-dismissed after the agent pushes a fix.
  // Human reviews are left for the reviewer to re-review or dismiss themselves.
  const dismissReviewIds = dedupeIds(
    reviews
      .filter((r) => !isHumanAuthor(r) || isConfiguredBotAuthor(r, botUsernames))
      .map((r) => r.id),
  );

  const hasReply = replyThreadIds.length > 0;
  const hasDismiss = dismissReviewIds.length > 0;
  // Mutations that require --message: replies (to human threads) and dismissals (of bot CR reviews).
  const hasMessageMutations = hasReply || hasDismiss;
  const hasResolveOrMinimize = resolveThreadIds.length > 0 || allCommentIds.length > 0;

  if (hasMessageMutations && hasResolveOrMinimize) {
    // Split: message-bearing mutations (replies + dismissals) ride in resolveArgv;
    // resolve/minimize mutations go in resolveOnlyArgv so they can run without SHA or message.
    const resolveArgv = buildPrShepherdCommand(["resolve", String(prNumber)]).argv;
    if (replyThreadIds.length > 0) {
      resolveArgv.push("--reply-thread-ids", replyThreadIds.join(","));
    }
    resolveArgv.push("--message", "$DISMISS_MESSAGE");
    if (hasDismiss) {
      resolveArgv.push("--dismiss-review-ids", dismissReviewIds.join(","));
    }
    // SHA is required when actionable thread fixes or failing checks are being addressed,
    // or when bot CR reviews are being dismissed (post-push SHA gate).
    const requiresHeadSha = threads.length > 0 || checks.length > 0 || hasDismiss;
    const resolveCommand: ResolveCommand = {
      argv: resolveArgv,
      requiresHeadSha,
      requiresDismissMessage: true,
      ...(replyThreadIds.length > 0 ? { replyThreadIds } : undefined),
      ...(hasDismiss ? { dismissReviewIds } : undefined),
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

  // Single command: all mutations combined (or only one category present).
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
  if (hasDismiss) {
    // Add --message when dismissing without a reply (replies already added it above).
    if (!hasReply) argv.push("--message", "$DISMISS_MESSAGE");
    argv.push("--dismiss-review-ids", dismissReviewIds.join(","));
  }
  const hasMutations = hasMessageMutations || hasResolveOrMinimize;
  // SHA is required when replying after actionable fixes/checks, or whenever dismissing
  // (dismissal is a post-push operation that must race-check against a moving HEAD).
  const requiresHeadSha = hasDismiss || (hasReply && (threads.length > 0 || checks.length > 0));
  const resolveCommand: ResolveCommand = {
    argv,
    requiresHeadSha,
    requiresDismissMessage: hasMessageMutations,
    ...(replyThreadIds.length > 0 ? { replyThreadIds } : undefined),
    ...(resolveThreadIds.length > 0 ? { resolveThreadIds } : undefined),
    ...(hasDismiss ? { dismissReviewIds } : undefined),
    hasMutations,
  };

  return { resolveCommand };
}
