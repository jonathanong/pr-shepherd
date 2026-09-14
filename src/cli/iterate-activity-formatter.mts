import type { IterateResult } from "../types.mts";

export function formatActivityLine(result: IterateResult): string | null {
  const activity = result.activity ?? {
    commitCount: 0,
    reviewRoundCount: 0,
    latestCommitCommittedAtUnix: null,
    reviewItemsSinceLatestCommit: [],
  };
  const hasActiveChecks = (result.inProgressChecks?.length ?? 0) > 0;
  const parts: string[] = [];
  if (activity.commitCount > 0) parts.push(`${activity.commitCount} commits`);
  if (activity.reviewRoundCount > 0) parts.push(`${activity.reviewRoundCount} review rounds`);
  if (activity.reviewItemsSinceLatestCommit.length > 0) {
    parts.push(`${activity.reviewItemsSinceLatestCommit.length} review items since latest commit`);
  }
  if (hasActiveChecks) {
    parts.push(
      `active: ${result
        .inProgressChecks!.slice(0, 5)
        .map((check) => `\`${check.name}\``)
        .join(", ")}`,
    );
  }
  if (parts.length === 0) return null;
  return `**activity** ${parts.join(" · ")}`;
}
