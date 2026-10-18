import type { IterateResult } from "../types.mts";
import { formatNameList } from "./iterate-check-names.mts";

export function formatActivityLine(result: IterateResult, verbose = false): string | null {
  const activity = result.activity ?? {
    commitCount: 0,
    reviewRoundCount: 0,
    latestCommitCommittedAtUnix: null,
    reviewItemsSinceLatestCommit: [],
  };
  const hasActiveChecks = (result.inProgressChecks?.length ?? 0) > 0;
  if (
    activity.commitCount === 0 &&
    activity.reviewRoundCount === 0 &&
    activity.reviewItemsSinceLatestCommit.length === 0 &&
    !hasActiveChecks
  ) {
    return null;
  }
  const parts = [`${activity.commitCount} commits`, `${activity.reviewRoundCount} review rounds`];
  if (activity.reviewItemsSinceLatestCommit.length > 0) {
    parts.push(`${activity.reviewItemsSinceLatestCommit.length} review items since latest commit`);
  }
  if (hasActiveChecks) {
    const names = result.inProgressChecks!.map((check) => check.name);
    parts.push(`active: ${formatNameList(names, verbose)}`);
  }
  return `**activity** ${parts.join(" · ")}`;
}
