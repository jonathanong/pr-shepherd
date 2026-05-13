import { getMergeableState, type RepoInfo } from "../github/client.mts";
import { deriveMergeStatus } from "../merge-status/derive.mts";
import type { CiVerdict } from "../checks/classify.mts";
import type { BatchPrData, MergeStatusResult, ShepherdStatus } from "../types.mts";
import { computeStatus } from "./check-status.mts";

interface ReadyMergeabilityRefresh {
  batchData: BatchPrData;
  mergeStatus: MergeStatusResult;
  status: ShepherdStatus;
}

export async function refreshUnknownMergeability(
  prNumber: number,
  repo: RepoInfo,
  batchData: BatchPrData,
): Promise<{ batchData: BatchPrData; didRefresh: boolean }> {
  if (
    (batchData.state ?? "OPEN") !== "OPEN" ||
    (batchData.mergeable !== "UNKNOWN" && batchData.mergeStateStatus !== "UNKNOWN")
  ) {
    return { batchData, didRefresh: false };
  }

  return { batchData: await readMergeability(prNumber, repo, batchData), didRefresh: true };
}

export async function refreshReadyMergeability(
  prNumber: number,
  repo: RepoInfo,
  batchData: BatchPrData,
  verdict: CiVerdict,
  unresolvedThreads: number,
  unresolvedComments: number,
): Promise<ReadyMergeabilityRefresh> {
  const refreshedBatchData = await readMergeability(prNumber, repo, batchData);
  const mergeStatus = deriveMergeStatus(refreshedBatchData);
  const status = computeStatus(
    verdict,
    unresolvedThreads,
    unresolvedComments,
    mergeStatus,
    refreshedBatchData.changesRequestedReviews.length,
  );
  return { batchData: refreshedBatchData, mergeStatus, status };
}

export function isBlockedByFilteredCheck(
  mergeStatus: MergeStatusResult,
  verdict: CiVerdict,
): boolean {
  return (
    mergeStatus.status === "BLOCKED" &&
    !verdict.anyFailing &&
    !verdict.anyInProgress &&
    verdict.filteredNames.length > 0
  );
}

async function readMergeability(
  prNumber: number,
  repo: RepoInfo,
  batchData: BatchPrData,
): Promise<BatchPrData> {
  const restState = await getMergeableState(prNumber, repo.owner, repo.name);
  return {
    ...batchData,
    mergeable: restState.mergeable ?? batchData.mergeable,
    mergeStateStatus: restState.mergeStateStatus ?? batchData.mergeStateStatus,
  };
}
