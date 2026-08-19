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
}

export interface StackStatus {
  number: number;
  size: number;
  position: number;
  baseRefName: string;
}

/** Extra batch-PR fields for merge-queue, stacks, and folded branch rules. */
export interface BatchPrMergeFields {
  branchRules?: BranchRules;
  isInMergeQueue?: boolean;
  isMergeQueueEnabled?: boolean;
  mergeQueueEntry?: MergeQueueEntryStatus | null;
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
