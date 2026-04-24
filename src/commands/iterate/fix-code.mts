import { readFixAttempts, writeFixAttempts } from "../../state/fix-attempts.mts";
import { toAgentThread, toAgentComment, toAgentChecks } from "../../reporters/agent.mts";
import {
  checkEscalateTriggers,
  validateBaseBranch,
  buildEscalateSuggestion,
  buildEscalateHumanMessage,
} from "./escalate.mts";
import { classifyComments, buildResolveCommand } from "./classify.mts";
import { buildFixInstructions } from "./render.mts";
import { applyStallGuard } from "./stall.mts";
import { tryCancelRun } from "./helpers.mts";
import type {
  EscalateDetails,
  IterateCommandOptions,
  IterateResult,
  IterateResultBase,
  Review,
  ShepherdReport,
} from "../../types.mts";

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
  surfacedSummaries: Review[];
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
    surfacedSummaries,
  } = ctx;

  const actionableChecks = report.checks.failing.filter((f) => f.failureKind === "actionable");

  const stored = await readFixAttempts({ owner: repoOwner, repo: repoName, pr: prNumber });

  const isNewSha = stored?.headSha !== headSha;
  // Accumulate across shas — only increment when a push is detected (sha changed)
  const currentAttempts: Record<string, number> = stored
    ? { ...stored.threadAttempts }
    : {};

  if (isNewSha) {
    for (const t of report.threads.actionable) {
      currentAttempts[t.id] = (currentAttempts[t.id] ?? 0) + 1;
    }
  }

  const escalateTriggers = checkEscalateTriggers(
    report.threads.actionable,
    report.comments.actionable,
    report.changesRequestedReviews,
    actionableChecks,
    currentAttempts,
    report.mergeStatus.status === "CONFLICTS",
  );
  if (escalateTriggers.triggers.length > 0) {
    const escalateBase: Omit<EscalateDetails, "humanMessage"> = {
      triggers: escalateTriggers.triggers,
      unresolvedThreads: report.threads.actionable.map(toAgentThread),
      ambiguousComments: report.comments.actionable.map(toAgentComment),
      changesRequestedReviews: report.changesRequestedReviews,
      attemptHistory: escalateTriggers.thrashHistory,
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

  // Save updated state (only incremented on sha change)
  await writeFixAttempts(
    { owner: repoOwner, repo: repoName, pr: prNumber },
    { headSha, threadAttempts: currentAttempts },
  );

  let cancelled: string[] = [];
  if (!opts.noAutoCancelActionable) {
    const uniqueRunIds = [
      ...new Set(actionableChecks.map((c) => c.runId).filter((id): id is string => id !== null)),
    ];
    const results = await Promise.all(
      uniqueRunIds.map((id) => tryCancelRun(id, repoOwner, repoName)),
    );
    cancelled = results.filter((id): id is string => id !== null);
  }

  const baseLookup = validateBaseBranch(report.baseBranch);
  const threads = report.threads.actionable.map(toAgentThread);
  const { actionable: actionableComments, noiseIds: noiseCommentIds } = classifyComments(
    report.comments.actionable.map(toAgentComment),
  );
  const checks = toAgentChecks(actionableChecks);
  const { changesRequestedReviews } = report;
  const hasConflicts = report.mergeStatus.status === "CONFLICTS";

  const allCommentIds = [
    ...actionableComments.map((c) => c.id),
    ...noiseCommentIds,
    ...reviewSummaryIds,
  ];
  const resolveCommand = buildResolveCommand(
    threads,
    actionableComments,
    allCommentIds,
    changesRequestedReviews,
    checks,
    prNumber,
  );

  if (baseLookup.isFallback && (resolveCommand.requiresHeadSha || hasConflicts)) {
    const fallbackEscalateBase: Omit<EscalateDetails, "humanMessage"> = {
      triggers: ["base-branch-unknown"],
      unresolvedThreads: threads,
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
        mode: "rebase-and-push" as const,
        threads,
        actionableComments,
        noiseCommentIds,
        reviewSummaryIds,
        surfacedSummaries,
        checks,
        changesRequestedReviews,
        resolveCommand,
        instructions,
      },
      cancelled,
    } as IterateResult,
    report,
    reviewSummaryIds,
  );
}
