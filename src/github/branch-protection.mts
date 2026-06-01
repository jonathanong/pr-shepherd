import type { BatchPrData } from "../types.mts";
import type { RawPr } from "./batch-raw-types.mts";

export function parseBranchProtection(raw: RawPr): BatchPrData["branchProtection"] {
  const rule = raw.baseRef?.branchProtectionRule ?? null;
  return rule
    ? {
        requiresApprovingReviews: rule.requiresApprovingReviews,
        requiredApprovingReviewCount: rule.requiredApprovingReviewCount,
        requiresConversationResolution: rule.requiresConversationResolution,
        requiresStatusChecks: rule.requiresStatusChecks,
        requiredStatusCheckContexts: rule.requiredStatusCheckContexts ?? [],
      }
    : null;
}
