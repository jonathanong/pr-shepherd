import { clearStallState } from "../../state/iterate-stall.mts";
import type {
  IterateDeferredWork,
  IterateResult,
  IterateResultBase,
  Review,
  ShepherdReport,
} from "../../types.mts";
import { buildEscalateHumanMessage, buildEscalateSuggestion } from "./escalate.mts";
import { buildMergeCommandPlan } from "./merge.mts";
import { formatPrUrl } from "../../pr-reference.mts";

type StallKey = { owner: string; repo: string; pr: number };

export function buildReadyMergeResult(
  enabled: boolean | undefined,
  readyElapsed: boolean,
  base: IterateResultBase,
  report: ShepherdReport,
): IterateResult | null {
  if (!enabled || !readyElapsed || report.mergeStatus.isDraft) return null;
  const queue = Boolean(
    report.mergeStatus.mergeRequirements?.mergeQueue?.required ||
    report.mergeStatus.mergeRequirements?.mergeQueue?.enabled,
  );
  return {
    ...base,
    action: "merge",
    merge: buildMergeCommandPlan({
      pr: report.pr,
      repo: report.repo,
      nodeId: report.nodeId,
      headSha: report.headSha ?? "unknown",
      queue,
    }),
  };
}

/** Raw counts of non-CI actionable work held back for one queued-PR wait tick. Omitted (all zero) when empty. */
function buildDeferredWork(input: {
  report: ShepherdReport;
  reviewSummaryIds: string[];
  firstLookSummaries: Review[];
  editedSummaries: Review[];
  surfacedApprovals: Review[];
  minimizeApprovals: boolean;
}): IterateDeferredWork | undefined {
  const {
    report,
    reviewSummaryIds,
    firstLookSummaries,
    editedSummaries,
    surfacedApprovals,
    minimizeApprovals,
  } = input;
  const deferredWork: IterateDeferredWork = {
    threads:
      report.threads.actionable.length +
      report.threads.resolutionOnly.length +
      report.threads.firstLook.length +
      (report.threads.ruleAutoResolveIds?.length ?? 0),
    comments:
      report.comments.actionable.length +
      (report.comments.minimizeIds?.length ?? 0) +
      report.comments.firstLook.length,
    changesRequestedReviews: report.changesRequestedReviews.length,
    reviewSummaries:
      reviewSummaryIds.length +
      firstLookSummaries.length +
      editedSummaries.length +
      (minimizeApprovals ? surfacedApprovals.length : 0),
  };
  const total =
    deferredWork.threads +
    deferredWork.comments +
    deferredWork.changesRequestedReviews +
    deferredWork.reviewSummaries;
  return total > 0 ? deferredWork : undefined;
}

export async function handleActiveMergeState(input: {
  enabled: boolean | undefined;
  active: boolean;
  base: IterateResultBase;
  report: ShepherdReport;
  stallKey: StallKey;
  reviewSummaryIds: string[];
  firstLookSummaries: Review[];
  editedSummaries: Review[];
  surfacedApprovals: Review[];
  minimizeApprovals: boolean;
}): Promise<IterateResult | null> {
  const { enabled, active, base, report, stallKey } = input;
  const inQueue = report.mergeQueue?.inQueue === true;
  if (enabled && active) {
    await clearStallState(stallKey);
    // Only the queued case ever holds back non-CI actionable work (see the `deferWhileQueued`
    // gate in index.mts, which requires `inQueue === true`); an ordinary active auto-merge
    // request with no queue membership never defers anything, so it never carries counts here.
    const deferredWork = inQueue ? buildDeferredWork(input) : undefined;
    return {
      ...base,
      action: "wait",
      ...(deferredWork && { deferredWork }),
      log: inQueue
        ? `WAIT: PR #${report.pr} is in the merge queue`
        : `WAIT: PR #${report.pr} has auto-merge enabled`,
    };
  }

  const removal = report.mergeQueue?.latestRemoval;
  if (!enabled || !removal || report.mergeQueue?.headUpdatedAfterRemoval) return null;
  await clearStallState(stallKey);
  const escalateBase = {
    triggers: ["merge-queue-removed" as const],
    unresolvedThreads: [],
    ambiguousComments: [],
    changesRequestedReviews: [],
    mergeQueueRemoval: removal,
    suggestion: buildEscalateSuggestion(
      ["merge-queue-removed"],
      removal.reason ?? "GitHub did not provide a reason",
    ),
  };
  return {
    ...base,
    action: "escalate",
    escalate: {
      ...escalateBase,
      humanMessage: buildEscalateHumanMessage(escalateBase, formatPrUrl(report.repo, report.pr), {
        merge: true,
      }),
    },
  };
}
