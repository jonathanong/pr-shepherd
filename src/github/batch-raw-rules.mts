import type { RawBranchProtectionRule } from "./batch-raw-types.mts";

interface RawMergeQueueEntry {
  position: number;
  state: string;
  estimatedTimeToMerge: number | null;
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
  stack?: RawStack | null;
  stackEntry?: { position: number } | null;
  baseRef?: RawBaseRef | null;
}
