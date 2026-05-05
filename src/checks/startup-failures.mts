import type { CheckRun } from "../types.mts";

export function mergeStartupFailureChecks(
  checks: CheckRun[],
  startupFailureChecks: CheckRun[],
): CheckRun[] {
  const byRunId = new Map<string, number[]>();
  checks.forEach((check, index) => {
    if (check.runId === null) return;
    const indices = byRunId.get(check.runId) ?? [];
    indices.push(index);
    byRunId.set(check.runId, indices);
  });

  const merged = [...checks];
  const removed = new Set<number>();
  for (const startupFailure of startupFailureChecks) {
    const indices = startupFailure.runId === null ? undefined : byRunId.get(startupFailure.runId);
    if (indices === undefined) {
      merged.push(startupFailure);
      continue;
    }
    merged[indices[0]!] = startupFailure;
    indices.slice(1).forEach((index) => removed.add(index));
  }
  return merged.filter((_, index) => !removed.has(index));
}
