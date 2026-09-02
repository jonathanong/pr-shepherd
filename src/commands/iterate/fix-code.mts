/* eslint-disable max-lines */
import {
  readFixAttempts,
  writeFixAttempts,
  type FixAttemptsState,
} from "../../state/fix-attempts.mts";
import {
  readBotCrSeenState,
  writeBotCrSeenState,
  updateBotCrSeenState,
} from "../../state/bot-cr-seen.mts";
import { toAgentThread, toAgentComment, toAgentChecks } from "../../reporters/agent.mts";
import { hashBody, markSeen } from "../../state/seen-comments.mts";
import {
  checkEscalateTriggers,
  validateBaseBranch,
  buildEscalateSuggestion,
  buildEscalateHumanMessage,
} from "./escalate.mts";
import { buildResolveCommand } from "./classify.mts";
import {
  buildThreadMutationRouting,
  canResolveOutdatedBotWithoutLocation,
} from "./thread-mutation-routing.mts";
import { buildFixInstructions } from "./render.mts";
import { applyStallGuard } from "./stall.mts";
import { annotationMarkerBody, checksWithActionableAnnotations } from "../check-annotations.mts";
import { threadTranscriptBody } from "../../threads/transcript.mts";
import { isHumanAuthor, isConfiguredBotAuthor } from "../../comments/authors.mts";
import { canRerunWorkflows } from "../../checks/conclusions.mts";
import { loadConfig } from "../../config/load.mts";
import { formatPrUrl } from "../../pr-reference.mts";
import type {
  AgentCheck,
  EscalateDetails,
  IterateCommandOptions,
  IterateResult,
  IterateResultBase,
  Review,
  ShepherdReport,
} from "../../types.mts";
import type { NormalizedBotUsernames } from "../../comments/authors.mts";
interface HandleFixCodeContext {
  base: IterateResultBase;
  report: ShepherdReport;
  opts: IterateCommandOptions;
  headSha: string;
  stallKey: { owner: string; repo: string; pr: number };
  prNumber: number;
  stallTimeoutSeconds: number;
  repoOwner: string;
  repoName: string;
  reviewSummaryIds: string[];
  firstLookSummaries: Review[];
  editedSummaries: Review[];
  surfacedApprovals: Review[];
  botUsernames: NormalizedBotUsernames;
  ruleAutoResolveThreadIds?: string[];
}

function checkRequiresHumanFollowUp(check: AgentCheck): boolean {
  if (check.rerunCommand) return false;
  // Once GitHub advances beyond the original attempt, Shepherd's one autonomous rerun has
  // already been consumed. Hand the repeated failure off even when logs are available; the
  // human still receives that evidence in the escalation payload.
  if (check.runAttempt !== undefined && check.runAttempt > 1) return true;
  if (
    check.conclusion === "ACTION_REQUIRED" ||
    check.conclusion === "CANCELLED" ||
    check.conclusion === "STARTUP_FAILURE"
  )
    return true;
  // An external check's direct URL is actionable evidence: the agent can inspect the
  // provider and/or reproduce the reported failure locally. Only a truly bare check
  // has no autonomous investigation path.
  if (check.runId === null) return !check.detailsUrl?.trim();
  return !check.logExcerpt?.trim();
}

function nextFixAttempts(
  stored: FixAttemptsState | null,
  headSha: string,
  threads: ShepherdReport["threads"]["actionable"],
): Pick<FixAttemptsState, "threadAttempts" | "threadBodyHashes"> {
  const threadAttempts: Record<string, number> = stored ? { ...stored.threadAttempts } : {};
  const threadBodyHashes: Record<string, string> = stored?.threadBodyHashes
    ? { ...stored.threadBodyHashes }
    : {};
  for (const t of threads) {
    const bodyHash = hashBody(threadTranscriptBody(t));
    const previousHash = threadBodyHashes[t.id];
    if (stored?.headSha === headSha && (previousHash === undefined || previousHash === bodyHash))
      continue;
    threadAttempts[t.id] = previousHash === bodyHash ? (threadAttempts[t.id] ?? 0) + 1 : 1;
    threadBodyHashes[t.id] = bodyHash;
  }
  return { threadAttempts, threadBodyHashes };
}

