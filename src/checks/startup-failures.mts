import type { CheckRun } from "../types.mts";

export function mergeStartupFailureChecks(
  checks: CheckRun[],
  startupFailureChecks: CheckRun[],
): CheckRun[] {
  const byRunId = new Map<string, number>();
  checks.forEach((check, index) => {
    if (check.runId !== null) byRunId.set(check.runId, index);
  });

  const merged = [...checks];
  for (const startupFailure of startupFailureChecks) {
    const index = startupFailure.runId === null ? undefined : byRunId.get(startupFailure.runId);
    if (index === undefined) {
      merged.push(startupFailure);
      continue;
    }
    merged[index] = mergeStartupFailureCheck(merged[index]!, startupFailure);
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
