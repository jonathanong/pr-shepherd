import type { IterateResultBase, ShepherdReport } from "../../types.mts";
import {
  buildActiveChecks,
  buildRelevantChecks,
  buildSummary,
  buildSuppressedCheckFields,
} from "./helpers.mts";

export function buildIterateBase(
  report: ShepherdReport,
  readyState: { shouldCancel: boolean; remainingSeconds: number },
): IterateResultBase {
  return {
    pr: report.pr,
    repo: report.repo,
    status: report.status,
    state: report.mergeStatus.state,
    mergeStateStatus: report.mergeStatus.mergeStateStatus,
    mergeStatus: report.mergeStatus.status,
    reviewDecision: report.mergeStatus.reviewDecision,
    blockingBotReviewInProgress: report.mergeStatus.blockingBotReviewInProgress,
    isDraft: report.mergeStatus.isDraft,
    shouldCancel: readyState.shouldCancel,
    remainingSeconds: readyState.remainingSeconds,
    summary: buildSummary(report),
    baseBranch: report.baseBranch,
    branchProtection: report.branchProtection,
    mergeRequirements: report.mergeStatus.mergeRequirements,
    checks: buildRelevantChecks(report),
    inProgressChecks: buildActiveChecks(report),
    ...buildSuppressedCheckFields(report),
    activity: report.activity,
    mergeQueue: report.mergeQueue,
  };
}
