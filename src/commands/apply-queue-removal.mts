import { EXIT, ShepherdError } from "../exit-codes.mts";
import { fetchPrBatch } from "../github/batch.mts";
import { queueRemovalAppliesToHead } from "../github/queue-removal-freshness.mts";
import { getCurrentPrNumber, getRepoInfo } from "../github/client.mts";
import {
  isCiQueueRemovalReason,
  writeQueueRemovalAcknowledgment,
  type QueueRemovalAcknowledgment,
} from "../state/queue-removal-ack.mts";

export interface ApplyQueueRemovalInput {
  prNumber?: number;
  targetRepository?: { owner: string; name: string };
  headSha: string;
  queueCommitOid: string;
  removedAtUnix: number;
}

export interface ApplyQueueRemovalResult {
  pr: number;
  repo: string;
  acknowledgment: QueueRemovalAcknowledgment;
}

/** Validate an observed native-stack CI queue removal before recording the caller's acknowledgment. */
export async function applyQueueRemovalAck(
  input: ApplyQueueRemovalInput,
): Promise<ApplyQueueRemovalResult> {
  const repo = input.targetRepository ?? (await getRepoInfo());
  const pr = input.prNumber ?? (await getCurrentPrNumber());
  if (pr === null) {
    throw new ShepherdError(
      "No open PR found for current branch. Pass a PR number explicitly.",
      EXIT.UNAVAILABLE,
    );
  }

  const { data } = await fetchPrBatch(pr, repo);
  const removal = data.latestMergeQueueRemoval;
  if (
    data.state !== "OPEN" ||
    !data.stack ||
    data.isMergeQueueEnabled !== true ||
    data.isInMergeQueue === true ||
    !removal ||
    !isCiQueueRemovalReason(removal.reason) ||
    data.headRefOid !== input.headSha ||
    removal.beforeCommitOid !== input.queueCommitOid ||
    removal.createdAtUnix !== input.removedAtUnix ||
    !queueRemovalAppliesToHead({
      parentOids: removal.beforeCommitParentOids,
      headOid: data.headRefOid,
      headCommittedAtUnix: data.activity?.latestCommitCommittedAtUnix,
      headPushedAtUnix: data.headPushedAtUnix,
      headForcePushedAtUnix: data.headForcePushedAtUnix,
      removedAtUnix: removal.createdAtUnix,
    })
  ) {
    throw new ShepherdError(
      "The supplied queue-removal evidence is stale or is not a current CI-driven removal for this native-stack PR.",
      EXIT.UNAVAILABLE,
    );
  }

  const acknowledgment: QueueRemovalAcknowledgment = {
    headSha: input.headSha,
    queueCommitOid: input.queueCommitOid,
    removedAtUnix: input.removedAtUnix,
  };
  if (
    !(await writeQueueRemovalAcknowledgment(
      { owner: repo.owner, repo: repo.name, pr },
      acknowledgment,
    ))
  ) {
    throw new ShepherdError(
      "Could not write queue-removal acknowledgment state.",
      EXIT.UNAVAILABLE,
    );
  }
  return { pr, repo: `${repo.owner}/${repo.name}`, acknowledgment };
}
