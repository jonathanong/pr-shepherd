import { clearStallState } from "../../state/iterate-stall.mts";
import type { IterateResult, IterateResultBase, ShepherdReport } from "../../types.mts";
import { buildEscalateHumanMessage, buildEscalateSuggestion } from "./escalate.mts";
import { buildMergeCommandPlan } from "./merge.mts";

type StallKey = { owner: string; repo: string; pr: number };

export function buildReadyMergeResult(
  enabled: boolean | undefined,
  readyElapsed: boolean,
  base: IterateResultBase,
  report: ShepherdReport,
): IterateResult | null {
  if (!enabled || !readyElapsed) return null;
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

export async function handleActiveMergeState(input: {
  enabled: boolean | undefined;
  active: boolean;
  base: IterateResultBase;
  report: ShepherdReport;
  stallKey: StallKey;
}): Promise<IterateResult | null> {
  const { enabled, active, base, report, stallKey } = input;
  if (enabled && active) {
    await clearStallState(stallKey);
    return {
      ...base,
      action: "wait",
      log: report.mergeQueue?.inQueue
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
      humanMessage: buildEscalateHumanMessage(escalateBase, report.pr),
    },
  };
}
