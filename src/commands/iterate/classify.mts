/* eslint-disable max-lines */
import type {
  AgentThread,
  Review,
  ResolveCommand,
  AgentCheck,
  ReviewThread,
  ViewerAuthorization,
} from "../../types.mts";
import { buildPrShepherdCommand } from "../../cli/runner.mts";
import { shouldMinimizeAuthor } from "../../comments/minimize-policy.mts";
import {
  isConfiguredBotAuthor,
  isHumanAuthor,
  type NormalizedBotUsernames,
} from "../../comments/authors.mts";
import type { MinimizeCommentsPolicy, ResolveOtherHumanThreads } from "../../config/load.mts";
import { buildThreadMutationRouting } from "./thread-mutation-routing.mts";

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
    r.viewerCanMinimize === true &&
    shouldMinimizeAuthor(r.authorType, minimizeComments, r.author, botUsernames) &&
    !blockedReviewIds.has(r.id);
  // First-look summaries still need one tick to surface their body to the agent,
  // so their minimize IDs ride in the agent-facing apply command. Seen summaries
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
      if (
        r.viewerCanMinimize === true &&
        shouldMinimizeAuthor(r.authorType, minimizeComments, r.author, botUsernames)
      )
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
  prReference: string | number,
  botUsernames: NormalizedBotUsernames = new Set(),
  ruleAutoResolveThreadIds: string[] = [],
  viewerAuthorization?: ViewerAuthorization,
  authorizationThreads: ReviewThread[] = [],
  resolveOtherHumanThreads: ResolveOtherHumanThreads = "none",
): { resolveCommand: ResolveCommand; resolveOnlyCommand?: ResolveCommand } {
  const allThreads = [...threads, ...resolutionOnlyThreads];
  const routed = buildThreadMutationRouting(
    allThreads,
    botUsernames,
    ruleAutoResolveThreadIds,
    resolveOtherHumanThreads,
  );
  const canReply = new Set(
    authorizationThreads
      .filter((thread) => thread.viewerCanReply === true)
      .map((thread) => thread.id),
  );
  const canResolve = new Set(
    authorizationThreads
      .filter((thread) => thread.viewerCanResolve === true)
      .map((thread) => thread.id),
  );
  const pairedResolveIds = new Set(routed.pairedResolveThreadIds);
  const replyThreadIds = routed.replyThreadIds.filter(
    (id) => canReply.has(id) && (!pairedResolveIds.has(id) || canResolve.has(id)),
  );
  // Viewer-authored human resolves stay paired with an authorized reply. Marker-ended
  // viewer-authored retries and bot/non-human resolves need only resolve authorization.
  const pairedResolveThreadIds = routed.pairedResolveThreadIds.filter(
    (id) => canReply.has(id) && canResolve.has(id),
  );
  const standaloneResolveThreadIds = routed.standaloneResolveThreadIds.filter((id) =>
    canResolve.has(id),
  );
  const resolveThreadIds = dedupeIds([...pairedResolveThreadIds, ...standaloneResolveThreadIds]);
  // Bot/non-human CHANGES_REQUESTED reviews are auto-dismissed after the agent pushes a fix.
  // Human reviews are left for the reviewer to re-review or dismiss themselves.
  const dismissReviewIds = dedupeIds(
    viewerAuthorization?.viewerCanAdminister === true
      ? reviews
          .filter((r) => !isHumanAuthor(r) || isConfiguredBotAuthor(r, botUsernames))
          .map((r) => r.id)
      : [],
  );

  const hasReply = replyThreadIds.length > 0;
  const hasDismiss = dismissReviewIds.length > 0;
  // Mutations that require --message: replies (to human threads) and dismissals (of bot CR reviews).
  const hasMessageMutations = hasReply || hasDismiss;
  const hasResolveOrMinimize = resolveThreadIds.length > 0 || allCommentIds.length > 0;
  const hasStandaloneResolveOrMinimize =
    standaloneResolveThreadIds.length > 0 || allCommentIds.length > 0;

  if (hasMessageMutations && hasStandaloneResolveOrMinimize) {
    // Split: message-bearing mutations plus their paired viewer-authored resolves ride in
    // resolveArgv; standalone resolve/minimize mutations go in resolveOnlyArgv so they can
    // run without SHA or message.
    const resolveArgv = buildPrShepherdCommand(["apply", "review", String(prReference)]).argv;
    if (replyThreadIds.length > 0) {
      resolveArgv.push("--reply-thread-ids", replyThreadIds.join(","));
    }
    if (pairedResolveThreadIds.length > 0) {
      resolveArgv.push("--resolve-thread-ids", pairedResolveThreadIds.join(","));
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
      ...(pairedResolveThreadIds.length > 0
        ? { resolveThreadIds: pairedResolveThreadIds }
        : undefined),
      ...(hasDismiss ? { dismissReviewIds } : undefined),
      hasMutations: true,
    };

    const resolveOnlyArgv = buildPrShepherdCommand(["apply", "review", String(prReference)]).argv;
    if (standaloneResolveThreadIds.length > 0) {
      resolveOnlyArgv.push("--resolve-thread-ids", standaloneResolveThreadIds.join(","));
    }
    if (allCommentIds.length > 0) {
      resolveOnlyArgv.push("--minimize-comment-ids", allCommentIds.join(","));
    }
    const resolveOnlyCommand: ResolveCommand = {
      argv: resolveOnlyArgv,
      requiresHeadSha: false,
      requiresDismissMessage: false,
      ...(standaloneResolveThreadIds.length > 0
        ? { resolveThreadIds: standaloneResolveThreadIds }
        : undefined),
      hasMutations: true,
    };

    return { resolveCommand, resolveOnlyCommand };
  }

  // Single command: all mutations combined (or only one category present).
  const argv = buildPrShepherdCommand(["apply", "review", String(prReference)]).argv;
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
