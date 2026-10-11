import {
  actionsWorkflowInProgress,
  reportedCheckNames,
  unreportedRequiredContexts,
  type WorkflowSuiteSnapshot,
} from "../checks/unreported-required.mts";
import { loadBaseBehindBy, loadMergeTargetStatus } from "../github/merge-target-rules.mts";
import type { BatchPrData, CheckRun, ShepherdReport } from "../types.mts";
import type { RepoInfo } from "../github/client.mts";
import type { CheckExecutionContext } from "./check-execution-context.mts";

export interface UnreportedRequiredFields {
  unreportedRequiredChecks?: string[];
  trunkBehindBy?: number;
  /** Commits on the PR base that this head does not contain. Omitted when zero or a stack. */
  baseBehindBy?: number;
  actionsWorkflowInProgress?: true;
  stackBottomPr?: number;
  headRefName: string;
  hasUnreportedRequired: boolean;
}

/** Load trunk rules for a stack and diff them against the head's check names. */
export async function collectUnreportedRequired(
  input: {
    batchData: BatchPrData;
    checks: readonly CheckRun[];
    suites: readonly WorkflowSuiteSnapshot[];
    owner: string;
    name: string;
    pr: number;
    relevantEvents: readonly string[];
  },
  context?: CheckExecutionContext,
): Promise<UnreportedRequiredFields> {
  const localContexts =
    input.batchData.branchRules?.requiredStatusCheckContexts ??
    input.batchData.branchProtection?.requiredStatusCheckContexts ??
    [];
  const target = await loadMergeTargetStatus(
    {
      owner: input.owner,
      name: input.name,
      pr: input.pr,
      baseRefName: input.batchData.baseRefName,
      headRefName: input.batchData.headRefName,
      headRefOid: input.batchData.headRefOid,
      localContexts,
      stack: input.batchData.stack,
    },
    context,
  );
  const unreported = unreportedRequiredContexts(target.contexts, reportedCheckNames(input.checks));
  // Like `baseBehindBy`, the trunk compare matters only to an unreported required check.
  const trunkBehindBy =
    unreported.length > 0 && target.trunkBehindBy ? await target.trunkBehindBy() : 0;
  const actionsRunning = actionsWorkflowInProgress(input.suites, new Set(input.relevantEvents));
  const baseBehindBy =
    unreported.length > 0 && !input.batchData.stack
      ? await loadBaseBehindBy(
          input.owner,
          input.name,
          input.batchData.baseRefName,
          input.batchData.headRefOid,
          {
            stateKey: { owner: input.owner, repo: input.name, pr: input.pr },
            ...(input.batchData.baseTipOid && { baseTipOid: input.batchData.baseTipOid }),
          },
        )
      : 0;
  return {
    ...(unreported.length > 0 && { unreportedRequiredChecks: unreported }),
    ...(trunkBehindBy > 0 && { trunkBehindBy }),
    ...(baseBehindBy > 0 && { baseBehindBy }),
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
  context?: CheckExecutionContext,
  baseTipOid?: string,
): Promise<ShepherdReport> {
  const stack = report.mergeStatus?.mergeRequirements?.stack;
  if (!report.headRefName) return report;
  if (!stack) return refreshBaseBehind(report, repo, baseTipOid);
  const target = await loadMergeTargetStatus(
    {
      owner: repo.owner,
      name: repo.name,
      pr: report.pr,
      baseRefName: report.baseBranch,
      headRefName: report.headRefName,
      ...(report.headSha && { headRefOid: report.headSha }),
      localContexts: report.mergeStatus.mergeRequirements?.requiredStatusChecks?.contexts ?? [],
      stack,
    },
    context,
  );
  const unreported = unreportedRequiredContexts(
    target.contexts,
    reportedCheckNames(reportChecks(report)),
  );
  const next: ShepherdReport = { ...report };
  if (unreported.length > 0) next.unreportedRequiredChecks = unreported;
  else delete next.unreportedRequiredChecks;
  const trunkBehindBy =
    unreported.length > 0 && target.trunkBehindBy ? await target.trunkBehindBy() : 0;
  if (trunkBehindBy > 0) next.trunkBehindBy = trunkBehindBy;
  else delete next.trunkBehindBy;
  if (target.stackBottomPr !== undefined) next.stackBottomPr = target.stackBottomPr;
  if (unreported.length > 0 && next.status === "READY") next.status = "PENDING";
  return next;
}

/** A fingerprint hit can keep a stale base compare after main moves. */
async function refreshBaseBehind(
  report: ShepherdReport,
  repo: RepoInfo,
  baseTipOid: string | undefined,
): Promise<ShepherdReport> {
  if ((report.unreportedRequiredChecks?.length ?? 0) === 0) {
    if (report.baseBehindBy === undefined) return report;
    const cleared = { ...report };
    delete cleared.baseBehindBy;
    return cleared;
  }
  // A missing head OID must not fall back to the branch name. That name can
  // resolve inside the base repository when the PR comes from a fork.
  const headOid = report.headSha;
  if (!headOid) return report;
  const behind = await loadBaseBehindBy(repo.owner, repo.name, report.baseBranch, headOid, {
    stateKey: { owner: repo.owner, repo: repo.name, pr: report.pr },
    ...(baseTipOid && { baseTipOid }),
  });
  const next = { ...report };
  if (behind > 0) next.baseBehindBy = behind;
  else delete next.baseBehindBy;
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
