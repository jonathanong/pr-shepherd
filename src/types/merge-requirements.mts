/** Branch-rule and "why can't I merge" types shared by batch data and merge status. */

export interface BranchRules {
  requiredApprovingReviewCount: number;
  requiresConversationResolution: boolean;
  requiresCodeOwnerReviews: boolean;
  requiresLastPushApproval: boolean;
  requiresCommitSignatures: boolean;
  requiresLinearHistory: boolean;
  requiresStrictStatusChecks: boolean;
  requiredStatusCheckContexts: string[];
  requiredDeploymentEnvironments: string[];
  requiresMergeQueue: boolean;
  requiresWorkflows: boolean;
  requiresCodeScanning: boolean;
}

export interface MergeQueueEntryStatus {
  position: number;
  state: string;
  estimatedTimeToMerge: number | null;
  headCommitOid?: string;
  enqueuedAtUnix?: number;
  enqueuer?: string;
}

export interface AutoMergeRequestStatus {
  enabledAtUnix: number;
  mergeMethod: string;
  enabledBy?: string;
}

export interface MergeQueueRemovalStatus {
  reason: string | null;
  actor?: string;
  createdAtUnix: number;
  beforeCommitOid?: string;
  beforeCommitParentOids?: string[];
}

export interface StackStatus {
  number: number;
  size: number;
  position: number;
  baseRefName: string;
}

/** Why an open native stack layer does not yet let the layers above it advance. */
export type StackLayerBlockReason =
  | "closed"
  | "draft"
  | "conflicting"
  | "queue-removal"
  | "failing-checks"
  | "review-work"
  | "checks-in-progress"
  | "merge-state"
  | "no-ready-receipt"
  | "stale-ancestry";

/** The lowest native stack layer that keeps an upper draft from being marked ready. */
export interface StackLowerLayerBlock {
  pr: number;
  reason: StackLayerBlockReason;
}

/**
 * Why a native stack layer stays in draft on a WAIT tick. Repeating the same one-PR
 * session cannot advance it, so the caller returns to the stack selector. A named
 * `lowerLayer` is the layer to advance first; without one, the lower layers could not
 * be verified.
 */
export type StackDraftHold =
  | { kind: "lower-layer-not-ready"; lowerLayer?: StackLowerLayerBlock }
  | { kind: "auto-mark-ready-disabled" };

/** Extra batch-PR fields for merge-queue, stacks, and folded branch rules. */
export interface BatchPrMergeFields {
  branchRules?: BranchRules;
  isInMergeQueue?: boolean;
  isMergeQueueEnabled?: boolean;
  mergeQueueEntry?: MergeQueueEntryStatus | null;
  autoMergeRequest?: AutoMergeRequestStatus | null;
  latestMergeQueueRemoval?: MergeQueueRemovalStatus | null;
  stack?: StackStatus | null;
}

/** Snapshot of "why can't I merge" requirements vs current PR state. */
export interface MergeRequirements {
  approvals: { current: number; requiredCount: number };
  conversationsResolved: { resolved: boolean; unresolvedCount: number; required: boolean };
  codeOwnerReview?: { required: true };
  lastPushApproval?: { required: true };
  signedCommits?: { required: true };
  linearHistory?: { required: true };
  branchUpToDate?: { current: boolean; required: true };
  requiredStatusChecks?: { contexts: string[] };
  requiredDeployments?: { environments: string[] };
  requiredWorkflows?: { required: true };
  codeScanning?: { required: true };
  mergeQueue?: {
    required: boolean;
    enabled: boolean;
    inQueue: boolean;
    position?: number;
    state?: string;
  };
  stack?: StackStatus;
}
