import type { BatchPrData } from "../types.mts";
import { restPullRefs, type RestPull } from "./rest-pr-core.mts";
import { REST_BATCH_UNAVAILABLE } from "./rest-batch-unavailable.mts";

export function isRestPullTerminal(pull: RestPull): boolean {
  return Boolean(pull.merged_at) || pull.state === "closed";
}

/**
 * Batch data for a merged or closed PR, built from the first pull read alone. A terminal tick
 * reports only identity and merge state (`buildTerminalReport`), so the feedback, checks, rules,
 * stack and repository reads of a full snapshot would be discarded unread.
 */
export function restTerminalBatchData(pull: RestPull): BatchPrData {
  const refs = restPullRefs(pull);
  return {
    nodeId: pull.node_id,
    ...refs,
    state: refs.state as BatchPrData["state"],
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
      { field: "branchProtection", reason: "not read for a merged or closed pull request" },
    ],
  };
}
