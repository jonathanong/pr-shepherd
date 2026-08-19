import type { BranchRules, MergeQueueEntryStatus, StackStatus } from "../types.mts";
import type { RawBaseRef, RawPrMergeFields, RawRepositoryRule } from "./batch-raw-rules.mts";
import type { RawBranchProtectionRule } from "./batch-raw-types.mts";

export const EMPTY_BRANCH_RULES: BranchRules = {
  requiredApprovingReviewCount: 0,
  requiresConversationResolution: false,
  requiresCodeOwnerReviews: false,
  requiresLastPushApproval: false,
  requiresCommitSignatures: false,
  requiresLinearHistory: false,
  requiresStrictStatusChecks: false,
  requiredStatusCheckContexts: [],
  requiredDeploymentEnvironments: [],
  requiresMergeQueue: false,
  requiresWorkflows: false,
  requiresCodeScanning: false,
};

export function parseBranchRules(baseRef: RawBaseRef | null | undefined): BranchRules {
  const rules = { ...EMPTY_BRANCH_RULES };
  if (!baseRef) return rules;
  foldClassicProtection(rules, baseRef.branchProtectionRule);
  for (const node of baseRef.rules?.nodes ?? []) foldRulesetRule(rules, node);
  return rules;
}

export function parseMergeQueueEntry(
  raw: RawPrMergeFields["mergeQueueEntry"],
): MergeQueueEntryStatus | null {
  if (!raw) return null;
  return {
    position: raw.position,
    state: raw.state,
    estimatedTimeToMerge: raw.estimatedTimeToMerge,
  };
}

export function parseStack(raw: RawPrMergeFields): StackStatus | null {
  if (!raw.stack) return null;
  return {
    number: raw.stack.number,
    size: raw.stack.size,
    position: raw.stackEntry?.position ?? 0,
    baseRefName: raw.stack.baseRefName,
  };
}

function foldClassicProtection(rules: BranchRules, bp: RawBranchProtectionRule | null): void {
  if (!bp) return;
  if (bp.requiresApprovingReviews) {
    rules.requiredApprovingReviewCount = Math.max(
      rules.requiredApprovingReviewCount,
      bp.requiredApprovingReviewCount ?? 0,
    );
  }
  if (bp.requiresConversationResolution) rules.requiresConversationResolution = true;
  if (bp.requiresCodeOwnerReviews) rules.requiresCodeOwnerReviews = true;
  if (bp.requireLastPushApproval) rules.requiresLastPushApproval = true;
  if (bp.requiresCommitSignatures) rules.requiresCommitSignatures = true;
  if (bp.requiresLinearHistory) rules.requiresLinearHistory = true;
  if (bp.requiresStrictStatusChecks) rules.requiresStrictStatusChecks = true;
  if (bp.requiresStatusChecks) {
    mergeUnique(rules.requiredStatusCheckContexts, bp.requiredStatusCheckContexts ?? []);
  }
  if (bp.requiresDeployments) {
    mergeUnique(rules.requiredDeploymentEnvironments, bp.requiredDeploymentEnvironments ?? []);
  }
}

function foldRulesetRule(rules: BranchRules, node: RawRepositoryRule): void {
  const p = node.parameters;
  switch (node.type) {
    case "PULL_REQUEST":
      if (p?.requiredApprovingReviewCount != null) {
        rules.requiredApprovingReviewCount = Math.max(
          rules.requiredApprovingReviewCount,
          p.requiredApprovingReviewCount,
        );
      }
      if (p?.requiredReviewThreadResolution) rules.requiresConversationResolution = true;
      if (p?.requireCodeOwnerReview) rules.requiresCodeOwnerReviews = true;
      if (p?.requireLastPushApproval) rules.requiresLastPushApproval = true;
      break;
    case "REQUIRED_REVIEW_THREAD_RESOLUTION":
      rules.requiresConversationResolution = true;
      break;
    case "REQUIRED_STATUS_CHECKS":
      if (p?.strictRequiredStatusChecksPolicy) rules.requiresStrictStatusChecks = true;
      mergeUnique(
        rules.requiredStatusCheckContexts,
        (p?.requiredStatusChecks ?? []).map((c) => c.context),
      );
      break;
    case "REQUIRED_SIGNATURES":
      rules.requiresCommitSignatures = true;
      break;
    case "REQUIRED_LINEAR_HISTORY":
      rules.requiresLinearHistory = true;
      break;
    case "REQUIRED_DEPLOYMENTS":
      mergeUnique(rules.requiredDeploymentEnvironments, p?.requiredDeploymentEnvironments ?? []);
      break;
    case "MERGE_QUEUE":
      rules.requiresMergeQueue = true;
      break;
    case "WORKFLOWS":
    case "REQUIRED_WORKFLOW_STATUS_CHECKS":
      rules.requiresWorkflows = true;
      break;
    case "CODE_SCANNING":
      rules.requiresCodeScanning = true;
      break;
    default:
      break;
  }
}

function mergeUnique(target: string[], values: string[]): void {
  for (const value of values) {
    if (value && !target.includes(value)) target.push(value);
  }
}
