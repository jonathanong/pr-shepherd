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
  findSupersededApprovalIds,
  reviewOrderingEntriesFromReviews,
} from "../../comments/superseded-approvals.mts";
import {
  isConfiguredBotAuthor,
  isHumanAuthor,
  type NormalizedBotUsernames,
} from "../../comments/authors.mts";
import type { MinimizeCommentsPolicy, ResolveOtherHumanThreads } from "../../config/load.mts";
import { buildThreadMutationRouting } from "./thread-mutation-routing.mts";
import { canGenerateGithubMutation } from "../../github/mutation-policy.mts";
import { durableStateRequested } from "../../state/durable-state.mts";

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

export interface ClassifyReviewSummaryOptions {
  minimizeSupersededApprovals?: boolean;
  supersededApprovals?: Review[];
  changesRequestedReviews?: Review[];
  latestReviews?: Array<{ login: string; state: string }>;
}

export function classifyReviewSummaries(
  summaries: { firstLook: Review[]; seen: Review[]; edited: Review[] },
  approvals: Review[],
  minimizeApprovals: boolean,
  minimizeComments: MinimizeCommentsPolicy | undefined = "all",
  botUsernames: NormalizedBotUsernames = new Set(),
  unresolvedThreads: ReadonlyArray<Pick<ReviewThread, "reviewId">> = [],
  ruleAutoResolveIds: string[] = [],
  options: ClassifyReviewSummaryOptions = {},
): {
  minimizeIds: string[];
  firstLookSummaries: Review[];
  editedSummaries: Review[];
  surfacedApprovals: Review[];
} {
  const blockedReviewIds = new Set(
    unresolvedThreads.flatMap((t) => (t.reviewId !== undefined ? [t.reviewId] : [])),
  );
  const eligible = (r: Review): boolean =>
    canGenerateGithubMutation(r.viewerCanMinimize, "minimize") &&
    shouldMinimizeAuthor(r.authorType, minimizeComments, r.author, botUsernames) &&
    !blockedReviewIds.has(r.id);
  // Both first-look and already-seen summaries stay in the agent-facing review
  // command once all of their inline threads are resolved — never hidden
  // automatically in-process. Edited summaries are excluded: they are already
  // minimized server-side (body changed after minimize was applied).
  const minimizeIds = dedupeIds(
    [...summaries.firstLook, ...summaries.seen].filter(eligible).map((r) => r.id),
  );
  // Rule-matched summaries are already suppressed from agent output; bypass normal
  // policy gates, while still waiting for any unresolved inline threads.
  for (const id of ruleAutoResolveIds) {
    if (!blockedReviewIds.has(id) && !minimizeIds.includes(id)) minimizeIds.push(id);
  }
  const minimizeSupersededApprovals = options.minimizeSupersededApprovals ?? true;
  const candidateApprovalsById = new Map<string, Review>();
  for (const r of options.supersededApprovals ?? []) candidateApprovalsById.set(r.id, r);
  for (const r of approvals) {
    if (!candidateApprovalsById.has(r.id)) candidateApprovalsById.set(r.id, r);
  }
  const candidateApprovals = [...candidateApprovalsById.values()];
  if (minimizeApprovals || minimizeSupersededApprovals) {
    const precomputed = new Set((options.supersededApprovals ?? []).map((r) => r.id));
    const supersededIds = minimizeApprovals
      ? new Set(candidateApprovals.map((r) => r.id))
      : findSupersededApprovalIds({
          reviews: reviewOrderingEntriesFromReviews({
            approvedReviews: candidateApprovals,
            changesRequestedReviews: options.changesRequestedReviews ?? [],
            reviewSummaries: [...summaries.firstLook, ...summaries.seen, ...summaries.edited],
          }),
          latestReviews: options.latestReviews,
          precomputedSupersededIds: precomputed,
        });
    const minimizedApprovalIds = new Set<string>();
    for (const r of candidateApprovals) {
      if (supersededIds.has(r.id) && eligible(r)) {
        if (!minimizeIds.includes(r.id)) minimizeIds.push(r.id);
        minimizedApprovalIds.add(r.id);
      }
    }
    const surfacedApprovals = approvals.filter((r) => !minimizedApprovalIds.has(r.id));
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

/**
 * A durable-state (cloud) session can lose its uncertain-reply records
 * between ticks. Its generated reply command opts in to adopting a reply GitHub already shows,
 * so rerunning the same printed command cannot double-post. Direct apply requests never do.
 */
function pushAdoptExistingReplies(argv: string[], hasReply: boolean): void {
  if (hasReply && durableStateRequested()) argv.push("--adopt-existing-replies");
}

export interface BuildResolveReviewOptions {
  reviewMinimizeIds?: string[];
  blockedReviewIds?: ReadonlySet<string>;
  minimizeComments?: MinimizeCommentsPolicy;
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
  reviewOptions: BuildResolveReviewOptions = {},
): {
  resolveCommand: ResolveCommand;
  resolveOnlyCommand?: ResolveCommand;
  dismissReviewsCommand?: ResolveCommand;
} {
  const allThreads = [...threads, ...resolutionOnlyThreads];
  const routed = buildThreadMutationRouting(
    allThreads,
    botUsernames,
    ruleAutoResolveThreadIds,
    resolveOtherHumanThreads,
  );
  const canReply = new Set(
    authorizationThreads
      .filter((thread) => canGenerateGithubMutation(thread.viewerCanReply, "reply"))
      .map((thread) => thread.id),
  );
  const canResolve = new Set(
    authorizationThreads
      .filter(
        (thread) =>
          thread.isResolved === false &&
          canGenerateGithubMutation(thread.viewerCanResolve, "resolve"),
      )
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
  // Bot/non-human CHANGES_REQUESTED reviews are dismissed and minimized in a separate command
  // only once all of their inline threads are resolved. Human reviews are left for the reviewer.
  const blockedReviewIds = new Set<string>(reviewOptions.blockedReviewIds);
  for (const thread of allThreads) {
    if (thread.reviewId !== undefined) blockedReviewIds.add(thread.reviewId);
  }
  const dismissibleReviews = canGenerateGithubMutation(
    viewerAuthorization?.viewerCanAdminister,
    "dismiss",
  )
    ? reviews.filter(
        (r) =>
          (!isHumanAuthor(r) || isConfiguredBotAuthor(r, botUsernames)) &&
          !blockedReviewIds.has(r.id),
      )
    : [];
  const dismissReviewIds = dedupeIds(dismissibleReviews.map((r) => r.id));
  const minimizePolicy = reviewOptions.minimizeComments ?? "all";
  const dismissMinimizeIds = dismissibleReviews
    .filter(
      (r) =>
        r.isMinimized !== true &&
        canGenerateGithubMutation(r.viewerCanMinimize, "minimize") &&
        shouldMinimizeAuthor(r.authorType, minimizePolicy, r.author, botUsernames),
    )
    .map((r) => r.id);
  const reviewMinimizeIds = dedupeIds([
    ...dismissMinimizeIds,
    ...(reviewOptions.reviewMinimizeIds ?? []),
  ]);
  const hasDismiss = dismissReviewIds.length > 0;
  const hasReviewMinimize = reviewMinimizeIds.length > 0;
  let dismissReviewsCommand: ResolveCommand | undefined;
  if (hasDismiss || hasReviewMinimize) {
    const reviewArgv = buildPrShepherdCommand(["apply", "review", String(prReference)]).argv;
    if (hasReviewMinimize) {
      reviewArgv.push("--minimize-comment-ids", reviewMinimizeIds.join(","));
    }
    if (hasDismiss) {
      reviewArgv.push("--dismiss-review-ids", dismissReviewIds.join(","));
      reviewArgv.push("--message", "$CHANGE_MESSAGE");
    }
    dismissReviewsCommand = {
      argv: reviewArgv,
      requiresHeadSha: hasDismiss,
      requiresDismissMessage: hasDismiss,
      ...(hasDismiss ? { dismissReviewIds } : undefined),
      hasMutations: true,
    };
  }

  const hasReply = replyThreadIds.length > 0;
  const hasResolveOrMinimize = resolveThreadIds.length > 0 || allCommentIds.length > 0;
  const hasStandaloneResolveOrMinimize =
    standaloneResolveThreadIds.length > 0 || allCommentIds.length > 0;

  if (hasReply && hasStandaloneResolveOrMinimize) {
    // Split: reply mutations plus their paired viewer-authored resolves ride in
    // resolveArgv; standalone resolve/PR-comment minimize mutations go in resolveOnlyArgv so
    // they can run without SHA or message.
    const resolveArgv = buildPrShepherdCommand(["apply", "review", String(prReference)]).argv;
    resolveArgv.push("--reply-thread-ids", replyThreadIds.join(","));
    if (pairedResolveThreadIds.length > 0) {
      resolveArgv.push("--resolve-thread-ids", pairedResolveThreadIds.join(","));
    }
    resolveArgv.push("--message", "$CHANGE_MESSAGE");
    pushAdoptExistingReplies(resolveArgv, true);
    const requiresHeadSha = threads.length > 0 || checks.length > 0;
    const resolveCommand: ResolveCommand = {
      argv: resolveArgv,
      requiresHeadSha,
      requiresDismissMessage: true,
      replyThreadIds,
      ...(pairedResolveThreadIds.length > 0
        ? { resolveThreadIds: pairedResolveThreadIds }
        : undefined),
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

    return {
      resolveCommand,
      resolveOnlyCommand,
      ...(dismissReviewsCommand ? { dismissReviewsCommand } : undefined),
    };
  }

  // Single command for inline threads and PR comments (or empty when only review mutations exist).
  const argv = buildPrShepherdCommand(["apply", "review", String(prReference)]).argv;
  if (hasReply) {
    argv.push("--reply-thread-ids", replyThreadIds.join(","));
    argv.push("--message", "$CHANGE_MESSAGE");
    pushAdoptExistingReplies(argv, true);
  }
  if (resolveThreadIds.length > 0) {
    argv.push("--resolve-thread-ids", resolveThreadIds.join(","));
  }
  if (allCommentIds.length > 0) {
    argv.push("--minimize-comment-ids", allCommentIds.join(","));
  }
  const hasMutations = hasReply || hasResolveOrMinimize;
  const requiresHeadSha = hasReply && (threads.length > 0 || checks.length > 0);
  const resolveCommand: ResolveCommand = {
    argv,
    requiresHeadSha,
    requiresDismissMessage: hasReply,
    ...(hasReply ? { replyThreadIds } : undefined),
    ...(resolveThreadIds.length > 0 ? { resolveThreadIds } : undefined),
    hasMutations,
  };

  return {
    resolveCommand,
    ...(dismissReviewsCommand ? { dismissReviewsCommand } : undefined),
  };
}
