import type { PollSummaryResult } from "../types.mts";

/**
 * Decision-relevant state only. Raw review totals and the ignored, skipped, filtered, and
 * superseded check counts move when rules suppress a bot notice or a bot reposts a status
 * check, which would reprint quiet polls and keep an idle stack from reaching `stall-timeout`.
 * Post-rule `actionable` and the check transitions that drive routing stay in.
 */
export function summaryStatusSignature(result: PollSummaryResult): string {
  return JSON.stringify({
    nextAction: result.nextAction,
    stackAncestry: result.stackAncestry,
    prs: result.prs.map((item) => ({
      pr: item.pr,
      action: item.action,
      state: item.state,
      mergeable: item.mergeable,
      mergeStateStatus: item.mergeStateStatus,
      reviewDecision: item.reviewDecision,
      checks: item.checks && {
        passing: item.checks.passing,
        failing: item.checks.failing,
        inProgress: item.checks.inProgress,
        incomplete: item.checks.incomplete,
        unreportedRequired: item.checks.unreportedRequired,
        actionsWorkflowInProgress: item.checks.actionsWorkflowInProgress,
      },
      review: item.review && {
        actionable: item.review.actionable,
        incomplete: item.review.incomplete,
      },
    })),
  });
}
