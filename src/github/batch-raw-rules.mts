export interface RawBranchProtectionRule {
  requiresApprovingReviews: boolean;
  requiredApprovingReviewCount: number;
  requiresConversationResolution: boolean;
  requiresStatusChecks: boolean;
  requiredStatusCheckContexts: string[] | null;
  requiresCodeOwnerReviews?: boolean;
  requireLastPushApproval?: boolean;
  requiresCommitSignatures?: boolean;
  requiresLinearHistory?: boolean;
  requiresStrictStatusChecks?: boolean;
  requiresDeployments?: boolean;
  requiredDeploymentEnvironments?: string[] | null;
}

import type { RawContextNode } from "./batch-raw-types.mts";

interface RawCheckCommit {
  oid: string;
  committedDate?: string;
  parents?: { nodes: Array<{ oid: string }> };
  statusCheckRollup: {
    contexts: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: Array<RawContextNode | null>;
    };
  } | null;
}

interface RawMergeQueueEntry {
  position: number;
  state: string;
  estimatedTimeToMerge: number | null;
  headCommit?: RawCheckCommit | null;
  enqueuedAt?: string;
  enqueuer?: { login: string } | null;
}

interface RawAutoMergeRequest {
  enabledAt: string;
  mergeMethod: string;
  enabledBy?: { login: string } | null;
}

interface RawMergeQueueRemoval {
  reason: string | null;
  actor?: { login: string } | null;
  createdAt: string;
  beforeCommit?: RawCheckCommit | null;
}

interface RawStack {
  number: number;
  size: number;
  baseRefName: string;
}

export interface RawRepositoryRule {
  type: string;
  parameters: RawRuleParameters | null;
}

interface RawRuleParameters {
  requiredApprovingReviewCount?: number;
  requiredReviewThreadResolution?: boolean;
  requireCodeOwnerReview?: boolean;
  requireLastPushApproval?: boolean;
  strictRequiredStatusChecksPolicy?: boolean;
  requiredStatusChecks?: Array<{ context: string }>;
  requiredDeploymentEnvironments?: string[];
  codeScanningTools?: Array<{ tool: string }>;
}

export interface RawBaseRef {
  branchProtectionRule: RawBranchProtectionRule | null;
  rules: { nodes: RawRepositoryRule[] } | null;
}

export interface RawPrMergeFields {
  isInMergeQueue?: boolean;
  isMergeQueueEnabled?: boolean;
  mergeQueueEntry?: RawMergeQueueEntry | null;
  autoMergeRequest?: RawAutoMergeRequest | null;
  mergeQueueRemovals?: { nodes: RawMergeQueueRemoval[] } | null;
  mergeQueueAdditions?: { nodes: Array<{ createdAt: string }> } | null;
  stack?: RawStack | null;
  stackEntry?: { position: number } | null;
  baseRef?: RawBaseRef | null;
}
