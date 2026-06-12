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
import { buildFixInstructions } from "./render.mts";
import { applyStallGuard } from "./stall.mts";
import { tryCancelRun, buildAutoCancelRunIds, buildInProgressRunIds } from "./helpers.mts";
import { annotationMarkerBody } from "../check-annotations.mts";
import { threadTranscriptBody } from "../../threads/transcript.mts";
import { isHumanAuthor, isConfiguredBotAuthor } from "../../comments/authors.mts";
import type {
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
  const failingChecks = report.checks.failing;
  const stored = await readFixAttempts({ owner: repoOwner, repo: repoName, pr: prNumber });
  const { threadAttempts, threadBodyHashes } = nextFixAttempts(
    stored,
    headSha,
    report.threads.actionable,
  );

  const botCrReviews = report.changesRequestedReviews.filter(
    (r) => !isHumanAuthor(r) || isConfiguredBotAuthor(r, botUsernames),
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
        humanMessage: buildEscalateHumanMessage(escalateBase, prNumber),
      },
    };
  }

  const escalateTriggers = checkEscalateTriggers(report.threads.actionable, threadAttempts);
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
        humanMessage: buildEscalateHumanMessage(escalateBase, prNumber),
      },
    };
  }
  await writeFixAttempts(
    { owner: repoOwner, repo: repoName, pr: prNumber },
    { headSha, threadAttempts, threadBodyHashes },
  );
  let cancelled: string[] = [];
  if (!opts.noAutoCancelActionable) {
    const runIds = buildAutoCancelRunIds(report);
    const results = await Promise.all(runIds.map((id) => tryCancelRun(id, repoOwner, repoName)));
    cancelled = results.filter((id): id is string => id !== null);
  }
  const cancelledSet = new Set(cancelled);
  const baseLookup = validateBaseBranch(report.baseBranch);
  const threads = report.threads.actionable.map(toAgentThread);
  const resolutionOnlyThreads = report.threads.resolutionOnly;
  const actionableComments = report.comments.actionable.map(toAgentComment);
  const checks = toAgentChecks(failingChecks);
  const { changesRequestedReviews } = report;
  const hasConflicts = report.mergeStatus.status === "CONFLICTS";
  // Only surface in-progress runs when a push is plausible — resolution-only and
  // summary-only iterations have no path to a push, so listing runs would prompt
  // unnecessary cancellation.
  const pushLikely =
    threads.length > 0 ||
    checks.length > 0 ||
    hasConflicts ||
    changesRequestedReviews.length > 0 ||
    actionableComments.length > 0;
  const inProgressRunIds = pushLikely
    ? buildInProgressRunIds(report, cancelledSet, {
        suppressProtectedFreshReruns: false,
      })
    : [];
  const commentMinimizeIds = report.comments.minimizeIds ?? actionableComments.map((c) => c.id);
  const allCommentIds = [...commentMinimizeIds, ...reviewSummaryIds];
  const { resolveCommand, resolveOnlyCommand } = buildResolveCommand(
    threads,
    resolutionOnlyThreads,
    allCommentIds,
    changesRequestedReviews,
    checks,
    prNumber,
    botUsernames,
    ruleAutoResolveThreadIds,
  );
  // Safety: if the base branch is unknown, escalate when a push is plausible — the agent
  // would need the correct base to rebase safely. This is a conservative guard, not a
  // prediction that the agent *will* push. Intentionally broader than `pushLikely` above:
  // resolution-only threads also need a known base in case the agent does push.
  const pushIsPlausible =
    threads.length > 0 ||
    checks.length > 0 ||
    hasConflicts ||
    changesRequestedReviews.length > 0 ||
    actionableComments.length > 0 ||
    resolutionOnlyThreads.length > 0;
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
        humanMessage: buildEscalateHumanMessage(fallbackEscalateBase, prNumber),
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
    prNumber,
    cancelled.length,
    firstLookThreads,
    firstLookComments,
    firstLookSummaries,
    editedSummaries,
    inProgressRunIds,
    resolutionOnlyThreads,
    resolveOnlyCommand,
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
  if (result.action === "fix_code") {
    await Promise.allSettled(
      result.fix.checks.flatMap((ch) =>
        (ch.annotations ?? []).map((a) => markSeen(stallKey, a.id, annotationMarkerBody(a))),
      ),
    );
  }
  return result;
}
