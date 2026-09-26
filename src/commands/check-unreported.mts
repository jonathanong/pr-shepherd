import {
  actionsWorkflowInProgress,
  reportedCheckNames,
  unreportedRequiredContexts,
  type WorkflowSuiteSnapshot,
} from "../checks/unreported-required.mts";
import { loadMergeTargetStatus } from "../github/merge-target-rules.mts";
import type { BatchPrData, CheckRun, ShepherdReport } from "../types.mts";
import type { RepoInfo } from "../github/client.mts";

export interface UnreportedRequiredFields {
  unreportedRequiredChecks?: string[];
  trunkBehindBy?: number;
  actionsWorkflowInProgress?: true;
  stackBottomPr?: number;
  headRefName: string;
  hasUnreportedRequired: boolean;
}

/** Load trunk rules for a stack and diff them against the head's check names. */
export async function collectUnreportedRequired(input: {
  batchData: BatchPrData;
  checks: readonly CheckRun[];
  suites: readonly WorkflowSuiteSnapshot[];
  owner: string;
  name: string;
  pr: number;
  relevantEvents: readonly string[];
}): Promise<UnreportedRequiredFields> {
  const localContexts =
    input.batchData.branchRules?.requiredStatusCheckContexts ??
    input.batchData.branchProtection?.requiredStatusCheckContexts ??
    [];
  const target = await loadMergeTargetStatus({
    owner: input.owner,
    name: input.name,
    pr: input.pr,
    baseRefName: input.batchData.baseRefName,
    headRefName: input.batchData.headRefName,
    localContexts,
    stack: input.batchData.stack,
  });
  const unreported = unreportedRequiredContexts(target.contexts, reportedCheckNames(input.checks));
  const actionsRunning = actionsWorkflowInProgress(input.suites, new Set(input.relevantEvents));
  return {
    ...(unreported.length > 0 && { unreportedRequiredChecks: unreported }),
    ...(target.trunkBehindBy !== undefined &&
      target.trunkBehindBy > 0 && { trunkBehindBy: target.trunkBehindBy }),
    ...(actionsRunning && { actionsWorkflowInProgress: true as const }),
    ...(target.stackBottomPr !== undefined && { stackBottomPr: target.stackBottomPr }),
    headRefName: input.batchData.headRefName,
    hasUnreportedRequired: unreported.length > 0,
  };
}

/**
 * A fingerprint hit can keep a stale trunk `behindBy`. Refresh the trunk compare
 * and the required-context diff without refetching the whole batch.
 */
export async function refreshCachedUnreported(
  report: ShepherdReport,
  repo: RepoInfo,
): Promise<ShepherdReport> {
  const stack = report.mergeStatus?.mergeRequirements?.stack;
  if (!stack || !report.headRefName) return report;
  const target = await loadMergeTargetStatus({
    owner: repo.owner,
    name: repo.name,
    pr: report.pr,
    baseRefName: report.baseBranch,
    headRefName: report.headRefName,
    localContexts: report.mergeStatus.mergeRequirements?.requiredStatusChecks?.contexts ?? [],
    stack,
  });
  const unreported = unreportedRequiredContexts(
    target.contexts,
    reportedCheckNames(reportChecks(report)),
  );
  const next: ShepherdReport = { ...report };
  if (unreported.length > 0) next.unreportedRequiredChecks = unreported;
  else delete next.unreportedRequiredChecks;
  if (target.trunkBehindBy !== undefined && target.trunkBehindBy > 0) {
    next.trunkBehindBy = target.trunkBehindBy;
  } else delete next.trunkBehindBy;
  if (target.stackBottomPr !== undefined) next.stackBottomPr = target.stackBottomPr;
  if (unreported.length > 0 && next.status === "READY") next.status = "PENDING";
  return next;
}

function reportChecks(report: ShepherdReport): { name: string }[] {
  return [
    ...report.checks.passing,
    ...report.checks.failing,
    ...report.checks.inProgress,
    ...report.checks.skipped,
    ...report.checks.filtered,
    ...(report.checks.ignored ?? []),
    ...(report.checks.supersededNames ?? []).map((name) => ({ name })),
  ];
}
