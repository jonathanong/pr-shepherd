import type { IterateDeferredWork, Review, ShepherdReport } from "../../types.mts";
import { buildDeferredWork } from "./merge-state.mts";

/** Review work for one triage tick; see `isQueuedConflict` in check-annotations.mts. */
interface ReviewWork {
  report: ShepherdReport;
  reviewSummaryIds: string[];
  firstLookSummaries: Review[];
  editedSummaries: Review[];
  surfacedApprovals: Review[];
  ruleAutoResolveThreadIds?: string[];
}

/** Strip review work from a queued-conflict tick and count what was held back. */
export function deferQueuedConflictReviewWork(
  work: ReviewWork,
  minimizeApprovals: boolean,
): Omit<ReviewWork, "ruleAutoResolveThreadIds"> & { deferredWork?: IterateDeferredWork } {
  const deferredWork = buildDeferredWork({ ...work, minimizeApprovals });
  const { reviewItems: _held, ...report } = work.report;
  const { ruleAutoResolveIds: _rule, ...threads } = report.threads;
  return {
    report: {
      ...report,
      threads: { ...threads, actionable: [], resolutionOnly: [], firstLook: [] },
      comments: { ...report.comments, actionable: [], minimizeIds: [], firstLook: [] },
      changesRequestedReviews: [],
    },
    reviewSummaryIds: [],
    firstLookSummaries: [],
    editedSummaries: [],
    surfacedApprovals: [],
    ...(deferredWork && { deferredWork }),
  };
}
