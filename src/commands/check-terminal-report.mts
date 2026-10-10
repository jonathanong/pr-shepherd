import type { BatchPrData, MergeStatusResult, ShepherdReport } from "../types.mts";

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
    mergeStatus,
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
