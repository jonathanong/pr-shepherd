import type { PollSummaryResult } from "../types.mts";

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
      checks: item.checks,
      review: item.review,
    })),
  });
}
