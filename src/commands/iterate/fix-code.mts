/* eslint-disable max-lines */
import { readFixAttempts, writeFixAttempts } from "../../state/fix-attempts.mts";
import { toAgentThread, toAgentComment, toAgentChecks } from "../../reporters/agent.mts";
import {
  checkEscalateTriggers,
  validateBaseBranch,
  buildEscalateSuggestion,
  buildEscalateHumanMessage,
} from "./escalate.mts";
import { buildResolveCommand } from "./classify.mts";
import { buildFixInstructions } from "./render.mts";
import { applyStallGuard } from "./stall.mts";
import { tryCancelRun, buildInProgressRunIds } from "./helpers.mts";
import type {
  EscalateDetails,
  IterateCommandOptions,
  IterateResult,
  IterateResultBase,
  Review,
  ShepherdReport,
} from "../../types.mts";
import type { CliRunner } from "../../cli/runner.mts";
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
  cliRunner?: CliRunner;
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
    cliRunner,
  } = ctx;
  const failingChecks = report.checks.failing;
  const stored = await readFixAttempts({ owner: repoOwner, repo: repoName, pr: prNumber });
  const isNewSha = stored?.headSha !== headSha;
  const currentAttempts: Record<string, number> = stored ? { ...stored.threadAttempts } : {};
  if (isNewSha) {
    for (const t of report.threads.actionable) {
      currentAttempts[t.id] = (currentAttempts[t.id] ?? 0) + 1;
    }
  }

  const escalateTriggers = checkEscalateTriggers(
    report.threads.actionable,
    report.threads.resolutionOnly,
    report.comments.actionable,
    report.changesRequestedReviews,
    failingChecks,
    currentAttempts,
    report.mergeStatus.status === "CONFLICTS",
  );
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
    { headSha, threadAttempts: currentAttempts },
  );
  let cancelled: string[] = [];
  if (!opts.noAutoCancelActionable) {
    const uniqueRunIds = [
      ...new Set(failingChecks.map((c) => c.runId).filter((id): id is string => id !== null)),
    ];
    const results = await Promise.all(
      uniqueRunIds.map((id) => tryCancelRun(id, repoOwner, repoName)),
    );
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
  const inProgressRunIds = buildInProgressRunIds(report, cancelledSet);
  const commentMinimizeIds = report.comments.minimizeIds ?? actionableComments.map((c) => c.id);
  const allCommentIds = [...commentMinimizeIds, ...reviewSummaryIds];
  const resolveCommand = buildResolveCommand(
    threads,
    resolutionOnlyThreads,
    allCommentIds,
    changesRequestedReviews,
    checks,
    prNumber,
    cliRunner,
  );
  const overlappingReviewIds = resolveCommand.droppedDismissReviewIds ?? [];
  if (overlappingReviewIds.length > 0) {
    process.stderr.write(
      `pr-shepherd: resolve command overlap: ${overlappingReviewIds.length} ` +
        `review IDs were also in minimize/comment IDs and were dropped from --dismiss-review-ids: ` +
        `${overlappingReviewIds.join(", ")}\n`,
    );
  }
  // Safety: if the base branch is unknown, escalate when a push is plausible — the agent
  // would need the correct base to rebase safely. This is a conservative guard, not a
  // prediction that the agent *will* push.
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
    cliRunner,
  );
  return applyStallGuard(
    stallKey,
    stallTimeoutSeconds,
    headSha,
    base,
    prNumber,
    {
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
        instructions,
        firstLookThreads,
        firstLookComments,
        inProgressRunIds,
      },
      cancelled,
    } as IterateResult,
    report,
    reviewSummaryIds,
  );
}
