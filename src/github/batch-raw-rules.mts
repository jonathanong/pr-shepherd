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
import type { StackMemberRefs } from "./stack-read.mts";

interface RawCheckCommit {
  oid: string;
  committedDate?: string;
  parents?: { nodes: Array<{ oid: string }> };
  statusCheckRollup?: {
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
  /** Selected only by `BatchPr`: the topology `PollStackTopology` would otherwise read. */
  id?: string;
  entries?: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: Array<{ position: number; pullRequest: StackMemberRefs | null } | null>;
  };
  /** Selected only by `BatchPr`: the bottom entry, whose base is normally the trunk. */
  trunkEntry?: {
    nodes: Array<{
      pullRequest: { baseRefName: string; baseRef: RawBaseRef | null } | null;
    } | null>;
  };
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
  rules: { pageInfo?: { hasNextPage: boolean }; nodes: RawRepositoryRule[] } | null;
  /** Live base branch tip; selected only by `BatchPr`. */
  target?: { oid?: string } | null;
}

export interface RawPrMergeFields {
  isInMergeQueue?: boolean;
  isMergeQueueEnabled?: boolean;
  mergeQueueEntry?: RawMergeQueueEntry | null;
  autoMergeRequest?: RawAutoMergeRequest | null;
  mergeQueueRemovals?: { nodes: RawMergeQueueRemoval[] } | null;
  mergeQueueAdditions?: { nodes: Array<{ createdAt: string }> } | null;
  /** Timestamps of the last 10 queue removals; counts repeat ejections of one head. */
  mergeQueueRemovalTimes?: { nodes: Array<{ createdAt: string }> } | null;
  /** The latest force-push, which dates a head whose commit time predates its push. */
  headRefForcePushes?: { nodes: Array<{ createdAt: string }> } | null;
  stack?: RawStack | null;
  stackEntry?: { position: number } | null;
  baseRef?: RawBaseRef | null;
}
