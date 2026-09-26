import type { IterateResult } from "../types.mts";

/** Summary-line branch phrase. Empty when the PR is not behind or conflicting. */
export function branchStateSegment(result: IterateResult): string {
  if (result.mergeStatus === "BEHIND" && result.baseBranch) {
    return `**branch** behind PR base \`${result.baseBranch}\``;
  }
  if (result.mergeStatus === "CONFLICTS" && result.stackTrunkConflict) {
    return `**branch** conflicts with stack trunk \`${result.stackTrunkConflict}\``;
  }
  if (result.mergeStatus === "CONFLICTS" && result.baseBranch) {
    return `**branch** conflicts with PR base \`${result.baseBranch}\``;
  }
  return "";
}
