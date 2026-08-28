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
