import type { IterateResult } from "../types.mts";

/** True when the summary-line branch phrase names the PR base branch. */
export function branchSegmentShowsBase(result: IterateResult): boolean {
  if (!result.baseBranch) return false;
  if (result.mergeStatus === "BEHIND") return true;
  return result.mergeStatus === "CONFLICTS" && !result.stackTrunkConflict;
}

/** Summary-line branch phrase. Empty when the PR is not behind or conflicting. */
export function branchStateSegment(result: IterateResult): string {
  if (result.mergeStatus === "CONFLICTS" && result.stackTrunkConflict) {
    return `**branch** conflicts with stack trunk \`${result.stackTrunkConflict}\``;
  }
  if (!branchSegmentShowsBase(result)) return "";
  const state = result.mergeStatus === "BEHIND" ? "behind" : "conflicts with";
  return `**branch** ${state} PR base \`${result.baseBranch}\``;
}
