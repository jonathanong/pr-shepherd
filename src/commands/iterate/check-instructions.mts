import type { AgentCheck } from "../../types.mts";

export function buildFailingCheckInstructions(checks: AgentCheck[]): string[] {
  if (checks.length === 0) return [];
  const hasRunId = checks.some(
    (c) => c.runId && c.conclusion !== "CANCELLED" && c.conclusion !== "STARTUP_FAILURE",
  );
  const hasCancelled = checks.some((c) => c.runId && c.conclusion === "CANCELLED");
  const hasStartupFailure = checks.some((c) => c.runId && c.conclusion === "STARTUP_FAILURE");
  const hasExternal = checks.some((c) => !c.runId && c.detailsUrl);
  const hasBare = checks.some((c) => !c.runId && !c.detailsUrl);

  const parts: string[] = [];
  if (hasRunId) {
    parts.push(
      "fetch the log with `gh run view <runId> --log-failed` and decide: rerun with `gh run rerun <runId> --failed` for transient infrastructure failures (network timeout, OOM kill, runner crash), or apply a code fix for real test/build failures",
    );
  }
  if (hasCancelled) {
    parts.push(
      "for `[conclusion: CANCELLED]` entries: rerun with `gh run rerun <runId>` if the cancellation looks unintended (not superseded by a newer push or concurrency-group eviction); otherwise treat as resolved — do NOT confuse with IDs under `## Cancelled runs`",
    );
  }
  if (hasStartupFailure) {
    parts.push(
      "for `[conclusion: STARTUP_FAILURE]` entries: inspect with `gh run view <runId>` and rerun with `gh run rerun <runId>` if the workflow should be retried",
    );
  }
  if (hasExternal) {
    parts.push("for `external` entries (no run ID, has URL): open the URL to inspect the failure");
  }
  if (hasBare) {
    parts.push(
      "for `(no runId)` entries: no log or URL is available — escalate to a human for manual investigation",
    );
  }

  return [
    `For each failing check under \`## Failing checks\`: ${parts.join("; ")}.`,
  ];
}