export async function handleFixCode(ctx: HandleFixCodeContext): Promise<IterateResult> {
  const {
    base,
    report,
    opts,
    headSha,
    stallKey,
    prNumber,
    stallTimeoutSeconds,
    repoOwner,
    repoName,
    reviewSummaryIds,
    firstLookSummaries,
    editedSummaries,
    surfacedApprovals,
    botUsernames,
    ruleAutoResolveThreadIds,
  } = ctx;
  const prReference = formatPrUrl(report.repo, prNumber);
  const failingChecks = report.checks.failing;
  const annotatedExtra = checksWithActionableAnnotations(report).filter(
    (c) => c.category !== "failing",
  );
  const allThreads = [...report.threads.actionable, ...report.threads.resolutionOnly];
  const ruleAutoResolveIds = new Set(ruleAutoResolveThreadIds ?? []);
  const routedThreadMutations = buildThreadMutationRouting(allThreads, botUsernames, [
    ...ruleAutoResolveIds,
  ]);
  const replyIdSet = new Set(routedThreadMutations.replyThreadIds);
  const resolveIdSet = new Set(routedThreadMutations.resolveThreadIds);
  const unauthorizedReplies = allThreads.filter(
    (thread) => replyIdSet.has(thread.id) && thread.viewerCanReply !== true,
  );
  const unauthorizedResolves = allThreads.filter(
    (thread) => resolveIdSet.has(thread.id) && thread.viewerCanResolve !== true,
  );
  const unauthorizedDismissals = report.changesRequestedReviews.filter(
    (review) =>
      (!isHumanAuthor(review) || isConfiguredBotAuthor(review, botUsernames)) &&
      report.viewerAuthorization?.viewerCanAdminister !== true,
  );
  const skippedThreadIds = new Set(
    [...unauthorizedReplies, ...unauthorizedResolves].map((thread) => thread.id),
  );
  const retryableActionableThreads = report.threads.actionable.filter(
    (thread) => !skippedThreadIds.has(thread.id) && thread.path !== null && thread.line !== null,
  );
  const protectedRuns: [] = [];
  const stored = await readFixAttempts({ owner: repoOwner, repo: repoName, pr: prNumber });
  const { threadAttempts, threadBodyHashes } = nextFixAttempts(
    stored,
    headSha,
    retryableActionableThreads,
  );

  const botCrReviews = report.changesRequestedReviews.filter(
    (r) =>
      (!isHumanAuthor(r) || isConfiguredBotAuthor(r, botUsernames)) &&
      report.viewerAuthorization?.viewerCanAdminister === true,
  );
  const botCrStateKey = { owner: repoOwner, repo: repoName, pr: prNumber };
  const previousBotCrState = await readBotCrSeenState(botCrStateKey);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const { next: nextBotCrState, staleIds: staleBotCrIds } = updateBotCrSeenState(
    previousBotCrState,
    botCrReviews,
    nowSeconds,
    stallTimeoutSeconds,
  );
  await writeBotCrSeenState(botCrStateKey, nextBotCrState);
  if (staleBotCrIds.length > 0) {
    const staleSet = new Set(staleBotCrIds);
    const staleReviews = botCrReviews.filter((r) => staleSet.has(r.id));
    const escalateBase: Omit<EscalateDetails, "humanMessage"> = {
      triggers: ["bot-cr-not-dismissed"],
      unresolvedThreads: [...report.threads.actionable, ...report.threads.resolutionOnly].map(
        toAgentThread,
      ),
      ambiguousComments: report.comments.actionable.map(toAgentComment),
      changesRequestedReviews: staleReviews,
      suggestion: buildEscalateSuggestion(["bot-cr-not-dismissed"], staleBotCrIds.join(", ")),
    };
    return {
      ...base,
      action: "escalate",
      escalate: {
        ...escalateBase,
        humanMessage: buildEscalateHumanMessage(escalateBase, prReference, {
          merge: opts.merge,
        }),
      },
    };
  }

  const escalateTriggers = checkEscalateTriggers(retryableActionableThreads, threadAttempts);
  if (escalateTriggers.triggers.length > 0) {
    const escalateBase: Omit<EscalateDetails, "humanMessage"> = {
      triggers: escalateTriggers.triggers,
      unresolvedThreads: [...report.threads.actionable, ...report.threads.resolutionOnly].map(
        toAgentThread,
      ),
      ambiguousComments: report.comments.actionable.map(toAgentComment),
      changesRequestedReviews: report.changesRequestedReviews,
      thrashHistory: escalateTriggers.thrashHistory,
      suggestion: buildEscalateSuggestion(escalateTriggers.triggers),
    };
    return {
      ...base,
      action: "escalate",
      escalate: {
        ...escalateBase,
        humanMessage: buildEscalateHumanMessage(escalateBase, prReference, {
          merge: opts.merge,
        }),
      },
    };
  }
  await writeFixAttempts(
    { owner: repoOwner, repo: repoName, pr: prNumber },
    { headSha, threadAttempts, threadBodyHashes },
  );
  // GitHub does not expose a per-run viewer capability for cancellation, so Shepherd never
  // issues or recommends a cancellation regardless of repository role. A rerun is different:
  // GitHub's Actions rerun API requires actions:write, which rides with WRITE+ repo access, so
  // repositoryPermission is a proxy for account-level rerun capability (see canRerunWorkflows) —
  // it does not confirm the credential executing `gh` has that scope; an unauthorized rerun
  // simply fails when the agent runs it, the same residual risk as every other CLI-recommended
  // git/gh mutation in this codebase.
  const cancelled: string[] = [];
  const baseLookup = validateBaseBranch(report.baseBranch);
  const threads = report.threads.actionable.map(toAgentThread);
  const resolutionOnlyThreads = report.threads.resolutionOnly;
  const actionableComments = report.comments.actionable.map(toAgentComment);
  const rerunAuthorized = canRerunWorkflows(report.viewerAuthorization);
  // A workflow run can only be rerun once it has fully completed; a runId still present among
  // in-progress checks (a sibling job from the same run) is not yet eligible.
  const inProgressWorkflowRunIds = new Set(
    report.checks.inProgress.flatMap((c) => (c.runId !== null ? [c.runId] : [])),
  );
  // Confirmed GitHub Actions provenance for a runId: `source: "startup_failure"` checks are
  // fetched directly from the Actions REST API (always genuine), while `source: "check_run"`
  // checks need `workflowName` — derived from the same `checkSuite.workflowRun.workflow` GraphQL
  // path as the run's numeric ID — because a third-party GitHub App's CheckRun can carry a
  // details-URL-parsed runId that merely looks like an Actions run number.
  const actionsRunIds = new Set(
    failingChecks.flatMap((c) =>
      c.runId !== null && (c.source === "startup_failure" || c.workflowName !== undefined)
        ? [c.runId]
        : [],
    ),
  );
  const initialAttemptRunIds = new Set(
    failingChecks.flatMap((c) => (c.runId !== null && c.runAttempt === 1 ? [c.runId] : [])),
  );
  const failingAgentChecks = toAgentChecks(failingChecks).map((c) =>
    rerunAuthorized &&
    c.runId &&
    actionsRunIds.has(c.runId) &&
    // GitHub increments run_attempt after every rerun. Recommend at most one rerun by limiting
    // the command to the original attempt; missing attempt metadata is denied conservatively.
    initialAttemptRunIds.has(c.runId) &&
    // ACTION_REQUIRED means the run is paused pending manual workflow approval; rerunning does
    // not grant that approval, so no rerun command applies.
    c.conclusion !== "ACTION_REQUIRED" &&
    !inProgressWorkflowRunIds.has(c.runId)
      ? { ...c, rerunCommand: `gh run rerun ${c.runId} -R ${report.repo}` }
      : c,
  );
  const checks = [
    ...failingAgentChecks,
    ...toAgentChecks(annotatedExtra).map((c) => ({ ...c, annotationOnly: true as const })),
  ];
  const { changesRequestedReviews } = report;
  const actionableChangesRequestedReviews = changesRequestedReviews.filter(
    (review) =>
      review.staleReview !== true ||
      !isHumanAuthor(review) ||
      isConfiguredBotAuthor(review, botUsernames),
  );
  const skippedDismissalIds = new Set(unauthorizedDismissals.map((review) => review.id));
  const changesRequestedReviewsForWork = actionableChangesRequestedReviews.filter(
    (review) => !skippedDismissalIds.has(review.id),
  );
  const resolutionOnlyThreadsForWork = resolutionOnlyThreads.filter(
    (thread) =>
      !skippedThreadIds.has(thread.id) &&
      ((thread.path !== null && thread.line !== null) ||
        canResolveOutdatedBotWithoutLocation(thread, botUsernames)),
  );
  const hasConflicts = report.mergeStatus.status === "CONFLICTS";
  const isBehind = report.mergeStatus.status === "BEHIND";
  const { behindBaseHint } = loadConfig().iterate;
  // Only surface in-progress runs when a push is plausible — resolution-only and
  // summary-only iterations have no path to a push, so listing runs would prompt
  // unnecessary cancellation.
  const inProgressRunIds: string[] = [];
  const commentMinimizeIds = report.comments.minimizeIds ?? actionableComments.map((c) => c.id);
  const allCommentIds = [...commentMinimizeIds, ...reviewSummaryIds];
  const belongsToActiveWorkflowRun = (check: AgentCheck): boolean =>
    check.runId !== null && inProgressWorkflowRunIds.has(check.runId);
  const manualFollowUpChecks = failingAgentChecks.filter(
    (check) => !belongsToActiveWorkflowRun(check) && checkRequiresHumanFollowUp(check),
  );
  const exhaustedAttempts = manualFollowUpChecks.filter(
    (check) => check.runAttempt !== undefined && check.runAttempt > 1,
  );
  const hasBehindBaseRecovery = isBehind && exhaustedAttempts.length > 0;
  const hasAutonomousWork =
    hasConflicts ||
    hasBehindBaseRecovery ||
    threads.length > 0 ||
    resolutionOnlyThreads.length > 0 ||
    actionableComments.length > 0 ||
    commentMinimizeIds.length > 0 ||
    actionableChangesRequestedReviews.length > 0 ||
    reviewSummaryIds.length > 0 ||
    firstLookSummaries.length > 0 ||
    editedSummaries.length > 0 ||
    report.threads.firstLook.length > 0 ||
    report.comments.firstLook.length > 0 ||
    checks.some((check) => (check.annotations?.length ?? 0) > 0) ||
    failingAgentChecks.some(
      (check) => belongsToActiveWorkflowRun(check) || !checkRequiresHumanFollowUp(check),
    );
  if (manualFollowUpChecks.length > 0 && !hasAutonomousWork) {
    const checkSuggestion =
      exhaustedAttempts.length > 0
        ? `GitHub reports a later workflow attempt (${exhaustedAttempts
            .map((check) => `${check.runId ?? check.name}: attempt ${check.runAttempt}`)
            .join(
              ", ",
            )}), so Shepherd's single rerun allowance is exhausted. Use the included evidence to handle the repeated failure manually before resuming.`
        : buildEscalateSuggestion(["check-follow-up-unavailable"]);
    const checkEscalateBase: Omit<EscalateDetails, "humanMessage"> = {
      triggers: ["check-follow-up-unavailable"],
      unresolvedThreads: [],
      ambiguousComments: [],
      changesRequestedReviews,
      checks: manualFollowUpChecks,
      suggestion: checkSuggestion,
    };
    return {
      ...base,
      action: "escalate",
      escalate: {
        ...checkEscalateBase,
        humanMessage: buildEscalateHumanMessage(checkEscalateBase, prReference, {
          merge: opts.merge,
        }),
      },
    };
  }
  // Push access to the PR head branch is a usage precondition. Build review mutations for
  // conflict ticks normally so the caller can push and complete the same fix_code cycle.
  const retryableActionableIds = new Set(retryableActionableThreads.map((thread) => thread.id));
  const retryableAgentThreads = threads.filter((thread) => retryableActionableIds.has(thread.id));
  const { resolveCommand, resolveOnlyCommand } = buildResolveCommand(
    retryableAgentThreads,
    resolutionOnlyThreadsForWork,
    allCommentIds,
    changesRequestedReviewsForWork,
    failingAgentChecks,
    prReference,
    botUsernames,
    ruleAutoResolveThreadIds,
    report.viewerAuthorization,
    allThreads,
  );
  // Safety: if the base branch is unknown, escalate when a push is plausible — the agent
  // would need the correct base to rebase safely. This is a conservative guard, not a
  // prediction that the agent *will* push. Located resolution-only threads retain that guard;
  // an outdated bot thread resolved only by ID has no code or push path.
  const locatedResolutionOnlyThreadsForWork = resolutionOnlyThreadsForWork.filter(
    (thread) => thread.path !== null && thread.line !== null,
  );
  const pushIsPlausible =
    retryableActionableThreads.length > 0 ||
    failingAgentChecks.length > 0 ||
    annotatedExtra.length > 0 ||
    hasConflicts ||
    changesRequestedReviewsForWork.length > 0 ||
    actionableComments.length > 0 ||
    locatedResolutionOnlyThreadsForWork.length > 0;
  if (baseLookup.isFallback && pushIsPlausible) {
    const fallbackEscalateBase: Omit<EscalateDetails, "humanMessage"> = {
      triggers: ["base-branch-unknown"],
      unresolvedThreads: [...threads, ...resolutionOnlyThreads.map(toAgentThread)],
      ambiguousComments: actionableComments,
      changesRequestedReviews,
      suggestion: buildEscalateSuggestion(["base-branch-unknown"], baseLookup.failureReason),
    };
    return {
      ...base,
      action: "escalate",
      escalate: {
        ...fallbackEscalateBase,
        humanMessage: buildEscalateHumanMessage(fallbackEscalateBase, prReference, {
          merge: opts.merge,
        }),
      },
    };
  }
  const firstLookThreads = report.threads.firstLook;
  const firstLookComments = report.comments.firstLook;
  const instructions = buildFixInstructions(
    threads,
    actionableComments,
    checks,
    changesRequestedReviews,
    baseLookup.branch,
    resolveCommand,
    hasConflicts,
    prReference,
    cancelled.length,
    firstLookThreads,
    firstLookComments,
    firstLookSummaries,
    editedSummaries,
    inProgressRunIds,
    resolutionOnlyThreads,
    resolveOnlyCommand,
    behindBaseHint,
    isBehind,
    report.viewerAuthorization?.viewerCanUpdate === true,
    exhaustedAttempts.length > 0,
  );
  const prospectiveResult = {
    ...base,
    baseBranch: baseLookup.branch,
    action: "fix_code" as const,
    fix: {
      threads,
      resolutionOnlyThreads,
      actionableComments,
      reviewSummaryIds,
      firstLookSummaries,
      editedSummaries,
      surfacedApprovals,
      checks,
      changesRequestedReviews,
      resolveCommand,
      ...(resolveOnlyCommand !== undefined ? { resolveOnlyCommand } : undefined),
      instructions,
      firstLookThreads,
      firstLookComments,
      inProgressRunIds,
      protectedRuns,
    },
    cancelled,
  } as IterateResult;
  const result = await applyStallGuard(
    stallKey,
    stallTimeoutSeconds,
    headSha,
    base,
    prNumber,
    prospectiveResult,
    report,
    reviewSummaryIds,
  );
  if (result.action === "fix_code" && opts.persistSeen !== false) {
    await Promise.allSettled(
      result.fix.checks.flatMap((ch) =>
        (ch.annotations ?? []).map((a) => markSeen(stallKey, a.id, annotationMarkerBody(a))),
      ),
    );
  }
  return result;
}
