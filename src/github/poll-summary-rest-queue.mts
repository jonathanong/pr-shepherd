import { parseBranchRules } from "./batch-parsers-rules.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";

/** Positive rules remain authoritative even when other branch policy is unavailable. */
export function restQueueRequirement(
  raw: Pick<RawSummaryPr, "baseRef" | "transportUnavailable">,
): boolean | undefined {
  if (parseBranchRules(raw.baseRef).requiresMergeQueue) return true;
  if (
    !raw.baseRef?.rules ||
    raw.baseRef.rules.pageInfo?.hasNextPage !== false ||
    raw.baseRef.branchProtectionRule !== null ||
    raw.transportUnavailable?.some(({ field }) =>
      ["branchProtection", "branchRules"].includes(field),
    )
  )
    return undefined;
  return false;
}
