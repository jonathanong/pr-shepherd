import type { BatchPrData, MergeStatusResult, ShepherdReport } from "../types.mts";

/** A merged PR answered from its first REST pull read never read reviews, threads or rules. */
const requirementsUnread = (batchData: BatchPrData) =>
  (batchData.transportUnavailable ?? []).some(({ field }) => field === "mergeRequirements");

function withoutRequirements(mergeStatus: MergeStatusResult): MergeStatusResult {
  const { mergeRequirements: _unread, ...rest } = mergeStatus;
  return rest;
}

export function buildTerminalReport(
  prNumber: number,
  repo: { owner: string; name: string },
  batchData: BatchPrData,
  mergeStatus: MergeStatusResult,
  status: "MERGED" | "CLOSED",
): ShepherdReport {
  return {
    pr: prNumber,
    nodeId: batchData.nodeId,
    ...(batchData.transport && { transport: batchData.transport }),
    ...(batchData.transportUnavailable?.length && {
      transportUnavailable: batchData.transportUnavailable,
    }),
    headSha: batchData.headRefOid,
    repo: `${repo.owner}/${repo.name}`,
    status,
    baseBranch: batchData.baseRefName,
    mergeStatus: requirementsUnread(batchData) ? withoutRequirements(mergeStatus) : mergeStatus,
    checks: {
      passing: [],
      failing: [],
      inProgress: [],
      skipped: [],
      filtered: [],
      filteredNames: [],
      blockedByFilteredCheck: false,
    },
    threads: {
      actionable: [],
      resolutionOnly: [],
      autoResolved: [],
      autoResolveErrors: [],
      firstLook: [],
    },
    comments: {
      actionable: [],
      firstLook: [],
    },
    changesRequestedReviews: [],
    reviewSummaries: [],
    firstLookSummaries: [],
    editedSummaries: [],
    approvedReviews: [],
    branchProtection: batchData.branchProtection,
    activity: batchData.activity,
  };
}
