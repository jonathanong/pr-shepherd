import type { BatchPrData } from "../types.mts";
import { restPullRefs, type RestPull } from "./rest-pr-core.mts";
import { REST_BATCH_UNAVAILABLE } from "./rest-batch-unavailable.mts";

/**
 * A merged pull is immutable, so its first read is final. A closed pull is not (it can be
 * reopened during the snapshot), so it keeps the full snapshot and its closing re-read.
 */
export function isRestPullMerged(pull: RestPull): boolean {
  return Boolean(pull.merged_at);
}

const NOT_READ = "not read for a merged pull request";

/**
 * Batch data for a merged PR, built from the first pull read alone. A terminal tick reports
 * only identity and merge state (`buildTerminalReport`), so the feedback, checks, rules, stack
 * and repository reads of a full snapshot would be discarded unread. The unread resources are
 * listed as unavailable, not presented as empty, so no merge requirement is derived from them.
 */
export function restMergedBatchData(pull: RestPull): BatchPrData {
  const refs = restPullRefs(pull);
  return {
    nodeId: pull.node_id,
    ...refs,
    state: "MERGED",
    isDraft: pull.draft,
    mergeable:
      pull.mergeable === true ? "MERGEABLE" : pull.mergeable === false ? "CONFLICTING" : "UNKNOWN",
    mergeStateStatus: pull.mergeable_state.toUpperCase() as BatchPrData["mergeStateStatus"],
    reviewDecision: null,
    headRepoWithOwner: pull.head.repo?.full_name ?? null,
    reviewRequests: [],
    latestReviews: [],
    reviewThreads: [],
    comments: [],
    changesRequestedReviews: [],
    reviewSummaries: [],
    approvedReviews: [],
    checks: [],
    branchProtection: null,
    stack: null,
    transport: "rest",
    transportUnavailable: [
      ...REST_BATCH_UNAVAILABLE,
      { field: "branchProtection", reason: NOT_READ },
      { field: "mergeRequirements", reason: NOT_READ },
    ],
  };
}
