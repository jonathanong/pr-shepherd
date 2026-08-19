import type { BatchPrData, MergeRequirements } from "../types.mts";
import { EMPTY_BRANCH_RULES } from "../github/batch-parsers-rules.mts";

export function deriveMergeRequirements(pr: BatchPrData): MergeRequirements {
  const rules = pr.branchRules ?? EMPTY_BRANCH_RULES;
  const currentApprovals = pr.latestReviews.filter((r) => r.state === "APPROVED").length;
  const unresolvedCount = pr.reviewThreads.filter((t) => !t.isResolved).length;
  const req: MergeRequirements = {
    approvals: {
      current: currentApprovals,
      requiredCount: rules.requiredApprovingReviewCount,
    },
    conversationsResolved: {
      resolved: unresolvedCount === 0,
      unresolvedCount,
      required: rules.requiresConversationResolution,
    },
  };

  if (rules.requiresCodeOwnerReviews) req.codeOwnerReview = { required: true };
  if (rules.requiresLastPushApproval) req.lastPushApproval = { required: true };
  if (rules.requiresCommitSignatures) req.signedCommits = { required: true };
  if (rules.requiresLinearHistory) req.linearHistory = { required: true };
  if (rules.requiresStrictStatusChecks) {
    req.branchUpToDate = { current: pr.mergeStateStatus !== "BEHIND", required: true };
  }
  if (rules.requiredStatusCheckContexts.length > 0) {
    req.requiredStatusChecks = { contexts: rules.requiredStatusCheckContexts };
  }
  if (rules.requiredDeploymentEnvironments.length > 0) {
    req.requiredDeployments = { environments: rules.requiredDeploymentEnvironments };
  }
  if (rules.requiresWorkflows) req.requiredWorkflows = { required: true };
  if (rules.requiresCodeScanning) req.codeScanning = { required: true };

  const queueRequired = rules.requiresMergeQueue || Boolean(pr.isMergeQueueEnabled);
  if (queueRequired || pr.isInMergeQueue) {
    req.mergeQueue = {
      required: queueRequired,
      enabled: Boolean(pr.isMergeQueueEnabled),
      inQueue: Boolean(pr.isInMergeQueue),
      ...(pr.mergeQueueEntry?.position !== undefined && { position: pr.mergeQueueEntry.position }),
      ...(pr.mergeQueueEntry?.state !== undefined && { state: pr.mergeQueueEntry.state }),
    };
  }

  if (pr.stack) req.stack = pr.stack;
  return req;
}
