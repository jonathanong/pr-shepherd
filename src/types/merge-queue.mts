import type {
  AutoMergeRequestStatus,
  MergeQueueEntryStatus,
  MergeQueueRemovalStatus,
} from "./merge-requirements.mts";

export interface MergeQueueReport {
  enabled: boolean;
  inQueue: boolean;
  autoMergeRequest?: AutoMergeRequestStatus;
  entry?: MergeQueueEntryStatus;
  latestRemoval?: MergeQueueRemovalStatus;
  checkCommitOid?: string;
  /** GitHub reported more than the first 100 contexts on the queue commit. */
  checksIncomplete?: true;
  /** The current PR head is not a parent of the removed synthetic queue commit. */
  headUpdatedAfterRemoval?: true;
}

/**
 * Raw counts of actionable work held back while the PR sits in the merge queue
 * (`actions.workWhileQueued` is `false`, the default) — a Shepherd-initiated push
 * or mutation right now would eject the PR. Omitted entirely once every count is
 * zero. Not emitted for checks/annotations/conflicts: those always surface via
 * `fix_code` immediately regardless of queue membership.
 */
export interface IterateDeferredWork {
  /** Unique review threads across actionable, resolution-only, first-look, and rule-auto-resolve. */
  threads: number;
  /** Unique PR comments across actionable, minimize-queued, and first-look. */
  comments: number;
  changesRequestedReviews: number;
  /** Unique review summaries across the minimize queue, first-look, edited, and (if opted in) surfaced approvals. */
  reviewSummaries: number;
}
