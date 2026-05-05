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
  for (const startupFailure of startupFailureChecks) {
    const indices = startupFailure.runId === null ? undefined : byRunId.get(startupFailure.runId);
    if (indices === undefined) {
      merged.push(startupFailure);
      continue;
    }
    for (const index of indices) {
      merged[index] = mergeStartupFailureCheck(merged[index]!, startupFailure);
    }
  }
  return merged;
}

function mergeStartupFailureCheck(existing: CheckRun, startupFailure: CheckRun): CheckRun {
  const replacement: CheckRun = {
    ...existing,
    conclusion: "STARTUP_FAILURE",
    status: "COMPLETED",
    detailsUrl: startupFailure.detailsUrl || existing.detailsUrl,
    event: startupFailure.event,
  };
  if (startupFailure.summary !== undefined) replacement.summary = startupFailure.summary;
  return replacement;
}
