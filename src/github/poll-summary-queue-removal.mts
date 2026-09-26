import type { RawSummaryPr } from "./poll-summary-raw.mts";
import {
  headPushUnixFromCheckNodes,
  queueRemovalAppliesToHead,
} from "./queue-removal-freshness.mts";
import { parseCreatedAt } from "./batch-parser-helpers.mts";

type QueueRemovalEvent = NonNullable<RawSummaryPr["mergeQueueRemovals"]>["nodes"][number];

/** Latest queue removal that still applies to this PR head, not an older attempt. */
export function currentQueueRemovalEvent(raw: RawSummaryPr): QueueRemovalEvent | null {
  const removal = raw.mergeQueueRemovals?.nodes[0];
  if (!removal || raw.isInMergeQueue) return null;
  const removalTime = Date.parse(removal.createdAt);
  if (!Number.isFinite(removalTime)) return null;
  const addition = raw.mergeQueueAdditions?.nodes[0];
  if (addition && Date.parse(addition.createdAt) > removalTime) return null;
  const parents = removal.beforeCommit?.parents?.nodes.map((parent) => parent.oid);
  const headCommit = raw.commits?.nodes[0]?.commit;
  const headPushedAtUnix = headPushUnixFromCheckNodes(
    headCommit?.statusCheckRollup?.contexts.nodes,
  );
  if (
    !queueRemovalAppliesToHead({
      parentOids: parents,
      headOid: raw.headRefOid,
      ...(headCommit?.committedDate && {
        headCommittedAtUnix: parseCreatedAt(headCommit.committedDate),
      }),
      ...(headPushedAtUnix !== undefined && { headPushedAtUnix }),
      removedAtUnix: Math.floor(removalTime / 1000),
    })
  ) {
    return null;
  }
  return removal;
}
